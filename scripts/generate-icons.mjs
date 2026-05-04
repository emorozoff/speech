import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

await mkdir(PUBLIC_DIR, { recursive: true });

// Композиция: красный rec-кружок сверху + белый «speech» под ним.
// padded — для maskable Android-иконки нужен safe area ~12% от краёв.
function buildSvg(size, { padded = false } = {}) {
  const cx = size / 2;
  const dotR = padded ? Math.round(size * 0.137) : Math.round(size * 0.176);
  const dotCy = padded ? Math.round(size * 0.39) : Math.round(size * 0.355);
  const fontSize = padded ? Math.round(size * 0.18) : Math.round(size * 0.232);
  const textY = padded ? Math.round(size * 0.66) : Math.round(size * 0.71);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000"/>
  <circle cx="${cx}" cy="${dotCy}" r="${dotR}" fill="#FF453A"/>
  <text x="${cx}" y="${textY}" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" letter-spacing="-0.03em">speech</text>
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
