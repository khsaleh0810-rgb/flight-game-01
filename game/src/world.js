// The island of Kaluna: one procedural island in a blue sea, built entirely
// from three.js primitives and a height function — no textures, no downloads.
// The same heightAt() that shapes the terrain mesh is what the flight model
// uses for ground collision, so the plane can never sink into a hill the
// player can see. The runway sits on a flattened shelf on the south-east
// side; six glowing rings mark the course over the island.
// The UMD build sets window.THREE (a classic script); importing it as an
// ES module yields an empty namespace, so modules read the global.
const THREE = window.THREE;
import { CONFIG } from './config.js';

// Deterministic pseudo-noise: smooth, cheap, and identical every run.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Ground height in metres at (x, z). 0 out at sea; hills rise toward the
// island centre; the runway shelf is flattened to the runway elevation.
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const rw = CONFIG.runway;
  const dr = Math.hypot(x - rw.x, z - rw.z);
  if (dr < rw.length * 0.62) {
    // Flattened shelf under and around the runway strip.
    const t = Math.min(1, dr / (rw.length * 0.62));
    const hill = islandHeight(x, z);
    return rw.elevation * (1 - t * t) + hill * t * t;
  }
  return islandHeight(x, z);
}

function islandHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r > CONFIG.islandRadius) return 0;
  const falloff = 1 - (r / CONFIG.islandRadius) ** 2;
  const hills = smoothNoise(x * 0.012 + 7, z * 0.012 + 3) * 0.65
    + smoothNoise(x * 0.045 + 13, z * 0.045 + 9) * 0.35;
  const ridge = smoothNoise(x * 0.02 + 40, z * 0.02 + 21);
  const peak = Math.max(0, 1 - Math.hypot(x + 120, z + 140) / 130) * 34 * ridge;
  return (hills * CONFIG.terrainMaxHeight * 0.55 + peak) * falloff + 2.5 * falloff;
}

function terrainColour(x, z, h) {
  // Sand near the waterline, grass on the flats, rock on the high ground.
  if (h < 4.5) return [0.86, 0.78, 0.55];
  if (h > 34) return [0.55, 0.52, 0.48];
  const n = smoothNoise(x * 0.05, z * 0.05);
  const g = 0.42 + n * 0.22;
  return [0.28 + n * 0.1, g, 0.22 + n * 0.08];
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.ringMeshes = [];
    this.clouds = [];
    this._time = 0;
    this._buildSky();
    this._buildSea();
    this._buildTerrain();
    this._buildRunway();
    this._buildTrees();
    this._buildLighthouse();
    this._buildClouds();
    this._buildRings();
  }

  _buildSky() {
    this.scene.background = new THREE.Color(0x87bfe8);
    this.scene.fog = new THREE.Fog(0x9fc8e8, 500, 1600);
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.15);
    sun.position.set(300, 420, 180);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xbfd9ee, 0.75));
    // A visible sun disc so the sky reads as a sky, not a flat colour.
    const sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(26, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
    );
    sunBall.position.set(420, 380, -700);
    this.scene.add(sunBall);
  }

  _buildSea() {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshLambertMaterial({ color: 0x1f7fb8 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0;
    this.scene.add(sea);
    // A second, slightly lighter sea disc far out gives the horizon a band.
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshBasicMaterial({ color: 0x2f8fc4 }),
    );
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.4;
    this.scene.add(far);
  }

  _buildTerrain() {
    const size = CONFIG.islandRadius * 2 + 120;
    const seg = 110;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const [r, g, b] = terrainColour(x, z, h);
      colours[i * 3] = r;
      colours[i * 3 + 1] = g;
      colours[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.scene.add(terrain);
  }

  _buildRunway() {
    const rw = CONFIG.runway;
    const group = new THREE.Group();
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(rw.length, 0.6, rw.width),
      new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
    );
    strip.position.set(rw.x, rw.elevation + 0.3, rw.z);
    group.add(strip);
    // Centreline dashes and threshold bars, pale against the asphalt.
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f5e8 });
    for (let i = -4; i <= 4; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 1.2), dashMat);
      dash.position.set(rw.x + i * 22, rw.elevation + 0.65, rw.z);
      group.add(dash);
    }
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, rw.width - 4), dashMat);
      bar.position.set(rw.x + side * (rw.length / 2 - 8), rw.elevation + 0.65, rw.z);
      group.add(bar);
    }
    // Windsock at the runway's west end.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 9, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
    );
    pole.position.set(rw.x - rw.length / 2 + 12, rw.elevation + 4.5, rw.z + 12);
    group.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 5, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(rw.x - rw.length / 2 + 15, rw.elevation + 8.6, rw.z + 12);
    group.add(sock);
    this.scene.add(group);
  }

  _buildTrees() {
    // Low-poly palms: a leaning trunk and a crown of flat cones. Placed by
    // the same hash so the layout is identical every run.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f3e });
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 7, 5);
    const crownGeo = new THREE.ConeGeometry(3.2, 4.5, 6);
    const count = 90;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crownGeo, leafMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < 600) {
      tries++;
      const x = (hash2(tries, 1) - 0.5) * 760;
      const z = (hash2(tries, 2) - 0.5) * 760;
      const h = heightAt(x, z);
      if (h < 5 || h > 26) continue;
      if (Math.hypot(x - CONFIG.runway.x, z - CONFIG.runway.z) < 150) continue;
      const scale = 0.8 + hash2(tries, 3) * 0.7;
      e.set(0, hash2(tries, 4) * Math.PI * 2, (hash2(tries, 5) - 0.5) * 0.2);
      q.setFromEuler(e);
      s.set(scale, scale, scale);
      m.compose(new THREE.Vector3(x, h + 3.5 * scale, z), q, s);
      trunks.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(x, h + (7 + 2.2) * scale, z), q, s);
      crowns.setMatrixAt(placed, m);
      placed++;
    }
    trunks.count = placed;
    crowns.count = placed;
    this.scene.add(trunks);
    this.scene.add(crowns);
  }

  _buildLighthouse() {
    // A striped lighthouse on the north headland: a landmark the pilot can
    // navigate by, and something recognisable in the screenshots.
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 5.5, 3, 10),
      new THREE.MeshLambertMaterial({ color: 0x8a8a8a }),
    );
    base.position.y = 1.5;
    group.add(base);
    const red = new THREE.MeshLambertMaterial({ color: 0xd23c2e });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(3.4 - i * 0.25, 3.6 - i * 0.25, 4.4, 10),
        i % 2 === 0 ? white : red,
      );
      band.position.y = 3 + 2.2 + i * 4.4;
      group.add(band);
    }
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe98a }),
    );
    lamp.position.y = 21.5;
    group.add(lamp);
    const hx = -260;
    const hz = -230;
    group.position.set(hx, heightAt(hx, hz), hz);
    this.scene.add(group);
  }

  _buildClouds() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 14; i++) {
      const group = new THREE.Group();
      const puffs = 3 + Math.floor(hash2(i, 7) * 3);
      for (let p = 0; p < puffs; p++) {
        const r = 7 + hash2(i, p) * 9;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
        puff.position.set(p * 10 - puffs * 5, hash2(p, i) * 3, hash2(i, p + 20) * 8 - 4);
        puff.scale.y = 0.55;
        group.add(puff);
      }
      group.position.set(
        (hash2(i, 11) - 0.5) * 1400,
        110 + hash2(i, 12) * 70,
        (hash2(i, 13) - 0.5) * 1400,
      );
      group.userData.drift = 1.5 + hash2(i, 14) * 2.5;
      this.clouds.push(group);
      this.scene.add(group);
    }
  }

  _buildRings() {
    const geo = new THREE.TorusGeometry(CONFIG.ringRadius, 1.1, 10, 40);
    for (const ring of CONFIG.rings) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.55 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(ring.x, ring.y, ring.z);
      // Face the ring toward the previous gate so the pilot flies through it.
      mesh.rotation.y = Math.PI / 2;
      mesh.userData.baseY = ring.y;
      this.scene.add(mesh);
      this.ringMeshes.push(mesh);
    }
    this.setActiveRing(0);
  }

  // The next gate glows bright gold; passed gates go green and dim; later
  // gates stay amber. Called whenever the ring index changes.
  setActiveRing(index) {
    this.ringMeshes.forEach((mesh, i) => {
      if (i < index) {
        mesh.material.color.setHex(0x2fd35a);
        mesh.material.opacity = 0.3;
      } else if (i === index) {
        mesh.material.color.setHex(0xffc21a);
        mesh.material.opacity = 1.0;
      } else {
        mesh.material.color.setHex(0xffb020);
        mesh.material.opacity = 0.55;
      }
    });
  }

  update(dt) {
    this._time += dt;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 800) cloud.position.x = -800;
    }
    // The active ring breathes so the pilot can spot it from far away.
    const active = this.ringMeshes[this._activeIndex ?? 0];
    if (active) {
      const pulse = 1 + Math.sin(this._time * 3) * 0.06;
      active.scale.set(pulse, pulse, pulse);
    }
  }

  set activeIndex(i) {
    this._activeIndex = i;
    this.setActiveRing(i);
  }

  get activeIndex() {
    return this._activeIndex ?? 0;
  }
}
