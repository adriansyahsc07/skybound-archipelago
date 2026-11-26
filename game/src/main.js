// Skybound Archipelago — bootstrap. Wires the world, the flight, the input and the
// renderer together and runs the fixed-step loop. With ?shot=<name>&seed=<n> in the URL it
// instead stages one frozen scene for the hand-in screenshots.

import { STEP } from './config.js';
import { buildWorld } from './world.js';
import {
  SCREEN_FLYING, SCREEN_PAUSED, SCREEN_TITLE, createFlight, stepFlight,
} from './flight.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const shot = params.get('shot');

let world = buildWorld(seed);
const flight = createFlight(world);
const input = createInput(window);
const renderer = createRenderer(canvas);

renderer.resize();
window.addEventListener('resize', renderer.resize);

let lastStatus = '';
function announce(text) {
  if (status && text !== lastStatus) {
    lastStatus = text;
    status.textContent = text;
  }
}

if (shot) {
  // A frozen scene: draw it, and keep redrawing so the prop blur and lamp stay alive
  // without the plane ever moving on.
  stageShot(shot, flight);
  const frame = () => {
    flight.propPhase += 0.35;
    renderer.draw(flight);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} else {
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    const controls = input.read();
    if (controls.startPressed) {
      if (flight.screen === SCREEN_TITLE) flight.screen = SCREEN_FLYING;
      else if (flight.screen === 'landed' || flight.screen === 'over') {
        world = buildWorld(seed); // a fresh world, so the rings hang unflown again
        Object.assign(flight, createFlight(world));
        flight.screen = SCREEN_FLYING;
      }
    }
    if (controls.pausePressed) {
      if (flight.screen === SCREEN_FLYING) flight.screen = SCREEN_PAUSED;
      else if (flight.screen === SCREEN_PAUSED) flight.screen = SCREEN_FLYING;
    }
    while (acc >= STEP) {
      stepFlight(flight, STEP, controls);
      acc -= STEP;
    }
    renderer.draw(flight);
    announce(
      'Altitude ' + Math.max(0, Math.round(flight.alt)) + ' metres, speed ' +
      Math.round(flight.speed * 3.6) + ' kilometres per hour, heading ' +
      ((Math.round(flight.heading * 57.2958) % 360 + 360) % 360) + ' degrees. Score ' + flight.score + '.',
    );
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
