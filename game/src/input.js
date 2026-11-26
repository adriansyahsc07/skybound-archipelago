// Keyboard and pointer input. The stick is read as three axes in [-1, 1]:
//   bank     — ArrowLeft/ArrowRight or A/D (left is negative)
//   pitch    — ArrowUp/ArrowDown (Up pushes the nose down, like a stick; Down lifts it)
//   throttle — W/S winds the throttle up and down
// Enter or a click starts and restarts; P pauses; M mutes the little engine hum.

export function createInput(target) {
  const keys = new Set();
  const state = {
    bank: 0,
    pitch: 0,
    throttle: 0,
    startPressed: false, // edge-triggered: set by the loop's consumer, cleared here each read
    pausePressed: false,
    muted: false,
  };
  let startEdge = false;
  let pauseEdge = false;

  function onKey(down) {
    return (event) => {
      const code = event.code;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) event.preventDefault();
      if (down) {
        if (!keys.has(code)) {
          if (code === 'Enter') startEdge = true;
          if (code === 'KeyP') pauseEdge = true;
          if (code === 'KeyM') state.muted = !state.muted;
        }
        keys.add(code);
      } else {
        keys.delete(code);
      }
    };
  }
  const keydown = onKey(true);
  const keyup = onKey(false);
  target.addEventListener('keydown', keydown);
  target.addEventListener('keyup', keyup);
  target.addEventListener('pointerdown', () => { startEdge = true; });

  /** Read the axes and consume the edge-triggered buttons. */
  function read() {
    state.bank = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    state.pitch = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    state.throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    state.startPressed = startEdge;
    state.pausePressed = pauseEdge;
    startEdge = false;
    pauseEdge = false;
    return state;
  }

  return { read };
}
