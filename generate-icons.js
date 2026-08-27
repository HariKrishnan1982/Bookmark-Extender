/**
 * generate-icons.js
 * Converts the source icon JPG to the required PNG sizes.
 * Run once with: node generate-icons.js
 *
 * Requires: npm install sharp
 */
const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, 'icon_source.jpg');
const sizes = [16, 32, 48, 128];

(async () => {
  for (const size of sizes) {
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, 'icons', `icon${size}.png`));
    console.log(`✅ icon${size}.png`);
  }
  console.log('All icons generated!');
})();
