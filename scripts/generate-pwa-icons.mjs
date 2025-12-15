import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// SVG icon content
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#16a34a"/>
      <stop offset="100%" style="stop-color:#15803d"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <path d="M256 120 C200 180, 180 260, 256 340 C332 260, 312 180, 256 120" fill="#ffffff" opacity="0.95"/>
  <path d="M256 200 L256 380" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>
  <ellipse cx="256" cy="400" rx="120" ry="24" fill="#ffffff" opacity="0.3"/>
  <circle cx="160" cy="380" r="28" fill="#fbbf24" stroke="#f59e0b" stroke-width="4"/>
  <text x="160" y="388" text-anchor="middle" fill="#92400e" font-size="24" font-weight="bold">$</text>
  <circle cx="352" cy="380" r="28" fill="#fbbf24" stroke="#f59e0b" stroke-width="4"/>
  <text x="352" y="388" text-anchor="middle" fill="#92400e" font-size="24" font-weight="bold">$</text>
</svg>`;

async function generateIcons() {
  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const svgBuffer = Buffer.from(svgIcon);

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Generate apple-touch-icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  console.log('Generated: apple-touch-icon.png');

  // Generate favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(iconsDir, 'favicon-32x32.png'));
  console.log('Generated: favicon-32x32.png');

  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.join(iconsDir, 'favicon-16x16.png'));
  console.log('Generated: favicon-16x16.png');

  console.log('\\nAll PWA icons generated successfully!');
}

generateIcons().catch(console.error);
