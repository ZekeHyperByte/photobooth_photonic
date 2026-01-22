import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateNewspaperTemplates() {
  const width = 1920;
  const height = 1080;
  const outputDir = path.join(process.cwd(), 'data', 'templates', 'defaults');

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Template 1: Classic Newspaper Frame
  const classicSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="paper-texture">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise"/>
          <feDiffuseLighting in="noise" lighting-color="#f5f5dc" surfaceScale="1">
            <feDistantLight azimuth="45" elevation="60"/>
          </feDiffuseLighting>
        </filter>
      </defs>

      <!-- Aged paper background -->
      <rect width="${width}" height="${height}" fill="#f5f5dc"/>

      <!-- Inner photo cutout area (15% x, 20% y, 70% width, 60% height) -->
      <!-- This creates a frame effect -->

      <!-- Top border with newspaper header -->
      <rect x="0" y="0" width="${width}" height="180" fill="#2c2c2c"/>
      <text x="${width/2}" y="80" text-anchor="middle" font-family="serif" font-size="72" fill="#f5f5dc" font-weight="bold" letter-spacing="8">
        THE DAILY PHOTOBOOTH
      </text>
      <text x="${width/2}" y="130" text-anchor="middle" font-family="serif" font-size="28" fill="#f5f5dc">
        Est. 2024 • Special Edition
      </text>
      <line x1="100" y1="155" x2="${width-100}" y2="155" stroke="#f5f5dc" stroke-width="2"/>

      <!-- Left border -->
      <rect x="0" y="180" width="200" height="${height-180}" fill="#2c2c2c"/>

      <!-- Right border -->
      <rect x="${width-200}" y="180" width="200" height="${height-180}" fill="#2c2c2c"/>

      <!-- Bottom border with date -->
      <rect x="200" y="${height-120}" width="${width-400}" height="120" fill="#2c2c2c"/>
      <text x="${width/2}" y="${height-50}" text-anchor="middle" font-family="serif" font-size="32" fill="#f5f5dc">
        TODAY'S SPECIAL MOMENT
      </text>

      <!-- Corner decorations -->
      <circle cx="200" cy="180" r="15" fill="#f5f5dc"/>
      <circle cx="${width-200}" cy="180" r="15" fill="#f5f5dc"/>
      <circle cx="200" cy="${height-120}" r="15" fill="#f5f5dc"/>
      <circle cx="${width-200}" cy="${height-120}" r="15" fill="#f5f5dc"/>
    </svg>
  `;

  // Template 2: Vintage Newspaper
  const vintageSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Sepia background -->
      <rect width="${width}" height="${height}" fill="#d4c5a9"/>

      <!-- Ornate top border -->
      <rect x="0" y="0" width="${width}" height="220" fill="#3d2817"/>

      <!-- Decorative pattern -->
      <pattern id="vintage-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="3" fill="#d4c5a9" opacity="0.3"/>
      </pattern>
      <rect x="0" y="0" width="${width}" height="220" fill="url(#vintage-pattern)"/>

      <text x="${width/2}" y="90" text-anchor="middle" font-family="serif" font-size="80" fill="#d4c5a9" font-weight="bold" font-style="italic">
        Vintage Times
      </text>
      <text x="${width/2}" y="150" text-anchor="middle" font-family="serif" font-size="32" fill="#d4c5a9" letter-spacing="4">
        — MEMORIES CAPTURED —
      </text>
      <line x1="150" y1="180" x2="${width-150}" y2="180" stroke="#d4c5a9" stroke-width="3"/>
      <line x1="150" y1="190" x2="${width-150}" y2="190" stroke="#d4c5a9" stroke-width="1"/>

      <!-- Side borders with ornate design -->
      <rect x="0" y="220" width="150" height="${height-360}" fill="#3d2817"/>
      <rect x="${width-150}" y="220" width="150" height="${height-360}" fill="#3d2817"/>

      <!-- Decorative elements on sides -->
      <line x1="75" y1="250" x2="75" y2="${height-170}" stroke="#d4c5a9" stroke-width="2" stroke-dasharray="10,5"/>
      <line x1="${width-75}" y1="250" x2="${width-75}" y2="${height-170}" stroke="#d4c5a9" stroke-width="2" stroke-dasharray="10,5"/>

      <!-- Bottom border -->
      <rect x="0" y="${height-140}" width="${width}" height="140" fill="#3d2817"/>
      <rect x="0" y="${height-140}" width="${width}" height="140" fill="url(#vintage-pattern)"/>
      <text x="${width/2}" y="${height-60}" text-anchor="middle" font-family="serif" font-size="36" fill="#d4c5a9" font-style="italic">
        A Moment in Time
      </text>

      <!-- Corner flourishes -->
      <path d="M 150 220 Q 170 220, 170 240" stroke="#d4c5a9" stroke-width="3" fill="none"/>
      <path d="M ${width-150} 220 Q ${width-170} 220, ${width-170} 240" stroke="#d4c5a9" stroke-width="3" fill="none"/>
    </svg>
  `;

  // Template 3: Modern Newspaper
  const modernSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Clean white background -->
      <rect width="${width}" height="${height}" fill="#ffffff"/>

      <!-- Top header bar -->
      <rect x="0" y="0" width="${width}" height="160" fill="#1a1a1a"/>
      <text x="100" y="90" font-family="sans-serif" font-size="64" fill="#ffffff" font-weight="900" letter-spacing="2">
        PHOTO
      </text>
      <text x="100" y="130" font-family="sans-serif" font-size="24" fill="#888888" letter-spacing="1">
        TODAY'S EDITION
      </text>

      <!-- Accent line -->
      <rect x="0" y="160" width="${width}" height="8" fill="#e74c3c"/>

      <!-- Minimal side borders -->
      <rect x="0" y="168" width="120" height="${height-268}" fill="#f8f8f8"/>
      <rect x="${width-120}" y="168" width="120" height="${height-268}" fill="#f8f8f8"/>

      <!-- Vertical accent lines -->
      <line x1="120" y1="168" x2="120" y2="${height-100}" stroke="#e74c3c" stroke-width="4"/>
      <line x1="${width-120}" y1="168" x2="${width-120}" y2="${height-100}" stroke="#e74c3c" stroke-width="4"/>

      <!-- Bottom info bar -->
      <rect x="0" y="${height-100}" width="${width}" height="100" fill="#1a1a1a"/>
      <text x="${width/2}" y="${height-45}" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#ffffff" font-weight="600">
        YOUR SPECIAL MOMENT
      </text>

      <!-- Grid pattern in side borders -->
      <pattern id="grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="20" stroke="#dddddd" stroke-width="1"/>
        <line x1="0" y1="0" x2="20" y2="0" stroke="#dddddd" stroke-width="1"/>
      </pattern>
      <rect x="0" y="168" width="120" height="${height-268}" fill="url(#grid)"/>
      <rect x="${width-120}" y="168" width="120" height="${height-268}" fill="url(#grid)"/>
    </svg>
  `;

  // Generate the three templates
  const templates = [
    { name: 'newspaper-classic.png', svg: classicSvg },
    { name: 'newspaper-vintage.png', svg: vintageSvg },
    { name: 'newspaper-modern.png', svg: modernSvg }
  ];

  for (const template of templates) {
    const outputPath = path.join(outputDir, template.name);
    await sharp(Buffer.from(template.svg))
      .png()
      .toFile(outputPath);
    console.log(`✓ Created: ${outputPath}`);
  }

  console.log('\n✓ All newspaper templates created successfully!');
}

generateNewspaperTemplates().catch(console.error);
