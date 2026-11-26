// Skybound Archipelago — hand-in program (Node 22, standard library only).
//
// The game itself lives in game/ as plain static files (game/index.html plus its ES modules);
// it needs no build step and loads nothing over the network. This program's one job is to hand
// the entry in: copy game/ and screenshots/ from beside this file into the output directory
// (MAKEFUN_OUTPUT_DIR, or /output inside the grader) and write dossier.json there with the
// vendored make.fun library, so the dossier the judge reads is exactly what buildDossier
// derives from the files as submitted.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Create the output tree (never remove it: the grader mounts it and expects it to stay).
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own: at most 4 screenshots of 256 KiB, at most 993 entries and
// 48 MiB under game/, no game/ path over 1000 bytes, and the dossier text capped at 160 KiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
