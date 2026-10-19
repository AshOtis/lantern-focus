/* Lantern Focus: one task, one block of time, and a calm screen.
 * Focus sessions with breaks, a place to park stray thoughts, a screen that dims everything except your note,
 * and Now playing: whatever your other players (or Spotify) are playing, with simple controls. */

const LF_VIEW = 'lantern-focus-view';
const LF_PLANS = { 25: 5, 50: 10, 90: 15 };   // focus minutes -> break minutes
const LF_DEFAULTS = {
  minutes: 25, chimes: true, calm: true, calmSidebars: true,
  logToDaily: true, autoBreak: true, longBreakEvery: 4, longBreak: 20,
  parkNow: false, theme: 'amber', musicFollows: true, breakPause: true, systemNow: false, blend: true,
  task: '', session: null,          // a running session survives a restart: { phase, task, endsAt, pausedLeft, startedAt, focusMin, breakMin, round, thoughts[] }
  history: []                        // last few sessions: { day, minutes, task }
};
const LF_THEMES = [['amber', 'Amber', '#ffb95c'], ['sea', 'Sea', '#6cc4ec'], ['forest', 'Forest', '#8cce78'], ['dusk', 'Dusk', '#ba96ff'], ['mono', 'Mono', '#dcdcd8']];

class LanternView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return LF_VIEW; }
  getDisplayText() { return 'Lantern Focus'; }
  getIcon() { return 'lamp'; }
  async onOpen() { this.build(); this.plugin.views.add(this); this.paint(); }
  async onClose() { this.plugin.views.delete(this); }

  build() {
    const el = this.contentEl; el.empty(); el.addClass('lf-host');
    const root = this.root = el.createDiv({ cls: 'lf' });
    const glow = root.createDiv({ cls: 'lf-glow' }); glow.setAttr('aria-hidden', 'true');
    const head = root.createDiv({ cls: 'lf-head' });
    const hr = head.createDiv({ cls: 'lf-head-r' });
    this.today = hr.createDiv({ cls: 'lf-today' });

    // the task
    this.taskWrap = root.createDiv({ cls: 'lf-task' });
    this.taskInput = this.taskWrap.createEl('input', { cls: 'lf-input', attr: { type: 'text', placeholder: 'What will you focus on?', 'aria-label': 'Task' } });
    this.taskInput.value = this.plugin.d.task || '';
    this.taskInput.addEventListener('input', () => { this.plugin.d.task = this.taskInput.value; this.plugin.save(); });
    this.taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') this.plugin.start(); });
    this.noteChip = this.taskWrap.createEl('button', { cls: 'lf-notechip' });
    this.noteChip.addEventListener('click', () => { const f = this.plugin.currentNote(); if (!f) return; this.taskInput.value = f.basename; this.plugin.d.task = f.basename; this.plugin.d.taskNote = f.path; this.plugin.save(); this.paint(); });
    this.taskInput.addEventListener('input', () => { this.plugin.d.taskNote = null; });
    this.taskShown = root.createDiv({ cls: 'lf-task-shown' });

    // the lantern: a ring that empties as time passes
    const ringWrap = root.createDiv({ cls: 'lf-ring-wrap' });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('class', 'lf-ring');
    const mk = (cls, r) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 100); c.setAttribute('cy', 100); c.setAttribute('r', r); c.setAttribute('class', cls); svg.appendChild(c); return c; };
    mk('lf-ring-track', 88); this.arc = mk('lf-ring-arc', 88);
    this.arc.style.strokeDasharray = String(2 * Math.PI * 88);
    ringWrap.appendChild(svg);
    const mid = ringWrap.createDiv({ cls: 'lf-ring-mid' });
    this.phaseEl = mid.createDiv({ cls: 'lf-phase' });
    this.timeEl = mid.createDiv({ cls: 'lf-time' });
    this.roundEl = mid.createDiv({ cls: 'lf-round' });

    // length
    this.lenRow = root.createDiv({ cls: 'lf-chips' });
    this.lenBtns = {};
    for (const m of Object.keys(LF_PLANS).map(Number)) {
      const b = this.lenRow.createEl('button', { cls: 'lf-chip', text: `${m} min` });
      b.setAttr('aria-label', `${m} minutes of focus, ${LF_PLANS[m]} minute break`);
      b.title = `${m} minutes, then a ${LF_PLANS[m]} minute break`;
      b.addEventListener('click', () => { this.plugin.d.minutes = m; this.plugin.save(); this.paint(); });
      this.lenBtns[m] = b;
    }

    // controls
    const ctl = root.createDiv({ cls: 'lf-ctl' });
    this.bStop = ctl.createEl('button', { cls: 'lf-btn lf-side', attr: { 'aria-label': 'Stop' } }); setIcon(this.bStop, 'square');
    this.bStop.addEventListener('click', () => this.plugin.stop());
    this.bMain = ctl.createEl('button', { cls: 'lf-btn lf-main' });
    this.bMain.addEventListener('click', () => this.plugin.primary());
    this.bMore = ctl.createEl('button', { cls: 'lf-btn lf-side', attr: { 'aria-label': 'Five more minutes' } }); this.bMore.setText('+5');
    this.bMore.addEventListener('click', () => this.plugin.addMinutes(5));

    // now playing: whatever your other players or Spotify are playing
    const np = this.np = root.createDiv({ cls: 'lf-card lf-np' });
    np.createDiv({ cls: 'lf-label', text: 'Now playing' });
    const row = np.createDiv({ cls: 'lf-np-row' });
    this.npArt = row.createDiv({ cls: 'lf-np-art' });
    const info = row.createDiv({ cls: 'lf-np-info' });
    this.npApp = info.createDiv({ cls: 'lf-np-app' });
    this.npTitle = info.createDiv({ cls: 'lf-np-title' });
    this.npSub = info.createDiv({ cls: 'lf-np-sub' });
    const npc = np.createDiv({ cls: 'lf-np-ctl' });
    const nb = (icon, label, fn) => { const b = npc.createEl('button', { cls: 'lf-btn lf-np-btn', attr: { 'aria-label': label } }); setIcon(b, icon); b.addEventListener('click', () => { fn(); setTimeout(() => this.paint(), 150); }); return b; };
    this.npPrev = nb('skip-back', 'Previous', () => this.npSrc && this.npSrc.controls.prev && this.npSrc.controls.prev());
    this.npPlay = nb('play', 'Play or pause', () => this.npSrc && this.npSrc.controls.toggle());
    this.npNext = nb('skip-forward', 'Next', () => this.npSrc && this.npSrc.controls.next && this.npSrc.controls.next());
    this.npOpen = nb('external-link', 'Open the player', () => this.npSrc && this.npSrc.controls.open && this.npSrc.controls.open());
    this.npEmpty = np.createDiv({ cls: 'lf-hint' });

    // park a thought
    const park = root.createDiv({ cls: 'lf-card' });
    park.createDiv({ cls: 'lf-label', text: 'Park a thought' });
    this.parkInput = park.createEl('input', { cls: 'lf-input', attr: { type: 'text', placeholder: 'Write it down, then back to work…', 'aria-label': 'Park a thought' } });
    this.parkInput.addEventListener('keydown', e => { if (e.key === 'Enter' && this.parkInput.value.trim()) { this.plugin.park(this.parkInput.value); this.parkInput.value = ''; } });
    this.thoughts = park.createEl('ul', { cls: 'lf-thoughts' });
    this.parkHint = park.createDiv({ cls: 'lf-hint' });
    const nowRow = park.createEl('label', { cls: 'lf-check' });
    this.parkNowEl = nowRow.createEl('input', { attr: { type: 'checkbox' } });
    nowRow.createSpan({ text: 'Write to my daily note straight away' });
    this.parkNowEl.addEventListener('change', () => { this.plugin.d.parkNow = this.parkNowEl.checked; this.plugin.save(); this.paint(); });

    // the end of a session
    this.done = root.createDiv({ cls: 'lf-done' });
  }

  paint() {
    if (!this.root) return;
    const p = this.plugin, d = p.d, s = d.session, now = Date.now();
    const phase = s ? s.phase : 'idle';
    this.root.dataset.phase = phase;
    this.root.toggleClass('lf-blend', d.blend !== false);
    if (d.theme && d.theme !== 'amber') this.root.dataset.theme = d.theme; else delete this.root.dataset.theme;
    this.root.toggleClass('is-paused', !!(s && s.pausedLeft != null));

    const left = s ? (s.pausedLeft != null ? s.pausedLeft : Math.max(0, s.endsAt - now)) : d.minutes * 60000;
    const total = s ? (s.phase === 'break' ? s.breakMin : s.focusMin) * 60000 : d.minutes * 60000;
    const mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
    this.timeEl.setText(`${mm}:${String(ss).padStart(2, '0')}`);
    const waiting = !!(s && s.phase === 'focus' && s.pausedLeft != null && s.pausedLeft >= s.focusMin * 60000);
    this.phaseEl.setText(phase === 'focus' ? (waiting ? 'Ready' : s.pausedLeft != null ? 'Paused' : 'Focus') : phase === 'break' ? 'Break' : 'Ready');
    this.roundEl.setText(s ? `Round ${s.round}` : `${d.minutes} min · ${LF_PLANS[d.minutes] || 5} min break`);
    const C = 2 * Math.PI * 88;
    this.arc.style.strokeDashoffset = String(C * (1 - (s ? left / total : 1)));

    this.taskInput.parentElement.toggleClass('is-hidden', !!s);
    // the note you're on: offered as the task, and used if you start without typing one
    const note = p.currentNote();
    this.taskInput.placeholder = note ? `What will you focus on? (${note.basename})` : 'What will you focus on?';
    const showChip = !!(note && this.taskInput.value.trim() !== note.basename);
    this.noteChip.toggleClass('is-hidden', !showChip);
    if (showChip && this.noteChip.dataset.n !== note.path) { this.noteChip.dataset.n = note.path; this.noteChip.empty(); setIcon(this.noteChip.createSpan({ cls: 'lf-notechip-ico' }), 'file-text'); this.noteChip.createSpan({ text: 'Use this note: ' + note.basename }); }
    this.taskShown.setText(s ? (s.task || 'Focus') : '');
    this.taskShown.toggleClass('is-hidden', !s);
    this.lenRow.toggleClass('is-hidden', !!s);
    for (const m in this.lenBtns) this.lenBtns[m].toggleClass('is-on', Number(m) === d.minutes);

    this.bMain.empty();
    setIcon(this.bMain, !s || s.pausedLeft != null ? 'play' : 'pause');
    this.bMain.setAttr('aria-label', !s ? 'Start' : s.pausedLeft != null ? 'Resume' : 'Pause');
    this.bMain.title = this.bMain.getAttr('aria-label');
    this.bStop.disabled = !s; this.bMore.disabled = !s;

    this.paintNow();

    const th = s ? s.thoughts : (p.looseThoughts || []);
    const key = JSON.stringify(th) + d.parkNow;
    if (key !== this.thKey) {
      this.thKey = key;
      this.thoughts.empty();
      th.forEach((t, i) => {
        const li = this.thoughts.createEl('li');
        li.toggleClass('is-saved', !!t.saved);
        li.createSpan({ text: t.text });
        if (t.saved) { const ok = li.createSpan({ cls: 'lf-saved', attr: { 'aria-label': 'In your daily note' } }); setIcon(ok, 'check'); return; }
        const sv = li.createEl('button', { cls: 'lf-x', attr: { 'aria-label': 'Write to daily note now' } }); setIcon(sv, 'calendar-plus');
        sv.addEventListener('click', () => p.saveThought(t));
        const x = li.createEl('button', { cls: 'lf-x', attr: { 'aria-label': 'Remove' } }); setIcon(x, 'x');
        x.addEventListener('click', () => { th.splice(i, 1); p.save(); this.paint(); });
      });
    }
    this.parkNowEl.checked = !!d.parkNow;
    this.parkHint.setText(d.parkNow ? 'Each thought goes into your daily note as soon as you press Enter.' : 'Parked thoughts go to your daily note when the session ends.');
    this.parkHint.toggleClass('is-hidden', th.length > 0);

    const mins = p.minutesToday();
    this.today.setText(mins ? `${mins} min today` : '');

    this.done.empty();
    if (p.lastDone && !s) {
      const r = p.lastDone;
      this.done.createDiv({ cls: 'lf-done-title', text: 'Session complete' });
      this.done.createDiv({ text: `${r.minutes} minutes on ${r.task || 'your task'}${r.thoughts ? ` · ${r.thoughts} thought${r.thoughts === 1 ? '' : 's'} parked` : ''}.` });
      if (r.logged) this.done.createDiv({ cls: 'lf-hint', text: 'Saved to your daily note.' });
    }
    this.done.toggleClass('is-hidden', !(p.lastDone && !s));
  }
}

LanternView.prototype.paintNow = function () {
  const p = this.plugin, src = this.npSrc = p.nowSource();
  this.np.toggleClass('is-empty', !src);
  this.npEmpty.setText(src ? '' : p.anyPlayer() ? 'Nothing playing. Press play in Static FM, Hi-Fi Tuner, Aurora MP3, MFP Player or Spotify and it shows here.' : 'Install one of my players (Static FM, Hi-Fi Tuner, Aurora MP3 or MFP Player), or turn on "What\'s playing on your computer" in settings for Spotify.');
  this.npEmpty.toggleClass('is-hidden', !!src);
  for (const el of [this.npArt.parentElement, this.npPlay.parentElement]) el.toggleClass('is-hidden', !src);
  if (!src) return;
  this.npApp.setText((src.playing ? '' : 'Paused · ') + src.app);
  this.npTitle.setText(src.title || '');
  this.npSub.setText(src.sub || '');
  const artKey = src.id + '|' + (src.art ? src.art.length + src.art.slice(-24) : src.icon);
  if (this.npArt.dataset.k !== artKey) {
    this.npArt.dataset.k = artKey; this.npArt.empty();
    if (src.art) { const im = this.npArt.createEl('img', { attr: { alt: '', src: src.art } }); im.draggable = false; }
    else setIcon(this.npArt, src.icon || 'music');
  }
  if (this.npPlayState !== src.playing) { this.npPlayState = src.playing; this.npPlay.empty(); setIcon(this.npPlay, src.playing ? 'pause' : 'play'); }
  this.npPrev.toggleClass('is-hidden', !src.controls.prev);
  this.npNext.toggleClass('is-hidden', !src.controls.next);
  this.npOpen.toggleClass('is-hidden', !src.controls.open);
};

class ParkModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    this.titleEl.setText('Park a thought');
    const input = this.contentEl.createEl('input', { cls: 'lf-modal-input', attr: { type: 'text', placeholder: 'Write it down, then back to work…' } });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { if (input.value.trim()) this.plugin.park(input.value); this.close(); } });
    setTimeout(() => input.focus(), 10);
  }
  onClose() { this.contentEl.empty(); }
}

class LanternFocus extends Plugin {
  async onload() {
    this.d = Object.assign({}, LF_DEFAULTS, await this.loadData());
    if (!LF_PLANS[this.d.minutes]) this.d.minutes = 25;
    if (this.d.session) this.d.session.thoughts = (this.d.session.thoughts || []).map(t => typeof t === 'string' ? { text: t, saved: false } : t);
    this.views = new Set();
    this.chime = new LFChime();
    this.recent = [];   // player ids, most recently started first
    this.sysNow = new AMSystemNow(st => { if (st && st.playing) this.touch('computer'); this.refresh(); });
    this.lastDone = null;

    this.registerView(LF_VIEW, leaf => new LanternView(leaf, this));
    this.addRibbonIcon('lamp', 'Lantern Focus', () => this.activateView());
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('lf-status');
    this.registerDomEvent(this.statusEl, 'click', () => this.activateView());

    const cmds = [
      ['open', 'Open', () => this.activateView()],
      ['start-pause', 'Start, pause or resume', () => this.primary()],
      ['stop', 'Stop the session', () => this.stop()],
      ['more', 'Five more minutes', () => this.addMinutes(5)],
      ['calm', 'Calm screen on or off', () => { this.d.calm = !this.d.calm; this.save(); this.applyCalm(); new Notice(`Lantern Focus: calm screen ${this.d.calm ? 'on' : 'off'}`); }]
    ];
    for (const [id, name, callback] of cmds) this.addCommand({ id, name, callback });
    this.addCommand({ id: 'park', name: 'Park a thought', callback: () => new ParkModal(this.app, this).open() });
    this.addSettingTab(new LanternSettings(this.app, this));

    // remember which player you started last, so Now playing shows that one
    this.registerEvent(this.app.workspace.on('ashotis:playing', src => { this.touch(src === 'aurora-mp3' ? (this.ampExt() ? 'computer' : 'aurora-music') : src); this.refresh(); }));
    this.registerEvent(this.app.workspace.on('ashotis:stopped', () => this.refresh()));
    this.app.workspace.onLayoutReady(() => { if (this.d.systemNow && !this.ampHandlesComputer()) this.sysNow.start(); });

    this.registerInterval(window.setInterval(() => this.tick(), 1000));
    // keep the "use this note" suggestion up to date as you move between notes
    this.registerEvent(this.app.workspace.on('file-open', () => { this.lastNote = this.app.workspace.getActiveFile() || this.lastNote; this.refresh(); }));
    this.app.workspace.onLayoutReady(() => { this.resume(); this.tick(); });
  }

  onunload() { this.chime.destroy(); this.sysNow.stop(); document.body.removeClass('lantern-calm'); }

  /* ---------- now playing ---------- */
  touch(id) { this.recent = [id].concat(this.recent.filter(x => x !== id)).slice(0, 8); }
  plugins() { return (this.app.plugins && this.app.plugins.plugins) || {}; }
  anyPlayer() { const P = this.plugins(); return !!(P['static-fm'] || P['hifi-tuner'] || P['aurora-music'] || P['mfp-player'] || this.sysNow.state); }
  ampHandlesComputer() { const a = this.plugins()['aurora-music']; return !!(a && a.d && a.d.systemNow && a.sysNow); }
  ampExt() { const a = this.plugins()['aurora-music']; return !!(a && a.extShown && a.extShown()); }
  nowSource() {
    const list = lfSources(this);
    for (const s of list) if (s.playing && !this.recent.includes(s.id)) this.recent.push(s.id);
    return lfPickSource(list, this.recent);
  }
  setSystemNow(on) {
    this.d.systemNow = on; this.save();
    if (on && !this.ampHandlesComputer()) this.sysNow.start(); else this.sysNow.stop();
    this.refresh();
  }
  // with "music follows the session": pause your music for breaks, play it again when you get back to work
  musicTo(play) {
    if (!this.d.musicFollows) return;
    if (!play && this.d.breakPause === false) return;   // "keep playing through breaks"
    const src = this.nowSource(); if (!src) return;
    if (play && !src.playing) src.controls.toggle();
    if (!play && src.playing) src.controls.toggle();
  }

  save() { clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => this.saveData(this.d), 300); }

  /* ---------- the session ---------- */
  primary() {
    const s = this.d.session;
    if (!s) return this.start();
    if (s.pausedLeft != null) this.resumePause(); else this.pause();
  }

  start() {
    const focusMin = this.d.minutes, breakMin = LF_PLANS[focusMin] || 5;
    let task = (this.d.task || '').trim(), notePath = task ? this.d.taskNote || null : null;
    if (!task) { const f = this.currentNote(); if (f) { task = f.basename; notePath = f.path; } }
    this.d.session = { phase: 'focus', task, notePath, startedAt: Date.now(), endsAt: Date.now() + focusMin * 60000,
      pausedLeft: null, focusMin, breakMin, round: 1, thoughts: [] };
    this.lastDone = null;
    this.save();
    if (this.d.chimes) this.chime.play('start');
    this.musicTo(true);
    this.applyCalm(); this.refresh();
  }

  pause() {
    const s = this.d.session; if (!s || s.pausedLeft != null) return;
    s.pausedLeft = Math.max(0, s.endsAt - Date.now());
    this.save(); this.applyCalm(); this.refresh();
  }

  resumePause() {
    const s = this.d.session; if (!s || s.pausedLeft == null) return;
    const fresh = s.phase === 'focus' && s.pausedLeft >= s.focusMin * 60000;
    if (fresh) { s.startedAt = Date.now(); if (this.d.chimes) this.chime.play('start'); this.musicTo(true); }
    s.endsAt = Date.now() + s.pausedLeft; s.pausedLeft = null;
    this.save(); this.applyCalm(); this.refresh();
  }

  addMinutes(m) {
    const s = this.d.session; if (!s) return;
    if (s.pausedLeft != null) s.pausedLeft += m * 60000; else s.endsAt += m * 60000;
    if (s.phase === 'focus') s.focusMin += m; else s.breakMin += m;
    this.save(); this.refresh();
  }

  // Stop early: log what was done (if anything), then reset
  stop() {
    const s = this.d.session; if (!s) return;
    if (s.phase === 'focus') this.finishFocus(true); else this.endSession();
  }

  // after a restart, a session that ran out while Obsidian was closed is wrapped up
  resume() {
    const s = this.d.session; if (!s) return;
    if (s.pausedLeft == null && Date.now() > s.endsAt) { if (s.phase === 'focus') this.finishFocus(false, true); else this.endSession(); return; }
    this.applyCalm();
  }

  tick() {
    const s = this.d.session;
    if (s && s.pausedLeft == null && Date.now() >= s.endsAt) {
      if (s.phase === 'focus') this.finishFocus(false); else this.endBreak();
    }
    this.refresh();
  }

  focusedMinutes(s, early) {
    if (!early) return s.focusMin;
    const ran = s.pausedLeft != null ? s.focusMin * 60000 - s.pausedLeft : s.focusMin * 60000 - Math.max(0, s.endsAt - Date.now());
    return Math.max(0, Math.round(ran / 60000));
  }

  async finishFocus(early, quiet) {
    const s = this.d.session;
    const minutes = this.focusedMinutes(s, early);
    if (!quiet && !early && this.d.chimes) this.chime.play('end');
    if (!quiet && !early && this.d.autoBreak) this.musicTo(false);
    let logged = false;
    s.thoughts = (s.thoughts || []).map(t => typeof t === 'string' ? { text: t, saved: false } : t);
    if (minutes > 0 || s.thoughts.some(t => !t.saved)) logged = await this.log(s, minutes);
    if (minutes > 0) { this.d.history.push({ day: window.moment().format('YYYY-MM-DD'), minutes, task: s.task }); this.d.history = this.d.history.slice(-60); }
    this.lastDone = { minutes, task: s.task, thoughts: s.thoughts.length, logged };
    if (early || !this.d.autoBreak) { this.d.session = null; }
    else {
      const long = this.d.longBreakEvery && s.round % this.d.longBreakEvery === 0;
      const br = long ? this.d.longBreak : s.breakMin;
      this.d.session = Object.assign({}, s, { phase: 'break', endsAt: Date.now() + br * 60000, breakMin: br, pausedLeft: null, thoughts: [] });
      if (!quiet) new Notice(`Lantern Focus: ${minutes} minutes done. Take ${br} minutes.`);
    }
    this.save(); this.applyCalm(); this.refresh();
  }

  endBreak() {
    const s = this.d.session;
    if (this.d.chimes) this.chime.play('break');
    new Notice('Lantern Focus: break over. Press play when you are ready.');
    // the next round waits for you: ready, but not started
    this.d.session = Object.assign({}, s, { phase: 'focus', round: s.round + 1, endsAt: 0, pausedLeft: s.focusMin * 60000, thoughts: [], startedAt: Date.now() });
    this.save(); this.applyCalm(); this.refresh();
  }

  endSession() { this.d.session = null; this.save(); this.applyCalm(); this.refresh(); }

  park(text) {
    const t = text.trim(); if (!t) return;
    const item = { text: t, saved: false };
    if (this.d.session) this.d.session.thoughts.push(item);
    else (this.looseThoughts = this.looseThoughts || []).push(item);
    // straight to the daily note when that's switched on, or when no session is running
    if (this.d.parkNow || !this.d.session) this.saveThought(item);
    this.save(); this.refresh();
  }

  // write one parked thought to today's daily note now, as a task
  async saveThought(item) {
    if (item.saved) return;
    const ok = await this.appendDaily(`- [ ] ${item.text}\n`);
    if (ok) { item.saved = true; this.save(); this.refresh(); }
    else new Notice('Lantern Focus: could not write to your daily note');
  }

  // the note you were last on (clicking into Lantern's own panel doesn't count)
  currentNote() {
    const f = this.app.workspace.getActiveFile();
    if (f) this.lastNote = f;
    const n = this.lastNote;
    return n && n.extension === 'md' && this.app.vault.getAbstractFileByPath(n.path) ? n : null;
  }

  minutesToday() {
    const day = window.moment().format('YYYY-MM-DD');
    return this.d.history.filter(h => h.day === day).reduce((a, h) => a + h.minutes, 0);
  }

  /* ---------- calm screen: during focus, everything but your note fades back ---------- */
  applyCalm() {
    const s = this.d.session;
    const on = !!(this.d.calm && s && s.phase === 'focus' && s.pausedLeft == null);
    document.body.toggleClass('lantern-calm', on);
    document.body.toggleClass('lantern-calm-sides', on && this.d.calmSidebars);
  }

  /* ---------- the daily note ---------- */
  dailyNotePath() {
    let folder = '', format = 'YYYY-MM-DD';
    try { const o = this.app.internalPlugins.getPluginById('daily-notes').instance.options; if (o) { folder = o.folder || ''; format = o.format || format; } } catch (e) { /* core plugin off: defaults */ }
    return (folder ? folder.replace(/\/+$/, '') + '/' : '') + window.moment().format(format) + '.md';
  }

  async log(s, minutes) {
    if (!this.d.logToDaily) return false;
    const from = window.moment(s.startedAt).format('HH:mm'), to = window.moment().format('HH:mm');
    const lines = [];
    const what = s.notePath ? `[[${s.notePath.replace(/\.md$/i, '')}|${s.task}]]` : s.task;
    if (minutes > 0) lines.push(`- ${from}–${to} Focused ${minutes} min${what ? ' on ' + what : ''}`);
    const open = (s.thoughts || []).filter(t => !(t && t.saved)).map(t => typeof t === 'string' ? t : t.text);
    if (!(minutes > 0) && open.length) lines.push(`- ${to} Parked thought${open.length > 1 ? 's' : ''}`);
    for (const t of open) lines.push(`  - [ ] ${t}`);
    if (!lines.length) return false;
    return this.appendDaily(lines.join('\n') + '\n');
  }

  async appendDaily(text) {
    const path = this.dailyNotePath();
    try {
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
        await this.app.vault.create(path, text);
      } else await this.app.vault.process(file, t => (t && !t.endsWith('\n') ? t + '\n' : t) + text);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- views and status bar ---------- */
  refresh() {
    for (const v of this.views) v.paint();
    const s = this.d.session;
    if (!s) { this.statusEl.setText(''); this.statusEl.toggleClass('lf-hidden', true); return; }
    const left = s.pausedLeft != null ? s.pausedLeft : Math.max(0, s.endsAt - Date.now());
    const mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
    this.statusEl.toggleClass('lf-hidden', false);
    this.statusEl.setText(`${s.phase === 'break' ? 'Break' : s.pausedLeft != null ? 'Paused' : 'Focus'} ${mm}:${String(ss).padStart(2, '0')}`);
    this.statusEl.setAttr('aria-label', 'Lantern Focus: open');
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(LF_VIEW)[0];
    if (!leaf) { leaf = workspace.getRightLeaf(false); if (!leaf) return; await leaf.setViewState({ type: LF_VIEW, active: true }); }
    await workspace.revealLeaf(leaf);
  }
}

class LanternSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const el = this.containerEl, p = this.plugin, d = p.d;
    el.empty();
    new Setting(el).setName('Colours').setDesc('Amber is warm and easy on the eyes in the evening, Sea and Forest are cooler and calmer, Dusk is soft violet, and Mono has no colour at all. With Blend with the sidebar on, the colour only tints the timer ring.')
      .addDropdown(dd => { for (const [k, name] of LF_THEMES) dd.addOption(k, name); dd.setValue(d.theme || 'amber').onChange(v => { d.theme = v; p.save(); p.refresh(); }); });
    new Setting(el).setName('Blend with the sidebar').setDesc('Use your theme\'s own colours, like the file list, with a soft dimmed timer. Turn off for Lantern\'s own dark panel with a glowing ring.')
      .addToggle(t => t.setValue(d.blend !== false).onChange(v => { d.blend = v; p.save(); p.refresh(); }));
    new Setting(el).setName('Calm screen').setDesc('While you focus, the ribbon, tabs, status bar and background glows fade back, so only your note stands out. Hover over anything to bring it back.')
      .addToggle(t => t.setValue(d.calm).onChange(v => { d.calm = v; p.save(); p.applyCalm(); }));
    new Setting(el).setName('Fade the file list too').setDesc('Also fade the left sidebar during focus.')
      .addToggle(t => t.setValue(d.calmSidebars).onChange(v => { d.calmSidebars = v; p.save(); p.applyCalm(); }));
    new Setting(el).setName('Chimes').setDesc('A soft bell when a session starts, when it ends, and when a break is over.')
      .addToggle(t => t.setValue(d.chimes).onChange(v => { d.chimes = v; p.save(); }));
    new Setting(el).setName('Breaks').setDesc('Start a break automatically when a focus session ends.')
      .addToggle(t => t.setValue(d.autoBreak).onChange(v => { d.autoBreak = v; p.save(); }));
    new Setting(el).setName('Long break').setDesc('Every few rounds, take a longer break.')
      .addDropdown(dd => dd.addOptions({ 0: 'Never', 3: 'Every 3 rounds', 4: 'Every 4 rounds', 5: 'Every 5 rounds' }).setValue(String(d.longBreakEvery)).onChange(v => { d.longBreakEvery = Number(v); p.save(); }))
      .addDropdown(dd => dd.addOptions({ 15: '15 min', 20: '20 min', 30: '30 min' }).setValue(String(d.longBreak)).onChange(v => { d.longBreak = Number(v); p.save(); }));
    new Setting(el).setName('Log to daily note').setDesc('When a session ends, add a line such as "09:00–09:50 Focused 50 min on Chapter three", with any parked thoughts as tasks under it.')
      .addToggle(t => t.setValue(d.logToDaily).onChange(v => { d.logToDaily = v; p.save(); }));
    new Setting(el).setName('Write thoughts straight away').setDesc('Each parked thought goes into your daily note as a task the moment you press Enter, instead of when the session ends. You can also send a single thought with the calendar button next to it.')
      .addToggle(t => t.setValue(!!d.parkNow).onChange(v => { d.parkNow = v; p.save(); p.refresh(); }));
    new Setting(el).setName('Now playing').setHeading();
    new Setting(el).setName('Music follows the session').setDesc('When a focus session starts, press play on the player shown in Now playing.')
      .addToggle(t => t.setValue(d.musicFollows).onChange(v => { d.musicFollows = v; p.save(); this.display(); }));
    if (d.musicFollows) new Setting(el).setName('Pause music for breaks').setDesc('Turn off to keep the music playing when the focus timer ends.')
      .addToggle(t => t.setValue(d.breakPause !== false).onChange(v => { d.breakPause = v; p.save(); }));
    const ampDoes = p.ampHandlesComputer();
    new Setting(el).setName("What's playing on your computer").setDesc(ampDoes
      ? 'Aurora MP3 is already reading this for you, so Spotify shows in Now playing.'
      : AMSystemNow.supported()
        ? 'Show Spotify, browsers, Apple Music, VLC and other apps in Now playing, with play, pause and skip. Read from Windows; no account needed. It runs a small hidden Windows PowerShell process while this is on.'
        : 'Windows only for now.')
      .addToggle(t => t.setValue(!!d.systemNow).setDisabled(ampDoes || !AMSystemNow.supported()).onChange(v => p.setSystemNow(v)));
  }
}
