'use strict';
const path=require('node:path');
const {existsSync,readdirSync,rmdirSync,renameSync}=require('node:fs');
function selectUserData(appData,currentDirectory,packaged=false){
  const legacy=packaged?['Project Kratos','project-kratos']:['project-kratos','Project Kratos'];
  const names=['Xenia Dashboard','NXE','nxe-launcher',...legacy];
  const defaults=names.map(name=>path.join(appData,name));
  // Respect explicit userData overrides used by custom deployments and tests.
  if(!defaults.some(directory=>path.resolve(directory)===path.resolve(currentDirectory)))return currentDirectory;
  return defaults.find(directory=>existsSync(path.join(directory,'library.json'))) || defaults[0];
}
// The app was called NXE before it became Xenia Dashboard. Settings kept in that folder are moved to the new name, once, so the
// folder on disk matches the app. It only happens when the new folder has no settings and nothing else in it; otherwise both stay.
function migrateUserData(appData){
  const old=path.join(appData,'NXE'),fresh=path.join(appData,'Xenia Dashboard');
  try{
    if(!existsSync(path.join(old,'library.json'))||existsSync(path.join(fresh,'library.json')))return null;
    if(existsSync(fresh)){if(readdirSync(fresh).length)return null;rmdirSync(fresh);}
    renameSync(old,fresh);return fresh;
  }catch{return null;}
}
// Portable mode keeps everything the dashboard saves in one folder beside the program, so it can live on a USB stick.
// The Windows portable .exe says where it sits in PORTABLE_EXECUTABLE_DIR and is always portable; an AppImage becomes
// portable when a folder named "Xenia Dashboard Data" already sits beside it. Otherwise: null (normal user folders).
const PORTABLE_FOLDER='Xenia Dashboard Data';
function portableUserData(env=process.env,exists=existsSync){
  if(env.PORTABLE_EXECUTABLE_DIR)return path.join(env.PORTABLE_EXECUTABLE_DIR,PORTABLE_FOLDER);
  if(env.APPIMAGE){const folder=path.join(path.dirname(env.APPIMAGE),PORTABLE_FOLDER);if(exists(folder))return folder;}
  return null;
}
// Where the dashboard keeps the Xenia builds it downloads. On Linux that is a program, not configuration, so it lives under
// ~/.local/share rather than ~/.config; Windows and the portable mode keep it with the rest of the dashboard's data.
function defaultInstallsRoot({userData,home,platform,portable}){
  if(portable||platform!=='linux')return path.join(userData,'xenia');
  return path.join(home,'.local','share','xenia-dashboard','xenia');
}
const insideFolder=(file,folder)=>{const relative=path.relative(path.resolve(folder),path.resolve(file));return !!relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
// A path that sat inside `from` follows the folder to `to`; anything else is left alone.
const relocate=(file,from,to)=>file&&insideFolder(file,from)?path.join(to,path.relative(path.resolve(from),path.resolve(file))):file;
async function moveFolder(from,to){
  const fs=require('node:fs/promises');
  await fs.mkdir(path.dirname(to),{recursive:true});
  try{await fs.rename(from,to);}
  catch(error){
    if(!['EXDEV','ENOTEMPTY','EEXIST','EPERM'].includes(error.code))throw error;
    await fs.cp(from,to,{recursive:true,errorOnExist:true,force:false});
    await fs.rm(from,{recursive:true,force:true});
  }
}
module.exports={selectUserData,migrateUserData,portableUserData,PORTABLE_FOLDER,defaultInstallsRoot,insideFolder,relocate,moveFolder};
