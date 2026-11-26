// A tiny seeded random generator (mulberry32). The archipelago is built from a seed so the
// same seed always raises the same islands — that is what makes the screenshot scenes and
// any replay line up frame for frame.

export function makeRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max) drawn from `next`. */
export function range(next, min, max) {
  return min + next() * (max - min);
}

/** Random integer in [min, max] drawn from `next`. */
export function intRange(next, min, max) {
  return min + Math.floor(next() * (max - min + 1));
}
