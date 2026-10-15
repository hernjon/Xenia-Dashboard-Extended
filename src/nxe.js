'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
// XUIZ directory: big-endian header, length/offset/name-length records, UTF-16BE names
// (version 3, used from the Kinect dashboard on, stores the names as single bytes).
function parseXzp(buffer) {
  if(buffer.length<22 || buffer.toString('ascii',0,4)!=='XUIZ' || buffer.readUInt32BE(8)!==buffer.length)throw new Error('Invalid XUIZ archive');
  const tableEnd=22+buffer.readUInt32BE(16),count=buffer.readUInt16BE(20),wide=buffer.readUInt32BE(4)<3,width=wide?2:1;
  if(tableEnd>buffer.length || count>10000)throw new Error('Invalid XUIZ directory');
  let cursor=22;const entries=[];
  for(let i=0;i<count;i++){
    if(cursor+9>tableEnd)throw new Error('Truncated XUIZ entry');
    const length=buffer.readUInt32BE(cursor),offset=buffer.readUInt32BE(cursor+4),chars=buffer[cursor+8];cursor+=9;
    if(cursor+chars*width>tableEnd)throw new Error('Truncated XUIZ name');
    let name='';for(let j=0;j<chars;j++)name+=String.fromCharCode(wide?buffer.readUInt16BE(cursor+j*2):buffer[cursor+j]);cursor+=chars*width;
    name=name.replace(/\0/g,'').replace(/\\/g,'/');
    if(!name || name.startsWith('/') || name.split('/').some(p=>p==='..') || /[:]/.test(name))throw new Error('Unsafe XUIZ name');
    if(tableEnd+offset+length>buffer.length)throw new Error('Invalid XUIZ data bounds');
    entries.push({name,length,bytes:buffer.subarray(tableEnd+offset,tableEnd+offset+length)});
  }
  return entries;
}
function isImage(bytes) {return bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || (bytes[0]===255 && bytes[1]===216 && bytes[2]===255);}
async function resolveRoot(folder){
  for(const candidate of [folder,path.join(folder,'NXE'),path.join(folder,'Dashboards','NXE')]){
    try {await fs.access(path.join(candidate,'Theme1','Wallpaper1.jpg'));return await fs.realpath(candidate);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  throw new Error('Choose the dashboard folder containing NXE/Theme1/Wallpaper1.jpg');
}
async function importTheme(folder,userData,authorize=()=>{}){
  const resources=require('./nxe-resources');
  const root=await resolveRoot(folder);authorize();
  const themesRoot=path.join(userData,'nxe-themes');await fs.mkdir(themesRoot,{recursive:true});
  const destination=await fs.mkdtemp(path.join(themesRoot,'import-'));
  const manifest={version:1,source:root,imported_at:new Date().toISOString(),assets:{},backgrounds:[],inventory:[],notes:[],sounds:{},menus:{},modules:[]};
  let total=0;
  async function save(name,bytes){
    if(!isImage(bytes) || bytes.length>16*1024*1024)return null;
    total+=bytes.length;if(total>128*1024*1024)throw new Error('Theme assets exceed import limit');
    const id=crypto.createHash('sha256').update(name).digest('hex').slice(0,20);
    const file=`${id}.${bytes[0]===255?'jpg':'png'}`;await fs.writeFile(path.join(destination,file),bytes);
    manifest.assets[id]={file,source:name};return id;
  }
  for(const theme of ['Theme0','Theme1','Theme2']){
    let files;try{files=await fs.readdir(path.join(root,theme),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
    for(const entry of files){
      if(!entry.isFile() || !/\.(png|jpg)$/i.test(entry.name))continue;
      const source=await fs.realpath(path.join(root,theme,entry.name));
      if(!source.startsWith(root+path.sep))throw new Error('Theme file escapes source folder');
      const stat=await fs.stat(source);if(stat.size>16*1024*1024)throw new Error('Theme image too large');
      const id=await save(`${theme}/${entry.name}`,await fs.readFile(source));
      if(id && /^Wallpaper\d+\.jpg$/i.test(entry.name))manifest.backgrounds.push({id,label:`${theme} · ${entry.name.replace('.jpg','')}`});
    }
  }
  try{
    const archivePath=path.join(root,'mediasite.xzp');const stat=await fs.stat(archivePath);if(stat.size>64*1024*1024)throw new Error('Resource archive too large');
    for(const entry of parseXzp(await fs.readFile(archivePath))){
      manifest.inventory.push({name:entry.name,length:entry.length});
      if(entry.length && /\.(png|jpg)$/i.test(entry.name))await save(`mediasite/${entry.name}`,entry.bytes);
    }
  }catch(error){manifest.notes.push(`mediasite.xzp: ${error.message}`);}
  const soundNames={right:'snd_panelright.xma',left:'snd_panelleft.xma',select:'snd_buttonselect.xma',back:'snd_buttonback.xma',open:'snd_panelunfold.xma',close:'snd_panelfold.xma',focus:'btn_Focus.xma'};
  for(const moduleName of ['$flash_dash.xex','$flash_huduiskin.xex','xam.xex']){
    try{
      const source=await fs.realpath(path.join(root,moduleName));if(!source.startsWith(root+path.sep))throw Error('Module escapes source folder');
      const stat=await fs.stat(source);if(stat.size>64*1024*1024)throw Error('Module exceeds size limit');
      authorize();const decoded=await resources.unpackModule(await fs.readFile(source),destination);
      const archives=resources.embeddedArchives(decoded.bytes,parseXzp);manifest.modules.push({name:moduleName,version:decoded.version,archives:archives.length});
      for(const archive of archives)for(const entry of archive.entries){
        manifest.inventory.push({name:`${moduleName}/${archive.offset}/${entry.name}`,length:entry.length});
        if(!entry.length)continue;
        const name=`${moduleName}/${archive.offset}/${entry.name}`;
        if(/\.(jpg|png)$/i.test(entry.name))await save(name,entry.bytes);
        if(['SystemScene.xur','dashSysCslSet.xur','MobyChannelScene.xur'].includes(entry.name) && moduleName==='$flash_dash.xex'){
          try{manifest.menus[entry.name]={...resources.parseXur(entry.bytes),source:name,version:decoded.version};}catch(error){manifest.notes.push(`${name}: ${error.message}`);}
        }
        const role=Object.keys(soundNames).find(key=>soundNames[key]===entry.name);
        if(role && !manifest.sounds[role]){
          const id=crypto.createHash('sha256').update(name).digest('hex').slice(0,20);
          try{authorize();const converted=await resources.convertSound(entry.bytes,destination,id);total+=converted.bytes;manifest.assets[id]={file:converted.file,source:name};manifest.sounds[role]=id;}catch(error){manifest.notes.push(`${entry.name}: ${error.message}`);}
        }
      }
    }catch(error){manifest.notes.push(`${moduleName}: ${error.message}`);}
  }
  if(!manifest.backgrounds.length)throw new Error('No supported NXE wallpapers found');
  manifest.notes.push('Dashboard code is never executed. XUR strings/vectors are decoded; DATA timelines and runtime property binding are not fully translated.');
  authorize();await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
  const original=Object.entries(manifest.assets).find(([,a])=>a.source.startsWith('$flash_dash.xex/')&&a.source.endsWith('/defaultbackground.jpg'));
  return {directory:destination,selected:original?.[0] || manifest.backgrounds.find(b=>b.label.startsWith('Theme1'))?.id || manifest.backgrounds[0].id};
}
async function loadTheme(config,userData,builtinDirectory=path.join(__dirname,'..','assets','nxe')){
  const builtin=!config || config.directory==='builtin';
  let directory;
  if(builtin)directory=await fs.realpath(builtinDirectory);
  else {
    const root=await fs.realpath(path.join(userData,'nxe-themes'));directory=await fs.realpath(config.directory);
    if(!directory.startsWith(root+path.sep))throw new Error('Invalid imported theme location');
  }
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1 || !Array.isArray(manifest.backgrounds))throw new Error('Invalid theme manifest');
  for(const [id,asset] of Object.entries(manifest.assets))if(!/^[a-f0-9]{20}$/.test(id) || !/^[a-f0-9]{20}\.(jpg|png|wav)$/.test(asset.file))throw new Error('Invalid theme asset');
  const audio=typeof config?.audio?.muted==='boolean' && Number.isFinite(config.audio.volume) && config.audio.volume>=0 && config.audio.volume<=1?config.audio:{volume:.5,muted:false};
  const original=Object.entries(manifest.assets).find(([,a])=>a.source.startsWith('$flash_dash.xex/')&&a.source.endsWith('/defaultbackground.jpg'));
  const selected=config && Object.hasOwn(config,'selected')?config.selected:original?.[0] || manifest.backgrounds[0]?.id;
  return {directory,manifest,selected,audio,builtin};
}
function themeConfig(theme){return {directory:theme.builtin?'builtin':theme.directory,selected:theme.selected,audio:theme.audio};}
const ICON_ROLES={
  settings:'ico_32x_console.png',      // fallback for any tile without its own
  console:'ico_64x_Console.png',       // Xenia Settings › System
  profiles:'ico_64x_profiles.png',     // Profiles
  games:'ico_96x_Game.png',            // Games
  more:'ico_64x_more.png',             // Advanced
  folder:'ico_96x_Folder.png',         // Locations
  themes:'ico_64x_Themes.png',         // Themes
  sound:'ico_96x_Music.png',           // Sound and animations
  camera:'ico_96x_Camera.png',         // Game covers
  family:'ico_32x_parentalControl.png',// PIN and locks
  desktop:'ico_96x_PC.png',            // Exit to desktop
  download:'ico_64x_Download.png'      // Updates
};
function publicTheme(theme){
  if(!theme)return {backgrounds:[],selected:null,sounds:{},audio:{volume:.5,muted:false},music:'kratos-art://music/dashboard'};
  const url=id=>`kratos-art://theme/${id}`;
  // Pictograms recovered from the dashboard, one per kind of tile. Each role names the largest version the
  // pack has (96 px where it exists, else 64, else 32); the skin scales it, and shrinking never blurs.
  const icons={},lowered=Object.entries(theme.manifest.assets).map(([id,a])=>[id,a.source.toLowerCase()]);
  for(const [role,name] of Object.entries(ICON_ROLES)){const entry=lowered.find(([,source])=>source.endsWith('/'+name.toLowerCase()));if(entry)icons[role]=url(entry[0]);}
  const buttons={};for(const key of ['A','B','X','Y']){const entry=Object.entries(theme.manifest.assets).find(([,a])=>a.source.startsWith('$flash_dash.xex/') && a.source.endsWith(`/Legend_${key}.png`));if(entry)buttons[key]=url(entry[0]);}
  const scene={};for(const [role,name] of Object.entries({background:'defaultbackground.jpg',horizon:'Aura_Horizon.png',marker:'MobyChannelZero.png'})){
    const entry=Object.entries(theme.manifest.assets).find(([,a])=>a.source.startsWith('$flash_dash.xex/')&&a.source.endsWith('/'+name));if(entry)scene[role]=url(entry[0]);
  }
  // The tile textures and the glossy 3D pictograms of the dashboard's own slots (Games, Settings, Music...), and the
  // orb; the NXE view draws its tiles with them.
  const dash=name=>{const entry=Object.entries(theme.manifest.assets).find(([,a])=>a.source.startsWith('$flash_dash.xex/')&&a.source.toLowerCase().endsWith('/'+name.toLowerCase()));return entry?url(entry[0]):null;};
  scene.tiles=Object.fromEntries(Object.entries({blank:'BlankGreen.jpg',games:'Games.jpg',settings:'Settings.jpg',music:'Music.jpg',photos:'Photos.jpg',videos:'Videos.jpg'}).map(([role,name])=>[role,dash(name)]).filter(([,value])=>value));
  scene.glossy=Object.fromEntries(Object.entries({disc:'icon_disc.png',games:'icon_gamelib.png',settings:'icon_settings.png',music:'icon_musiclib.png',photos:'icon_picturelib.png',videos:'icon_videolib.png'}).map(([role,name])=>[role,dash(name)]).filter(([,value])=>value));
  scene.menuOrb=dash('Legend_Menu.png');
  const backgrounds=theme.manifest.backgrounds.map((b,index)=>({...b,label:`Wallpaper ${index+1}`,url:url(b.id)}));
  if(scene.background&&!backgrounds.some(b=>b.url===scene.background))backgrounds.unshift({id:scene.background.split('/').at(-1),label:'Original NXE · Green dashboard',url:scene.background});
  return {backgrounds,selected:theme.selected,assetCount:Object.keys(theme.manifest.assets).length,resourceCount:theme.manifest.inventory.length,notes:theme.manifest.notes,sounds:Object.fromEntries(Object.entries(theme.manifest.sounds || {}).map(([role,id])=>[role,url(id)])),audio:theme.audio,menu:theme.manifest.menus?.['dashSysCslSet.xur']?{detailLabel:theme.manifest.menus['dashSysCslSet.xur'].strings.find(s=>s==='Current Setting') || 'Current Setting',source:theme.manifest.menus['dashSysCslSet.xur'].source,version:theme.manifest.menus['dashSysCslSet.xur'].version}:null,icons,buttons,scene,music:'kratos-art://music/dashboard'};
}
module.exports={parseXzp,importTheme,loadTheme,publicTheme,themeConfig};
