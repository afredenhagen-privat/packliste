/**
 * Generiert PWA-Icons (any + maskable) aus einer einzelnen SVG-Quelle.
 * Aufruf: node scripts/gen-icons.mjs
 *
 * Ausgaben:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png   (mit Safe-Area-Padding)
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

const ACCENT = '#4f46e5';
const ACCENT_DARK = '#4338ca';

// "Any"-Icon: füllt das gesamte Quadrat (mit abgerundeten Ecken)
function svgAny(size) {
  const r = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.55);
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="${ACCENT_DARK}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="#ffffff">P</text>
</svg>`);
}

// "Maskable"-Icon: Logo nur in der inneren 80%-Safe-Area, Hintergrund vollflächig
function svgMaskable(size) {
  const fontSize = Math.round(size * 0.4);
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="${ACCENT_DARK}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="#ffffff">P</text>
</svg>`);
}

async function generate() {
  await sharp(svgAny(192)).png().toFile(resolve(outDir, 'icon-192.png'));
  await sharp(svgAny(512)).png().toFile(resolve(outDir, 'icon-512.png'));
  await sharp(svgMaskable(512))
    .png()
    .toFile(resolve(outDir, 'icon-maskable-512.png'));
  console.log('PWA-Icons in', outDir, 'erzeugt.');
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
