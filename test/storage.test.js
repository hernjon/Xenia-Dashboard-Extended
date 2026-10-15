'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {selectUserData}=require('../src/storage');
test('Xenia Dashboard uses existing Kratos settings and caches, prefers its own settings, and respects explicit overrides',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nxe-storage-'));
  try{
    const fresh=path.join(root,'Xenia Dashboard'),legacy=path.join(root,'project-kratos');
    assert.equal(selectUserData(root,path.join(root,'nxe-launcher')),fresh);
    await fs.mkdir(legacy);await fs.writeFile(path.join(legacy,'library.json'),'existing credentials and preferences');
    assert.equal(selectUserData(root,fresh),legacy);
    assert.equal(await fs.readFile(path.join(legacy,'library.json'),'utf8'),'existing credentials and preferences');
    const installed=path.join(root,'Project Kratos');await fs.mkdir(installed);await fs.writeFile(path.join(installed,'library.json'),'installed profile');
    assert.equal(selectUserData(root,fresh,true),installed);
    assert.equal(selectUserData(root,fresh,false),legacy);
    await fs.mkdir(fresh);await fs.writeFile(path.join(fresh,'library.json'),'new profile');
    assert.equal(selectUserData(root,fresh),fresh);
    assert.equal(selectUserData(root,path.join(root,'custom')),path.join(root,'custom'));
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true});}
});

test('profiles from before the rename (the NXE folder) keep being used, so PIN, covers and settings survive',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xd-storage-'));
  try{
    const fresh=path.join(root,'Xenia Dashboard'),old=path.join(root,'NXE');
    assert.equal(selectUserData(root,fresh),fresh,'a new install starts in its own folder');
    await fs.mkdir(old);await fs.writeFile(path.join(old,'library.json'),'my settings');
    assert.equal(selectUserData(root,fresh),old,'the existing NXE profile wins over the empty default');
    assert.equal(selectUserData(root,fresh,true),old);
    await fs.mkdir(fresh);await fs.writeFile(path.join(fresh,'library.json'),'newer profile');
    assert.equal(selectUserData(root,fresh),fresh,'once the new folder has a profile it takes over');
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true});}
});

test('portable mode keeps all data beside the program',()=>{
  const {portableUserData}=require('../src/storage');
  assert.equal(portableUserData({},()=>false),null);
  assert.equal(portableUserData({PORTABLE_EXECUTABLE_DIR:path.join('E:','Games')},()=>false),path.join('E:','Games','Xenia Dashboard Data'));
  assert.equal(portableUserData({APPIMAGE:'/mnt/usb/XD.AppImage'},()=>false),null,'an AppImage is portable only when asked');
  assert.equal(portableUserData({APPIMAGE:'/mnt/usb/XD.AppImage'},()=>true),path.join('/mnt/usb','Xenia Dashboard Data'));
});

test('the NXE folder from before the rename is moved to "Xenia Dashboard" once, and nothing is overwritten',async()=>{
  const {migrateUserData}=require('../src/storage');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xd-migrate-'));
  const exists=file=>fs.access(file).then(()=>true,()=>false);
  try{
    assert.equal(migrateUserData(root),null,'nothing to move on a new install');
    const old=path.join(root,'NXE'),fresh=path.join(root,'Xenia Dashboard');
    await fs.mkdir(path.join(old,'covers'),{recursive:true});await fs.writeFile(path.join(old,'library.json'),'my settings');await fs.writeFile(path.join(old,'covers','a.jpg'),'cover');
    await fs.mkdir(fresh);                                     // an empty folder left by an earlier start
    assert.equal(migrateUserData(root),fresh);
    assert.equal(await fs.readFile(path.join(fresh,'library.json'),'utf8'),'my settings');
    assert.equal(await fs.readFile(path.join(fresh,'covers','a.jpg'),'utf8'),'cover','everything came along');
    assert.equal(await exists(old),false,'moved, not copied');
    assert.equal(selectUserData(root,fresh),fresh,'and the app now picks the new folder');
    assert.equal(migrateUserData(root),null,'a second start moves nothing');
    // The new folder already has settings: both stay as they are.
    await fs.mkdir(old);await fs.writeFile(path.join(old,'library.json'),'older');
    assert.equal(migrateUserData(root),null);
    assert.equal(await fs.readFile(path.join(fresh,'library.json'),'utf8'),'my settings');
    assert.equal(await exists(path.join(old,'library.json')),true,'the old folder is left alone');
    // The new folder has other things in it (no settings): it is not touched either.
    await fs.rm(fresh,{recursive:true});await fs.mkdir(fresh);await fs.writeFile(path.join(fresh,'Cookies'),'x');
    assert.equal(migrateUserData(root),null);
    assert.equal(await exists(path.join(old,'library.json')),true);
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true});}
});
