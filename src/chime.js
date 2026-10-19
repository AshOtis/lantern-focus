/* Lantern Focus: chimes. Small synthesised bells for the start and end of a session and the end of a break. */
class LFChime {
  constructor() { this.ctx = null; }
  play(kind, volume = 0.5) {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const notes = kind === 'start' ? [523.25] : kind === 'end' ? [659.25, 523.25] : [523.25, 659.25];
      notes.forEach((f, i) => {
        const t0 = this.ctx.currentTime + i * 0.55;
        for (const [mult, amp] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mult;
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.18 * amp * volume, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6 / mult);
          o.connect(g); g.connect(this.ctx.destination); o.start(t0); o.stop(t0 + 2.8);
        }
      });
    } catch (e) { /* no audio: stay quiet */ }
  }
  destroy() { try { if (this.ctx) this.ctx.close(); } catch (e) { /* closing */ } }
}
