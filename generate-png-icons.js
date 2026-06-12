import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('./public/favicon.svg');
const publicDir = path.resolve('./public');

if (!fs.existsSync(svgPath)) {
  console.error("Source favicon.svg not found in public folder!");
  process.exit(1);
}

const svgBuffer = fs.readFileSync(svgPath);

const iconsToGenerate = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon.png', size: 32 }
];

console.log("Starting PNG generation from SVG...");

for (const icon of iconsToGenerate) {
  try {
    const resvg = new Resvg(svgBuffer, {
      fitTo: {
        mode: 'width',
        value: icon.size,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    const destPath = path.join(publicDir, icon.name);
    fs.writeFileSync(destPath, pngBuffer);
    console.log(`Successfully generated ${icon.name} (${icon.size}x${icon.size})`);
  } catch (error) {
    console.error(`Failed to generate ${icon.name}:`, error);
  }
}

console.log("All icons generated successfully!");
