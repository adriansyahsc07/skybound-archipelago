// Deterministic screenshot scenes behind ?shot=cover|flight|rings|landing&seed=1.
// Each scene places the plane in a fixed, attractive spot over the archipelago and freezes
// the simulation there (the prop still spins), so the same URL always renders the same
// frame — the four hand-in screenshots are real renders of the game's own code.

import { SCREEN_FLYING, SCREEN_TITLE } from './flight.js';

/** Put the flight into the named scene. Unknown names fall back to the cover. */
export function stageShot(name, f) {
  const world = f.world;
  f.throttle = 0.66;
  f.speed = 48;
  f.timeLeft = 132;
  f.fuel = 82;
  f.score = 1750;
  f.ringsTaken = 3;
  f.nextRing = 3;

  if (name === 'flight') {
    // Mid-course over the chain, islands and sea spread out ahead.
    f.screen = SCREEN_FLYING;
    f.x = -350; f.z = -350; f.alt = 128;
    f.heading = 2.25; f.pitch = 0.02; f.roll = -0.22;
    f.score = 1250; f.ringsTaken = 2; f.nextRing = 2;
  } else if (name === 'rings') {
    // On the fourth ring's doorstep: the ring fills the view ahead of the nose.
    const ring = world.rings[3];
    f.screen = SCREEN_FLYING;
    f.heading = ring.heading;
    f.x = ring.x - Math.sin(ring.heading) * 95;
    f.z = ring.z + Math.cos(ring.heading) * 95;
    f.alt = ring.alt + 2;
    f.pitch = 0.0; f.roll = 0.08;
    f.nextRing = 3;
    f.ringsTaken = 3;
  } else if (name === 'landing') {
    // Short final: aligned with the strip, low and slow, runway filling the lower frame.
    const t = world.runwayThreshold();
    f.screen = SCREEN_FLYING;
    f.heading = world.runway.heading;
    f.x = t.x - t.dirx * 215;
    f.z = t.z - t.dirz * 215;
    f.alt = world.runway.alt + 21;
    f.pitch = -0.05; f.roll = 0.0;
    f.speed = 27;
    f.throttle = 0.3;
    f.nextRing = world.rings.length;
    f.ringsTaken = world.rings.length;
    f.score = 5650;
  } else {
    // cover: the title scene — the plane posed over the home island, name over it.
    f.screen = SCREEN_TITLE;
    f.x = -760; f.z = -760; f.alt = 150;
    f.heading = 2.5; f.pitch = 0.03; f.roll = -0.3;
    f.score = 0; f.ringsTaken = 0; f.nextRing = 0;
    f.timeLeft = 165; f.fuel = 100;
  }
  return f.screen;
}
