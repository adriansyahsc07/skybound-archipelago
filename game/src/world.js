// The archipelago: a chain of islands in a turquoise sea, raised from a seed.
// Terrain height is a sum of smooth island bumps, so any (x, z) has one height the renderer
// and the collision check agree on. The largest island carries the runway; a smaller one
// carries the lighthouse. The ring course threads the chain from the start to the runway.

import { LANDING, MISSION, WORLD } from './config.js';
import { makeRandom, range } from './random.js';

/** One island: a centre, a radius and a peak height, all in metres. */
function island(x, z, radius, peak) {
  return { x, z, radius, peak };
}

/**
 * Build the world for `seed`. Returns the islands, the ring course (in flight order), the
 * runway, the lighthouse and the decorative clouds, plus the height function.
 */
export function buildWorld(seed) {
  const next = makeRandom(seed * 7919 + 17);

  // The chain, hand-placed so the course reads well, with seeded jitter so seeds differ.
  const jitter = (v, amt) => v + range(next, -amt, amt);
  const islands = [
    island(jitter(-1250, 60), jitter(-1500, 60), 430, 96), // home island, holds the runway
    island(jitter(-420, 70), jitter(-980, 70), 300, 64),
    island(jitter(390, 70), jitter(-1150, 70), 340, 78),
    island(jitter(1150, 70), jitter(-520, 70), 280, 58), // lighthouse isle
    island(jitter(620, 70), jitter(120, 70), 360, 84),
    island(jitter(-260, 70), jitter(420, 70), 320, 66),
    island(jitter(-1080, 70), jitter(180, 70), 300, 72),
    island(jitter(150, 70), jitter(1150, 70), 380, 92),
    island(jitter(1180, 70), jitter(980, 70), 290, 60),
  ];

  /** Ground height at (x, z): the sea floor is below zero, beaches sit at the waterline. */
  function groundHeight(x, z) {
    let h = -14; // open sea floor; the water surface itself is drawn at 0
    for (let i = 0; i < islands.length; i += 1) {
      const isle = islands[i];
      const dx = x - isle.x;
      const dz = z - isle.z;
      const d = Math.hypot(dx, dz);
      const reach = isle.radius * 1.35; // the bump's skirts run a little past the beach
      if (d >= reach) continue;
      // A smoothstep dome: the peak at the centre, the shoreline where it crosses zero.
      const t = 1 - d / reach;
      const s = t * t * (3 - 2 * t);
      h = Math.max(h, -14 + (isle.peak + 14) * s);
    }
    return h;
  }

  // Flatten a pad on the home island for the runway: the strip is carved level.
  const home = islands[0];
  const runway = {
    x: home.x,
    z: home.z,
    heading: 0.5, // rad; the strip runs across the island's broad top
    length: 460,
    width: LANDING.stripHalfWidth * 2,
    alt: 0,
  };
  runway.alt = groundHeight(runway.x, runway.z);

  /** Height with the runway pad blended in: inside the strip the ground is the strip. */
  function terrainHeight(x, z) {
    const dx = x - runway.x;
    const dz = z - runway.z;
    const along = dx * Math.sin(runway.heading) + dz * -Math.cos(runway.heading);
    const across = dx * Math.cos(runway.heading) + dz * Math.sin(runway.heading);
    if (Math.abs(along) < runway.length / 2 + 60 && Math.abs(across) < runway.width / 2 + 60) {
      const edge = Math.max(
        Math.abs(along) / (runway.length / 2 + 60),
        Math.abs(across) / (runway.width / 2 + 60),
      );
      const blend = Math.min(1, Math.max(0, (1 - edge) * 4));
      return groundHeight(x, z) * (1 - blend) + runway.alt * blend;
    }
    return groundHeight(x, z);
  }

  /** Where the strip starts (the threshold the pilot aims at) in world coordinates. */
  function runwayThreshold() {
    const dirx = Math.sin(runway.heading);
    const dirz = -Math.cos(runway.heading);
    return {
      x: runway.x - dirx * (runway.length / 2),
      z: runway.z - dirz * (runway.length / 2),
      dirx,
      dirz,
    };
  }

  // The ring course: gates strung between the islands, ending on the runway approach.
  const ringDefs = [
    [-820, -1250, 120], [-120, -1080, 105], [430, -820, 130], [980, -760, 95],
    [1010, -180, 115], [420, 260, 100], [-60, 620, 125], [-700, 330, 90],
  ];
  const rings = ringDefs.map(([x, z, alt], index) => {
    const nx = index + 1 < ringDefs.length ? ringDefs[index + 1][0] : runway.x;
    const nz = index + 1 < ringDefs.length ? ringDefs[index + 1][1] : runway.z;
    // Each ring faces the incoming pilot: its plane is perpendicular to the leg's direction.
    const heading = Math.atan2(nx - x, -(nz - z));
    return { x, z, alt, heading, index, taken: false };
  });

  const lighthouse = { x: islands[3].x + 60, z: islands[3].z - 40, base: 0 };
  lighthouse.base = terrainHeight(lighthouse.x, lighthouse.z);

  // Puffy clouds drifting high above the course, seeded once.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: range(next, -WORLD.half, WORLD.half),
      z: range(next, -WORLD.half, WORLD.half),
      alt: range(next, 210, 330),
      size: range(next, 90, 220),
    });
  }

  return { islands, rings, runway, runwayThreshold, lighthouse, clouds, groundHeight, terrainHeight };
}
