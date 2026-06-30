/**
 * SVG Rendering Engine for Section Drawing
 * Draws I-section and optional cover plates dynamically with dimension lines, centroid, and neutral axes.
 */

/**
 * Draws the I-section inside an SVG element inside the container.
 * @param {string} containerId - ID of the container element
 * @param {object} params - Input parameters { D, btf, ttf, bbf, tbf, tw, btp, ttp, bbp, tbp, hasTopPlate, hasBottomPlate }
 * @param {object} results - Calculated properties (yc, yp, etc.)
 * @param {string} unit - Current display unit (mm, cm, in, m)
 */
function drawISection(containerId, params, results, unit) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const D = Number(params.D);
  const btf = Number(params.btf);
  const ttf = Number(params.ttf);
  const bbf = Number(params.bbf);
  const tbf = Number(params.tbf);
  const tw = Number(params.tw);

  const hasTopPlate = !!params.hasTopPlate;
  const btp = hasTopPlate ? Number(params.btp || 0) : 0;
  const ttp = hasTopPlate ? Number(params.ttp || 0) : 0;

  const hasBottomPlate = !!params.hasBottomPlate;
  const bbp = hasBottomPlate ? Number(params.bbp || 0) : 0;
  const tbp = hasBottomPlate ? Number(params.tbp || 0) : 0;

  const yc = Number(results.yc); // Centroid from bottom
  const yp = Number(results.yp); // PNA from bottom

  // Composite limits
  const D_total = D + ttp + tbp;
  const maxW = Math.max(btf, bbf, btp, bbp);

  // Canvas details
  const canvasW = 460;
  const canvasH = 400;
  const padLeft = 85;
  const padRight = 85;
  const padTop = 60;
  const padBottom = 60;

  const drawAreaW = canvasW - padLeft - padRight;
  const drawAreaH = canvasH - padTop - padBottom;

  // Scaling factor
  const scale = Math.min(drawAreaW / maxW, drawAreaH / D_total);

  // Centerline X
  const cx = padLeft + drawAreaW / 2;

  // Bottom line Y (origin of entire composite shape)
  const cyBottom = canvasH - padBottom;

  // Coordinate mapping helper
  const getX = (valFromCenter) => cx + valFromCenter * scale;
  const getY = (valFromBottom) => cyBottom - valFromBottom * scale;

  // Interface coordinates (from bottom y = 0 to y = D_total)
  const y0 = 0;
  const y1 = tbp;
  const y2 = tbp + tbf;
  const y3 = tbp + D - ttf;
  const y4 = tbp + D;
  const y5 = D_total;

  const dw = D - ttf - tbf; // web height

  // SVG Coordinates for drawing I-section core
  const xBfL = getX(-bbf / 2);
  const xBfR = getX(bbf / 2);
  const xTfL = getX(-btf / 2);
  const xTfR = getX(btf / 2);
  const xWL = getX(-tw / 2);
  const xWR = getX(tw / 2);

  const yBfBottom = getY(y1);
  const yBfTop = getY(y2);
  const yTfBottom = getY(y3);
  const yTfTop = getY(y4);

  // I-Section Shape Path (Trace clockwise starting from bottom-left corner of bottom flange)
  const pathD = `
    M ${xBfL} ${yBfBottom}
    L ${xBfL} ${yBfTop}
    L ${xWL} ${yBfTop}
    L ${xWL} ${yTfBottom}
    L ${xTfL} ${yTfBottom}
    L ${xTfL} ${yTfTop}
    L ${xTfR} ${yTfTop}
    L ${xTfR} ${yTfBottom}
    L ${xWR} ${yTfBottom}
    L ${xWR} ${yBfTop}
    L ${xBfR} ${yBfTop}
    L ${xBfR} ${yBfBottom}
    Z
  `.trim();

  // Highlight offset on the right
  const maxRightBound = getX(maxW / 2);

  // Create SVG string
  let svg = `
    <svg viewBox="0 0 ${canvasW} ${canvasH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Arrow markers for dimension lines -->
        <marker id="arrow-start" markerWidth="8" markerHeight="8" refX="0" refY="3" orient="auto">
          <path d="M6,0 L0,3 L6,6 Z" fill="var(--text-secondary)"/>
        </marker>
        <marker id="arrow-end" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-secondary)"/>
        </marker>
        <style>
          .svg-text { fill: var(--text-secondary); font-family: var(--font-sans); font-size: 11px; }
          .svg-text-bold { fill: var(--text-primary); font-family: var(--font-title); font-weight: 600; font-size: 12px; }
          .svg-axis-lbl { font-family: var(--font-title); font-size: 11px; font-weight: 700; }
          .interactive-zone { fill: transparent; cursor: pointer; transition: fill 0.2s; }
          .interactive-zone:hover { fill: rgba(20, 184, 166, 0.08); }
          .interactive-zone.active { fill: rgba(20, 184, 166, 0.2); stroke: var(--accent-secondary); stroke-width: 1px; }
          .svg-plate-shape { fill: rgba(20, 184, 166, 0.1); stroke: var(--accent-secondary); stroke-width: 1.5; }
          .svg-text-summary { fill: var(--text-secondary); font-family: var(--font-sans); font-size: 11px; font-weight: 500; }
        </style>
      </defs>

      <!-- Grid Background -->
      <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="transparent" />

      <!-- ================= DRAW SHAPES ================= -->

      <!-- 1. Bottom Cover Plate -->
      ${hasBottomPlate ? `
        <rect x="${getX(-bbp/2)}" y="${getY(y1)}" width="${bbp * scale}" height="${tbp * scale}" 
              class="svg-plate-shape" id="svg-bottom-plate" />
      ` : ''}

      <!-- 2. The Main I-Section Core -->
      <path d="${pathD}" class="svg-section-shape" id="svg-main-outline" />

      <!-- 3. Top Cover Plate -->
      ${hasTopPlate ? `
        <rect x="${getX(-btp/2)}" y="${getY(y5)}" width="${btp * scale}" height="${ttp * scale}" 
              class="svg-plate-shape" id="svg-top-plate" />
      ` : ''}


      <!-- ================= HOVER INTERACTIVE ZONES ================= -->
      
      <!-- Top Cover Plate Zone -->
      ${hasTopPlate ? `
        <rect x="${getX(-btp/2)}" y="${getY(y5)}" width="${btp * scale}" height="${ttp * scale}" 
              class="interactive-zone" id="svg-zone-tp" data-target="top-plate" />
      ` : ''}

      <!-- Top Flange Zone -->
      <rect x="${xTfL}" y="${yTfTop}" width="${btf * scale}" height="${ttf * scale}" 
            class="interactive-zone" id="svg-zone-tf" data-target="top-flange" />
      
      <!-- Web Zone -->
      <rect x="${xWL}" y="${yTfBottom}" width="${tw * scale}" height="${dw * scale}" 
            class="interactive-zone" id="svg-zone-web" data-target="web" />

      <!-- Bottom Flange Zone -->
      <rect x="${xBfL}" y="${yBfBottom}" width="${bbf * scale}" height="${tbf * scale}" 
            class="interactive-zone" id="svg-zone-bf" data-target="bottom-flange" />

      <!-- Bottom Cover Plate Zone -->
      ${hasBottomPlate ? `
        <rect x="${getX(-bbp/2)}" y="${getY(y1)}" width="${bbp * scale}" height="${tbp * scale}" 
              class="interactive-zone" id="svg-zone-bp" data-target="bottom-plate" />
      ` : ''}


      <!-- ================= NEUTRAL AXES ================= -->
      
      <!-- Elastic Neutral Axis X-X -->
      <line x1="${padLeft - 20}" y1="${getY(yc)}" x2="${canvasW - padRight + 20}" y2="${getY(yc)}" 
            class="svg-axis-line" stroke="#ff4757" stroke-width="1.2" stroke-dasharray="6,4" />
      <text x="${canvasW - padRight + 25}" y="${getY(yc) + 4}" class="svg-axis-lbl" fill="#ff4757">X</text>
      <text x="${padLeft - 35}" y="${getY(yc) + 4}" class="svg-axis-lbl" fill="#ff4757">X</text>

      <!-- Y-Y Neutral Axis -->
      <line x1="${cx}" y1="${padTop - 20}" x2="${cx}" y2="${cyBottom + 20}" 
            class="svg-axis-line" stroke="#ff4757" stroke-width="1.2" stroke-dasharray="6,4" />
      <text x="${cx - 4}" y="${padTop - 25}" class="svg-axis-lbl" fill="#ff4757">Y</text>
      <text x="${cx - 4}" y="${cyBottom + 32}" class="svg-axis-lbl" fill="#ff4757">Y</text>

      <!-- Plastic Neutral Axis PNA (dashed, purple) -->
      <line x1="${padLeft - 10}" y1="${getY(yp)}" x2="${canvasW - padRight + 10}" y2="${getY(yp)}" 
            stroke="var(--accent-primary)" stroke-width="1.2" stroke-dasharray="3,3" opacity="0.8" />
      <text x="${canvasW - padRight + 12}" y="${getY(yp) - 4}" class="svg-text" style="font-size: 8px; fill: var(--accent-primary);">PNA</text>

      <!-- Centroid Marker G -->
      <circle cx="${cx}" cy="${getY(yc)}" r="6" class="svg-centroid-marker" />
      <circle cx="${cx}" cy="${getY(yc)}" r="2" fill="#ff4757" />
      <text x="${cx + 10}" y="${getY(yc) - 6}" class="svg-text-bold" fill="#ff4757">G</text>

    </svg>
  `;

  // Update HTML Overlay Card at the top-right
  const overlay = document.getElementById('visualizer-summary-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div class="visualizer-overlay-row">Total Depth = ${D.toFixed(1)} ${unit}</div>
      <div class="visualizer-overlay-row">Top Flange = ${btf.toFixed(1)} x ${ttf.toFixed(1)} ${unit}</div>
      <div class="visualizer-overlay-row">Bottom Flange = ${bbf.toFixed(1)} x ${tbf.toFixed(1)} ${unit}</div>
      <div class="visualizer-overlay-row">Top Plate = ${hasTopPlate ? `${btp.toFixed(1)} x ${ttp.toFixed(1)} ${unit}` : 'None'}</div>
      <div class="visualizer-overlay-row">Bottom Plate = ${hasBottomPlate ? `${bbp.toFixed(1)} x ${tbp.toFixed(1)} ${unit}` : 'None'}</div>
    `;
  }

  container.innerHTML = svg;
}

/**
 * Draws the Box-section inside an SVG element inside the container.
 * @param {string} containerId - ID of the container element
 * @param {object} params - Input parameters { D, btf, ttf, bbf, tbf, tw, btp, ttp, bbp, tbp, hasTopPlate, hasBottomPlate }
 * @param {object} results - Calculated properties (yc, yp, etc.)
 * @param {string} unit - Current display unit (mm, cm, in, m)
 */
function drawBoxSection(containerId, params, results, unit) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const D = Number(params.D);
  const btf = Number(params.btf);
  const ttf = Number(params.ttf);
  const bbf = Number(params.bbf);
  const tbf = Number(params.tbf);
  const tw = Number(params.tw);

  const hasTopPlate = !!params.hasTopPlate;
  const btp = hasTopPlate ? Number(params.btp || 0) : 0;
  const ttp = hasTopPlate ? Number(params.ttp || 0) : 0;

  const hasBottomPlate = !!params.hasBottomPlate;
  const bbp = hasBottomPlate ? Number(params.bbp || 0) : 0;
  const tbp = hasBottomPlate ? Number(params.tbp || 0) : 0;

  const yc = Number(results.yc); // Centroid from bottom
  const yp = Number(results.yp); // PNA from bottom

  // Composite limits
  const D_total = D + ttp + tbp;
  const maxW = Math.max(btf, bbf, btp, bbp);

  // Canvas details
  const canvasW = 460;
  const canvasH = 400;
  const padLeft = 85;
  const padRight = 85;
  const padTop = 60;
  const padBottom = 60;

  const drawAreaW = canvasW - padLeft - padRight;
  const drawAreaH = canvasH - padTop - padBottom;

  // Scaling factor
  const scale = Math.min(drawAreaW / maxW, drawAreaH / D_total);

  // Centerline X
  const cx = padLeft + drawAreaW / 2;

  // Bottom line Y (origin of entire composite shape)
  const cyBottom = canvasH - padBottom;

  // Coordinate mapping helper
  const getX = (valFromCenter) => cx + valFromCenter * scale;
  const getY = (valFromBottom) => cyBottom - valFromBottom * scale;

  // Interface coordinates (from bottom y = 0 to y = D_total)
  const y0 = 0;
  const y1 = tbp;
  const y2 = tbp + tbf;
  const y3 = tbp + D - ttf;
  const y4 = tbp + D;
  const y5 = D_total;

  const dw = D - ttf - tbf; // web height

  // SVG Coordinates for drawing box outer shape
  const xBfL = getX(-bbf / 2);
  const xBfR = getX(bbf / 2);
  const xTfL = getX(-btf / 2);
  const xTfR = getX(btf / 2);

  const yBfBottom = getY(y1);
  const yBfTop = getY(y2);
  const yTfBottom = getY(y3);
  const yTfTop = getY(y4);

  // Inner void coordinates (centered webs)
  const b_w_center = (Math.min(btf, bbf) - tw) / 2;
  const xInnerL = getX(-b_w_center + tw / 2);
  const xInnerR = getX(b_w_center - tw / 2);

  // Compound SVG path (outer rectangle clockwise + inner void rectangle counter-clockwise)
  const pathD = `
    M ${xTfL} ${yTfTop}
    L ${xTfR} ${yTfTop}
    L ${xBfR} ${yBfBottom}
    L ${xBfL} ${yBfBottom}
    Z
    M ${xInnerL} ${yTfBottom}
    L ${xInnerL} ${yBfTop}
    L ${xInnerR} ${yBfTop}
    L ${xInnerR} ${yTfBottom}
    Z
  `.trim();

  // Create SVG string
  let svg = `
    <svg viewBox="0 0 ${canvasW} ${canvasH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Arrow markers for dimension lines -->
        <marker id="arrow-start" markerWidth="8" markerHeight="8" refX="0" refY="3" orient="auto">
          <path d="M6,0 L0,3 L6,6 Z" fill="var(--text-secondary)"/>
        </marker>
        <marker id="arrow-end" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-secondary)"/>
        </marker>
        <style>
          .svg-text { fill: var(--text-secondary); font-family: var(--font-sans); font-size: 11px; }
          .svg-text-bold { fill: var(--text-primary); font-family: var(--font-title); font-weight: 600; font-size: 12px; }
          .svg-axis-lbl { font-family: var(--font-title); font-size: 11px; font-weight: 700; }
          .interactive-zone { fill: transparent; cursor: pointer; transition: fill 0.2s; }
          .interactive-zone:hover { fill: rgba(20, 184, 166, 0.08); }
          .interactive-zone.active { fill: rgba(20, 184, 166, 0.2); stroke: var(--accent-secondary); stroke-width: 1px; }
          .svg-plate-shape { fill: rgba(20, 184, 166, 0.1); stroke: var(--accent-secondary); stroke-width: 1.5; }
          .svg-text-summary { fill: var(--text-secondary); font-family: var(--font-sans); font-size: 11px; font-weight: 500; }
          .svg-section-shape { fill: rgba(99, 102, 241, 0.15); stroke: var(--accent-primary); stroke-width: 1.5; fill-rule: evenodd; }
          .svg-centroid-marker { fill: #ff4757; stroke: white; stroke-width: 1; }
        </style>
      </defs>

      <!-- Grid Background -->
      <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="transparent" />

      <!-- ================= DRAW SHAPES ================= -->

      <!-- 1. Bottom Cover Plate -->
      ${hasBottomPlate ? `
        <rect x="${getX(-bbp/2)}" y="${getY(y1)}" width="${bbp * scale}" height="${tbp * scale}" 
              class="svg-plate-shape" id="svg-bottom-plate" />
      ` : ''}

      <!-- 2. The Main Hollow Box Section Core -->
      <path d="${pathD}" class="svg-section-shape" id="svg-main-outline" />

      <!-- 3. Top Cover Plate -->
      ${hasTopPlate ? `
        <rect x="${getX(-btp/2)}" y="${getY(y5)}" width="${btp * scale}" height="${ttp * scale}" 
              class="svg-plate-shape" id="svg-top-plate" />
      ` : ''}


      <!-- ================= HOVER INTERACTIVE ZONES ================= -->
      
      <!-- Top Cover Plate Zone -->
      ${hasTopPlate ? `
        <rect x="${getX(-btp/2)}" y="${getY(y5)}" width="${btp * scale}" height="${ttp * scale}" 
              class="interactive-zone" id="svg-zone-tp" data-target="top-plate" />
      ` : ''}

      <!-- Top Flange Zone -->
      <rect x="${xTfL}" y="${yTfTop}" width="${btf * scale}" height="${ttf * scale}" 
            class="interactive-zone" id="svg-zone-tf" data-target="top-flange" />
      
      <!-- Web Zone (Left Web) -->
      <rect x="${getX(-b_w_center - tw/2)}" y="${yTfBottom}" width="${tw * scale}" height="${dw * scale}" 
            class="interactive-zone" id="svg-zone-web-l" data-target="web" />

      <!-- Web Zone (Right Web) -->
      <rect x="${getX(b_w_center - tw/2)}" y="${yTfBottom}" width="${tw * scale}" height="${dw * scale}" 
            class="interactive-zone" id="svg-zone-web-r" data-target="web" />

      <!-- Bottom Flange Zone -->
      <rect x="${xBfL}" y="${yBfBottom}" width="${bbf * scale}" height="${tbf * scale}" 
            class="interactive-zone" id="svg-zone-bf" data-target="bottom-flange" />

      <!-- Bottom Cover Plate Zone -->
      ${hasBottomPlate ? `
        <rect x="${getX(-bbp/2)}" y="${getY(y1)}" width="${bbp * scale}" height="${tbp * scale}" 
              class="interactive-zone" id="svg-zone-bp" data-target="bottom-plate" />
      ` : ''}


      <!-- ================= NEUTRAL AXES ================= -->
      
      <!-- Elastic Neutral Axis X-X -->
      <line x1="${padLeft - 20}" y1="${getY(yc)}" x2="${canvasW - padRight + 20}" y2="${getY(yc)}" 
            class="svg-axis-line" stroke="#ff4757" stroke-width="1.2" stroke-dasharray="6,4" />
      <text x="${canvasW - padRight + 25}" y="${getY(yc) + 4}" class="svg-axis-lbl" fill="#ff4757">X</text>
      <text x="${padLeft - 35}" y="${getY(yc) + 4}" class="svg-axis-lbl" fill="#ff4757">X</text>

      <!-- Y-Y Neutral Axis -->
      <line x1="${cx}" y1="${padTop - 20}" x2="${cx}" y2="${cyBottom + 20}" 
            class="svg-axis-line" stroke="#ff4757" stroke-width="1.2" stroke-dasharray="6,4" />
      <text x="${cx - 4}" y="${padTop - 25}" class="svg-axis-lbl" fill="#ff4757">Y</text>
      <text x="${cx - 4}" y="${cyBottom + 32}" class="svg-axis-lbl" fill="#ff4757">Y</text>

      <!-- Plastic Neutral Axis PNA (dashed, purple) -->
      <line x1="${padLeft - 10}" y1="${getY(yp)}" x2="${canvasW - padRight + 10}" y2="${getY(yp)}" 
            stroke="var(--accent-primary)" stroke-width="1.2" stroke-dasharray="3,3" opacity="0.8" />
      <text x="${canvasW - padRight + 12}" y="${getY(yp) - 4}" class="svg-text" style="font-size: 8px; fill: var(--accent-primary);">PNA</text>

      <!-- Centroid Marker G -->
      <circle cx="${cx}" cy="${getY(yc)}" r="6" class="svg-centroid-marker" />
      <circle cx="${cx}" cy="${getY(yc)}" r="2" fill="#ff4757" />
      <text x="${cx + 10}" y="${getY(yc) - 6}" class="svg-text-bold" fill="#ff4757">G</text>

    </svg>
  `;

  // Update HTML Overlay Card at the top-right
  const overlay = document.getElementById('visualizer-summary-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div class="visualizer-overlay-row">Total Depth = ${D.toFixed(1)} ${unit}</div>
      <div class="visualizer-overlay-row">Top Flange = ${btf.toFixed(1)} x ${ttf.toFixed(1)} ${unit}</div>
      <div class="visualizer-overlay-row">Bottom Flange = ${bbf.toFixed(1)} x ${tbf.toFixed(1)} ${unit}</div>
      <div class="visualizer-overlay-row">Top Plate = ${hasTopPlate ? `${btp.toFixed(1)} x ${ttp.toFixed(1)} ${unit}` : 'None'}</div>
      <div class="visualizer-overlay-row">Bottom Plate = ${hasBottomPlate ? `${bbp.toFixed(1)} x ${tbp.toFixed(1)} ${unit}` : 'None'}</div>
    `;
  }

  container.innerHTML = svg;
}

/**
 * Highlights a specific region in the SVG drawing.
 * @param {string} zone - "top-flange", "bottom-flange", "web", "top-plate", or "bottom-plate"
 * @param {boolean} active - whether to activate or deactivate the highlight
 */
function highlightSvgZone(zone, active) {
  let targetId = "";
  if (zone === "top-flange") targetId = "svg-zone-tf";
  else if (zone === "bottom-flange") targetId = "svg-zone-bf";
  else if (zone === "web") targetId = "svg-zone-web";
  else if (zone === "top-plate") targetId = "svg-zone-tp";
  else if (zone === "bottom-plate") targetId = "svg-zone-bp";

  if (!targetId) return;

  const rect = document.getElementById(targetId);
  if (rect) {
    if (active) {
      rect.classList.add("active");
    } else {
      rect.classList.remove("active");
    }
  }
}
