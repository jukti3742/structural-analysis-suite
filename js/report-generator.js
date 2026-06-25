(function () {
  class ReportGenerator {
    constructor() {
      // Base constructor
    }

    generate(config, stateData) {
      // config contains: projectTitle, engineerName, clientRef, notes, reportType
      // stateData contains: L, E, supports, loads, diagramData, reactionsData, diagramMarkers, etc.
      
      let htmlContent = '';
      if (config.reportType === 'general') {
        htmlContent = this.renderGeneralReport(config, stateData);
      } else {
        htmlContent = `<h2>Selected report type is not implemented yet.</h2>`;
      }
      
      this.openPrintWindow(htmlContent);
    }

    renderGeneralReport(config, state) {
      // 1. Calculate min / max (extremum) values from state.diagramData
      const extremums = this.calculateExtremums(state.diagramData);

      // Get application title and subtitle dynamically from the main window's sidebar logo
      const logoTextEl = document.querySelector('.logo-text');
      const appTitle = logoTextEl && logoTextEl.querySelector('h1') ? logoTextEl.querySelector('h1').textContent.trim() : 'Apex Suite';
      const appSubtitle = logoTextEl && logoTextEl.querySelector('span') ? logoTextEl.querySelector('span').textContent.trim() : 'Structural Analysis';
      const reportHeaderTitle = `${appTitle}: ${appSubtitle}`;

      // 2. Clone and prepare SVGs
      const schematicSvg = this.cloneAndProcessSvg('beam-schematic-container');
      const reactionsSvg = this.cloneAndProcessSvg('reactions-diagram-container');
      const sfdSvg = this.cloneAndProcessSvg('sfd-diagram-container');
      const bmdSvg = this.cloneAndProcessSvg('bmd-diagram-container');
      const afdSvg = this.cloneAndProcessSvg('afd-diagram-container');
      const deflectionSvg = this.cloneAndProcessSvg('deflection-diagram-container');

      // 3. Format Date
      const timestamp = new Date().toLocaleString();

      // Get cross section properties
      let A_val = 'N/A';
      let Ixx_val = 'N/A';
      if (window.getActiveSectionProperties) {
        const props = window.getActiveSectionProperties();
        if (props) {
          // Convert m2 to cm2, m4 to cm4 for presentation
          A_val = (props.A * 10000).toFixed(2) + ' cm²';
          Ixx_val = (props.Ixx * 100000000).toFixed(2) + ' cm⁴';
        }
      }

      // Generate HTML
      let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this.escapeHtml(reportHeaderTitle)}</title>

  <style>
    /* CSS for Print A4 Layout */
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 20mm 15mm;
    }
    :root {
      --text-color: #0f172a;
      --border-color: #e2e8f0;
      --accent-color: #4f46e5;
      --accent-secondary: #0d9488;
      
      /* Theme mappings for SVGs */
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --accent-primary: #4f46e5;
      --bg-primary: #ffffff;
      --bg-card: #ffffff;
      --error: #ef4444;
      --success: #10b981;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      font-family: var(--font-sans);
      color: var(--text-color);
      background: #ffffff;
      font-size: 10pt;
      line-height: 1.4;
      margin: 0;
      padding: 0;
    }
    .report-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    /* Interactive Toolbar */
    .report-toolbar {
      position: sticky;
      top: 0;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 24px;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      z-index: 1000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      margin-bottom: 10px;
    }
    .toolbar-btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border-color);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
    }
    .btn-print {
      background: var(--accent-color);
      color: #ffffff;
      border-color: var(--accent-color);
    }
    .btn-print:hover {
      background: #4338ca;
      border-color: #4338ca;
    }

    .btn-json {
      background: #475569;
      color: #ffffff;
      border-color: #475569;
    }
    .btn-json:hover {
      background: #334155;
      border-color: #334155;
    }
    
    .report-header {
      border-bottom: 2px solid var(--accent-color);
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .report-logo {
      font-size: 18pt;
      font-weight: 800;
      color: var(--accent-color);
      letter-spacing: -0.5px;
    }
    .report-meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 24px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }
    .meta-item {
      font-size: 9.5pt;
    }
    .meta-label {
      font-weight: 700;
      color: #475569;
    }
    .section-title {
      font-size: 12pt;
      font-weight: 700;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 12px;
      color: var(--accent-color);
      page-break-after: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 9pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid var(--border-color);
      padding: 6px 10px;
      text-align: left;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 700;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .diagram-container {
      text-align: center;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .diagram-container svg {
      width: 100%;
      max-width: 580px;
      height: auto;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: #ffffff;
    }
    .page-break {
      page-break-before: always;
    }
    .notes-box {
      background: #fafafa;
      border-left: 3px solid var(--accent-secondary);
      padding: 10px 14px;
      font-style: italic;
      font-size: 9.5pt;
      margin-bottom: 20px;
      white-space: pre-wrap;
    }
    
    /* SVG Interactive schematic classes copy */
    .schematic-beam-line {
      stroke: var(--text-primary);
      stroke-width: 8px;
      stroke-linecap: round;
    }
    .schematic-support-pin {
      fill: var(--accent-primary);
      stroke: var(--bg-primary);
      stroke-width: 1.5;
    }
    .schematic-support-fixed {
      stroke: var(--accent-primary);
      stroke-width: 4px;
    }
    .schematic-support-roller {
      fill: var(--accent-secondary);
      stroke: var(--bg-primary);
      stroke-width: 1.5;
    }
    .schematic-load-arrow {
      stroke: var(--error);
      stroke-width: 3px;
      fill: var(--error);
    }
    .schematic-load-arrow-h {
      stroke: #3b82f6;
      stroke-width: 3px;
      fill: #3b82f6;
    }
    .schematic-load-torque {
      stroke: #a855f7;
      stroke-width: 2.5px;
      fill: none;
    }
    .schematic-load-dist {
      fill: rgba(239, 68, 68, 0.12);
      stroke: var(--error);
      stroke-width: 1.5px;
      stroke-dasharray: 3 3;
    }
    .schematic-label {
      font-size: 10px;
      font-family: var(--font-sans);
      fill: var(--text-secondary);
      font-weight: 500;
    }
    
    /* High-contrast fixes for print SVGs */
    svg text {
      fill: #0f172a !important;
      font-family: inherit;
    }
    .diagram-fill-sfd { fill: rgba(79, 70, 229, 0.08) !important; }
    .diagram-curve-sfd { stroke: var(--accent-color) !important; }
    
    .diagram-fill-bmd { fill: rgba(13, 148, 136, 0.08) !important; }
    .diagram-curve-bmd { stroke: var(--accent-secondary) !important; }

    .diagram-fill-afd { fill: rgba(245, 158, 11, 0.08) !important; }
    .diagram-curve-afd { stroke: #f59e0b !important; }

    .diagram-fill-deflection { fill: rgba(99, 102, 241, 0.05) !important; }
    .diagram-curve-deflection { stroke: #6366f1 !important; stroke-dasharray: none !important; }
    
    .schematic-beam { stroke: #0f172a !important; stroke-width: 4px !important; }
    .schematic-support-pin { fill: var(--accent-color) !important; stroke: var(--accent-color) !important; }
    .schematic-support-roller { fill: var(--accent-secondary) !important; stroke: var(--accent-secondary) !important; }
    
    /* Diagram axis, grid, discontinuity and label styling */
    .diagram-axis {
      stroke: var(--text-muted) !important;
      stroke-width: 1px !important;
    }
    .diagram-grid {
      stroke: var(--border-color) !important;
      stroke-width: 0.75px !important;
      stroke-dasharray: 2 4 !important;
    }
    .diagram-tick-text {
      font-size: 11px !important;
      font-family: var(--font-sans) !important;
      fill: var(--text-muted) !important;
    }
    .diagram-axis-title {
      font-size: 12px !important;
      font-family: var(--font-sans) !important;
      fill: var(--text-primary) !important;
      font-weight: normal !important;
    }
    .diagram-discontinuity {
      stroke: var(--border-color) !important;
      stroke-width: 1px !important;
      stroke-dasharray: 2 2 !important;
    }
    
    .print-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      font-size: 8pt;
      text-align: center;
      color: #94a3b8;
      border-top: 1px solid var(--border-color);
      padding-top: 6px;
      display: none;
    }

    .print-header-repeated,
    .print-footer-repeated {
      display: none;
    }

    .print-wrapper-table {
      width: 100%;
      border-collapse: collapse;
      border: none;
    }
    .print-wrapper-table > thead > tr > td,
    .print-wrapper-table > tbody > tr > td,
    .print-wrapper-table > tfoot > tr > td {
      border: none !important;
      padding: 0 !important;
    }
    .print-header-spacer {
      height: 0;
    }
    .print-footer-spacer {
      height: 0;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 0; /* Hides default browser header/footer (like about:blank) */
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 9.5pt;
      }
      .report-container {
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
      }
      .report-toolbar {
        display: none !important;
      }
      .print-footer {
        display: none !important; /* Hide original screen footer */
      }
      .section-title {
        margin-top: 14px;
        margin-bottom: 8px;
        padding-bottom: 4px;
      }
      table {
        margin-bottom: 10px;
      }
      th, td {
        padding: 4px 8px;
      }
      .diagram-container {
        margin-bottom: 10px;
      }
      .diagram-container svg {
        max-height: 145px !important;
      }
      .diagram-container.schematic-container svg {
        max-height: 210px !important;
      }
      .diagram-container.reactions-container svg {
        max-height: 105px !important;
      }

      /* Repeated Print Header & Footer spacing adjustments via table td padding */
      .print-wrapper-table > thead > tr > td,
      .print-wrapper-table > tbody > tr > td,
      .print-wrapper-table > tfoot > tr > td {
        padding-left: 15mm !important;
        padding-right: 15mm !important;
      }
      .print-header-spacer {
        height: 15mm;
      }
      .print-footer-spacer {
        height: 20mm;
      }

      /* Repeated Print Header & Footer styles */
      .print-header-repeated {
        display: flex !important;
        position: fixed;
        top: 5mm;
        left: 15mm;
        right: 15mm;
        height: 6mm;
        border-bottom: 1px solid var(--border-color);
        justify-content: space-between;
        align-items: center;
        font-size: 7.5pt;
        color: #64748b;
        font-family: var(--font-sans);
      }
      .print-footer-repeated {
        display: flex !important;
        position: fixed;
        bottom: 8mm;
        left: 15mm;
        right: 15mm;
        height: 6mm;
        border-top: 1px solid var(--border-color);
        justify-content: space-between;
        align-items: center;
        font-size: 7.5pt;
        color: #64748b;
        font-family: var(--font-sans);
      }
    }
  </style>
</head>
<body>
  <!-- Repeated Print Header & Footer (Visible on print only) -->
  <div class="print-header-repeated">
    <span>${this.escapeHtml(reportHeaderTitle)}</span>
    <span>Beam Analysis Report</span>
  </div>
  <div class="print-footer-repeated">
    <span>Generated by ${this.escapeHtml(reportHeaderTitle)}</span>
    <span></span>
  </div>

  <!-- Header Action Toolbar -->
  <div class="report-toolbar">
    <button id="btn-print-report" class="toolbar-btn btn-print">
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h6z" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Print
    </button>
    <button id="btn-json-report" class="toolbar-btn btn-json">
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Export to JSON
    </button>
  </div>

  <div class="report-container">
    <table class="print-wrapper-table">
      <thead>
        <tr>
          <td>
            <div class="print-header-spacer"></div>
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="report-header">
      <div class="report-logo">${this.escapeHtml(reportHeaderTitle)}</div>
      <div style="font-size: 10pt; font-weight: 500; color: #64748b;">Beam Analysis Report</div>
    </div>

    <h3 class="section-title">1. Structure & Material Properties</h3>
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Symbol</th>
          <th>Value</th>
          <th>Unit Settings</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Beam Span Length</td>
          <td>L</td>
          <td>${state.L.toFixed(2)}</td>
          <td>${state.currentUnitBeamLength}</td>
        </tr>
        <tr>
          <td>Elastic Modulus</td>
          <td>E</td>
          <td>${state.E.toFixed(1)}</td>
          <td>${state.currentUnitE}</td>
        </tr>
        <tr>
          <td>Cross-Sectional Area</td>
          <td>A</td>
          <td>${A_val}</td>
          <td>-</td>
        </tr>
        <tr>
          <td>Moment of Inertia</td>
          <td>I<sub>xx</sub></td>
          <td>${Ixx_val}</td>
          <td>-</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">2. Supports Configured</h3>
    <table>
      <thead>
        <tr>
          <th class="text-center">#</th>
          <th>Type</th>
          <th class="text-right">Coordinate (x)</th>
          <th>Stiffness Details</th>
        </tr>
      </thead>
      <tbody>
        ${state.supports.map((s, idx) => `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td>${s.type}</td>
            <td class="text-right">${s.x.toFixed(2)} ${state.currentUnitBeamLength}</td>
            <td>${s.type === 'Spring' ? `k<sub>y</sub> = ${s.ky.toFixed(1)} kN/m` : 'Rigid'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3 class="section-title">3. Applied Loads</h3>
    <table>
      <thead>
        <tr>
          <th class="text-center">#</th>
          <th>Load Type</th>
          <th class="text-right">Position / Span</th>
          <th class="text-right">Magnitude 1</th>
          <th class="text-right">Magnitude 2</th>
        </tr>
      </thead>
      <tbody>
        ${state.loads.length === 0 ? `
          <tr>
            <td colspan="5" class="text-center">No loads applied. Self-weight only or unloaded.</td>
          </tr>
        ` : state.loads.map((l, idx) => {
          let posStr = '';
          let mag1Str = '';
          let mag2Str = '-';
          if (l.type === 'UDLV' || l.type === 'UDLH' || l.type === 'TrapezoidalLoadV' || l.type === 'TrapezoidalLoadH') {
            posStr = `${l.start.toFixed(2)} to ${l.end.toFixed(2)} ${state.currentUnitDist}`;
          } else {
            posStr = `${l.x.toFixed(2)} ${state.currentUnitDist}`;
          }

          if (l.type === 'PointLoadV' || l.type === 'PointLoadH') {
            mag1Str = `${l.f1.toFixed(2)} ${state.currentUnitForce}`;
          } else if (l.type === 'PointLoadInclined') {
            mag1Str = `${l.f1.toFixed(2)} ${state.currentUnitForce}`;
            mag2Str = `Angle: ${l.f2.toFixed(1)}${state.currentUnitAngle}`;
          } else if (l.type === 'PointTorque') {
            mag1Str = `${l.f1.toFixed(2)} ${state.currentUnitMoment}`;
          } else if (l.type === 'UDLV' || l.type === 'UDLH') {
            mag1Str = `${l.f1.toFixed(2)} ${state.currentUnitUDL}`;
          } else if (l.type === 'TrapezoidalLoadV' || l.type === 'TrapezoidalLoadH') {
            mag1Str = `Start: ${l.f1.toFixed(2)} ${state.currentUnitUDL}`;
            mag2Str = `End: ${l.f2.toFixed(2)} ${state.currentUnitUDL}`;
          }

          return `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>${l.type}</td>
              <td class="text-right">${posStr}</td>
              <td class="text-right">${mag1Str}</td>
              <td class="text-right">${mag2Str}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div class="diagram-container schematic-container" style="margin-top: 16px;">
      <div style="font-weight: 700; font-size: 9.5pt; margin-bottom: 6px;">Interactive Beam Schematic</div>
      ${schematicSvg || '<p>Schematic diagram not available</p>'}
    </div>

    <div class="page-break"></div>

    <h3 class="section-title">4. Support Reactions</h3>
    <table>
      <thead>
        <tr>
          <th class="text-center">Support</th>
          <th class="text-center">Location (x)</th>
          <th class="text-right">Horizontal Reaction (R<sub>x</sub>)</th>
          <th class="text-right">Vertical Reaction (R<sub>y</sub>)</th>
          <th class="text-right">Reaction Moment (M)</th>
        </tr>
      </thead>
      <tbody>
        ${state.reactionsData && state.reactionsData.length > 0 ? state.reactionsData.map(r => {
          const c_result_dist = state.getDistFactor(state.currentUnitBeamLength);
          const c_result_force = state.getForceFactor(state.resultUnitForce);
          const c_result_moment = state.getMomentFactor(state.resultUnitMoment);

          const rx_user = r.Rx / c_result_force;
          const ry_user = r.Ry / c_result_force;
          const m_user = r.M / c_result_moment;
          const x_user = r.x / c_result_dist;

          let supportLabel = "Support";
          const c_beam_dist = state.getDistFactor(state.currentUnitBeamLength);
          const supIndex = state.supports.findIndex(s => Math.abs(s.x * c_beam_dist - r.x) < 1e-3);
          if (supIndex !== -1) {
            supportLabel = `Support-${supIndex + 1}`;
          }

          return `
            <tr>
              <td class="text-center" style="font-weight: 700;">${supportLabel}</td>
              <td class="text-center">${x_user.toFixed(2)} ${state.currentUnitBeamLength}</td>
              <td class="text-right">${rx_user.toFixed(2)} ${state.resultUnitForce}</td>
              <td class="text-right">${ry_user.toFixed(2)} ${state.resultUnitForce}</td>
              <td class="text-right">${m_user.toFixed(2)} ${state.resultUnitMoment}</td>
            </tr>
          `;
        }).join('') : `
          <tr>
            <td colspan="5" class="text-center">No reactions available. Make sure to run beam solver first.</td>
          </tr>
        `}
      </tbody>
    </table>

    <div class="diagram-container reactions-container">
      ${reactionsSvg || ''}
    </div>

    <h3 class="section-title">5. Min/Max Results</h3>
    <table>
      <thead>
        <tr>
          <th>Result Type</th>
          <th class="text-right">Minimum Value</th>
          <th class="text-right">Location (x)</th>
          <th class="text-right">Maximum Value</th>
          <th class="text-right">Location (x)</th>
          <th>Units</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Shear Force (SFD)</strong></td>
          <td class="text-right">${extremums.minShear.toFixed(2)}</td>
          <td class="text-right">${extremums.minShearX.toFixed(2)}</td>
          <td class="text-right">${extremums.maxShear.toFixed(2)}</td>
          <td class="text-right">${extremums.maxShearX.toFixed(2)}</td>
          <td>${state.resultUnitForceSFD}</td>
        </tr>
        <tr>
          <td><strong>Bending Moment (BMD)</strong></td>
          <td class="text-right">${extremums.minMoment.toFixed(2)}</td>
          <td class="text-right">${extremums.minMomentX.toFixed(2)}</td>
          <td class="text-right">${extremums.maxMoment.toFixed(2)}</td>
          <td class="text-right">${extremums.maxMomentX.toFixed(2)}</td>
          <td>${state.resultUnitMoment}</td>
        </tr>
        <tr>
          <td><strong>Axial Force (AFD)</strong></td>
          <td class="text-right">${extremums.minAxial.toFixed(2)}</td>
          <td class="text-right">${extremums.minAxialX.toFixed(2)}</td>
          <td class="text-right">${extremums.maxAxial.toFixed(2)}</td>
          <td class="text-right">${extremums.maxAxialX.toFixed(2)}</td>
          <td>${state.resultUnitForceAFD}</td>
        </tr>
        <tr>
          <td><strong>Deflection</strong></td>
          <td class="text-right">${extremums.minDeflect.toFixed(4)}</td>
          <td class="text-right">${extremums.minDeflectX.toFixed(2)}</td>
          <td class="text-right">${extremums.maxDeflect.toFixed(4)}</td>
          <td class="text-right">${extremums.maxDeflectX.toFixed(2)}</td>
          <td>${state.resultUnitDisplacement}</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">6. Internal Forces Diagrams</h3>
    
    <div class="diagram-container">
      <div style="font-weight: 700; font-size: 9.5pt; margin-bottom: 4px;">Shear Force Diagram (SFD)</div>
      ${sfdSvg || '<p>SFD not available</p>'}
    </div>

    <div class="diagram-container" style="margin-top: 20px;">
      <div style="font-weight: 700; font-size: 9.5pt; margin-bottom: 4px;">Bending Moment Diagram (BMD)</div>
      ${bmdSvg || '<p>BMD not available</p>'}
    </div>

    <div class="diagram-container" style="margin-top: 20px;">
      <div style="font-weight: 700; font-size: 9.5pt; margin-bottom: 4px;">Axial Force Diagram (AFD)</div>
      ${afdSvg || '<p>AFD not available</p>'}
    </div>

    <div class="diagram-container" style="margin-top: 20px;">
      <div style="font-weight: 700; font-size: 9.5pt; margin-bottom: 4px;">Deflection Curve</div>
      ${deflectionSvg || '<p>Deflection diagram not available</p>'}
    </div>

    <div class="print-footer">
      Generated by ${this.escapeHtml(reportHeaderTitle)} &copy; ${new Date().getFullYear()} - Document Confidential / Structural Engineering Report
    </div>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>
            <div class="print-footer-spacer"></div>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Inline report-data payload -->
  <script id="report-data" type="application/json">
    {
      "config": ${JSON.stringify(config)},
      "state": ${JSON.stringify(state)}
    }
  </script>

  <!-- Interactive handlers script -->
  <script>
    (function () {
      const rawData = JSON.parse(document.getElementById('report-data').textContent);
      const { config, state } = rawData;
      // Bind Print
      document.getElementById('btn-print-report').addEventListener('click', () => window.print());

      // Clear title during print to prevent browser header
      window.addEventListener('beforeprint', () => {
        document.title = ' ';
      });
      window.addEventListener('afterprint', () => {
        document.title = document.querySelector('.report-logo').textContent.trim();
      });
      
      // Bind JSON Export
      document.getElementById('btn-json-report').addEventListener('click', () => {
        const payload = {
          suite: document.querySelector('.report-logo').textContent.trim(),
          reportType: "General Analysis Report",
          timestamp: new Date().toISOString(),
          beamState: {
            length: state.L,
            elasticModulus: state.E,
            units: {
              beamLength: state.currentUnitBeamLength,
              distance: state.currentUnitDist,
              force: state.currentUnitForce,
              moment: state.currentUnitMoment,
              udl: state.currentUnitUDL,
              elasticModulus: state.currentUnitE,
              angle: state.currentUnitAngle,
              resultForce: state.resultUnitForce,
              resultForceSFD: state.resultUnitForceSFD,
              resultForceAFD: state.resultUnitForceAFD,
              resultMoment: state.resultUnitMoment,
              resultDisplacement: state.resultUnitDisplacement
            },
            supports: state.supports,
            loads: state.loads,
            reactions: state.reactionsData,
            points: state.diagramData
          }
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "beam_report_${appTitle.replace(/"/g, '\\"')}.json";
        a.click();
        URL.revokeObjectURL(url);
      });
    })();
  </script>
</body>
</html>
      `;

      return html;
    }

    calculateExtremums(points) {
      if (!points || points.length === 0) {
        return {
          minShear: 0, minShearX: 0, maxShear: 0, maxShearX: 0,
          minMoment: 0, minMomentX: 0, maxMoment: 0, maxMomentX: 0,
          minAxial: 0, minAxialX: 0, maxAxial: 0, maxAxialX: 0,
          minDeflect: 0, minDeflectX: 0, maxDeflect: 0, maxDeflectX: 0
        };
      }
      
      // Let's get units scaling from beam state
      const state = window.getBeamState ? window.getBeamState() : null;
      const c_beam_dist = state ? state.getDistFactor(state.currentUnitBeamLength) : 1.0;
      
      const u_sfd = state ? 1.0 / state.getForceFactor(state.resultUnitForceSFD) : 1.0;
      const u_bmd = state ? 1.0 / state.getMomentFactor(state.resultUnitMoment) : 1.0;
      const u_afd = state ? 1.0 / state.getForceFactor(state.resultUnitForceAFD) : 1.0;
      const u_defl = state ? 1.0 / state.getDistFactor(state.resultUnitDisplacement) : 1000.0; // standard to mm

      let minShear = Infinity, minShearX = 0;
      let maxShear = -Infinity, maxShearX = 0;
      let minMoment = Infinity, minMomentX = 0;
      let maxMoment = -Infinity, maxMomentX = 0;
      let minAxial = Infinity, minAxialX = 0;
      let maxAxial = -Infinity, maxAxialX = 0;
      let minDeflect = Infinity, minDeflectX = 0;
      let maxDeflect = -Infinity, maxDeflectX = 0;

      points.forEach(pt => {
        const x_user = pt.x / c_beam_dist;
        
        const s_val = pt.shear * u_sfd;
        const m_val = pt.moment * u_bmd;
        const a_val = pt.axial * u_afd;
        const d_val = pt.deflection * u_defl;

        if (s_val < minShear) { minShear = s_val; minShearX = x_user; }
        if (s_val > maxShear) { maxShear = s_val; maxShearX = x_user; }

        if (m_val < minMoment) { minMoment = m_val; minMomentX = x_user; }
        if (m_val > maxMoment) { maxMoment = m_val; maxMomentX = x_user; }

        if (a_val < minAxial) { minAxial = a_val; minAxialX = x_user; }
        if (a_val > maxAxial) { maxAxial = a_val; maxAxialX = x_user; }

        if (d_val < minDeflect) { minDeflect = d_val; minDeflectX = x_user; }
        if (d_val > maxDeflect) { maxDeflect = d_val; maxDeflectX = x_user; }
      });

      return {
        minShear, minShearX, maxShear, maxShearX,
        minMoment, minMomentX, maxMoment, maxMomentX,
        minAxial, minAxialX, maxAxial, maxAxialX,
        minDeflect, minDeflectX, maxDeflect, maxDeflectX
      };
    }

    cloneAndProcessSvg(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return null;
      const svg = container.querySelector('svg');
      if (!svg) return null;

      // Clone the SVG element
      const clonedSvg = svg.cloneNode(true);
      
      // Clean up interactive and hover classes/dots
      clonedSvg.querySelectorAll('.diagram-hover-dot, .diagram-hover-line, .diagram-marker-delete').forEach(el => el.remove());
      
      // Remove inline sizing styles that might restrict A4 fit
      clonedSvg.removeAttribute('style');
      clonedSvg.setAttribute('width', '100%');
      
      // Set height based on type to prevent aspect ratio clipping
      if (containerId === 'beam-schematic-container') {
        clonedSvg.setAttribute('height', '300');
      } else if (containerId === 'reactions-diagram-container') {
        clonedSvg.setAttribute('height', '120');
      } else {
        clonedSvg.setAttribute('height', '200');
      }
      
      return clonedSvg.outerHTML;
    }

    escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }

    openPrintWindow(htmlContent) {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site to view the report.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  }

  // Export globally
  window.ReportGenerator = new ReportGenerator();
})();
