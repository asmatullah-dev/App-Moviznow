import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('Failed to fetch:', url, err.message);
    return null;
  }
}

async function run() {
  console.log('Generating official Price Increase poster (v2)...');

  // 1. Read catalog json for trending collection
  const catalogPath = path.resolve('src/data/moviznow_catalog_export.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const trendingCollection = catalog.collections?.items?.['7R6Mc6ofAVfe5XSK3PMR'];
  const contentMap = new Map((catalog.content || []).map((c) => [c.id, c]));

  const trendingItems = (trendingCollection?.contentIds || [])
    .map((id) => contentMap.get(id))
    .filter((c) => c && c.pos)
    .slice(0, 6);

  console.log('Selected trending items:', trendingItems.map((t) => t.tit));

  // 2. Fetch poster buffers
  const posterBuffers = [];
  for (const item of trendingItems) {
    console.log('Fetching:', item.tit);
    const buf = await fetchImageBuffer(item.pos);
    if (buf) {
      posterBuffers.push({ item, buf });
    }
  }

  // Canvas dimensions: 1080 x 1080 square
  const WIDTH = 1080;
  const HEIGHT = 1080;

  // Process poster cards with rounded corners and glowing border
  const cardWidth = 145;
  const cardHeight = 215;
  const cardCornerRadius = 16;

  const roundRectMask = Buffer.from(
    `<svg width="${cardWidth}" height="${cardHeight}">
      <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="${cardCornerRadius}" ry="${cardCornerRadius}" fill="#fff"/>
    </svg>`
  );

  const processedPosters = [];
  for (let i = 0; i < posterBuffers.length; i++) {
    const { item, buf } = posterBuffers[i];
    try {
      const resized = await sharp(buf)
        .resize(cardWidth, cardHeight, { fit: 'cover' })
        .composite([{ input: roundRectMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      // Border and title label wrapper
      const bordered = await sharp({
        create: {
          width: cardWidth + 8,
          height: cardHeight + 8,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${cardWidth + 8}" height="${cardHeight + 8}">
                <rect x="2" y="2" width="${cardWidth + 4}" height="${cardHeight + 4}" rx="${cardCornerRadius + 2}" ry="${cardCornerRadius + 2}" fill="none" stroke="rgba(245, 158, 11, 0.6)" stroke-width="2.5"/>
              </svg>`
            ),
            top: 0,
            left: 0,
          },
          {
            input: resized,
            top: 4,
            left: 4,
          },
        ])
        .png()
        .toBuffer();

      processedPosters.push({ item, buffer: bordered });
    } catch (e) {
      console.error('Error processing card:', e.message);
    }
  }

  // Place 4 prominent trending movie posters on sides (2 left, 2 right)
  // Left side:
  // Card 1: left 32, top 300
  // Card 2: left 32, top 535
  // Right side:
  // Card 3: left 895, top 300
  // Card 4: left 895, top 535
  const posterPositions = [
    { left: 32, top: 300 },
    { left: 32, top: 535 },
    { left: 895, top: 300 },
    { left: 895, top: 535 },
  ];

  const compositeList = [];

  for (let i = 0; i < processedPosters.length && i < posterPositions.length; i++) {
    compositeList.push({
      input: processedPosters[i].buffer,
      left: posterPositions[i].left,
      top: posterPositions[i].top,
    });
  }

  // 3. Create Clean, Non-Overlapping Main Typography & Badges SVG Overlay
  const overlaySvg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Vivid Emerald Pop Gradient -->
      <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#047857" />
      </linearGradient>

      <!-- Neon Accent Glow -->
      <filter id="emeraldGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#10b981" flood-opacity="0.8"/>
      </filter>

      <!-- Center Ambient Glow -->
      <radialGradient id="centerGlow" cx="50%" cy="48%" r="48%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.22" />
        <stop offset="60%" stop-color="#10b981" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>

      <!-- Top Ambient Light -->
      <radialGradient id="topAmbient" cx="50%" cy="0%" r="55%">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>

      <!-- Gold Border Gradient -->
      <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="50%" stop-color="#fcd34d" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>

      <!-- Gold Text Gradient -->
      <linearGradient id="goldText" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="50%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
    </defs>

    <!-- Ambient background glows -->
    <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#topAmbient)" />
    <circle cx="540" cy="510" r="480" fill="url(#centerGlow)" />

    <!-- ==================== HEADER: OFFICIAL LOGO ==================== -->
    <g transform="translate(370, 36)">
      <!-- Official MovizNow 'M' Architectural Icon -->
      <g transform="translate(0, 0) scale(0.18)">
        <!-- Abstract 'M' shape -->
        <path d="M 90 350 L 90 100 L 256 230 L 422 100 L 422 350" fill="none" stroke="#ffffff" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Glowing Play Button -->
        <path d="M 215 160 L 330 230 L 215 300 Z" fill="url(#emeraldGrad)" filter="url(#emeraldGlow)" stroke="url(#emeraldGrad)" stroke-width="20" stroke-linejoin="round" />
      </g>
      <!-- Wordmark Text -->
      <text x="96" y="52" font-family="'Inter', system-ui, -apple-system, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-1">
        Moviz<tspan fill="#10b981">Now</tspan><tspan fill="#6ee7b7" font-size="28" font-weight="700">.com</tspan>
      </text>
    </g>

    <!-- Subtitle Category Tag -->
    <text x="540" y="132" font-family="'Inter', sans-serif" font-size="15" font-weight="800" text-anchor="middle" fill="#10b981" letter-spacing="4">
      OFFICIAL STREAMING PLAN
    </text>

    <!-- ==================== MAIN HEADLINE ==================== -->
    <!-- Notice: Exact words "PRICE INCREASE ALERT" as requested -->
    <text x="540" y="188" font-family="'Inter', 'Arial Black', sans-serif" font-size="52" font-weight="900" text-anchor="middle" fill="#ffffff" letter-spacing="1">
      PRICE INCREASE ALERT
    </text>

    <!-- Date Badge: EFFECTIVE 21 OCTOBER SE -->
    <g transform="translate(355, 214)">
      <rect x="0" y="0" width="370" height="42" rx="21" fill="rgba(239, 68, 68, 0.18)" stroke="#ef4444" stroke-width="2" />
      <circle cx="26" cy="21" r="6" fill="#ef4444" />
      <text x="195" y="27" font-family="'Inter', sans-serif" font-size="18" font-weight="900" text-anchor="middle" fill="#fca5a5" letter-spacing="1.5">
        EFFECTIVE 21 OCTOBER SE
      </text>
    </g>

    <!-- Label above posters -->
    <text x="110" y="285" font-family="'Inter', sans-serif" font-size="12" font-weight="800" text-anchor="middle" fill="#fbbf24" letter-spacing="1">
      🔥 TRENDING NOW
    </text>
    <text x="970" y="285" font-family="'Inter', sans-serif" font-size="12" font-weight="800" text-anchor="middle" fill="#fbbf24" letter-spacing="1">
      🔥 TRENDING NOW
    </text>

    <!-- ==================== CENTER COMPARISON CARD ==================== -->
    <g transform="translate(205, 290)">
      <!-- Main Card Box -->
      <rect x="0" y="0" width="670" height="450" rx="30" fill="rgba(15, 15, 18, 0.94)" stroke="url(#goldBorder)" stroke-width="2.5" />

      <!-- Top Badge in Card -->
      <g transform="translate(235, 26)">
        <rect x="0" y="0" width="200" height="36" rx="18" fill="rgba(16, 185, 129, 0.18)" stroke="#10b981" stroke-width="1.8" />
        <text x="100" y="24" font-family="'Inter', sans-serif" font-size="17" font-weight="900" text-anchor="middle" fill="#34d399" letter-spacing="2">
          BASIC PLAN
        </text>
      </g>

      <!-- Old Rate: Rs 100 -->
      <text x="160" y="165" font-family="'Inter', 'Arial Black', sans-serif" font-size="64" font-weight="900" text-anchor="middle" fill="#d4d4d8">
        Rs 100
      </text>
      <!-- Red Strike line -->
      <line x1="55" y1="175" x2="265" y2="120" stroke="#ef4444" stroke-width="8" stroke-linecap="round" />
      <text x="160" y="200" font-family="'Inter', sans-serif" font-size="14" font-weight="800" text-anchor="middle" fill="#71717a" letter-spacing="1">
        OLD RATE / MONTH
      </text>

      <!-- Big Golden Arrow -->
      <g transform="translate(305, 128)">
        <path d="M 0 14 L 38 14 L 38 0 L 62 24 L 38 48 L 38 34 L 0 34 Z" fill="url(#goldText)" />
      </g>

      <!-- New Rate: Rs 150 -->
      <text x="500" y="165" font-family="'Inter', 'Arial Black', sans-serif" font-size="74" font-weight="900" text-anchor="middle" fill="url(#goldText)">
        Rs 150
      </text>
      <text x="500" y="200" font-family="'Inter', sans-serif" font-size="14" font-weight="800" text-anchor="middle" fill="#f59e0b" letter-spacing="1">
        NEW RATE (FROM 21 OCT)
      </text>

      <!-- Divider -->
      <line x1="35" y1="230" x2="635" y2="230" stroke="rgba(63, 63, 70, 0.6)" stroke-width="1.2" />

      <!-- Included Benefits Checklist -->
      <g transform="translate(60, 260)">
        <circle cx="10" cy="10" r="8" fill="#10b981" />
        <polyline points="7,10 9,13 14,7" fill="none" stroke="#fff" stroke-width="2" />
        <text x="28" y="15" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#f4f4f5">
          Unlimited Movies &amp; Complete Web Series
        </text>

        <circle cx="10" cy="45" r="8" fill="#10b981" />
        <polyline points="7,45 9,48 14,42" fill="none" stroke="#fff" stroke-width="2" />
        <text x="28" y="50" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#f4f4f5">
          Full HD 1080p &amp; 720p Streaming
        </text>

        <circle cx="10" cy="80" r="8" fill="#10b981" />
        <polyline points="7,80 9,83 14,77" fill="none" stroke="#fff" stroke-width="2" />
        <text x="28" y="85" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#f4f4f5">
          Fast Direct High-Speed Downloads
        </text>

        <circle cx="10" cy="115" r="8" fill="#10b981" />
        <polyline points="7,115 9,118 14,112" fill="none" stroke="#fff" stroke-width="2" />
        <text x="28" y="120" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#f4f4f5">
          Works On All Mobile, PC &amp; Smart TV Browsers
        </text>
      </g>

      <!-- Urgency Banner Inside/Attached to Card -->
      <g transform="translate(35, 400)">
        <rect x="0" y="0" width="600" height="36" rx="10" fill="rgba(245, 158, 11, 0.15)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1.2" />
        <text x="300" y="24" font-family="'Inter', sans-serif" font-size="15" font-weight="800" text-anchor="middle" fill="#fcd34d">
          ⏳ Lock In Rs 100 Now Before Price Increases!
        </text>
      </g>
    </g>

    <!-- ==================== ROMAN URDU ACTION BANNER ==================== -->
    <g transform="translate(140, 765)">
      <rect x="0" y="0" width="800" height="92" rx="22" fill="url(#goldBorder)" />
      <text x="400" y="42" font-family="'Inter', 'Arial Black', sans-serif" font-size="32" font-weight="900" text-anchor="middle" fill="#09090b" letter-spacing="1">
        AAKHRI MAUQA! ABHI BUY KAREIN
      </text>
      <text x="400" y="74" font-family="'Inter', sans-serif" font-size="18" font-weight="800" text-anchor="middle" fill="#18181b">
        21 October Se Pehle Rs 100 Mein Apna Plan Activate Karein!
      </text>
    </g>

    <!-- Roman Urdu Explainer Subtext -->
    <text x="540" y="895" font-family="'Inter', sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="#f3f4f6">
      21 October se Basic Plan ki nayi qeemat Rs 150 ho jayegi.
    </text>
    <text x="540" y="926" font-family="'Inter', sans-serif" font-size="18" font-weight="600" text-anchor="middle" fill="#9ca3af">
      Purani rate (Rs 100) par chalne ke liye abhi 1, 3 ya 6 month plan buy karein!
    </text>

    <!-- ==================== FOOTER CTA BUTTON ==================== -->
    <g transform="translate(330, 955)">
      <rect x="0" y="0" width="420" height="58" rx="29" fill="rgba(16, 185, 129, 0.12)" stroke="#10b981" stroke-width="2.2" />
      <circle cx="36" cy="29" r="13" fill="#10b981" />
      <polygon points="32,23 44,29 32,35" fill="#ffffff" />
      <text x="230" y="38" font-family="'Inter', 'Arial Black', sans-serif" font-size="25" font-weight="900" text-anchor="middle" fill="#ffffff" letter-spacing="1">
        Visit: Moviz<tspan fill="#10b981">Now</tspan>.com
      </text>
    </g>

    <text x="540" y="1045" font-family="'Inter', sans-serif" font-size="13" font-weight="600" text-anchor="middle" fill="#71717a" letter-spacing="1.5">
      INSTANT ACTIVATION • NO ADS • 100% SECURE
    </text>
  </svg>
  `;

  // Base background: Obsidian Dark
  const baseBackground = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 9, g: 9, b: 11, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const finalComposites = [...compositeList];
  finalComposites.push({
    input: Buffer.from(overlaySvg),
    top: 0,
    left: 0,
  });

  const finalImage = await sharp(baseBackground)
    .composite(finalComposites)
    .jpeg({ quality: 96 })
    .toBuffer();

  // Save to all target paths
  const outputPaths = [
    'src/assets/images/moviznow_price_increase_poster.jpg',
    'public/moviznow_price_increase_poster.jpg',
    'src/assets/images/moviznow_price_hike_poster.jpg',
    'public/moviznow_price_hike_poster.jpg',
  ];

  for (const p of outputPaths) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, finalImage);
    console.log('Saved to:', p);
  }

  console.log('Successfully generated official Price Increase poster (v2)!');
}

run().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
