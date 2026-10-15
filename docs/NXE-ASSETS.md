# NXE skin resources

> **Blades skin and boot videos.** `skins/blades/assets/` holds pieces taken from the MC360 2.1 XBMC skin by Team
> BlackBolt, as repackaged in Fabxx/XBMC360 release 0.5 (textures decoded from its `textures.xpr`, its `bkgd_frames`,
> sounds and `MC360.ttf`); its blade slides and second-level open/close sounds (`bladeslide-1..3`, `tier2-enter/exit`)
> are the Blades dashboard's own, 2.0.6717 (`dash_BladeSwitch_2..4`, `dash_2ndLevelOpen/Close`, XMA converted to WAV). The boot videos are the Xbox 360 start-up screens: `skins/nxe/assets/boot.webm` (Blades / NXE, 2005-2011)
> and `skins/kinect/assets/boot.webm` (Kinect / Metro, 2011-2012, for the future skins), both cut from a 4K capture of the
> Xbox start-up screens and re-encoded at 1080p. They derive from Microsoft's dashboards: private use only, to be removed
> or replaced before any public release.
>
> **Kinect skin.** `skins/kinect/assets/` holds pieces of the Kinect dashboard 2.0.13604 (`$flash_dash.xex` of the
> system update, its XUIZ v3 archives): the aura background and floor, the grey tile pictograms (a few white menu
> pictograms are used as shapes only), the A/B/X/Y legends, the orb and the interface sounds converted from XMA to WAV.
> The tile swoosh is drawn in SVG. **NXE skin.** It draws with the NXE pack (below) and adds the dashboard's channel-change sound
> (`skins/nxe/assets/channel.wav`, from `snd_channeldown.xma`). **Metro skin.** `skins/metro-v1/assets/` holds pieces of dashboard 2.0.15574 (same
> source, same format): the default background, the white tile pictograms, the default box art and the A/B/X/Y legends;
> its sounds are the Kinect files (byte-identical in 15574). Microsoft's: private use only, to be removed or replaced before any public release.

The built-in theme includes the 48 recovered image/audio assets the NXE view uses, and their metadata, under `assets/nxe/`: the original green background, the nine Theme0/Theme1/Theme2 wallpapers of the system update, the horizon glow, the channel marker, the orb, the slot textures (Games, Settings, Music, Photos, Videos, BlankGreen), the glossy slot pictograms, the menu pictograms of the settings tiles, the button legends and seven interface sound cues.

The source dashboard resources are NXE 2.0.7371.0. Images and converted PCM WAV cues are loaded locally through the restricted artwork protocol. The separate background track is `assets/dashboard-music.ogg`; its source is listed in [asset attribution](assets/ATTRIBUTION.md).

The resource parser validates XUIZ archives and XEX containers, and decodes XUR strings/vectors. Xbox executable code is not executed. XUR DATA timelines and full console-shell behavior are not implemented.

Floor geometry, ripple rings, tile lighting/reflections, movement, rounded shadows, and the smooth menu frame are rendered in CSS/JavaScript. Scene-specific avatar/prop layers and square box-art shadows are retained in the inventory but not applied to the library.

Existing cached themes remain supported. Import/decoder APIs are not exposed by the shipped app. Asset recovery is developer-only; normal use needs no dashboard download, import, or conversion. The font is not bundled.

Microsoft dashboard assets retain their ownership and are separate from the MIT source-code license. See [FFMPEG-NOTICE.md](../FFMPEG-NOTICE.md) for converter licensing.
