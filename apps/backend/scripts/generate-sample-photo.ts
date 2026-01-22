import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateSamplePhoto() {
  const width = 1920;
  const height = 1080;

  // Create a gradient background with text
  const svg = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad1)" />
      <text x="50%" y="40%" text-anchor="middle" font-family="Arial, sans-serif" font-size="80" fill="white" font-weight="bold">
        SAMPLE PHOTO
      </text>
      <text x="50%" y="55%" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="rgba(255,255,255,0.8)">
        Photonic Photo Booth
      </text>
      <circle cx="${width/2}" cy="${height/2}" r="300" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="4"/>
    </svg>
  `;

  const outputPath = path.join(process.cwd(), 'data', 'sample-photo.jpg');

  // Ensure data directory exists
  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  console.log(`✓ Sample photo created at: ${outputPath}`);
}

generateSamplePhoto().catch(console.error);
