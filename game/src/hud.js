// The HUD: a glass-cockpit style overlay of live instruments, drawn in the
// DOM so the text stays crisp at any size. Left: the primary flight display
// (altitude, speed, heading, artificial horizon, fuel). Right: the sortie
// panel (score, rings, timer, throttle). Centre: messages and the title /
// pause / end screens. Every value is refreshed from the plane each frame.
import { CONFIG, metresToFeet, speedToKnots } from './config.js';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.altEl = document.getElementById('hud-alt');
    this.spdEl = document.getElementById('hud-spd');
    this.hdgEl = document.getElementById('hud-hdg');
    this.fuelEl = document.getElementById('hud-fuel');
    this.fuelBar = document.getElementById('hud-fuelbar');
    this.thrEl = document.getElementById('hud-thr');
    this.thrBar = document.getElementById('hud-thrbar');
    this.scoreEl = document.getElementById('hud-score');
    this.ringsEl = document.getElementById('hud-rings');
    this.timeEl = document.getElementById('hud-time');
    this.msgEl = document.getElementById('hud-message');
    this.horizon = document.getElementById('hud-horizon');
    this.horizonCtx = this.horizon.getContext('2d');
    this.nextRingEl = document.getElementById('hud-nextring');
    this._msgTimer = 0;
  }

  // Refresh every instrument from the live plane and mission state.
  update(plane, mission, dt) {
    this.altEl.textContent = String(metresToFeet(plane.pos.y)).padStart(5, '0');
    this.spdEl.textContent = String(speedToKnots(plane.speed)).padStart(3, '0');
    this.hdgEl.textContent = String(Math.round(plane.headingDeg())).padStart(3, '0');
    const fuel = Math.round(plane.fuel);
    this.fuelEl.textContent = `${fuel}%`;
    this.fuelBar.style.width = `${fuel}%`;
    this.fuelBar.classList.toggle('low', fuel < 25);
    const thr = Math.round(plane.throttle * 100);
    this.thrEl.textContent = `${thr}%`;
    this.thrBar.style.width = `${thr}%`;
    this.scoreEl.textContent = String(mission.score);
    this.ringsEl.textContent = `${mission.ringsCleared} / ${CONFIG.rings.length}`;
    const remain = Math.max(0, Math.ceil(mission.timeLeft));
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
    this.timeEl.textContent = `${mm}:${ss}`;
    this.timeEl.classList.toggle('low', remain < 60);
    if (mission.ringsCleared < CONFIG.rings.length) {
      this.nextRingEl.textContent = `NEXT RING ${mission.ringsCleared + 1} — follow the gold gate`;
    } else {
      this.nextRingEl.textContent = 'ALL RINGS CLEARED — land on the runway!';
    }
    this._drawHorizon(plane);
    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.msgEl.classList.add('hidden');
    }
  }

  // Artificial horizon: a small canvas with a sky/ground split that tilts
  // with the bank and slides with the pitch — the instrument that makes the
  // cockpit feel flown rather than drawn.
  _drawHorizon(plane) {
    const ctx = this.horizonCtx;
    const w = this.horizon.width;
    const h = this.horizon.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-plane.roll);
    const pitchPx = plane.pitch * 40;
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-w, -h + pitchPx, w * 2, h);
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-w, pitchPx, w * 2, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w, pitchPx);
    ctx.lineTo(w, pitchPx);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol over the horizon.
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h / 2);
    ctx.lineTo(w / 2 + 16, h / 2);
    ctx.moveTo(w / 2, h / 2 - 4);
    ctx.lineTo(w / 2, h / 2 + 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  showMessage(text, seconds = 2.5) {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('hidden');
    this._msgTimer = seconds;
  }

  showScreen(id) {
    for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
    if (id) document.getElementById(id).classList.remove('hidden');
  }

  setEndScreen(title, lines, showRestart = true) {
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-lines').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    document.getElementById('end-restart').classList.toggle('hidden', !showRestart);
    this.showScreen('screen-end');
  }
}
