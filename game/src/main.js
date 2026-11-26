// Island Hopper — entry point. Boots the renderer, the chase camera, the
// mission state machine and the main loop. States: 'title' (parked on the
// runway, press Enter to fly), 'flying', 'paused', 'landed', 'crashed' and
// 'complete'. The mission: fly through all six gold rings over Kaluna island,
// then land back on the runway before the fuel or the five-minute clock runs
// out. Landing refuels the hopper and pays a bonus; a crash or a timeout ends
// the sortie.
//
// Screenshot mode: ?shot=start|play|ring|end stages a deterministic scene
// and sets window.__shotReady once the first frames have rendered, so the
// screenshots are real renders of the game itself.
// The UMD build sets window.THREE (a classic script); importing it as an
// ES module yields an empty namespace, so modules read the global.
const THREE = window.THREE;
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Plane, PLANE_STATE } from './plane.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';

const GAME_STATE = {
  TITLE: 'title',
  FLYING: 'flying',
  PAUSED: 'paused',
  LANDED: 'landed',
  CRASHED: 'crashed',
  COMPLETE: 'complete',
};

class IslandHopper {
  constructor() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 4000);
    this.world = new World(this.scene);
    this.plane = new Plane(this.scene);
    this.hud = new Hud();
    this.input = new Input(canvas);
    this.sound = new SoundEngine();
    this.state = GAME_STATE.TITLE;
    this.mission = this._freshMission();
    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._frames = 0;
    this._shot = new URLSearchParams(window.location.search).get('shot');
    this._shotReady = false;

    window.addEventListener('resize', () => this._onResize());
    document.getElementById('btn-fly').addEventListener('click', () => this._startFlight());
    document.getElementById('btn-restart').addEventListener('click', () => this._restart());
    document.getElementById('end-restart').addEventListener('click', () => this._restart());
    document.addEventListener('keydown', (e) => {
      this.sound.unlock();
      if (e.code === 'Enter' && this.state === GAME_STATE.TITLE) this._startFlight();
      if (e.code === 'KeyR' && this.state !== GAME_STATE.TITLE) this._restart();
      if (e.code === 'KeyP') this._togglePause();
      if (e.code === 'KeyM') this.sound.setMuted(!this.sound.muted);
    });
    canvas.addEventListener('mousedown', () => this.sound.unlock());

    this._stageShot();
    this._lastTime = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _freshMission() {
    return { score: 0, ringsCleared: 0, timeLeft: CONFIG.timeLimitSec, landed: false };
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _startFlight() {
    this.sound.unlock();
    this.sound.click();
    this.state = GAME_STATE.FLYING;
    this.hud.showScreen(null);
    this.hud.showMessage('FULL THROTTLE — hold SHIFT, pull UP to climb', 3.5);
  }

  _restart() {
    this.plane.reset();
    this.mission = this._freshMission();
    this.world.activeIndex = 0;
    this.state = GAME_STATE.TITLE;
    this.hud.showScreen('screen-title');
    this.hud.update(this.plane, this.mission, 0);
  }

  _togglePause() {
    if (this.state === GAME_STATE.FLYING) {
      this.state = GAME_STATE.PAUSED;
      this.hud.showScreen('screen-pause');
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.FLYING;
      this.hud.showScreen(null);
    }
  }

  _frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;
    this._frames++;

    const ctl = this.input.snapshot();
    if (this.state === GAME_STATE.FLYING) {
      this.mission.timeLeft -= dt;
      const event = this.plane.update(dt, ctl);
      this._checkRings();
      this._checkMissionEnd(event);
      this.sound.updateFlight(this.plane.throttle, this.plane.speed / CONFIG.maxSpeed);
    } else if (this.state === GAME_STATE.TITLE) {
      // Parked on the runway: idle propeller, camera slowly orbiting the plane.
      this.plane.idle(dt);
    }
    this.world.update(dt);
    this._updateCamera(dt);
    this.hud.update(this.plane, this.mission, dt);
    this.renderer.render(this.scene, this.camera);

    if (this._shot && !this._shotReady && this._frames > 6) {
      this._shotReady = true;
      window.__shotReady = true;
    }
  }

  _checkRings() {
    if (this.mission.ringsCleared >= CONFIG.rings.length) return;
    const ring = CONFIG.rings[this.mission.ringsCleared];
    if (this.plane.ringDistance(ring) < CONFIG.ringRadius) {
      this.mission.ringsCleared++;
      this.mission.score += CONFIG.scorePerRing;
      this.world.activeIndex = this.mission.ringsCleared;
      this.sound.ringChime();
      if (this.mission.ringsCleared >= CONFIG.rings.length) {
        this.hud.showMessage('ALL RINGS CLEARED! Land on the runway for +250', 4);
      } else {
        this.hud.showMessage(`RING ${this.mission.ringsCleared} CLEARED! +${CONFIG.scorePerRing}`, 2.5);
      }
    }
  }

  _checkMissionEnd(event) {
    if (event === 'landed') {
      this.sound.landingFanfare();
      if (this.mission.ringsCleared >= CONFIG.rings.length) {
        this.mission.score += CONFIG.landingBonus;
        this.state = GAME_STATE.COMPLETE;
        this.hud.setEndScreen('SORTIE COMPLETE!', [
          `Score: <b>${this.mission.score}</b> — all 6 rings + runway landing`,
          `Fuel refilled on the ground. Kaluna's skies are yours, pilot.`,
        ]);
      } else {
        this.mission.score += 50;
        this.state = GAME_STATE.LANDED;
        this.hud.setEndScreen('TOUCHDOWN!', [
          `Score: <b>${this.mission.score}</b> — landed with ${this.mission.ringsCleared} / 6 rings`,
          'Refuelled and ready. Press R to fly again and chase the rest.',
        ]);
      }
      return;
    }
    if (event === 'crashed') {
      this.sound.crashThud();
      this.state = GAME_STATE.CRASHED;
      this.hud.setEndScreen('CRASHED!', [
        `Score: <b>${this.mission.score}</b> — ${this.mission.ringsCleared} / 6 rings cleared`,
        'The hopper is tougher than it looks. Press R and try again.',
      ]);
      return;
    }
    if (event === 'fuel-empty') {
      this.hud.showMessage('FUEL EMPTY — gliding! Find the runway!', 4);
    }
    if (this.mission.timeLeft <= 0 && this.state === GAME_STATE.FLYING) {
      this.state = GAME_STATE.CRASHED;
      this.hud.setEndScreen('OUT OF TIME!', [
        `Score: <b>${this.mission.score}</b> — ${this.mission.ringsCleared} / 6 rings cleared`,
        'The five-minute sortie clock ran out. Press R to fly again.',
      ]);
    }
  }

  // Chase camera: sits behind and above the plane, looking ahead down the
  // nose, with a little lag so turns feel weighty. On the title screen it
  // orbits the parked plane instead.
  _updateCamera(dt) {
    const p = this.plane.pos;
    if (this.state === GAME_STATE.TITLE) {
      if (this._shot === 'start') {
        // Staged title shot: hold the camera still on the parked plane.
        this.camera.position.copy(this._camPos);
        this.camera.lookAt(this._camTarget);
        return;
      }
      const t = performance.now() / 1000;
      const r = 26;
      this._camPos.set(
        p.x + Math.sin(t * 0.12) * r,
        p.y + 9 + Math.sin(t * 0.2) * 2,
        p.z + Math.cos(t * 0.12) * r,
      );
      this._camTarget.copy(p).add(new THREE.Vector3(0, 2, 0));
    } else {
      const back = new THREE.Vector3(
        -Math.sin(this.plane.heading), 0, Math.cos(this.plane.heading),
      );
      const desired = p.clone()
        .addScaledVector(back, 17)
        .add(new THREE.Vector3(0, 6.5, 0));
      const k = 1 - Math.exp(-dt * 4.5);
      this._camPos.lerp(desired, k);
      this._camTarget.lerp(
        p.clone().add(new THREE.Vector3(Math.sin(this.plane.heading), 0.15, -Math.cos(this.plane.heading)).multiplyScalar(22)),
        1 - Math.exp(-dt * 7),
      );
    }
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTarget);
  }

  // Stage a deterministic scene for screenshots: the game itself, posed.
  _stageShot() {
    if (!this._shot) {
      this.hud.showScreen('screen-title');
      return;
    }
    if (this._shot === 'start') {
      this.state = GAME_STATE.TITLE;
      this.hud.showScreen('screen-title');
      // Title content rides to the top so the parked plane on the runway
      // shows in the lower half of the frame.
      document.body.classList.add('shot-start');
      this._camPos.set(52, 12, 258);
      this._camTarget.set(62, 7, 208);
    } else if (this._shot === 'play') {
      // Mid-flight over the island, second ring ahead, runway behind.
      this.plane.placeAt(-120, 72, 110, 63, 78);
      this.mission.ringsCleared = 1;
      this.world.activeIndex = 1;
      this.mission.score = 100;
      this.state = GAME_STATE.FLYING;
      this.hud.showScreen(null);
      this.hud.showMessage('RING 2 AHEAD — bank right through the gold gate', 6);
      // Let the camera settle behind the plane before the shot.
      this._camPos.set(-128, 79, 126);
      this._camTarget.set(-60, 70, 60);
    } else if (this._shot === 'ring') {
      // Seconds from flying through ring 3, lighthouse and runway in view.
      this.plane.placeAt(-215, 82, -60, 30, 84);
      this.mission.ringsCleared = 2;
      this.world.activeIndex = 2;
      this.mission.score = 200;
      this.state = GAME_STATE.FLYING;
      this.hud.showScreen(null);
      this.hud.showMessage('RING 3 DEAD AHEAD', 6);
      this._camPos.set(-224, 89, -45);
      this._camTarget.set(-180, 80, -120);
    } else if (this._shot === 'end') {
      // Landed on the runway after a full course, complete screen up.
      this.plane.reset();
      this.plane.pos.set(150, CONFIG.runway.elevation + 1.75, 210);
      this.plane.state = PLANE_STATE.LANDED;
      this.plane._syncMesh();
      this.mission.ringsCleared = 6;
      this.mission.score = 850;
      this.state = GAME_STATE.COMPLETE;
      this.hud.setEndScreen('SORTIE COMPLETE!', [
        'Score: <b>850</b> — all 6 rings + runway landing',
        "Fuel refilled on the ground. Kaluna's skies are yours, pilot.",
      ]);
      this._camPos.set(118, 16, 238);
      this._camTarget.set(150, 8, 210);
    }
    this.hud.update(this.plane, this.mission, 0);
  }
}

const game = new IslandHopper();
// Debug / test handle: screenshots and playtests read state through this.
window.__islandHopper = game;
window.__shotReady = false;
