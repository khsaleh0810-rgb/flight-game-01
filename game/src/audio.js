// All sound is synthesised with WebAudio oscillators and filtered noise — no
// audio files, nothing to download, everything offline. The engine is a low
// sawtooth whose pitch follows the throttle, wind is looped filtered noise
// whose loudness follows airspeed, and events (ring, landing, crash) are short
// one-shot blips. Audio starts only after the first user gesture, as browsers
// require, and a mute toggle (M) silences everything.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._engineOsc = null;
    this._engineGain = null;
    this._windGain = null;
    this._windFilter = null;
  }

  // Call from a click/keydown handler. Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // Engine drone: two detuned sawtooths through a low-pass filter.
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55 * 1.005;
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0.0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this._engineOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(this._engineGain);
    this._engineGain.connect(this.ctx.destination);
    this._engineOsc.start();
    osc2.start();
    this._engineOsc2 = osc2;

    // Wind: white noise through a band-pass, loudness follows airspeed.
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this._windFilter = this.ctx.createBiquadFilter();
    this._windFilter.type = 'bandpass';
    this._windFilter.frequency.value = 700;
    this._windFilter.Q.value = 0.6;
    this._windGain = this.ctx.createGain();
    this._windGain.gain.value = 0.0;
    noise.connect(this._windFilter);
    this._windFilter.connect(this._windGain);
    this._windGain.connect(this.ctx.destination);
    noise.start();
  }

  // Called every frame while flying: throttle 0..1, speedRatio 0..1.
  updateFlight(throttle, speedRatio) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const engineLevel = 0.05 + throttle * 0.06;
    this._engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    this._engineOsc.frequency.setTargetAtTime(48 + throttle * 70, t, 0.1);
    this._engineOsc2.frequency.setTargetAtTime((48 + throttle * 70) * 1.005, t, 0.1);
    this._windGain.gain.setTargetAtTime(speedRatio * speedRatio * 0.12, t, 0.15);
    this._windFilter.frequency.setTargetAtTime(500 + speedRatio * 900, t, 0.15);
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._engineGain.gain.setTargetAtTime(muted ? 0 : 0.08, t, 0.05);
    this._windGain.gain.setTargetAtTime(0, t, 0.05);
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  ringChime() {
    this._blip(880, 0.35, 'sine', 0.25);
    this._blip(1318, 0.4, 'sine', 0.18, 0.09);
  }

  landingFanfare() {
    this._blip(523, 0.25, 'triangle', 0.22);
    this._blip(659, 0.25, 'triangle', 0.22, 0.14);
    this._blip(784, 0.5, 'triangle', 0.22, 0.28);
  }

  crashThud() {
    this._blip(70, 0.6, 'sawtooth', 0.3);
    this._blip(45, 0.8, 'square', 0.2, 0.05);
  }

  click() {
    this._blip(1200, 0.06, 'sine', 0.12);
  }
}
