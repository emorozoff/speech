import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

// Open Graph рекомендуемый размер для широких карточек: 1200×630.
// Композиция повторяет логику app-иконки (rec-кружок + «speech»),
// но в горизонтальном формате с подписью.
const W = 1200;
const H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>

  <circle cx="${W / 2}" cy="200" r="76" fill="#FF453A"/>

  <text
    x="${W / 2}"
    y="380"
    font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-weight="700"
    font-size="160"
    fill="#FFFFFF"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="-0.03em"
  >speech</text>

  <text
    x="${W / 2}"
    y="490"
    font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-weight="500"
    font-size="40"
    fill="#888888"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="-0.005em"
  >Телесуфлёр для блогеров. От блогера.</text>

  <text
    x="${W / 2}"
    y="570"
    font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-weight="500"
    font-size="22"
    fill="#444444"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="0.04em"
  >PWA · ГОЛОС ВЕДЁТ ТЕКСТ · ПОЛНОСТЬЮ ОФФЛАЙН</text>
</svg>`;

console.log('Generating og-image in', PUBLIC_DIR);
const buffer = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(path.join(PUBLIC_DIR, 'og-image.png'), buffer);
console.log('  ✓ og-image.png', `(${buffer.length} bytes)`);
console.log('Done.');
