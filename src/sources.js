/* Lantern Focus: Now playing. Shows what's playing in my other players (Static FM, Hi-Fi Tuner, Aurora MP3,
 * MFP Player) and on the computer (Spotify and others, Windows), with simple controls. Lantern plays no sound
 * of its own: it reads the players that are installed and asks them to play, pause or skip. */

// Each source returns { id, app, playing, title, sub, art, icon, controls: { toggle, next, prev, open } } or null.
function lfSources(plugin) {
  const P = plugin.app.plugins && plugin.app.plugins.plugins ? plugin.app.plugins.plugins : {};
  const out = [];
  const safe = fn => { try { return fn(); } catch (e) { return null; } };
  const openCmd = id => () => { const p = P[id]; if (p && p.activateView) p.activateView(); };

  // Aurora MP3: your own music, or (when it's leading) what's playing on the computer
  const amp = P['aurora-music'];
  if (amp) safe(() => {
    if (amp.extShown && amp.extShown()) {
      const x = amp.ext;
      out.push({ id: 'computer', app: x.appName, playing: x.playing, title: x.title, sub: [x.artist, x.album].filter(Boolean).join(' · '), art: x.art || '', icon: 'music',
        controls: { toggle: () => amp.sysNow.control('toggle'), next: () => amp.sysNow.control('next'), prev: () => amp.sysNow.control('prev'), open: openCmd('aurora-music') } });
    } else if (amp.player && amp.player.current) {
      const p = amp.player, t = p.current;
      out.push({ id: 'aurora-music', app: 'Aurora MP3', playing: !!p.playing, title: t.title, sub: [t.artist || t.albumArtist, t.album].filter(Boolean).join(' · '),
        art: t.cover ? amp.coverUrl(t.cover) : '', icon: 'disc-3',
        controls: { toggle: () => p.toggle(), next: () => p.next(), prev: () => p.prev(), open: openCmd('aurora-music') } });
    }
  });

  // Hi-Fi Tuner: the station, and the song when the station shares it
  const hft = P['hifi-tuner'];
  if (hft && hft.engine) safe(() => {
    const s = hft.engine.snapshot();
    if (!s.station) return;
    out.push({ id: 'hifi-tuner', app: 'Hi-Fi Tuner', playing: !!s.on, title: s.station.name, sub: s.nowPlaying || [s.station.tags, s.station.country].filter(Boolean).join(' · '),
      art: s.station.image || '', icon: 'radio',
      controls: { toggle: () => hft.engine.toggle(), next: () => hft.engine.step(1), prev: () => hft.engine.step(-1), open: openCmd('hifi-tuner') } });
  });

  // Static FM: the noise, its dial position and any binaural beat
  const sfm = P['static-fm'];
  if (sfm && sfm.engine) safe(() => {
    const s = sfm.engine.snapshot();
    const bin = s.binaural && s.binaural.on ? `${s.binaural.beat} Hz binaural` : 'Noise';
    out.push({ id: 'static-fm', app: 'Static FM', playing: !!s.playing, title: `${Number(s.live).toFixed(1)} MHz`, sub: bin + (s.muted ? ' · muted' : ''), art: '', icon: 'waves',
      controls: { toggle: () => sfm.engine.toggle(), open: openCmd('static-fm') } });
  });

  // MFP Player: the episode
  const mfp = P['mfp-player'];
  if (mfp && mfp.current) safe(() => {
    const ep = mfp.current(); if (!ep) return;
    const playing = !!(mfp.audio && mfp.audio.src && !mfp.audio.paused);
    const m = /^(?:Episode\s*)?(\d+)\s*[:\-–]\s*(.+)$/i.exec(ep.title || '');
    out.push({ id: 'mfp-player', app: 'MFP Player', playing, title: m ? m[2] : ep.title, sub: m ? 'Music For Programming · Episode ' + m[1] : 'Music For Programming', art: '', icon: 'music',
      controls: { toggle: () => mfp.togglePlay(), next: () => mfp.step(1), prev: () => mfp.prev ? mfp.prev() : mfp.step(-1), open: openCmd('mfp-player') } });
  });

  // Spotify and other apps, read by Lantern itself when Aurora MP3 isn't doing it
  if (!out.some(o => o.id === 'computer') && plugin.sysNow && plugin.sysNow.state) {
    const x = plugin.sysNow.state;
    out.push({ id: 'computer', app: x.appName, playing: x.playing, title: x.title, sub: [x.artist, x.album].filter(Boolean).join(' · '), art: x.art || '', icon: 'music',
      controls: { toggle: () => plugin.sysNow.control('toggle'), next: () => plugin.sysNow.control('next'), prev: () => plugin.sysNow.control('prev') } });
  }
  return out;
}

// Which one to show: whatever is playing (the one you started most recently first), else the last one you used
function lfPickSource(list, recent) {
  const rank = s => { const i = recent.indexOf(s.id); return i < 0 ? 99 : i; };
  const playing = list.filter(s => s.playing).sort((a, b) => rank(a) - rank(b));
  if (playing.length) return playing[0];
  const paused = list.filter(s => recent.includes(s.id)).sort((a, b) => rank(a) - rank(b));
  return paused[0] || null;
}
