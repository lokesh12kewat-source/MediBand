'use client';

import React from 'react';

export default function WorldMapBackground() {
  return (
    <div
      className="world-map-container"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <svg
        viewBox="0 0 2000 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Deep Navy/Slate Ocean Gradient */}
          <radialGradient id="mapOceanGrad" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#111B2E" />
            <stop offset="50%" stopColor="#0B1220" />
            <stop offset="85%" stopColor="#070C16" />
            <stop offset="100%" stopColor="#040810" />
          </radialGradient>

          {/* Continent Land Gradient */}
          <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E2E4A" />
            <stop offset="100%" stopColor="#142036" />
          </linearGradient>

          {/* India Highlight Gradient */}
          <linearGradient id="indiaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6115" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF8A48" stopOpacity="0.18" />
          </linearGradient>

          {/* Supply Chain Arc Gradient */}
          <linearGradient id="mapArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6115" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#FFA066" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.9" />
          </linearGradient>

          {/* Arc Glow Filter */}
          <filter id="mapLineGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Hub Glow Filter */}
          <filter id="mapHubGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Continent Outer Glow Filter */}
          <filter id="mapCoastGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Dot Grid Pattern for Nautical Cartography */}
          <pattern id="mapDotGrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="1.2" fill="#38BDF8" opacity="0.25" />
          </pattern>
        </defs>

        {/* 1. Base Ocean Canvas */}
        <rect width="2000" height="1000" fill="url(#mapOceanGrad)" />

        {/* 2. Nautical Dot Grid */}
        <rect width="2000" height="1000" fill="url(#mapDotGrid)" />

        {/* 3. Global Coordinate Graticules (Latitude & Longitude) */}
        <g stroke="#38BDF8" strokeWidth="1" strokeDasharray="4,8" opacity="0.22">
          {/* Latitudes */}
          <line x1="50" y1="200" x2="1950" y2="200" />
          <line x1="50" y1="350" x2="1950" y2="350" />
          <line x1="50" y1="500" x2="1950" y2="500" stroke="#38BDF8" strokeWidth="1.8" strokeDasharray="8,6" opacity="0.45" /> {/* Equator */}
          <line x1="50" y1="650" x2="1950" y2="650" />
          <line x1="50" y1="800" x2="1950" y2="800" />

          {/* Longitudes */}
          <line x1="250" y1="50" x2="250" y2="950" />
          <line x1="500" y1="50" x2="500" y2="950" />
          <line x1="750" y1="50" x2="750" y2="950" />
          <line x1="1000" y1="50" x2="1000" y2="950" stroke="#38BDF8" strokeWidth="1.8" strokeDasharray="8,6" opacity="0.45" /> {/* Prime Meridian */}
          <line x1="1250" y1="50" x2="1250" y2="950" />
          <line x1="1500" y1="50" x2="1500" y2="950" />
          <line x1="1750" y1="50" x2="1750" y2="950" />
        </g>

        {/* 4. High-Contrast Continents & Landmasses with Electric Cyan Borders */}
        <g filter="url(#mapCoastGlow)">
          {/* North America */}
          <polygon
            points="160,209 175,183 225,183 300,192 350,187 425,192 525,178 600,174 590,209 675,241 725,268 700,294 670,303 645,312 625,330 600,357 595,388 575,370 550,366 515,384 515,411 560,429 585,455 615,464 595,464 575,446 540,429 500,420 475,397 450,393 425,366 400,348 380,330 380,285 350,259 320,236 275,232 225,241 175,232 160,209"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="2"
            opacity="0.95"
          />

          {/* Greenland */}
          <polygon
            points="775,232 825,209 875,187 900,156 850,129 775,129 725,142 700,165 750,209 775,232"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />

          {/* South America */}
          <polygon
            points="615,464 640,451 690,455 750,500 825,522 825,545 810,581 790,603 750,634 725,657 675,701 660,741 630,733 625,701 640,670 645,634 620,581 600,522 600,491 615,464"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="2"
            opacity="0.95"
          />

          {/* Europe */}
          <polygon
            points="955,339 955,308 995,303 980,285 1010,272 1040,259 1040,241 1075,250 1100,232 1140,209 1125,183 1160,187 1200,201 1250,196 1300,196 1300,277 1250,285 1200,299 1175,294 1150,294 1140,317 1115,330 1080,321 1060,303 1015,312 985,339 955,339"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="2"
            opacity="0.95"
          />

          {/* British Isles */}
          <polygon
            points="975,277 995,272 1005,263 1000,241 985,241 975,254 975,277"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />

          {/* Africa */}
          <polygon
            points="970,339 1050,335 1125,357 1170,361 1175,379 1215,446 1255,446 1240,478 1200,522 1175,567 1160,625 1140,652 1090,652 1060,589 1045,522 1040,482 1010,473 960,482 925,446 915,433 915,406 935,375 970,339"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="2"
            opacity="0.95"
          />

          {/* Madagascar */}
          <polygon
            points="1220,554 1250,567 1240,612 1220,612 1220,554"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />

          {/* Asia / Eurasia */}
          <polygon
            points="1300,196 1350,174 1425,165 1525,151 1650,178 1800,187 1900,205 1850,232 1775,254 1710,277 1675,299 1650,330 1610,330 1600,357 1590,393 1540,402 1525,455 1500,491 1490,455 1450,402 1400,429 1400,464 1385,464 1360,411 1340,393 1310,388 1280,384 1270,393 1250,433 1215,446 1175,379 1175,344 1200,321 1250,285 1300,277 1300,196"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="2"
            opacity="0.95"
          />

          {/* Japan */}
          <polygon
            points="1650,357 1675,344 1700,321 1725,303 1710,299 1690,330 1650,357"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />

          {/* Southeast Asia / Indonesia */}
          <polygon
            points="1475,478 1525,522 1575,536 1600,536 1575,509 1525,500 1475,478"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />
          <polygon
            points="1550,513 1590,478 1575,469 1545,491 1550,513"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />

          {/* Australia */}
          <polygon
            points="1570,598 1600,567 1675,554 1710,545 1730,581 1765,625 1750,661 1690,657 1650,643 1575,652 1570,625 1570,598"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="2"
            opacity="0.95"
          />

          {/* New Zealand */}
          <polygon
            points="1840,706 1870,683 1890,665 1875,657 1860,679 1840,706"
            fill="url(#landGrad)"
            stroke="#60A5FA"
            strokeWidth="1.8"
            opacity="0.95"
          />
        </g>

        {/* 5. Special MediBand Highlight: Indian Subcontinent (Neon Orange) */}
        <g id="indiaHighlight">
          {/* India Continental Boundary */}
          <polygon
            points="1340,393 1360,411 1370,433 1385,464 1400,464 1400,442 1425,420 1445,402 1460,406 1440,379 1400,366 1370,357 1360,375 1340,393"
            fill="url(#indiaGrad)"
            stroke="#FF6115"
            strokeWidth="2.8"
            filter="drop-shadow(0 0 14px rgba(255, 97, 21, 0.75))"
          />
          {/* Sri Lanka */}
          <circle
            cx="1405"
            cy="484"
            r="7"
            fill="#FF6115"
            fillOpacity="0.4"
            stroke="#FF6115"
            strokeWidth="1.8"
          />

          {/* Animated/Glowing Radar Pulse Rings from Delhi (1386, 372) */}
          <circle
            cx="1386"
            cy="372"
            r="45"
            fill="none"
            stroke="#FF6115"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            opacity="0.6"
          />
          <circle
            cx="1386"
            cy="372"
            r="85"
            fill="none"
            stroke="#FF6115"
            strokeWidth="1.2"
            strokeDasharray="6,6"
            opacity="0.4"
          />
          <circle
            cx="1386"
            cy="372"
            r="135"
            fill="none"
            stroke="#FF6115"
            strokeWidth="1"
            strokeDasharray="8,8"
            opacity="0.25"
          />
        </g>

        {/* 6. International Supply Chain & Verification Flight Arcs */}
        <g filter="url(#mapLineGlow)">
          {/* India (Delhi) -> Geneva (WHO HQ) */}
          <path
            d="M 1386 372 Q 1208 220 1030 293"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.4"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> London (MHRA) */}
          <path
            d="M 1386 372 Q 1192 195 1000 270"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.4"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> Frankfurt (Pharma Logistics) */}
          <path
            d="M 1386 372 Q 1215 210 1044 276"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.2"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> New York / FDA */}
          <path
            d="M 1386 372 Q 1000 160 630 318"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.6"
            strokeDasharray="9,6"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> Tokyo (PMDA) */}
          <path
            d="M 1386 372 Q 1542 275 1698 340"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.4"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> Singapore (BioMed Hub) */}
          <path
            d="M 1386 372 Q 1452 345 1519 494"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.2"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> Sydney (TGA) */}
          <path
            d="M 1386 372 Q 1571 300 1756 651"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.4"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> Nairobi (Health Supply Corridor) */}
          <path
            d="M 1386 372 Q 1285 330 1184 506"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2.2"
            strokeDasharray="8,5"
            strokeLinecap="round"
          />
          {/* India (Delhi) -> São Paulo (ANVISA) */}
          <path
            d="M 1386 372 Q 1070 380 767 605"
            fill="none"
            stroke="url(#mapArcGrad)"
            strokeWidth="2"
            strokeDasharray="7,6"
            strokeLinecap="round"
          />
          {/* Trans-Atlantic link: London -> New York */}
          <path
            d="M 1000 270 Q 815 205 630 318"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.8"
            strokeDasharray="6,6"
            strokeLinecap="round"
            opacity="0.75"
          />
        </g>

        {/* 7. Strategic Pharmaceutical Hubs & Pulsing Radar Markers */}
        <g filter="url(#mapHubGlow)">
          {/* ── INDIAN NODES (NEON ORANGE) ── */}
          {/* Delhi HQ */}
          <circle cx="1386" cy="372" r="18" fill="none" stroke="#FF6115" strokeWidth="1.8" opacity="0.6" />
          <circle cx="1386" cy="372" r="10" fill="none" stroke="#FF6115" strokeWidth="2.2" opacity="0.9" />
          <circle cx="1386" cy="372" r="6" fill="#FF6115" />
          <circle cx="1386" cy="372" r="2.8" fill="#FFFFFF" />
          <g transform="translate(1398, 368)">
            <rect x="-4" y="-12" width="128" height="20" rx="4" fill="#0B132B" fillOpacity="0.85" stroke="#FF6115" strokeWidth="1" />
            <text x="4" y="2" fill="#FF9E66" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="700">
              Delhi (HQ Node)
            </text>
          </g>

          {/* Mumbai Hub */}
          <circle cx="1364" cy="415" r="14" fill="none" stroke="#FF6115" strokeWidth="1.5" opacity="0.5" />
          <circle cx="1364" cy="415" r="8" fill="none" stroke="#FF6115" strokeWidth="2" opacity="0.8" />
          <circle cx="1364" cy="415" r="5" fill="#FF6115" />
          <circle cx="1364" cy="415" r="2.2" fill="#FFFFFF" />
          <g transform="translate(1376, 411)">
            <rect x="-4" y="-11" width="112" height="18" rx="4" fill="#0B132B" fillOpacity="0.85" stroke="#FF6115" strokeWidth="0.8" />
            <text x="4" y="2" fill="#FFA066" fontFamily="system-ui, -apple-system, sans-serif" fontSize="10" fontWeight="700">
              Mumbai Logistics
            </text>
          </g>

          {/* Hyderabad Pharma City */}
          <circle cx="1392" cy="422" r="14" fill="none" stroke="#FF6115" strokeWidth="1.5" opacity="0.5" />
          <circle cx="1392" cy="422" r="8" fill="none" stroke="#FF6115" strokeWidth="2" opacity="0.8" />
          <circle cx="1392" cy="422" r="5" fill="#FF6115" />
          <circle cx="1392" cy="422" r="2.2" fill="#FFFFFF" />
          <g transform="translate(1404, 425)">
            <rect x="-4" y="-11" width="144" height="18" rx="4" fill="#0B132B" fillOpacity="0.85" stroke="#FF6115" strokeWidth="0.8" />
            <text x="4" y="2" fill="#FFA066" fontFamily="system-ui, -apple-system, sans-serif" fontSize="10" fontWeight="700">
              Hyderabad Pharma City
            </text>
          </g>

          {/* ── INTERNATIONAL NODES (ELECTRIC CYAN / SKY BLUE) ── */}
          {/* Geneva (WHO) */}
          <circle cx="1030" cy="293" r="8" fill="none" stroke="#38BDF8" strokeWidth="1.8" opacity="0.7" />
          <circle cx="1030" cy="293" r="4.5" fill="#38BDF8" />
          <circle cx="1030" cy="293" r="2" fill="#FFFFFF" />
          <g transform="translate(1040, 289)">
            <rect x="-4" y="-10" width="94" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              Geneva (WHO)
            </text>
          </g>

          {/* London (MHRA) */}
          <circle cx="1000" cy="270" r="8" fill="none" stroke="#38BDF8" strokeWidth="1.8" opacity="0.7" />
          <circle cx="1000" cy="270" r="4.5" fill="#38BDF8" />
          <circle cx="1000" cy="270" r="2" fill="#FFFFFF" />
          <g transform="translate(920, 266)">
            <rect x="-4" y="-10" width="76" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              London MHRA
            </text>
          </g>

          {/* Frankfurt */}
          <circle cx="1044" cy="276" r="7" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity="0.7" />
          <circle cx="1044" cy="276" r="4" fill="#38BDF8" />
          <circle cx="1044" cy="276" r="1.8" fill="#FFFFFF" />
          <g transform="translate(1054, 272)">
            <rect x="-4" y="-10" width="102" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              Frankfurt Hub
            </text>
          </g>

          {/* New York / FDA */}
          <circle cx="630" cy="318" r="9" fill="none" stroke="#38BDF8" strokeWidth="1.8" opacity="0.7" />
          <circle cx="630" cy="318" r="5" fill="#38BDF8" />
          <circle cx="630" cy="318" r="2.2" fill="#FFFFFF" />
          <g transform="translate(530, 314)">
            <rect x="-4" y="-10" width="96" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              New York (FDA)
            </text>
          </g>

          {/* Tokyo (PMDA) */}
          <circle cx="1698" cy="340" r="8" fill="none" stroke="#38BDF8" strokeWidth="1.8" opacity="0.7" />
          <circle cx="1698" cy="340" r="4.5" fill="#38BDF8" />
          <circle cx="1698" cy="340" r="2" fill="#FFFFFF" />
          <g transform="translate(1708, 336)">
            <rect x="-4" y="-10" width="86" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              Tokyo PMDA
            </text>
          </g>

          {/* Singapore */}
          <circle cx="1519" cy="494" r="8" fill="none" stroke="#38BDF8" strokeWidth="1.8" opacity="0.7" />
          <circle cx="1519" cy="494" r="4.5" fill="#38BDF8" />
          <circle cx="1519" cy="494" r="2" fill="#FFFFFF" />
          <g transform="translate(1529, 490)">
            <rect x="-4" y="-10" width="112" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              Singapore BioMed
            </text>
          </g>

          {/* Sydney */}
          <circle cx="1756" cy="651" r="8" fill="none" stroke="#38BDF8" strokeWidth="1.8" opacity="0.7" />
          <circle cx="1756" cy="651" r="4.5" fill="#38BDF8" />
          <circle cx="1756" cy="651" r="2" fill="#FFFFFF" />
          <g transform="translate(1766, 647)">
            <rect x="-4" y="-10" width="78" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              Sydney TGA
            </text>
          </g>

          {/* Nairobi Corridor */}
          <circle cx="1184" cy="506" r="7" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity="0.7" />
          <circle cx="1184" cy="506" r="4" fill="#38BDF8" />
          <circle cx="1184" cy="506" r="1.8" fill="#FFFFFF" />
          <g transform="translate(1194, 502)">
            <rect x="-4" y="-10" width="102" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              Nairobi Health
            </text>
          </g>

          {/* São Paulo */}
          <circle cx="767" cy="605" r="7" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity="0.7" />
          <circle cx="767" cy="605" r="4" fill="#38BDF8" />
          <circle cx="767" cy="605" r="1.8" fill="#FFFFFF" />
          <g transform="translate(777, 601)">
            <rect x="-4" y="-10" width="106" height="16" rx="3" fill="#0B132B" fillOpacity="0.85" stroke="#38BDF8" strokeWidth="0.8" />
            <text x="4" y="2" fill="#BAE6FD" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9.5" fontWeight="600">
              São Paulo ANVISA
            </text>
          </g>
        </g>

        {/* 8. HUD Matrix Telemetry Badges */}
        <g opacity="0.85">
          {/* Top-Right HUD Badge */}
          <g transform="translate(1620, 45)">
            <rect x="0" y="0" width="340" height="42" rx="6" fill="#0B132B" fillOpacity="0.88" stroke="#38BDF8" strokeWidth="1" />
            <text x="14" y="18" fill="#38BDF8" fontFamily="monospace" fontSize="11" fontWeight="700" letterSpacing="1.2">
              GLOBAL VERIFICATION MATRIX
            </text>
            <text x="14" y="32" fill="#94A3B8" fontFamily="monospace" fontSize="9.5">
              GS1 COMPLIANT · 14 GLOBAL NODES ACTIVE
            </text>
          </g>

          {/* Bottom-Left HUD Badge */}
          <g transform="translate(50, 930)">
            <text x="0" y="0" fill="#64748B" fontFamily="monospace" fontSize="11" letterSpacing="1.5">
              COORDINATES: 28.6139° N, 77.2090° E · ACTIVE MONITORING PROTOCOL
            </text>
            <text x="0" y="18" fill="#FF6115" fontFamily="monospace" fontSize="10.5" fontWeight="700" letterSpacing="1">
              DATA STREAM: SECURE (EVIDENCE-BACKED PROBABILISTIC MATCHING)
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
