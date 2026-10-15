'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ttf':'font/ttf','.webm':'video/webm'};
async function readAsset(file,root,extensions,maxBytes=16*1024*1024){
  const ext=path.extname(file).toLowerCase();if(!extensions.includes(ext))throw Error('Unsupported local asset');
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)throw Error('Invalid local asset');
  const [realRoot,realFile]=await Promise.all([fs.realpath(root),fs.realpath(file)]);
  const relative=path.relative(realRoot,realFile);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Asset escapes allowed directory');
  const bytes=await fs.readFile(realFile);if(bytes.length>maxBytes)throw Error('Local asset exceeds limit');
  return {bytes,mime:MIME[ext]};
}
const APP_FILES=new Set(['index.html','ui/renderer.js','ui/covers-ui.js','dashboard/sections.js','dashboard/navigation.js','dashboard/skin.js','skins/nxe/nxe-skin.js','sections/library.js','sections/settings.js','skins/nxe/nxe.css','skins/blades/blades-skin.js','skins/blades/blades.css','skins/kinect/kinect-skin.js','skins/kinect/kinect.css','skins/metro-v1/metro-v1-skin.js','skins/metro-v1/metro-v1.css','ui/notice.js','ui/view-picker.js','ui/wizard.js','ui/wizard.css','ui/notice.css','ui/ui-sounds.js','ui/ui-music.js','assets/controller-buttons.jpg']);
// A skin's own pictures, sounds, font and boot video live in skins/<name>/assets/ (one sub-folder deep at most).
const SKIN_ASSET=/^skins\/[a-z][a-z0-9-]*\/assets\/(?:[a-z0-9-]+\/)?[\w.-]+\.(?:png|jpg|wav|ttf|webm)$/;
// The previews of the views (the timeline in the install wizard and in Dashboard Settings › View).
const VIEW_PREVIEW=/^assets\/views\/[a-z][a-z0-9-]*\.jpg$/;
const appFile=file=>APP_FILES.has(file)||(SKIN_ASSET.test(file)&&!file.includes('..'))||VIEW_PREVIEW.test(file);
module.exports={readAsset,APP_FILES,appFile};
