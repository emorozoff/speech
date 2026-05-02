import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

await mkdir(PUBLIC_DIR, { recursive: true });

function buildSvg(size, { padded = false } = {}) {
  const dotR = padded ? Math.round(size * 0.156) : Math.round(size * 0.214);
  const dotCy = padded ? Math.round(size * 0.453) : Math.round(size * 0.430);
  const lineY = padded ? Math.round(size * 0.648) : Math.round(size * 0.684);
  const lineW = padded ? Math.round(size * 0.273) : Math.round(size * 0.391);
  const lineX = (size - lineW) / 2;
  const lineH = Math.max(2, Math.round(size * 0.012));
  const cx = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000"/>
  <circle cx="${cx}" cy="${dotCy}" r="${dotR}" fill="#FFB800"/>
  <rect x="${lineX}" y="${lineY}" width="${lineW}" height="${lineH}" rx="${lineH / 2}" fill="#FFB800" opacity="0.7"/>
</svg>`;
}

async function svgToPng(svg, fileName) {
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  const outputPath = path.join(PUBLIC_DIR, fileName);
  await writeFile(outputPath, buffer);
  console.log('  ✓', fileName, `(${buffer.length} bytes)`);
}

async function writeSvg(svg, fileName) {
  const outputPath = path.join(PUBLIC_DIR, fileName);
  await writeFile(outputPath, svg, 'utf8');
  console.log('  ✓', fileName);
}

console.log('Generating PWA icons in', PUBLIC_DIR);
await svgToPng(buildSvg(192), 'icon-192.png');
await svgToPng(buildSvg(512), 'icon-512.png');
await svgToPng(buildSvg(512, { padded: true }), 'icon-512-maskable.png');
await svgToPng(buildSvg(180), 'apple-touch-icon.png');
await writeSvg(buildSvg(512), 'icon.svg');
console.log('Done.');
