// Island Hopper — shared tuning numbers. One place for every magic number so
// the flight model, the world and the HUD all agree on what "fast" means.
export const CONFIG = {
  // World: one island, roughly 900 x 900 m, ringed by sea.
  islandRadius: 420,
  seaLevel: 0,
  terrainMaxHeight: 55,
  // Runway: a flat strip on the island's south-east shelf.
  runway: {
    x: 150, z: 210,           // centre of the strip
    headingDeg: 90,           // strip runs east-west
    length: 220, width: 18,
    elevation: 6,             // flattened shelf height
  },
  // The ring course: six glowing gates over the island, in flying order.
  rings: [
    { x: 150,  z: 120,  y: 55 },
    { x: -40,  z: 60,   y: 70 },
    { x: -180, z: -120, y: 80 },
    { x: -60,  z: -260, y: 65 },
    { x: 160,  z: -180, y: 75 },
    { x: 260,  z: 40,   y: 60 },
  ],
  ringRadius: 16,
  // Flight model (arcade, knots shown on the HUD, metres inside).
  minSpeed: 28,          // below this the wings stop flying
  cruiseSpeed: 62,
  maxSpeed: 118,
  throttleAccel: 26,
  drag: 0.12,
  pitchRate: 0.85,       // rad/s at full stick
  rollRate: 1.7,
  turnRate: 0.55,        // heading change per second at full bank
  climbPerPitch: 1.0,
  fuelCapacity: 100,
  fuelBurnPerSec: 0.55,  // at full throttle; idle burns far less
  scorePerRing: 100,
  landingBonus: 250,
  timeLimitSec: 300,     // five-minute sortie
  // Start: parked on the runway, nose east down the strip.
  startPos: { x: 60, z: 210, y: 6.8 },
  startHeadingDeg: 90,
};

// Convert the game's internal speed (m/s-ish) to the knots the HUD shows.
export function speedToKnots(speed) {
  return Math.round(speed * 1.94);
}

// Feet for the altimeter, metres inside.
export function metresToFeet(m) {
  return Math.round(m * 3.281);
}

// Heading in degrees, 0 = north, 90 = east, normalised to 0..359.
export function normaliseHeading(rad) {
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
