'use strict';

const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico');
const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BUILD_DIR  = path.join(__dirname, '..', 'build');

async function main() {
  const svgPath = path.join(ASSETS_DIR, 'icon.svg');
  if (!fs.existsSync(svgPath)) {
    console.error('ERROR: assets/icon.svg not found');
    process.exit(1);
  }
  const svgBuffer = fs.readFileSync(svgPath);
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Render a 1024px PNG as the source for ICO/ICNS generation
  console.log('  Rendering SVG → PNG (1024×1024)…');
  const resvg1024 = new Resvg(svgBuffer, { fitTo: { mode: 'width', value: 1024 } });
  const png1024 = resvg1024.render().asPng();
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), png1024);

  // Build ICO with the four sizes Windows expects
  console.log('  Generating icon.ico (Windows)…');
  const icoSizes = [16, 32, 48, 256];
  const icoBuffers = icoSizes.map(size => {
    const r = new Resvg(svgBuffer, { fitTo: { mode: 'width', value: size } });
    return r.render().asPng();
  });
  const icoBuffer = await pngToIco(icoBuffers);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);

  // Build ICNS for macOS
  console.log('  Generating icon.icns (macOS)…');
  const icnsBuffer = png2icons.createICNS(png1024, png2icons.BICUBIC, 0);
  if (!icnsBuffer) throw new Error('png2icons returned null — check the input PNG');
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icnsBuffer);

  console.log('✓ Icons written to build/');
}

main().catch(err => {
  console.error('Icon build failed:', err.message);
  process.exit(1);
});
