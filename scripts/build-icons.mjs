// Renders PNG icons and default social images from the SVG logo. Run once: node scripts/build-icons.mjs
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const logo = await readFile('public/assets/img/logo.svg');
const out = 'public/assets/img';

for (const size of [32, 180, 192, 512]) {
  const name = size === 32 ? 'favicon-32.png' : size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  await sharp(logo, { density: 384 }).resize(size, size).png().toFile(`${out}/${name}`);
}
await sharp(logo, { density: 384 }).resize(48, 48).png().toFile('public/favicon.ico'); // PNG-in-ICO name, accepted by browsers

const banner = (title, subtitle) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#042f2e"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <path d="M0 630 300 300l120 150 110-130 300 310z" fill="#115e59" opacity=".6"/>
  <path d="M500 630 820 260l120 140 90-100 170 330z" fill="#134e4a" opacity=".7"/>
  <text x="80" y="250" font-family="Segoe UI, Arial, sans-serif" font-size="76" font-weight="800" fill="#fff">${title}</text>
  <text x="80" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#ccfbf1">${subtitle}</text>
  <text x="80" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="700" fill="#fb923c">Soaltee Mode, Kathmandu · +977 9843944253</text>
</svg>`);

await sharp(banner('The Everest Kennel', 'Pet shop · Vet house calls · Boarding · Shelter')).jpeg({ quality: 82 }).toFile(`${out}/og-default.jpg`);
await sharp(banner('Visit our shop', 'Puppies, food, accessories and care')).jpeg({ quality: 82 }).toFile(`${out}/storefront.jpg`);
console.log('Icons and social images generated');
