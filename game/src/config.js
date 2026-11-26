// Skybound Archipelago — shared constants: the world, the plane and the palette.
// Everything the other modules agree on lives here so tuning happens in one place.

/** Fixed simulation step, seconds. The game advances in whole steps so a seed replays exactly. */
export const STEP = 1 / 60;

/** World extents in metres: a square of sea, centred on (0, 0). North is -Z. */
export const WORLD = {
  half: 2600, // playable half-width; beyond it the plane is turned back gently
  seaLevel: 0,
  ceiling: 420, // soft ceiling in metres; the plane will not climb past it
};

/** The little prop plane, "Kestrel". Speeds in m/s, angles in radians. */
export const PLANE = {
  minSpeed: 16, // below this the wing stalls and the nose drops
  maxSpeed: 78,
  startSpeed: 46,
  startAlt: 150,
  throttleRate: 0.55, // throttle units per second at full key press
  accel: 26, // m/s gained per second at full throttle, level
  drag: 0.0038, // quadratic drag coefficient
  bankRate: 1.5, // rad/s of roll at full stick
  pitchRate: 0.85, // rad/s of pitch at full stick
  maxBank: 1.05, // rad, about 60 degrees
  maxPitch: 0.5, // rad, about 29 degrees
  turnPerBank: 0.55, // heading rad/s at max bank and cruise speed
  liftSink: 9.5, // m/s of sink the wing cancels at cruise; less speed, more sink
  radius: 6, // collision bubble around the plane, metres
};

/** The sortie: rings to fly, then home to the runway. */
export const MISSION = {
  startTime: 165, // seconds on the clock at takeoff
  ringBonusTime: 9, // seconds each ring adds back
  ringScore: 500,
  ringCentreScore: 250, // extra for threading the middle of a ring
  ringRadius: 26, // the ring's own radius, metres
  ringPassRadius: 24, // how close to the centre a crossing still counts
  lives: 3,
  fuelStart: 100,
  fuelBurn: 1.15, // fuel units per second at full throttle
  fuelPerRing: 6, // a ring's marker buoy drips a little avgas back, generously
};

/** Landing judging: what a gentle arrival looks like. */
export const LANDING = {
  maxTouchSpeed: 34, // m/s; faster is a crash, not a landing
  maxSink: 4.2, // m/s of descent at touchdown; more breaks the gear
  maxAlignError: 0.38, // rad of heading error against the runway heading
  stripHalfWidth: 17, // metres either side of the centreline
};

/** Colours, one style throughout: bright noon over a turquoise sea. */
export const PALETTE = {
  skyTop: '#2f7fd0',
  skyMid: '#79b8e8',
  skyLow: '#cfeaf7',
  sun: '#fff3b0',
  seaDeep: '#0d6e8c',
  seaShallow: '#2fb3a6',
  sand: '#ecd28f',
  grassLow: '#57a75a',
  grassHigh: '#2e7d46',
  rock: '#8a7f72',
  cloud: 'rgba(255,255,255,0.92)',
  ring: '#ffb52e',
  ringGlow: 'rgba(255,181,46,0.35)',
  runway: '#4a4f55',
  runwayLine: '#f5f2e8',
  lighthouse: '#e8e3d5',
  lighthouseBand: '#d2453a',
};
