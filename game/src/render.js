// The renderer: a Canvas 2D pseudo-3D chase view. World points are pushed through a simple
// pinhole camera that sits behind and above the plane; the terrain is a heightfield grid
// drawn far-to-near, then the rings, the runway and the lighthouse, then the plane itself in
// screen space, and finally the lit cockpit panel and HUD the bounty asks for.

import { MISSION, PALETTE } from './config.js';
import {
  SCREEN_CRASHED, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_TITLE, clamp, wrapAngle,
} from './flight.js';

const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- camera -------------------------------------------------------------
  // Basis vectors are rebuilt per frame from the flight state.
  const cam = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fy: 0, fz: 0, focal: 0 };

  function buildCamera(f) {
    const cp = Math.cos(f.pitch * 0.55);
    const fx = Math.sin(f.heading) * cp;
    const fz = -Math.cos(f.heading) * cp;
    const fy = Math.sin(f.pitch * 0.55) - 0.10; // a gentle downward tilt keeps the land in frame
    const fl = Math.hypot(fx, fy, fz);
    cam.fx = fx / fl; cam.fy = fy / fl; cam.fz = fz / fl;
    // Camera sits behind the plane along its heading, raised above it.
    cam.x = f.x - Math.sin(f.heading) * 40;
    cam.z = f.z + Math.cos(f.heading) * 40;
    cam.y = f.alt + 14;
    // Right = cross(forward, world up (0,1,0)) = (-fz, 0, fx); then roll with the bank.
    let rx = -cam.fz;
    let ry = 0;
    let rz = cam.fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    // up = cross(right, forward)
    let ux = ry * cam.fz - rz * cam.fy;
    let uy = rz * cam.fx - rx * cam.fz;
    let uz = rx * cam.fy - ry * cam.fx;
    // Apply the plane's roll about the forward axis (damped, so the world leans, not spins).
    const roll = f.roll * 0.55;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const nrx = rx * cr + ux * sr;
    const nry = ry * cr + uy * sr;
    const nrz = rz * cr + uz * sr;
    const nux = ux * cr - rx * sr;
    const nuy = uy * cr - ry * sr;
    const nuz = uz * cr - rz * sr;
    cam.rx = nrx; cam.ry = nry; cam.rz = nrz;
    cam.ux = nux; cam.uy = nuy; cam.uz = nuz;
    cam.focal = H * 1.05;
  }

  /** Project a world point; returns {x, y, depth} or null when behind the camera. */
  function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const depth = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (depth < 2) return null;
    const px = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const py = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    return { x: W / 2 + (px * cam.focal) / depth, y: H * 0.52 - (py * cam.focal) / depth, depth };
  }

  // --- scene pieces ---------------------------------------------------------

  function drawSky(f) {
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // The sun, fixed in the south-east sky relative to heading.
    const sunA = wrapAngle(2.2 - f.heading);
    const sunX = W / 2 + Math.sin(sunA) * W * 0.42;
    const sunY = H * 0.16 + Math.cos(sunA) * 6;
    if (sunX > -80 && sunX < W + 80) {
      ctx.fillStyle = 'rgba(255,243,176,0.35)';
      ctx.beginPath(); ctx.arc(sunX, sunY, 54, 0, TAU); ctx.fill();
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath(); ctx.arc(sunX, sunY, 30, 0, TAU); ctx.fill();
    }
  }

  function groundColour(h, slopeShade) {
    if (h < 0.4) {
      // Water: deeper is darker, and the shallows near a beach turn turquoise.
      const depth = clamp((h + 2) / 2.4, 0, 1);
      return mix(PALETTE.seaDeep, PALETTE.seaShallow, depth * 0.85, slopeShade);
    }
    if (h < 4.5) return shade(PALETTE.sand, slopeShade);
    if (h < 34) return shade(PALETTE.grassLow, slopeShade);
    if (h < 62) return shade(PALETTE.grassHigh, slopeShade);
    return shade(PALETTE.rock, slopeShade);
  }

  function drawTerrain(world) {
    // A fan of grid rows ahead of the camera, spaced wider the farther they reach.
    const rows = [];
    const rowCount = 34;
    for (let i = 0; i <= rowCount; i += 1) {
      const t = i / rowCount;
      rows.push(5 + Math.pow(t, 2.0) * 2500);
    }
    const colCount = 36;
    const latMax = 1500;
    // Horizontal forward/right on the ground plane, from the camera's heading.
    const fx = cam.fx;
    const fz = cam.fz;
    const fl = Math.hypot(fx, fz) || 1;
    const ghx = fx / fl;
    const ghz = fz / fl;
    const grx = -ghz;
    const grz = ghx;
    const grid = [];
    for (let i = 0; i <= rowCount; i += 1) {
      const line = [];
      for (let j = 0; j <= colCount; j += 1) {
        const lat = -latMax + (2 * latMax * j) / colCount * (0.3 + rows[i] / 750);
        const wx = cam.x + ghx * rows[i] + grx * lat;
        const wz = cam.z + ghz * rows[i] + grz * lat;
        const h = world.terrainHeight(wx, wz);
        // The water surface is one plane: display height never dips below -2, so the
        // sea colours flat instead of shading the hidden sea floor's bumps.
        const dh = Math.max(h, -2);
        line.push({ p: project(wx, dh, wz), h: dh });
      }
      grid.push(line);
    }
    for (let i = rowCount - 1; i >= 0; i -= 1) {
      for (let j = 0; j < colCount; j += 1) {
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const c = grid[i + 1][j + 1];
        const d = grid[i + 1][j];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const hAvg = (a.h + b.h + c.h + d.h) / 4;
        const slopeShade = hAvg < 0.4
          ? clamp(1 - Math.abs(a.h - d.h) * 0.03, 0.94, 1.0)
          : clamp(1 - Math.abs(a.h - d.h) * 0.012, 0.72, 1.05);
        ctx.fillStyle = groundColour(hAvg, slopeShade);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawClouds(world, f) {
    ctx.fillStyle = PALETTE.cloud;
    for (const cloud of world.clouds) {
      const p = project(cloud.x, cloud.alt, cloud.z);
      if (!p || p.depth > 2400) continue;
      const s = Math.min((cloud.size * cam.focal) / p.depth, 230);
      if (s < 6) continue;
      ctx.globalAlpha = clamp(1.05 - p.depth / 2400, 0.15, 0.78);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, TAU);
      ctx.ellipse(p.x - s * 0.5, p.y + s * 0.06, s * 0.62, s * 0.24, 0, 0, TAU);
      ctx.ellipse(p.x + s * 0.5, p.y + s * 0.05, s * 0.58, s * 0.22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRunway(world) {
    const rw = world.runway;
    const t = world.runwayThreshold();
    // Strip corners: threshold ± right vector, far end ± right vector.
    const rxv = t.dirz; // the right vector is the direction turned a quarter turn
    const rzv = -t.dirx;
    const pts = [
      project(t.x + rxv * rw.width / 2, rw.alt + 0.4, t.z + rzv * rw.width / 2),
      project(t.x - rxv * rw.width / 2, rw.alt + 0.4, t.z - rzv * rw.width / 2),
      project(t.x + t.dirx * rw.length - rxv * rw.width / 2, rw.alt + 0.4, t.z + t.dirz * rw.length - rzv * rw.width / 2),
      project(t.x + t.dirx * rw.length + rxv * rw.width / 2, rw.alt + 0.4, t.z + t.dirz * rw.length + rzv * rw.width / 2),
    ];
    if (pts.every(Boolean)) {
      ctx.fillStyle = PALETTE.runway;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.fill();
      // Edge lines, so the strip reads as a strip and not as bare rock.
      ctx.strokeStyle = 'rgba(245,242,232,0.85)';
      ctx.lineWidth = Math.max(1.5, 800 / pts[0].depth);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
      ctx.stroke();
      // Centreline dashes.
      ctx.strokeStyle = PALETTE.runwayLine;
      ctx.lineWidth = Math.max(1.5, 900 / pts[0].depth);
      ctx.setLineDash([18, 14]);
      const mid1 = project(t.x + t.dirx * 12, rw.alt + 0.5, t.z + t.dirz * 12);
      const mid2 = project(t.x + t.dirx * (rw.length - 12), rw.alt + 0.5, t.z + t.dirz * (rw.length - 12));
      if (mid1 && mid2) {
        ctx.beginPath(); ctx.moveTo(mid1.x, mid1.y); ctx.lineTo(mid2.x, mid2.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      // Threshold bars.
      ctx.fillStyle = PALETTE.runwayLine;
      for (let k = -2; k <= 2; k += 1) {
        const bx = t.x + rxv * k * 6 + t.dirx * 8;
        const bz = t.z + rzv * k * 6 + t.dirz * 8;
        const bp = project(bx, rw.alt + 0.5, bz);
        if (bp) {
          const s = clamp(700 / bp.depth, 1, 9);
          ctx.fillRect(bp.x - s / 2, bp.y - s / 2, s, s);
        }
      }
    }
  }

  function drawLighthouse(world) {
    const lh = world.lighthouse;
    const base = project(lh.x, lh.base, lh.z);
    if (!base || base.depth > 1900) return;
    const top = project(lh.x, lh.base + 34, lh.z);
    if (!top) return;
    const wBase = clamp((9 * cam.focal) / base.depth, 1.5, 26);
    const wTop = wBase * 0.62;
    ctx.fillStyle = PALETTE.lighthouse;
    ctx.beginPath();
    ctx.moveTo(base.x - wBase / 2, base.y);
    ctx.lineTo(base.x + wBase / 2, base.y);
    ctx.lineTo(top.x + wTop / 2, top.y);
    ctx.lineTo(top.x - wTop / 2, top.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.lighthouseBand;
    const midY = (base.y + top.y) / 2;
    ctx.fillRect(top.x - wTop * 0.72, midY, wTop * 1.44, Math.max(1.5, (base.y - top.y) * 0.16));
    // The lamp.
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(top.x, top.y - 2, Math.max(1.5, wTop * 0.4), 0, TAU); ctx.fill();
  }

  function drawRings(world, f) {
    for (let i = world.rings.length - 1; i >= 0; i -= 1) {
      const ring = world.rings[i];
      if (ring.taken) continue;
      const isNext = i === f.nextRing;
      const ax = Math.cos(ring.heading);
      const az = Math.sin(ring.heading);
      const pts = [];
      let visible = true;
      for (let k = 0; k <= 30; k += 1) {
        const a = (k / 30) * TAU;
        const px = ring.x + ax * Math.cos(a) * 26;
        const pz = ring.z + az * Math.cos(a) * 26;
        const py = ring.alt + Math.sin(a) * 26;
        const p = project(px, py, pz);
        if (!p) { visible = false; break; }
        pts.push(p);
      }
      if (!visible || pts[0].depth > 2600) continue;
      ctx.lineWidth = clamp((isNext ? 1500 : 1000) / pts[0].depth, 1.5, isNext ? 13 : 8);
      ctx.strokeStyle = isNext ? PALETTE.ringGlow : 'rgba(255,181,46,0.25)';
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.lineWidth = clamp((isNext ? 700 : 420) / pts[0].depth, 1, isNext ? 6 : 3.5);
      ctx.strokeStyle = isNext ? PALETTE.ring : 'rgba(255,197,80,0.55)';
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      if (isNext) {
        // A marker label above the next ring.
        const top = pts[7];
        ctx.fillStyle = '#fff7e0';
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT RING', top.x, top.y - 12);
      }
    }
  }

  // --- the plane, in screen space ------------------------------------------

  function drawPlane(f) {
    const cx = W / 2 - f.roll * 26;
    const cy = H * 0.565 + f.pitch * 55 + Math.sin(f.elapsed * 2.1) * 2.5;
    const s = Math.min(W, H) / 560; // overall scale
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(f.roll * 0.82);
    ctx.scale(s, s);
    // Wings (behind the fuselage), slightly swept, cream with red tips.
    ctx.fillStyle = '#f3ead2';
    roundPoly([[-118, 6], [-16, -8], [16, -8], [118, 6], [112, 20], [-112, 20]]);
    ctx.fill();
    ctx.fillStyle = '#d2453a';
    roundPoly([[-118, 6], [-92, 2], [-92, 19], [-112, 20]]);
    ctx.fill();
    roundPoly([[92, 2], [118, 6], [112, 20], [92, 19]]);
    ctx.fill();
    // Tailplane and fin, upstage (drawn above the fuselage top edge).
    ctx.fillStyle = '#e7dcc0';
    roundPoly([[-44, -34], [-8, -42], [8, -42], [44, -34], [40, -26], [-40, -26]]);
    ctx.fill();
    ctx.fillStyle = '#d2453a';
    roundPoly([[-5, -66], [5, -66], [7, -40], [-7, -40]]);
    ctx.fill();
    // Fuselage: a plump teardrop seen from behind and above.
    const body = ctx.createLinearGradient(0, -34, 0, 44);
    body.addColorStop(0, '#fdf6dd');
    body.addColorStop(0.6, '#f3ead2');
    body.addColorStop(1, '#d9cba6');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 4, 27, 40, 0, 0, TAU);
    ctx.fill();
    // Cockpit canopy.
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -8, 14, 19, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,220,250,0.75)';
    ctx.beginPath();
    ctx.ellipse(-4, -14, 6, 9, -0.4, 0, TAU);
    ctx.fill();
    // The prop: a blurred disc facing the camera with two blade streaks.
    const blur = 0.24 + f.throttle * 0.3;
    ctx.fillStyle = 'rgba(40,36,30,' + blur.toFixed(2) + ')';
    ctx.beginPath();
    ctx.ellipse(0, 26, 30, 30, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,18,14,0.55)';
    ctx.lineWidth = 5;
    const pa = f.propPhase;
    ctx.beginPath();
    ctx.moveTo(Math.cos(pa) * -27, 26 + Math.sin(pa) * 27);
    ctx.lineTo(Math.cos(pa) * 27, 26 - Math.sin(pa) * 27);
    ctx.stroke();
    ctx.fillStyle = '#8c2f28';
    ctx.beginPath(); ctx.arc(0, 26, 6.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function roundPoly(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  }

  // --- cockpit and HUD -------------------------------------------------------

  function drawCockpit(f) {
    const panelH = Math.round(H * 0.235);
    const top = H - panelH;
    // The panel: dark leather-brown with a lit top edge.
    const grad = ctx.createLinearGradient(0, top, 0, H);
    grad.addColorStop(0, '#3a332a');
    grad.addColorStop(0.12, '#2b2620');
    grad.addColorStop(1, '#171410');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, top + 16);
    ctx.quadraticCurveTo(W / 2, top - 14, W, top + 16);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,90,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, top + 16);
    ctx.quadraticCurveTo(W / 2, top - 14, W, top + 16);
    ctx.stroke();

    const cy = top + panelH * 0.58;
    const r = Math.min(panelH * 0.40, 64);
    drawSpeedDial(W * 0.30, cy, r, f.speed);
    drawHorizon(W * 0.50, cy, r * 1.12, f);
    drawAltimeter(W * 0.70, cy, r, f.alt);
    drawThrottle(W * 0.845, top + panelH * 0.16, panelH * 0.68, f.throttle);
    drawFuel(W * 0.115, top + panelH * 0.16, panelH * 0.68, f.fuel);
  }

  function gaugeShell(x, y, r, label) {
    ctx.fillStyle = '#0d0f12';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c8a24a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 ' + Math.max(8, r * 0.19) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r * 0.84);
  }

  function needle(x, y, angle, len) {
    ctx.strokeStyle = '#ffb52e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
    ctx.fillStyle = '#e8e3d5';
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill();
  }

  function drawSpeedDial(x, y, r, speed) {
    gaugeShell(x, y, r, 'AIRSPEED');
    ctx.fillStyle = '#9fd8ef';
    ctx.font = '600 ' + Math.max(8, r * 0.2) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let v = 0; v <= 280; v += 40) {
      const a = Math.PI * 0.75 + (v / 280) * Math.PI * 1.5;
      ctx.fillText(String(v), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58 + 3);
    }
    const kmh = speed * 3.6;
    needle(x, y, Math.PI * 0.75 + (kmh / 280) * Math.PI * 1.5, r * 0.8);
  }

  function drawAltimeter(x, y, r, alt) {
    gaugeShell(x, y, r, 'ALTIMETER');
    ctx.fillStyle = '#9fd8ef';
    ctx.font = '600 ' + Math.max(8, r * 0.2) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let v = 0; v < 10; v += 1) {
      const a = -Math.PI / 2 + (v / 10) * TAU;
      ctx.fillText(String(v), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58 + 3);
    }
    needle(x, y, -Math.PI / 2 + ((alt % 100) / 100) * TAU, r * 0.82); // hundreds hand
    ctx.strokeStyle = '#e8e3d5';
    ctx.lineWidth = 2;
    const a2 = -Math.PI / 2 + ((alt % 1000) / 1000) * TAU;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a2) * r * 0.55, y + Math.sin(a2) * r * 0.55); ctx.stroke();
  }

  function drawHorizon(x, y, r, f) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.translate(x, y);
    ctx.rotate(-f.roll);
    const drop = clamp(f.pitch * r * 1.6, -r * 0.8, r * 0.8);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-r * 1.5, -r * 1.5 + drop, r * 3, r * 1.5);
    ctx.fillStyle = '#8a6844';
    ctx.fillRect(-r * 1.5, drop, r * 3, r * 1.5);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * 1.5, drop); ctx.lineTo(r * 1.5, drop); ctx.stroke();
    // Pitch ladder.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    for (const off of [-0.42, 0.42]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, drop + off * r);
      ctx.lineTo(r * 0.32, drop + off * r);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#c8a24a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, TAU); ctx.stroke();
    // The fixed aircraft symbol.
    ctx.strokeStyle = '#ffb52e';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y);
    ctx.lineTo(x - r * 0.16, y);
    ctx.lineTo(x - r * 0.16, y + r * 0.14);
    ctx.moveTo(x + r * 0.55, y);
    ctx.lineTo(x + r * 0.16, y);
    ctx.lineTo(x + r * 0.16, y + r * 0.14);
    ctx.stroke();
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 ' + Math.max(9, r * 0.22) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HORIZON', x, y + r * 0.66);
  }

  function drawThrottle(x, y, h, throttle) {
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(x - 9, y, 18, h);
    ctx.strokeStyle = '#c8a24a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 9, y, 18, h);
    const knobY = y + h - throttle * h;
    ctx.fillStyle = '#d2453a';
    ctx.fillRect(x - 14, knobY - 6, 28, 12);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THR', x, y + h + 14);
  }

  function drawFuel(x, y, h, fuel) {
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(x - 9, y, 18, h);
    ctx.strokeStyle = '#c8a24a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 9, y, 18, h);
    ctx.fillStyle = fuel < 25 ? '#d2453a' : '#57a75a';
    const fh = (fuel / 100) * (h - 4);
    ctx.fillRect(x - 7, y + h - 2 - fh, 14, fh);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL', x, y + h + 14);
  }

  function drawHud(f, world) {
    ctx.textAlign = 'left';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(10,20,30,0.45)';
    ctx.fillRect(14, 12, 252, 92);
    ctx.fillStyle = '#eaf7ff';
    const hdg = ((Math.round(f.heading * 57.2958) % 360) + 360) % 360;
    ctx.fillText('ALT ' + Math.max(0, Math.round(f.alt)) + ' m', 26, 40);
    ctx.fillText('SPD ' + Math.round(f.speed * 3.6) + ' km/h', 26, 66);
    ctx.fillText('HDG ' + String(hdg).padStart(3, '0') + '°', 26, 92);
    // Right side: the sortie book.
    ctx.fillStyle = 'rgba(10,20,30,0.45)';
    ctx.fillRect(W - 266, 12, 252, 92);
    ctx.fillStyle = '#eaf7ff';
    ctx.textAlign = 'right';
    ctx.fillText('SCORE ' + f.score, W - 26, 40);
    ctx.fillText('RINGS ' + f.ringsTaken + '/' + world.rings.length, W - 26, 66);
    const t = Math.max(0, Math.ceil(f.timeLeft));
    ctx.fillStyle = t <= 20 ? '#ff9a8a' : '#eaf7ff';
    ctx.fillText('TIME ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), W - 26, 92);
    ctx.textAlign = 'left';
    // Centre messages and the final-approach cue.
    if (f.nextRing >= world.rings.length && f.screen === 'flying') {
      banner('ALL RINGS FLOWN — LAND ON THE RUNWAY', '#ffd75e');
    } else if (f.messageT > 0 && f.message) {
      banner(f.message, '#ffffff');
    }
  }

  function banner(text, colour) {
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 36;
    ctx.fillStyle = 'rgba(10,20,30,0.5)';
    ctx.fillRect(W / 2 - w / 2, 118, w, 40);
    ctx.fillStyle = colour;
    ctx.fillText(text, W / 2, 147);
    ctx.textAlign = 'left';
  }

  // --- overlays ---------------------------------------------------------------

  function panel(title, lines, accent) {
    ctx.fillStyle = 'rgba(8,16,26,0.42)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(620, W * 0.8);
    const ph = 118 + lines.length * 30;
    const px = (W - pw) / 2;
    const py = H * 0.16;
    ctx.fillStyle = 'rgba(12,24,38,0.92)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = accent;
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, py + 58);
    ctx.fillStyle = '#eaf7ff';
    ctx.font = '500 18px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, py + 100 + i * 30));
    ctx.textAlign = 'left';
  }

  function drawOverlay(f, world) {
    if (f.screen === SCREEN_TITLE) {
      panel('SKYBOUND ARCHIPELAGO', [
        'Fly the ring course over the islands, then land on the home runway.',
        'Steer: A/D or ←/→ bank · ↑ nose down · ↓ nose up · W/S throttle',
        'Thread all ' + world.rings.length + ' rings for score and time, mind your fuel,',
        'then land gently: slow, straight and soft on the strip.',
        'Press ENTER or click to fly',
      ], '#ffd75e');
    } else if (f.screen === SCREEN_PAUSED) {
      panel('PAUSED', ['Press P to keep flying'], '#9fd8ef');
    } else if (f.screen === SCREEN_CRASHED) {
      ctx.fillStyle = 'rgba(160,30,20,0.28)';
      ctx.fillRect(0, 0, W, H);
      panel('DOWN', [f.message || 'The plane came down.', f.lives > 0 ? 'Relaunching…' : 'No planes left'], '#ff9a8a');
    } else if (f.screen === SCREEN_LANDED) {
      panel('TOUCHDOWN — GRADE ' + f.landingGrade, [
        f.landingNotes,
        'Rings flown: ' + f.ringsTaken + '/' + world.rings.length + ' · Time left: ' + Math.max(0, Math.ceil(f.timeLeft)) + 's',
        'FINAL SCORE ' + f.score,
        'Press ENTER to fly the course again',
      ], '#8ae08a');
    } else if (f.screen === SCREEN_OVER) {
      panel('SORTIE OVER', [
        'Rings flown: ' + f.ringsTaken + '/' + world.rings.length,
        'FINAL SCORE ' + f.score,
        'Press ENTER to fly again',
      ], '#ff9a8a');
    }
  }

  /** Draw one frame of the sortie. */
  function draw(f) {
    const world = f.world;
    buildCamera(f);
    drawSky(f);
    drawTerrain(world);
    drawRunway(world);
    drawLighthouse(world);
    drawClouds(world, f);
    drawRings(world, f);
    drawPlane(f);
    drawCockpit(f);
    drawHud(f, world);
    drawOverlay(f, world);
  }

  return { draw, resize };
}

/** Multiply a #rrggbb colour by a shade factor, for cheap terrain lighting. */
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * factor), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * factor), 0, 255);
  const b = clamp(Math.round((n & 255) * factor), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/** Blend two #rrggbb colours by t in [0, 1], then apply a shade factor. */
function mix(hexA, hexB, t, factor) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ch = (shift) => clamp(Math.round((((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) * factor), 0, 255);
  return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}
