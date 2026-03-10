const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputImagePath = path.join(__dirname, 'public', 'logo.png.png');
const publicDir = path.join(__dirname, 'public');
const iconsDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
    try {
        console.log(`Processing: ${inputImagePath}`);

        if (!fs.existsSync(inputImagePath)) {
            throw new Error('Input image not found: ' + inputImagePath);
        }

        // Generate 192x192
        await sharp(inputImagePath)
            .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(path.join(iconsDir, 'icon-192.png'));
        console.log('Created icon-192.png');

        // Generate 512x512
        await sharp(inputImagePath)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(path.join(iconsDir, 'icon-512.png'));
        console.log('Created icon-512.png');

        // Generate favicon.png
        await sharp(inputImagePath)
            .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(path.join(publicDir, 'favicon.png'));
        console.log('Created favicon.png');

    } catch (error) {
        console.error('Error generating icons:', error);
    }
}

generateIcons();
