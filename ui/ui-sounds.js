'use strict';
// Only local WAV URLs supplied by the main process (a theme pack's, or a skin's own) are accepted.
window.uiSounds={
  clips:new Map(),volume:.5,muted:false,lastTime:0,
  configure(state){
    for(const audio of this.clips.values())audio.pause();this.clips.clear();
    this.volume=state.audio?.volume ?? .5;this.muted=state.sound?!state.sound.effects:(state.audio?.muted ?? false);
    for(const [role,url] of Object.entries(state.sounds || {})){
      if(!/^kratos-art:\/\/theme\/[a-f0-9]{20}$/.test(url)&&!/^nxe-app:\/\/dashboard\/skins\/[a-z][a-z0-9-]*\/assets\/[a-z0-9-]+\.wav$/.test(url))continue;
      const audio=new Audio(url);audio.preload='auto';audio.volume=this.volume;this.clips.set(role,audio);
    }
  },
  play(role){
    // 'slide1'…'slide4' (arriving at the 1st…4th section): a view may give each its own sound; else 'slide', else the menu's 'focus'.
    // 'notify' (a notification pops up) falls back to the sound of opening a window.
    const sliding=/^slide/.test(role);
    if(this.muted||this.volume===0)return false;const clip=this.clips.get(role)||(sliding?this.clips.get('slide')||this.clips.get('focus'):role==='notify'?this.clips.get('open'):null);if(!clip)return false;
    const now=performance.now();if((role==='focus'||sliding)&&now-this.lastTime<90)return false;
    this.lastTime=now;for(const audio of this.clips.values())audio.pause();clip.currentTime=0;clip.volume=this.volume;clip.play().catch(()=>{});return true;
  }
};
