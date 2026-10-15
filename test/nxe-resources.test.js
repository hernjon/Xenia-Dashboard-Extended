'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const vm=require('node:vm'),fs=require('node:fs');const resources=require('../src/nxe-resources');
function fixture(){
  const b=Buffer.alloc(1056);b.write('XEX2');b.writeUInt32BE(1024,8);b.writeUInt32BE(256,16);b.writeUInt32BE(1,20);b.writeUInt32BE(0x3ff,24);b.writeUInt32BE(128,28);b.writeUInt32BE(32768,260);
  b.writeUInt16BE(2,134);b.writeUInt32BE(1<<20,136);b.writeUInt32BE(32,140);b.writeUInt16BE(4,1048);
  crypto.createHash('sha1').update(b.subarray(1024)).digest().copy(b,144);return b;
}
test('XEX cabinet conversion authenticates blocks and limits decompression size',()=>{
  const b=fixture(),cab=resources.cabinet(b);assert.equal(cab.toString('ascii',0,4),'MSCF');assert.equal(cab.readUInt32LE(8),cab.length);
  b[1050]^=1;assert.throws(()=>resources.cabinet(b),/authentication/);
  const oversized=fixture();oversized.writeUInt32BE(100*1024*1024,260);assert.throws(()=>resources.cabinet(oversized),/Unsupported/);
  assert.throws(()=>resources.header(Buffer.alloc(30)),/XEX2/);
});
test('XUR strings and vectors decode with section bounds validation',()=>{
  const b=Buffer.alloc(74);b.write('XUIB');b.writeUInt32BE(5,4);b.writeUInt32BE(74,14);b.writeUInt16BE(2,18);
  b.write('STRN',20);b.writeUInt32BE(44,24);b.writeUInt32BE(18,28);b.write('VECT',32);b.writeUInt32BE(62,36);b.writeUInt32BE(12,40);
  b.writeUInt16BE(8,44);for(let i=0;i<8;i++)b.writeUInt16BE('FadeIn!!'.charCodeAt(i),46+i*2);b.writeFloatBE(46,62);
  const result=resources.parseXur(b);assert.equal(result.strings[0],'FadeIn!!');assert.deepEqual(result.vectors,[[46,0,0]]);
  b.writeUInt32BE(999,36);assert.throws(()=>resources.parseXur(b),/bounds/);
});
test('sound playback accepts only cached assets and honors volume/mute',()=>{
  const clips=[];const context=vm.createContext({window:{},performance:{now:()=>1000},Audio:class{constructor(url){this.url=url;clips.push(this);}pause(){}play(){this.played=true;return Promise.resolve();}}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','ui','ui-sounds.js'),'utf8'),context);const sounds=context.window.uiSounds;
  sounds.configure({sounds:{select:'kratos-art://theme/01234567890123456789',bad:'https://remote/audio.wav'},audio:{volume:.25,muted:false}});
  assert.equal(clips.length,1);assert.equal(sounds.play('select'),true);assert.equal(clips[0].volume,.25);sounds.muted=true;assert.equal(sounds.play('select'),false);
  sounds.configure({sounds:{select:'kratos-art://theme/01234567890123456789'},audio:{volume:.5,muted:false},sound:{music:false,effects:true}});assert.equal(sounds.play('select'),true,'music off keeps the effects');
  sounds.configure({sounds:{select:'kratos-art://theme/01234567890123456789'},audio:{volume:.5,muted:false},sound:{music:true,effects:false}});assert.equal(sounds.play('select'),false,'effects off silences them');
});

test('changing section has its own sound, and a look without one keeps using the menu sound',()=>{
  const played=[];
  class Audio{constructor(url){this.url=url;this.volume=1;this.currentTime=0;}pause(){}play(){played.push(this.url);return Promise.resolve();}}
  const context=vm.createContext({window:{},Audio,performance:{now:(()=>{let t=0;return()=>t+=500;})()}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','ui','ui-sounds.js'),'utf8'),context);
  const sounds=context.window.uiSounds,url=name=>`nxe-app://dashboard/skins/blades/assets/${name}.wav`;
  sounds.configure({sounds:{slide:url('swoosh'),focus:url('boop')},audio:{volume:1,muted:false}});
  sounds.play('slide');sounds.play('focus');assert.deepEqual(played,[url('swoosh'),url('boop')],'two different sounds');
  played.length=0;
  sounds.configure({sounds:{focus:url('boop')},audio:{volume:1,muted:false}});
  assert.equal(sounds.play('slide'),true);assert.deepEqual(played,[url('boop')],'no sound of its own: the menu sound');
});

test('each section can have its own slide sound; a look with fewer falls back to slide, then to the menu sound',()=>{
  const played=[];
  class Audio{constructor(url){this.url=url;this.volume=1;this.currentTime=0;}pause(){}play(){played.push(this.url.split('/').pop());return Promise.resolve();}}
  const context=vm.createContext({window:{},Audio,performance:{now:(()=>{let t=0;return()=>t+=500;})()}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','ui','ui-sounds.js'),'utf8'),context);
  const sounds=context.window.uiSounds,url=name=>`nxe-app://dashboard/skins/blades/assets/${name}.wav`;
  sounds.configure({sounds:{slide1:url('s1'),slide2:url('s2'),slide3:url('s3'),slide4:url('s4'),focus:url('boop')},audio:{volume:1,muted:false}});
  for(const role of ['slide1','slide2','slide3','slide4','focus'])sounds.play(role);
  assert.deepEqual(played,['s1.wav','s2.wav','s3.wav','s4.wav','boop.wav']);
  played.length=0;sounds.configure({sounds:{slide:url('generic'),focus:url('boop')},audio:{volume:1,muted:false}});sounds.play('slide3');
  assert.deepEqual(played,['generic.wav']);
  played.length=0;sounds.configure({sounds:{focus:url('boop')},audio:{volume:1,muted:false}});sounds.play('slide2');
  assert.deepEqual(played,['boop.wav']);
});
