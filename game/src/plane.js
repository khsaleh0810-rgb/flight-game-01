// The plane — "Kupu", a little yellow island-hopper — and its arcade flight
// model. The mesh is built from primitives (a tapered fuselage, straight
// wings, a tail and a spinning propeller) so the aircraft reads as built,
// not drawn. The model is deliberately forgiving: throttle sets target speed,
// pitch trades speed for altitude, bank turns the heading, and below the
// minimum speed the wings stall and the nose drops. Ground contact is checked
// against the world's heightAt() every frame.
// The UMD build sets window.THREE (a classic script); importing it as an
// ES module yields an empty namespace, so modules read the global.
const THREE = window.THREE;
import { CONFIG, clamp, normaliseHeading } from './config.js';
import { heightAt } from './world.js';

export const PLANE_STATE = {
  PARKED: 'parked',
  FLYING: 'flying',
  LANDED: 'landed',
  CRASHED: 'crashed',
};

export class Plane {
  constructor(scene) {
    this.group = new THREE.Group();
    this.prop = null;
    this._buildMesh();
    scene.add(this.group);
    this.reset();
  }

  _buildMesh() {
    const yellow = new THREE.MeshLambertMaterial({ color: 0xffc21a });
    const cream = new THREE.MeshLambertMaterial({ color: 0xfff3d0 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
    const red = new THREE.MeshLambertMaterial({ color: 0xd23c2e });

    // Fuselage: a cylinder along the forward axis, nose cone at the front.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 6.4, 10), yellow);
    body.rotation.x = Math.PI / 2;
    this.group.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 10), red);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -4.1;
    this.group.add(nose);
    // Cockpit canopy: a half-sphere of dark glass on top.
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }),
    );
    canopy.position.set(0, 0.55, -0.6);
    canopy.scale.set(1, 0.8, 1.6);
    this.group.add(canopy);
    // Main wing and tailplane.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.28, 1.9), cream);
    wing.position.set(0, -0.1, -0.4);
    this.group.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 1.3), cream);
    tail.position.set(0, 0.25, 3.0);
    this.group.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 1.5), red);
    fin.position.set(0, 0.9, 3.0);
    this.group.add(fin);
    // Landing gear: two fixed wheels so the parked plane sits on the strip.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), dark);
      leg.position.set(side * 1.1, -1.2, -0.8);
      this.group.add(leg);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.1, -1.75, -0.8);
      this.group.add(wheel);
    }
    // Propeller: two blades on a hub, spun in update().
    this.prop = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), dark);
    hub.rotation.x = Math.PI / 2;
    this.prop.add(hub);
    for (const a of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.6, 0.12), dark);
      blade.rotation.z = a;
      this.prop.add(blade);
    }
    this.prop.position.z = -5.1;
    this.group.add(this.prop);
  }

  reset() {
    const s = CONFIG.startPos;
    this.pos = new THREE.Vector3(s.x, s.y, s.z);
    this.heading = (CONFIG.startHeadingDeg * Math.PI) / 180; // 0 = north
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.fuel = CONFIG.fuelCapacity;
    this.state = PLANE_STATE.PARKED;
    this.verticalSpeed = 0;
    this._syncMesh();
  }

  // Parked on the title screen: idle propeller, no physics, no fuel burn.
  idle(dt) {
    this._spinProp(dt, 0.05);
    this._syncMesh();
  }

  // Place the plane mid-course for a screenshot or a quick restart.
  placeAt(x, y, z, headingDeg, speed) {
    this.pos.set(x, y, z);
    this.heading = (headingDeg * Math.PI) / 180;
    this.pitch = 0;
    this.roll = 0;
    this.speed = speed;
    this.throttle = 0.65;
    this.state = PLANE_STATE.FLYING;
    this._syncMesh();
  }

  // One physics step. `ctl` is the input snapshot; `dt` seconds. Returns an
  // event string ('ring', 'landed', 'crashed', 'fuel-empty') or null.
  update(dt, ctl) {
    if (this.state === PLANE_STATE.CRASHED || this.state === PLANE_STATE.LANDED) {
      this._spinProp(dt, 0.05); // propeller winds down on the ground
      return null;
    }
    const cfg = CONFIG;

    // Throttle: Shift up, Ctrl down, mouse drag vertical trims pitch.
    this.throttle = clamp(this.throttle + ctl.throttle * dt * 0.7, 0, 1);
    if (ctl.mouseDown) {
      this.pitch = clamp(this.pitch - ctl.drag.y * 0.0016, -0.6, 0.6);
      this.roll = clamp(this.roll + ctl.drag.x * 0.002, -1.1, 1.1);
    }

    // Stick: arrows pitch and roll toward their targets, then relax.
    const targetPitch = ctl.pitch * 0.45;
    const targetRoll = ctl.roll * 0.9;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3.2);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 3.2);
    if (!ctl.mouseDown && ctl.pitch === 0 && ctl.roll === 0) {
      this.pitch *= Math.max(0, 1 - dt * 1.4);
      this.roll *= Math.max(0, 1 - dt * 1.8);
    }

    // Speed chases the throttle; drag and climb bleed it off.
    const targetSpeed = cfg.minSpeed + this.throttle * (cfg.maxSpeed - cfg.minSpeed);
    const climbCost = Math.max(0, Math.sin(this.pitch)) * 14;
    this.speed += (targetSpeed - climbCost - this.speed) * Math.min(1, dt * (0.5 + cfg.drag));

    // Heading turns with the bank; steeper bank turns faster.
    this.heading += -this.roll * cfg.turnRate * dt * clamp(this.speed / cfg.cruiseSpeed, 0.3, 1.4);

    // Vertical speed: pitch lifts, gravity pulls, stall drops the nose.
    // A gentle sink applies whenever the nose is level, so the plane will
    // not cruise forever with the stick untouched.
    const flying = this.speed > cfg.minSpeed;
    if (flying) {
      this.verticalSpeed = Math.sin(this.pitch) * this.speed * cfg.climbPerPitch - 2.0;
    } else if (this.state === PLANE_STATE.FLYING) {
      // Stalled: sink, nose down.
      this.verticalSpeed = -9;
      this.pitch = Math.max(this.pitch - dt * 0.5, -0.35);
    } else {
      this.verticalSpeed = 0;
    }

    // Integrate. Heading 0 = north (-Z), 90 = east (+X).
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.pos.addScaledVector(forward, this.speed * dt);
    this.pos.y += this.verticalSpeed * dt;

    // Takeoff: once fast enough on the runway, the parked plane lifts off.
    if (this.state === PLANE_STATE.PARKED && this.speed >= cfg.minSpeed && this.pitch > 0.06) {
      this.state = PLANE_STATE.FLYING;
    }

    // Fuel: full throttle burns fastest; empty tank means gliding to a stop.
    this.fuel = Math.max(0, this.fuel - cfg.fuelBurnPerSec * (0.25 + this.throttle * 0.75) * dt);
    if (this.fuel <= 0 && this.throttle > 0) {
      this.throttle = 0;
      if (this.state === PLANE_STATE.FLYING && this.speed < cfg.minSpeed) return 'fuel-empty';
    }

    this._spinProp(dt, 0.15 + this.throttle);
    this._syncMesh();
    return this._checkGround();
  }

  _spinProp(dt, rate) {
    if (this.prop) this.prop.rotation.z += dt * (6 + rate * 34);
  }

  _syncMesh() {
    this.group.position.copy(this.pos);
    // Yaw about Y, then pitch about the local X, then roll about local Z.
    // The mesh nose faces -Z, so yaw is -heading; positive pitch is nose
    // up; positive roll banks right, which is a negative Z rotation.
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = -this.heading;
    this.group.rotation.x = this.pitch;
    this.group.rotation.z = -this.roll;
  }

  _checkGround() {
    const ground = heightAt(this.pos.x, this.pos.z);
    const rw = CONFIG.runway;
    const onRunway = Math.abs(this.pos.x - rw.x) < rw.length / 2
      && Math.abs(this.pos.z - rw.z) < rw.width / 2 + 4;
    const clearance = this.pos.y - ground;

    if (clearance > 1.2) return null;
    // Touching down.
    if (onRunway && this.state === PLANE_STATE.FLYING
      && Math.abs(this.verticalSpeed) < 8 && this.speed < 55) {
      this.pos.y = rw.elevation + 1.75;
      this.pitch = 0;
      this.roll = 0;
      this.state = PLANE_STATE.LANDED;
      this.fuel = CONFIG.fuelCapacity; // ground crew refuels the hopper
      this._syncMesh();
      return 'landed';
    }
    if (this.state === PLANE_STATE.PARKED) {
      this.pos.y = rw.elevation + 1.75;
      this._syncMesh();
      return null;
    }
    // Water or hillside at speed: a crash. A gentle ditching at low speed
    // on the beach still counts, because the sea has no beach to land on.
    this.pos.y = ground + 0.6;
    this.state = PLANE_STATE.CRASHED;
    this._syncMesh();
    return 'crashed';
  }

  // Distance from the plane to a ring centre, and whether it is close
  // enough to count as flown through.
  ringDistance(ring) {
    return Math.hypot(this.pos.x - ring.x, this.pos.y - ring.y, this.pos.z - ring.z);
  }

  headingDeg() {
    return normaliseHeading(this.heading);
  }
}
