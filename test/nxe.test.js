'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const nxe=require('../src/nxe');
function archive(name='icon.png'){
  const text=Buffer.from(name,'utf16le');text.swap16();const offset=22+9+text.length,buffer=Buffer.alloc(offset+8);
  buffer.write('XUIZ');buffer.writeUInt32BE(buffer.length,8);buffer.writeUInt32BE(offset-22,16);buffer.writeUInt16BE(1,20);
  buffer.writeUInt32BE(8,22);buffer[30]=name.length;text.copy(buffer,31);Buffer.from('89504e470d0a1a0a','hex').copy(buffer,offset);return buffer;
}
test('built-in NXE works without a cache, includes every wallpaper and sound, and persists portable preferences',async()=>{
  const theme=await nxe.loadTheme(null,'nonexistent-user-data');
  const visible=nxe.publicTheme(theme);
  assert.equal(theme.builtin,true);assert.equal(visible.backgrounds.length,10);assert.equal(Object.keys(visible.sounds).length,7);
  assert.equal(visible.selected,visible.backgrounds[0].id);
  for(const asset of Object.values(theme.manifest.assets))await fs.access(path.join(theme.directory,asset.file));
  theme.selected=visible.backgrounds[2].id;theme.audio={volume:.25,muted:true};
  const config=nxe.themeConfig(theme);assert.equal(config.directory,'builtin');
  const restored=await nxe.loadTheme(config,'nonexistent-user-data');assert.equal(restored.selected,theme.selected);assert.deepEqual(restored.audio,theme.audio);
  assert.equal((await nxe.loadTheme({...config,selected:null},'nonexistent-user-data')).selected,null);
  // The dashboard's own slot textures and glossy pictograms (used by the NXE look).
  for(const role of ['blank','games','settings','music','photos','videos'])assert.ok(visible.scene.tiles[role],role);
  for(const role of ['disc','games','settings','music','photos','videos'])assert.ok(visible.scene.glossy[role],role);
  assert.ok(visible.scene.menuOrb);assert.equal(visible.scene.discBadge,undefined);
});
test('XUIZ extraction checks names, archive length and payload bounds',()=>{
  const good=archive();assert.equal(nxe.parseXzp(good)[0].name,'icon.png');assert.equal(nxe.parseXzp(good)[0].bytes.length,8);
  assert.throws(()=>nxe.parseXzp(archive('../escape.png')),/Unsafe/);
  good.writeUInt32BE(99999,22);assert.throws(()=>nxe.parseXzp(good),/bounds/);
  assert.throws(()=>nxe.parseXzp(Buffer.from('XUIZ')),/Invalid/);
});
test('XUIZ version 3 (Kinect dashboard on) stores single-byte names',()=>{
  function v3(name){
    const text=Buffer.from(name,'latin1'),offset=22+9+text.length,buffer=Buffer.alloc(offset+8);
    buffer.write('XUIZ');buffer.writeUInt32BE(3,4);buffer.writeUInt32BE(buffer.length,8);buffer.writeUInt32BE(offset-22,16);buffer.writeUInt16BE(1,20);
    buffer.writeUInt32BE(8,22);buffer[30]=name.length;text.copy(buffer,31);Buffer.from('89504e470d0a1a0a','hex').copy(buffer,offset);return buffer;
  }
  const [entry]=nxe.parseXzp(v3('aura\\floor.png'));assert.equal(entry.name,'aura/floor.png');assert.equal(entry.bytes.length,8);
  assert.throws(()=>nxe.parseXzp(v3('..\\escape.png')),/Unsafe/);
});
test('theme import caches original images, persists selection, and checks authorization before publishing',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'kratos-nxe-'));
  try{
    const source=path.join(directory,'source'),data=path.join(directory,'data');await fs.mkdir(path.join(source,'Theme1'),{recursive:true});
    await fs.writeFile(path.join(source,'Theme1','Wallpaper1.jpg'),Buffer.from([255,216,255,224]));await fs.writeFile(path.join(source,'mediasite.xzp'),archive());
    let checks=0;const config=await nxe.importTheme(source,data,()=>checks++);assert.equal(checks,2);
    await fs.unlink(path.join(source,'Theme1','Wallpaper1.jpg'));
    const theme=await nxe.loadTheme(config,data),publicData=nxe.publicTheme(theme);
    assert.equal(publicData.backgrounds.length,1);assert.equal(publicData.assetCount,2);assert.equal(publicData.resourceCount,1);
    assert.equal((await nxe.loadTheme({...config,selected:null},data)).selected,null);
    await assert.rejects(nxe.loadTheme({directory:source},data),/Invalid imported/);
    await fs.writeFile(path.join(source,'Theme1','Wallpaper1.jpg'),Buffer.from([255,216,255,224]));
    await assert.rejects(nxe.importTheme(source,data,()=>{throw Error('Expired');}),/Expired/);
  }finally{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(directory,{recursive:true});}
});

test('every tile asks for a pictogram the built-in theme really provides, as a PNG, with a fallback', async t => {
  const fsp = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'xd-icons-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const theme = await nxe.loadTheme(null, root), icons = nxe.publicTheme(theme).icons;
  const registry = require('../dashboard/sections').createSectionRegistry();
  require('../sections/settings').registerSettingsSections(registry, { enter() {} });
  const wanted = new Set(registry.list().flatMap(section => section.items().map(item => item.icon)));
  assert.ok(wanted.size >= 8, 'tiles use different icons, not one shared one');
  for (const role of [...wanted, 'settings']) {
    assert.ok(icons[role], `the theme has no icon for "${role}"`);
    const id = icons[role].split('/').at(-1), file = path.join(theme.directory, theme.manifest.assets[id].file);
    assert.deepEqual([...(await fsp.readFile(file)).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${role} is a PNG`);
  }
});
