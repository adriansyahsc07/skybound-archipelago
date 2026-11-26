// The flight model and the sortie's state machine.
// States: TITLE (waiting to launch), FLYING, PAUSED, CRASHED (a short hold, then a relaunch
// while lives remain), LANDED (the results screen) and OVER (out of time or out of planes).

import { LANDING, MISSION, PLANE, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_FLYING = 'flying';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_LANDED = 'landed';
export const SCREEN_OVER = 'over';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_OVER = 8;

/** A fresh sortie over `world`: plane on the runway heading, full tank, full clock. */
export function createFlight(world) {
  const start = world.runwayThreshold();
  return {
    world,
    screen: SCREEN_TITLE,
    // The plane. Heading 0 faces north (-Z); pitch and roll are the visible attitude.
    x: start.x - start.dirx * 700,
    z: start.z - start.dirz * 700,
    alt: PLANE.startAlt,
    heading: world.runway.heading,
    pitch: 0,
    roll: 0,
    speed: PLANE.startSpeed,
    throttle: 0.62,
    vspeed: 0,
    // The sortie.
    timeLeft: MISSION.startTime,
    fuel: MISSION.fuelStart,
    lives: MISSION.lives,
    score: 0,
    ringsTaken: 0,
    nextRing: 0,
    message: '',
    messageT: 0,
    holdT: 0, // seconds left on a crash/results hold
    propPhase: 0,
    landingGrade: '',
    landingNotes: '',
    elapsed: 0,
  };
}

/** Relaunch after a crash: back on the approach, slower clock, one life fewer. */
function relaunch(f) {
  const start = f.world.runwayThreshold();
  f.x = start.x - start.dirx * 700;
  f.z = start.z - start.dirz * 700;
  f.alt = PLANE.startAlt;
  f.heading = f.world.runway.heading;
  f.pitch = 0;
  f.roll = 0;
  f.speed = PLANE.startSpeed;
  f.throttle = 0.62;
  f.fuel = Math.max(f.fuel, 45);
  f.screen = SCREEN_FLYING;
}

/**
 * Advance the flight one fixed step. `input` is {bank, pitch, throttle} each in [-1, 1]
 * (throttle is a rate: +1 winds it up, -1 winds it down). Returns event flags.
 */
export function stepFlight(f, dt, input) {
  let events = 0;
  f.propPhase += dt * (6 + f.throttle * 46);
  if (f.messageT > 0) f.messageT -= dt;

  if (f.screen === SCREEN_CRASHED || f.screen === SCREEN_LANDED) {
    f.holdT -= dt;
    if (f.holdT <= 0) {
      if (f.screen === SCREEN_CRASHED && f.lives > 0) relaunch(f);
      else if (f.screen === SCREEN_CRASHED) { f.screen = SCREEN_OVER; events |= EVENT_OVER; }
    }
    return events;
  }
  if (f.screen !== SCREEN_FLYING) return events;

  f.elapsed += dt;
  f.timeLeft -= dt;
  if (f.timeLeft <= 0) {
    f.timeLeft = 0;
    f.screen = SCREEN_OVER;
    return EVENT_OVER;
  }

  // Controls: bank and pitch ease toward the stick, throttle winds up or down.
  f.throttle = clamp(f.throttle + input.throttle * PLANE.throttleRate * dt, 0, 1);
  const targetRoll = input.bank * PLANE.maxBank;
  const targetPitch = input.pitch * PLANE.maxPitch;
  f.roll += clamp(targetRoll - f.roll, -PLANE.bankRate * dt, PLANE.bankRate * dt);
  f.pitch += clamp(targetPitch - f.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

  // A banked wing turns the plane; the turn is lazier at low speed, keener banked.
  const speedFactor = clamp(f.speed / 46, 0.45, 1.35);
  f.heading += Math.sin(f.roll) * PLANE.turnPerBank * speedFactor * dt * 1.9;

  // Speed: throttle pushes, drag and the climb resist, a dive feeds it.
  const climbDrag = Math.sin(f.pitch) * 15;
  f.speed += (f.throttle * PLANE.accel - PLANE.drag * f.speed * f.speed - climbDrag) * dt;
  f.speed = clamp(f.speed, 6, PLANE.maxSpeed + 14);

  // Vertical: pitch aims the nose, but a slow wing sinks — the stall drops the nose too.
  const stall = f.speed < PLANE.minSpeed;
  if (stall) f.pitch = Math.max(f.pitch - 0.55 * dt, -0.42);
  const lift = clamp(f.speed / 46, 0, 1.25);
  f.vspeed = Math.sin(f.pitch) * f.speed * 0.92 - (1 - lift) * PLANE.liftSink - 1.1;
  // Ground effect: within a wingspan or so of the surface the sink cushions out,
  // which is what lets a gentle flare settle onto the strip instead of dropping.
  const clearance = f.alt - f.world.terrainHeight(f.x, f.z);
  if (clearance < 14 && f.vspeed < 0) f.vspeed *= 0.45 + 0.55 * (clearance / 14);
  f.alt += f.vspeed * dt;
  if (f.alt > WORLD.ceiling) { f.alt = WORLD.ceiling; f.vspeed = Math.min(f.vspeed, 0); }

  // Forward, in the heading's direction (north is -Z).
  const vx = Math.sin(f.heading) * Math.cos(f.pitch) * f.speed;
  const vz = -Math.cos(f.heading) * Math.cos(f.pitch) * f.speed;
  const prevX = f.x;
  const prevZ = f.z;
  f.x += vx * dt;
  f.z += vz * dt;

  // Keep the sortie over the archipelago: far out, the plane is nudged back toward home.
  const out = Math.hypot(f.x, f.z);
  if (out > WORLD.half) {
    const home = Math.atan2(-f.x, f.z);
    let diff = wrapAngle(home - f.heading);
    f.heading += clamp(diff, -0.5 * dt, 0.5 * dt);
    if (f.messageT <= 0) { f.message = 'Head back to the islands'; f.messageT = 2; }
  }

  // Fuel: burnt by the throttle, and an empty tank means gliding.
  f.fuel = Math.max(0, f.fuel - f.throttle * MISSION.fuelBurn * dt);
  if (f.fuel <= 0) f.throttle = Math.min(f.throttle, 0.12);

  events |= checkRing(f, prevX, prevZ);
  events |= checkGround(f);
  return events;
}

/** Did the plane cross the next ring's plane inside its hoop this step? */
function checkRing(f, prevX, prevZ) {
  const ring = f.world.rings[f.nextRing];
  if (!ring) return 0;
  const dirx = Math.sin(ring.heading);
  const dirz = -Math.cos(ring.heading);
  const before = (prevX - ring.x) * dirx + (prevZ - ring.z) * dirz;
  const after = (f.x - ring.x) * dirx + (f.z - ring.z) * dirz;
  if (before === 0 || before * after > 0) return 0; // did not cross the plane this step
  // Where the path pierces the ring's plane, how far from the centre?
  const t = before / (before - after);
  const px = prevX + (f.x - prevX) * t;
  const pz = prevZ + (f.z - prevZ) * t;
  const pAlt = f.alt; // close enough at step scale
  const dist = Math.hypot(px - ring.x, pz - ring.z, pAlt - ring.alt);
  if (dist > MISSION.ringPassRadius) return 0;
  ring.taken = true;
  f.nextRing += 1;
  f.ringsTaken += 1;
  const centred = dist < MISSION.ringRadius * 0.45;
  f.score += MISSION.ringScore + (centred ? MISSION.ringCentreScore : 0);
  f.timeLeft += MISSION.ringBonusTime;
  f.fuel = Math.min(100, f.fuel + MISSION.fuelPerRing);
  f.message = centred ? 'Threaded it! +' + (MISSION.ringScore + MISSION.ringCentreScore) : 'Ring! +' + MISSION.ringScore;
  f.messageT = 2.2;
  return EVENT_RING;
}

/** Ground contact: a landing on the strip, or a crash anywhere else. */
function checkGround(f) {
  const ground = f.world.terrainHeight(f.x, f.z);
  if (f.alt > ground + PLANE.radius * 0.4) return 0;
  const rw = f.world.runway;
  const dx = f.x - rw.x;
  const dz = f.z - rw.z;
  const along = dx * Math.sin(rw.heading) + dz * -Math.cos(rw.heading);
  const across = dx * Math.cos(rw.heading) + dz * Math.sin(rw.heading);
  const onStrip = Math.abs(along) < rw.length / 2 && Math.abs(across) < LANDING.stripHalfWidth;
  const alignError = Math.abs(wrapAngle(f.heading - rw.heading));
  if (onStrip && alignError < LANDING.maxAlignError && f.speed <= LANDING.maxTouchSpeed && f.vspeed >= -LANDING.maxSink) {
    return land(f, alignError);
  }
  return crash(f, onStrip ? 'Too fast, too steep or crooked for the strip' : 'The plane came down on the terrain');
}

function land(f, alignError) {
  const speedScore = clamp(1 - (f.speed - 18) / (LANDING.maxTouchSpeed - 18), 0, 1);
  const sinkScore = clamp(1 - Math.abs(f.vspeed) / LANDING.maxSink, 0, 1);
  const alignScore = clamp(1 - alignError / LANDING.maxAlignError, 0, 1);
  const quality = speedScore * 0.35 + sinkScore * 0.4 + alignScore * 0.25;
  f.landingGrade = quality > 0.82 ? 'S' : quality > 0.64 ? 'A' : quality > 0.45 ? 'B' : 'C';
  const bonus = Math.round(quality * 1500) + Math.round(f.timeLeft) * 10 + f.ringsTaken * 100;
  f.score += bonus;
  f.landingNotes =
    'Touchdown at ' + Math.round(f.speed * 3.6) + ' km/h, sink ' + Math.abs(f.vspeed).toFixed(1) +
    ' m/s, alignment ' + Math.round(alignError * 57.3) + '°. Landing bonus +' + bonus + '.';
  f.screen = SCREEN_LANDED;
  f.holdT = 9999; // the results screen stays until the pilot restarts
  return EVENT_LANDED;
}

function crash(f, why) {
  f.lives -= 1;
  f.message = why + (f.lives > 0 ? ' — ' + f.lives + (f.lives === 1 ? ' plane' : ' planes') + ' left' : '');
  f.messageT = 3;
  f.screen = SCREEN_CRASHED;
  f.holdT = 2.4;
  return EVENT_CRASH;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
