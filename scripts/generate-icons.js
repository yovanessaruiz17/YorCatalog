import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write icon.svg
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="112" fill="#0f172a"/>
  <!-- Editorial Catalog Geometry -->
  <path d="M120 140C120 128.954 128.954 120 140 120H372C383.046 120 392 128.954 392 140V372C392 383.046 383.046 392 372 392H140C128.954 392 120 383.046 120 372V140Z" fill="#1e293b"/>
  <!-- Left Folio Page -->
  <path d="M140 140H248V372H140C128.954 372 120 363.046 120 352V160C120 148.954 128.954 140 140 140Z" fill="#0f766e"/>
  <!-- Right Folio Page -->
  <path d="M264 140H372C383.046 140 392 148.954 392 160V352C392 363.046 383.046 372 372 372H264V140Z" fill="#0d9488"/>
  <!-- Subtle Spine Center -->
  <rect x="250" y="140" width="12" height="232" rx="3" fill="#14b8a6"/>
  <!-- Editorial Y monogram ligature across spread -->
  <path d="M190 200L256 280L322 200H350L268 296V336H244V296L162 200H190Z" fill="#ffffff"/>
  <!-- Accent spark dot -->
  <circle cx="340" cy="180" r="14" fill="#38bdf8"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');

function drawIcon(size, isMaskable = false) {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;
  const scale = size / 512;
  const padding = isMaskable ? size * 0.15 : 0;
  const cornerRadius = isMaskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      
      // Default dark navy background #0f172a
      let r = 15, g = 23, b = 42, a = 255;

      // Inner card box bounds
      const minX = padding + (isMaskable ? 40 * scale : 60 * scale);
      const maxX = size - padding - (isMaskable ? 40 * scale : 60 * scale);
      const minY = padding + (isMaskable ? 50 * scale : 70 * scale);
      const maxY = size - padding - (isMaskable ? 50 * scale : 70 * scale);

      // Spine division at center
      const spineX = center;

      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        // Spine gap
        if (Math.abs(x - spineX) < 4 * scale) {
          r = 20; g = 184; b = 166; // #14b8a6
        } else if (x < spineX) {
          // Left page #0f766e
          r = 15; g = 118; b = 110;
        } else {
          // Right page #0d9488
          r = 13; g = 148; b = 136;
        }

        // Draw stylized Y monogram
        // Upper left arm
        const yRel = y - minY;
        const xRel = x - minX;
        const totalW = maxX - minX;
        const totalH = maxY - minY;

        const nx = xRel / totalW;
        const ny = yRel / totalH;

        // Check if point is inside letter Y
        let isY = false;
        // Upper left diagonal
        if (ny >= 0.25 && ny <= 0.55) {
          const expectedXLeft = 0.25 + (ny - 0.25) * 0.9;
          if (Math.abs(nx - expectedXLeft) < 0.07) isY = true;
          const expectedXRight = 0.75 - (ny - 0.25) * 0.9;
          if (Math.abs(nx - expectedXRight) < 0.07) isY = true;
        }
        // Stem
        if (ny >= 0.52 && ny <= 0.78) {
          if (Math.abs(nx - 0.5) < 0.065) isY = true;
        }

        if (isY) {
          r = 255; g = 255; b = 255; // White
        }

        // Spark dot at top right
        const dotDist = Math.hypot(nx - 0.78, ny - 0.2);
        if (dotDist < 0.05) {
          r = 56; g = 189; b = 248; // #38bdf8
        }
      }

      // Rounded corners for non-maskable icons
      if (!isMaskable && cornerRadius > 0) {
        let inside = true;
        if (x < cornerRadius && y < cornerRadius) {
          if (Math.hypot(x - cornerRadius, y - cornerRadius) > cornerRadius) inside = false;
        } else if (x > size - cornerRadius && y < cornerRadius) {
          if (Math.hypot(x - (size - cornerRadius), y - cornerRadius) > cornerRadius) inside = false;
        } else if (x < cornerRadius && y > size - cornerRadius) {
          if (Math.hypot(x - cornerRadius, y - (size - cornerRadius)) > cornerRadius) inside = false;
        } else if (x > size - cornerRadius && y > size - cornerRadius) {
          if (Math.hypot(x - (size - cornerRadius), y - (size - cornerRadius)) > cornerRadius) inside = false;
        }
        if (!inside) a = 0;
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return png;
}

// Generate files
const sizes = [
  { name: 'pwa-192x192.png', size: 192, maskable: false },
  { name: 'pwa-512x512.png', size: 512, maskable: false },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon.ico', size: 64, maskable: false },
];

for (const icon of sizes) {
  const png = drawIcon(icon.size, icon.maskable);
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(publicDir, icon.name), buffer);
}

console.log('PWA icons generated successfully in public/');
