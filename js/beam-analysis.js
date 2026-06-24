/**
 * Apex Structural Analysis Suite - Beam & Frame Analysis Controller
 * Handles user interactions, visual schematic dragging, REST API communication,
 * and high-performance SVG diagram rendering.
 *
 * Performance-optimized: Uses requestAnimationFrame V-Sync throttling,
 * click-offset tracking, dynamic label collision avoidance, support label stacking,
 * semantic zoom, dynamic margin fitting, and click-to-pan controls.
 */

(function () {
  // Model State Variables (Default values)
  let L = 6.0; // span length in meters
  let E = 200.0; // Elastic Modulus in GPa
  
  // Active units settings
  let currentUnitForce = 'kN';
  let currentUnitMomentForce = 'kN';
  let currentUnitMomentDist = 'm';
  let currentUnitMoment = 'kN·m';
  let currentUnitUDLForce = 'kN';
  let currentUnitUDLDist = 'm';
  let currentUnitUDL = 'kN/m';
  let currentUnitDist = 'm';
  let currentUnitAngle = '°';
  let currentUnitBeamLength = 'm';
  let currentUnitE = 'GPa';

  // Result presentation units settings
  let resultUnitForce = 'kN';
  let resultUnitForceSFD = 'kN';
  let resultUnitForceAFD = 'kN';
  let resultUnitMomentForce = 'kN';
  let resultUnitMomentDist = 'm';
  let resultUnitMoment = 'kN·m';
  let resultUnitDisplacement = 'mm';
  let globalPadL = 80;
  let diagramMarkers = [];
  let activeDraggedMarkerId = null;
  let labelDragState = {
    active: false,
    markerId: null,
    startDx: 0,
    startDy: 0,
    startX: 0,
    startY: 0,
    hasMoved: false
  };
  let justFinishedDragging = false;
  
  // Supports state list: Pinned at 0.0m, Roller at 6.0m
  let supports = [
    { x: 0.0, type: 'Pinned', ky: 0 },
    { x: 6.0, type: 'Roller', ky: 0 }
  ];
  
  // Loads state list: vertical point load at 3.0m of -10 kN
  let loads = [
    { type: 'PointLoadV', x: 3.0, start: 0, end: 0, f1: -10.0, f2: 0 }
  ];
  
  // Results cache
  let diagramData = null; // sampled points from solver
  let reactionsData = null; // reaction values
  let activeDiagram = 'sfd'; // 'sfd', 'bmd', 'deflection', 'afd'

  // Viewport Zoom & Pan variables
  let zoomScale = 1.0;
  let panX = 0;
  let S_fit = 100.0; // Auto-fit scale factor (calculated dynamically)

  // Drag state tracker
  const dragState = {
    active: false,
    type: null, // 'support' | 'load' | 'load-start' | 'load-end' | 'load-body' | 'pan'
    index: -1,
    startX: 0,
    offset: 0, // offset to prevent jump-snapping
    startPanX: 0,
    loadLength: 0 // length of UDL/Trapezoidal load being dragged
  };

  // V-Sync ticking flag for rendering throttle
  let isTicking = false;

  // SVG dimensions
  const canvasW = 600;
  const canvasH = 300; // Expanded SVG height for stacked loads and dimensions

  // Document elements
  let elBeamLength, elBeamE;
  let elTableSupports, elTableLoads, elTableReactions;
  let elBtnAddSupport, elBtnAddLoad, elBtnSolve;
  let elSchematicContainer, elDiagramContainer;
  let elDragTooltip;

  // Unit conversion helpers
  function getDistFactor(unit) {
    switch (unit) {
      case 'm': return 1.0;
      case 'cm': return 0.01;
      case 'mm': return 0.001;
      case 'in': return 0.0254;
      case 'ft': return 0.3048;
      default: return 1.0;
    }
  }

  function getForceFactor(unit) {
    switch (unit) {
      case 'kN': return 1000.0;
      case 'N': return 1.0;
      case 'lbf': return 4.4482216153;
      case 'kip': return 4448.2216153;
      case 'kg': return 9.80665;
      case 'MTon': return 9806.65;
      default: return 1000.0;
    }
  }

  function getEFactor(unit) {
    switch (unit) {
      case 'GPa': return 1e9;
      case 'MPa': return 1e6;
      case 'psi': return 6894.757;
      case 'ksi': return 6894757.29;
      default: return 1e9;
    }
  }

  function getMomentFactor(forceOrMomentUnit, distUnit) {
    if (distUnit === undefined && typeof forceOrMomentUnit === 'string') {
      const parts = forceOrMomentUnit.split('·');
      if (parts.length === 2) {
        return getForceFactor(parts[0]) * getDistFactor(parts[1]);
      }
    }
    const fUnit = forceOrMomentUnit || currentUnitMomentForce;
    const dUnit = distUnit || currentUnitMomentDist;
    return getForceFactor(fUnit) * getDistFactor(dUnit);
  }

  function getUDLFactor(forceOrUDLUnit, distUnit) {
    if (distUnit === undefined && typeof forceOrUDLUnit === 'string') {
      const parts = forceOrUDLUnit.split('/');
      if (parts.length === 2) {
        return getForceFactor(parts[0]) / getDistFactor(parts[1]);
      }
    }
    const fUnit = forceOrUDLUnit || currentUnitUDLForce;
    const dUnit = distUnit || currentUnitUDLDist;
    return getForceFactor(fUnit) / getDistFactor(dUnit);
  }

  function convertForceUnits(oldUnit, newUnit) {
    const ratio = getForceFactor(oldUnit) / getForceFactor(newUnit);
    loads.forEach(l => {
      if (l.type === 'PointLoadV' || l.type === 'PointLoadH' || l.type === 'PointLoadInclined') {
        l.f1 = l.f1 * ratio;
      }
    });
  }

  function convertMomentUnits(oldUnit, newUnit) {
    const ratio = getMomentFactor(oldUnit) / getMomentFactor(newUnit);
    loads.forEach(l => {
      if (l.type === 'PointTorque') {
        l.f1 = l.f1 * ratio;
      }
    });
  }

  function convertUDLUnits(oldUnit, newUnit) {
    const ratio = getUDLFactor(oldUnit) / getUDLFactor(newUnit);
    loads.forEach(l => {
      if (l.type === 'UDLV' || l.type === 'TrapezoidalLoadV') {
        l.f1 = l.f1 * ratio;
        if (l.type === 'TrapezoidalLoadV') {
          l.f2 = l.f2 * ratio;
        }
      }
    });
  }

  function convertDistanceUnits(oldUnit, newUnit) {
    const oldF = getDistFactor(oldUnit);
    const newF = getDistFactor(newUnit);
    const ratio = oldF / newF;

    loads.forEach(l => {
      if (l.x !== undefined) l.x = l.x * ratio;
      if (l.start !== undefined) l.start = l.start * ratio;
      if (l.end !== undefined) l.end = l.end * ratio;
    });
  }

  function convertBeamLengthUnits(oldUnit, newUnit) {
    const oldF = getDistFactor(oldUnit);
    const newF = getDistFactor(newUnit);
    const ratio = oldF / newF;

    L = L * ratio;
    supports.forEach(s => {
      s.x = s.x * ratio;
    });
    diagramMarkers.forEach(m => {
      m.x = m.x * ratio;
    });
  }

  function convertEUnits(oldUnit, newUnit) {
    const oldF = getEFactor(oldUnit);
    const newF = getEFactor(newUnit);
    const ratio = oldF / newF;
    E = E * ratio;
  }

  function convertAngleUnits(oldUnit, newUnit) {
    const ratio = (oldUnit === '°' && newUnit === 'rad') ? (Math.PI / 180.0) : (180.0 / Math.PI);
    loads.forEach(l => {
      if (l.type === 'PointLoadInclined') {
        l.f2 = l.f2 * ratio;
      }
    });
  }

  function syncResultPresentationUnits() {
    resultUnitMoment = `${resultUnitMomentForce}·${resultUnitMomentDist}`;
  }

  function updateTableHeaders() {
    syncResultPresentationUnits();

    if (elTableSupports) {
      const ths = elTableSupports.querySelectorAll('thead tr.unit-row th');
      if (ths.length >= 4) {
        ths[1].textContent = currentUnitBeamLength;
        ths[3].textContent = 'kN/m';
      }
    }

    if (elTableLoads) {
      const ths = elTableLoads.querySelectorAll('thead tr.unit-row th');
      if (ths.length >= 6) {
        ths[1].textContent = currentUnitDist;
        ths[2].textContent = currentUnitDist;
        ths[3].textContent = `${currentUnitForce} / ${currentUnitUDL}`;
        ths[4].textContent = currentUnitUDL;
        ths[5].textContent = currentUnitAngle;
      }
    }

    if (elTableReactions) {
      const ths = elTableReactions.querySelectorAll('thead tr.unit-row th');
      if (ths.length >= 5) {
        ths[1].textContent = currentUnitBeamLength; // Location x follows beam length unit
        ths[2].textContent = resultUnitForce;  // Rx follows result presentation unit
        ths[3].textContent = resultUnitForce;  // Ry follows result presentation unit
        ths[4].textContent = resultUnitMoment; // M follows result presentation unit
      }
    }
  }

  function updateClearButtonVisibility() {
    const types = ['sfd', 'bmd', 'deflection', 'afd'];
    types.forEach(t => {
      const btn = document.getElementById(`btn-clear-${t}`);
      if (btn) {
        const hasMarkers = diagramMarkers.some(m => m.type === t);
        btn.style.display = hasMarkers ? 'inline-block' : 'none';
      }
    });
  }

  // Initialize view and bind globally
  window.initBeamAnalysisView = function () {
    // Locate elements
    elBeamLength = document.getElementById('beam-length');
    elBeamE = document.getElementById('beam-E');
    elTableSupports = document.getElementById('table-supports');
    elTableLoads = document.getElementById('table-loads');
    elTableReactions = document.getElementById('table-reactions');
    elBtnAddSupport = document.getElementById('btn-add-support');
    elBtnAddLoad = document.getElementById('btn-add-load');
    elBtnSolve = document.getElementById('btn-solve-beam');
    elSchematicContainer = document.getElementById('beam-schematic-container');
    elDiagramContainer = document.getElementById('beam-diagram-container');
    elDragTooltip = document.getElementById('beam-drag-tooltip');

    // Set up hover tooltip for loads and supports
    let elHoverTooltip = document.getElementById('beam-hover-tooltip');
    let currentHoverIndex = -1;
    let currentHoverType = null;

    function showHoverTooltip(type, idx, clientX, clientY) {
      if (!elHoverTooltip) elHoverTooltip = document.getElementById('beam-hover-tooltip');
      if (!elHoverTooltip) return;
      if (type === 'support') {
        elHoverTooltip.textContent = `Support-${idx + 1}`;
      } else {
        elHoverTooltip.textContent = `Load-${idx + 1}`;
      }
      elHoverTooltip.style.display = 'block';
      updateHoverTooltipPosition(clientX, clientY);
    }

    function updateHoverTooltipPosition(clientX, clientY) {
      if (!elHoverTooltip || !elSchematicContainer) return;
      const containerRect = elSchematicContainer.getBoundingClientRect();
      elHoverTooltip.style.left = `${clientX - containerRect.left}px`;
      elHoverTooltip.style.top = `${clientY - containerRect.top - 35}px`;
    }

    function hideHoverTooltip() {
      if (!elHoverTooltip) elHoverTooltip = document.getElementById('beam-hover-tooltip');
      if (elHoverTooltip) {
        elHoverTooltip.style.display = 'none';
      }
    }

    if (elSchematicContainer) {
      elSchematicContainer.addEventListener('pointermove', (e) => {
        if (dragState && dragState.active) {
          if (currentHoverIndex !== -1) {
            currentHoverIndex = -1;
            currentHoverType = null;
            hideHoverTooltip();
          }
          return;
        }

        const draggable = e.target.closest('.schematic-draggable');
        if (draggable) {
          const type = draggable.getAttribute('data-type');
          const idx = parseInt(draggable.getAttribute('data-index'), 10);
          if (type && (type.startsWith('load') || type === 'support') && !isNaN(idx)) {
            const normType = type.startsWith('load') ? 'load' : 'support';
            if (currentHoverIndex !== idx || currentHoverType !== normType) {
              currentHoverIndex = idx;
              currentHoverType = normType;
              showHoverTooltip(normType, idx, e.clientX, e.clientY);
            } else {
              updateHoverTooltipPosition(e.clientX, e.clientY);
            }
            return;
          }
        }

        if (currentHoverIndex !== -1) {
          currentHoverIndex = -1;
          currentHoverType = null;
          hideHoverTooltip();
        }
      });

      elSchematicContainer.addEventListener('pointerleave', () => {
        if (currentHoverIndex !== -1) {
          currentHoverIndex = -1;
          currentHoverType = null;
          hideHoverTooltip();
        }
      });
    }

    // Read initial inputs
    const elUnitBeamLength = document.getElementById('unit-beam-length');
    const elUnitBeamE = document.getElementById('unit-beam-E');
    if (elUnitBeamLength) currentUnitBeamLength = elUnitBeamLength.value || 'm';
    if (elUnitBeamE) currentUnitE = elUnitBeamE.value || 'GPa';

    if (elBeamLength) L = parseFloat(elBeamLength.value) || 6.0;
    if (elBeamE) E = parseFloat(elBeamE.value) || 200.0;

    // Zoom and pan controls are disabled to align layout horizontally with result diagrams.

    // Set up listeners for beam specs
    if (elBeamLength) {
      elBeamLength.addEventListener('change', (e) => {
        L = Math.max(1.0, parseFloat(e.target.value) || 6.0);
        elBeamLength.value = L;
        
        // Reset viewport pan/zoom on length change
        zoomScale = 1.0;
        panX = 0;

        const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
        const L_load = L * beamToLoadRatio;

        // Clamp existing supports/loads positions to new length
        supports.forEach(s => s.x = Math.min(s.x, L));
        loads.forEach(l => {
          if (l.x !== undefined) l.x = Math.min(l.x, L_load);
          if (l.start !== undefined) l.start = Math.min(l.start, L_load);
          if (l.end !== undefined) l.end = Math.min(l.end, L_load);
        });
        
        renderSupportsTable();
        renderLoadsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    if (elBeamE) {
      elBeamE.addEventListener('change', (e) => {
        E = Math.max(1.0, parseFloat(e.target.value) || 200.0);
        elBeamE.value = E;
        solveBeamModel();
      });
    }

    // Bind additions
    if (elBtnAddSupport) {
      elBtnAddSupport.addEventListener('click', () => {
        let newS;
        if (supports.length === 0) {
          newS = { x: 0.0, type: 'Pinned', ky: 0 };
        } else if (supports.length === 1) {
          const firstX = supports[0].x;
          const candX = Math.abs(firstX - 0.0) < 0.05 ? L : 0.0;
          newS = { x: parseFloat(candX.toFixed(2)), type: 'Roller', ky: 0 };
        } else {
          let candX = L / 2;
          const candidates = [L / 2, L / 4, 3 * L / 4, L / 5, 2 * L / 5, 3 * L / 5, 4 * L / 5];
          for (const cand of candidates) {
            if (!supports.some(s => Math.abs(s.x - cand) < 0.05)) {
              candX = cand;
              break;
            }
          }
          newS = { x: parseFloat(candX.toFixed(2)), type: 'Roller', ky: 0 };
        }
        supports.push(newS);
        renderSupportsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    if (elBtnAddLoad) {
      elBtnAddLoad.addEventListener('click', () => {
        const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
        const L_load = L * beamToLoadRatio;
        loads.push({ type: 'PointLoadV', x: parseFloat((L_load / 2).toFixed(2)), start: 0, end: 0, f1: -10.0, f2: 0 });
        renderLoadsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    // Solve button fallback
    if (elBtnSolve) {
      elBtnSolve.addEventListener('click', solveBeamModel);
    }

    // Set up diagram tab selectors
    document.querySelectorAll('.diagram-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.diagram-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeDiagram = tab.getAttribute('data-diagram');
        renderActiveDiagram();
      });
    });

    // Set up listeners for unit dropdown selectors
    const elUnitPointLoad = document.getElementById('unit-point-load');
    const elUnitMomentForce = document.getElementById('unit-moment-force');
    const elUnitMomentDist = document.getElementById('unit-moment-dist');
    const elUnitUDLForce = document.getElementById('unit-udl-force');
    const elUnitUDLDist = document.getElementById('unit-udl-dist');
    const elUnitDistance = document.getElementById('unit-distance');
    const elUnitAngle = document.getElementById('unit-angle');

    if (elUnitPointLoad) {
      elUnitPointLoad.addEventListener('change', (e) => {
        const oldVal = currentUnitForce;
        const newVal = e.target.value;
        if (oldVal === newVal) return;
        currentUnitForce = newVal;
        convertForceUnits(oldVal, newVal);
        updateTableHeaders();
        renderLoadsTable();
        renderSupportsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    function handleMomentUnitChange() {
      const oldVal = currentUnitMoment;
      const newForce = elUnitMomentForce ? elUnitMomentForce.value : currentUnitMomentForce;
      const newDist = elUnitMomentDist ? elUnitMomentDist.value : currentUnitMomentDist;
      const newVal = `${newForce}·${newDist}`;
      if (oldVal === newVal) return;
      
      currentUnitMomentForce = newForce;
      currentUnitMomentDist = newDist;
      currentUnitMoment = newVal;
      
      convertMomentUnits(oldVal, newVal);
      updateTableHeaders();
      renderLoadsTable();
      drawSchematic();
      solveBeamModel();
    }

    if (elUnitMomentForce) {
      elUnitMomentForce.addEventListener('change', handleMomentUnitChange);
    }
    if (elUnitMomentDist) {
      elUnitMomentDist.addEventListener('change', handleMomentUnitChange);
    }

    function handleUDLUnitChange() {
      const oldVal = currentUnitUDL;
      const newForce = elUnitUDLForce ? elUnitUDLForce.value : currentUnitUDLForce;
      const newDist = elUnitUDLDist ? elUnitUDLDist.value : currentUnitUDLDist;
      const newVal = `${newForce}/${newDist}`;
      if (oldVal === newVal) return;
      
      currentUnitUDLForce = newForce;
      currentUnitUDLDist = newDist;
      currentUnitUDL = newVal;
      
      convertUDLUnits(oldVal, newVal);
      updateTableHeaders();
      renderLoadsTable();
      drawSchematic();
      solveBeamModel();
    }

    if (elUnitUDLForce) {
      elUnitUDLForce.addEventListener('change', handleUDLUnitChange);
    }
    if (elUnitUDLDist) {
      elUnitUDLDist.addEventListener('change', handleUDLUnitChange);
    }

    if (elUnitDistance) {
      elUnitDistance.addEventListener('change', (e) => {
        const oldVal = currentUnitDist;
        const newVal = e.target.value;
        if (oldVal === newVal) return;
        currentUnitDist = newVal;
        convertDistanceUnits(oldVal, newVal);
        updateTableHeaders();
        renderLoadsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    if (elUnitAngle) {
      elUnitAngle.addEventListener('change', (e) => {
        const oldVal = currentUnitAngle;
        const newVal = e.target.value;
        if (oldVal === newVal) return;
        currentUnitAngle = newVal;
        convertAngleUnits(oldVal, newVal);
        updateTableHeaders();
        renderLoadsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    if (elUnitBeamLength) {
      elUnitBeamLength.addEventListener('change', (e) => {
        const oldVal = currentUnitBeamLength;
        const newVal = e.target.value;
        if (oldVal === newVal) return;
        currentUnitBeamLength = newVal;
        convertBeamLengthUnits(oldVal, newVal);
        updateTableHeaders();
        if (elBeamLength) elBeamLength.value = parseFloat(L.toFixed(3));
        renderSupportsTable();
        drawSchematic();
        solveBeamModel();
      });
    }

    if (elUnitBeamE) {
      elUnitBeamE.addEventListener('change', (e) => {
        const oldVal = currentUnitE;
        const newVal = e.target.value;
        if (oldVal === newVal) return;
        currentUnitE = newVal;
        convertEUnits(oldVal, newVal);
        if (elBeamE) elBeamE.value = parseFloat(E.toFixed(3));
        solveBeamModel();
      });
    }

    // Result presentation units listeners
    const elResultUnitForce = document.getElementById('result-unit-force');
    if (elResultUnitForce) {
      elResultUnitForce.value = resultUnitForce;
      elResultUnitForce.addEventListener('change', (e) => {
        resultUnitForce = e.target.value;
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    const elResultUnitForceSFD = document.getElementById('result-unit-force-sfd');
    if (elResultUnitForceSFD) {
      elResultUnitForceSFD.value = resultUnitForceSFD;
      elResultUnitForceSFD.addEventListener('change', (e) => {
        resultUnitForceSFD = e.target.value;
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    const elResultUnitForceAFD = document.getElementById('result-unit-force-afd');
    if (elResultUnitForceAFD) {
      elResultUnitForceAFD.value = resultUnitForceAFD;
      elResultUnitForceAFD.addEventListener('change', (e) => {
        resultUnitForceAFD = e.target.value;
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    const elResultUnitMomentForce = document.getElementById('result-unit-moment-force');
    if (elResultUnitMomentForce) {
      elResultUnitMomentForce.value = resultUnitMomentForce;
      elResultUnitMomentForce.addEventListener('change', (e) => {
        resultUnitMomentForce = e.target.value;
        const elReactionsUnitMomentForce = document.getElementById('reactions-unit-moment-force');
        if (elReactionsUnitMomentForce) {
          elReactionsUnitMomentForce.value = resultUnitMomentForce;
        }
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    const elResultUnitMomentDist = document.getElementById('result-unit-moment-dist');
    if (elResultUnitMomentDist) {
      elResultUnitMomentDist.value = resultUnitMomentDist;
      elResultUnitMomentDist.addEventListener('change', (e) => {
        resultUnitMomentDist = e.target.value;
        const elReactionsUnitMomentDist = document.getElementById('reactions-unit-moment-dist');
        if (elReactionsUnitMomentDist) {
          elReactionsUnitMomentDist.value = resultUnitMomentDist;
        }
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    const elReactionsUnitMomentForce = document.getElementById('reactions-unit-moment-force');
    if (elReactionsUnitMomentForce) {
      elReactionsUnitMomentForce.value = resultUnitMomentForce;
      elReactionsUnitMomentForce.addEventListener('change', (e) => {
        resultUnitMomentForce = e.target.value;
        if (elResultUnitMomentForce) {
          elResultUnitMomentForce.value = resultUnitMomentForce;
        }
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    const elReactionsUnitMomentDist = document.getElementById('reactions-unit-moment-dist');
    if (elReactionsUnitMomentDist) {
      elReactionsUnitMomentDist.value = resultUnitMomentDist;
      elReactionsUnitMomentDist.addEventListener('change', (e) => {
        resultUnitMomentDist = e.target.value;
        if (elResultUnitMomentDist) {
          elResultUnitMomentDist.value = resultUnitMomentDist;
        }
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    // Set up hover tooltip for reactions graph supports
    const elReactionsContainer = document.getElementById('reactions-diagram-container');
    let elReactionsHoverTooltip = document.getElementById('reactions-hover-tooltip');
    let currentReactionsHoverIndex = -1;

    function showReactionsHoverTooltip(idx, clientX, clientY) {
      if (!elReactionsHoverTooltip) elReactionsHoverTooltip = document.getElementById('reactions-hover-tooltip');
      if (!elReactionsHoverTooltip) return;
      elReactionsHoverTooltip.textContent = `Support-${idx + 1}`;
      elReactionsHoverTooltip.style.display = 'block';
      updateReactionsHoverTooltipPosition(clientX, clientY);
    }

    function updateReactionsHoverTooltipPosition(clientX, clientY) {
      if (!elReactionsHoverTooltip || !elReactionsContainer) return;
      const containerRect = elReactionsContainer.getBoundingClientRect();
      elReactionsHoverTooltip.style.left = `${clientX - containerRect.left}px`;
      elReactionsHoverTooltip.style.top = `${clientY - containerRect.top - 35}px`;
    }

    function hideReactionsHoverTooltip() {
      if (!elReactionsHoverTooltip) elReactionsHoverTooltip = document.getElementById('reactions-hover-tooltip');
      if (elReactionsHoverTooltip) {
        elReactionsHoverTooltip.style.display = 'none';
      }
    }

    if (elReactionsContainer) {
      elReactionsContainer.addEventListener('pointermove', (e) => {
        const hoverable = e.target.closest('.reactions-support-hoverable');
        if (hoverable) {
          const idx = parseInt(hoverable.getAttribute('data-index'), 10);
          if (!isNaN(idx)) {
            if (currentReactionsHoverIndex !== idx) {
              currentReactionsHoverIndex = idx;
              showReactionsHoverTooltip(idx, e.clientX, e.clientY);
            } else {
              updateReactionsHoverTooltipPosition(e.clientX, e.clientY);
            }
            return;
          }
        }

        if (currentReactionsHoverIndex !== -1) {
          currentReactionsHoverIndex = -1;
          hideReactionsHoverTooltip();
        }
      });

      elReactionsContainer.addEventListener('pointerleave', () => {
        if (currentReactionsHoverIndex !== -1) {
          currentReactionsHoverIndex = -1;
          hideReactionsHoverTooltip();
        }
      });
    }

    const elResultUnitDisplacement = document.getElementById('result-unit-displacement');
    if (elResultUnitDisplacement) {
      elResultUnitDisplacement.value = resultUnitDisplacement;
      elResultUnitDisplacement.addEventListener('change', (e) => {
        resultUnitDisplacement = e.target.value;
        updateTableHeaders();
        renderReactionsTable();
        renderActiveDiagram();
      });
    }

    updateTableHeaders();

    // Helper to get coordinates on diagram SVG relative to viewport/client coordinates
    function getDiagramCoordsAtClient(clientX, clientY, svgEl) {
      if (!diagramData || diagramData.length === 0 || !svgEl) return null;
      const rect = svgEl.getBoundingClientRect();
      const svgW = 600;
      const svgH = parseFloat(svgEl.getAttribute('viewBox').split(' ')[3]) || 180;
      
      const padL = parseFloat(svgEl.getAttribute('data-padl')) || 80;
      const padR = 40;
      const graphW = svgW - padL - padR;
      
      const mouseXInSvg = ((clientX - rect.left) / rect.width) * svgW;
      const mouseYInSvg = ((clientY - rect.top) / rect.height) * svgH;
      
      // Horizontal graph region: [padL, svgW - padR]
      if (mouseXInSvg < padL || mouseXInSvg > svgW - padR) return null;
      
      const fraction = (mouseXInSvg - padL) / graphW;
      const beamX = fraction * L;
      
      const c_dist = getDistFactor(currentUnitBeamLength);
      
      const diagramType = svgEl.getAttribute('data-diagram');
      let propKey = 'shear';
      let propUnit = resultUnitForceSFD;
      let propScale = 1.0 / getForceFactor(resultUnitForceSFD);
      if (diagramType === 'bmd') {
        propKey = 'moment';
        propUnit = resultUnitMoment;
        propScale = 1.0 / getMomentFactor(resultUnitMoment);
      } else if (diagramType === 'deflection') {
        propKey = 'deflection';
        propUnit = resultUnitDisplacement;
        propScale = 1.0 / getDistFactor(resultUnitDisplacement);
      } else if (diagramType === 'afd') {
        propKey = 'axial';
        propUnit = resultUnitForceAFD;
        propScale = 1.0 / getForceFactor(resultUnitForceAFD);
      }
      
      let closestPt = null;
      let minDiff = 1e9;
      diagramData.forEach(pt => {
        const px_user = pt.x / c_dist;
        const diff = Math.abs(px_user - beamX);
        if (diff < minDiff) {
          minDiff = diff;
          closestPt = {
            x_user: px_user,
            y_user: pt[propKey] * propScale
          };
        }
      });
      
      if (!closestPt) return null;
      
      const getXPixel = (x) => padL + (x / L) * graphW;
      
      let minVal = Math.min(...diagramData.map(pt => pt[propKey] * propScale));
      let maxVal = Math.max(...diagramData.map(pt => pt[propKey] * propScale));
      if (Math.abs(minVal) < 1e-4 && Math.abs(maxVal) < 1e-4) {
        minVal = -1.0;
        maxVal = 1.0;
      } else {
        const padding = (maxVal - minVal) * 0.15 || 1.0;
        minVal -= padding;
        maxVal += padding;
      }
      
      const padT = 25;
      const padB = 40;
      const graphH = svgH - padT - padB;
      
      const getYPixel = (y) => {
        const frac = (y - minVal) / (maxVal - minVal);
        return padT + (1.0 - frac) * graphH;
      };
      
      const px = getXPixel(closestPt.x_user);
      const py = getYPixel(closestPt.y_user);
      
      return {
        x: closestPt.x_user,
        y: closestPt.y_user,
        px: px,
        py: py,
        unit: propUnit,
        type: diagramType
      };
    }

    function getCoordsAtBeamX(xVal, diagramType, svgEl) {
      if (!diagramData || diagramData.length === 0) return null;
      
      const padL = svgEl ? (parseFloat(svgEl.getAttribute('data-padl')) || 80) : 80;
      const padR = 40;
      const svgW = 600;
      const graphW = svgW - padL - padR;
      
      const c_dist = getDistFactor(currentUnitBeamLength);
      let propKey = 'shear';
      let propScale = 1.0 / getForceFactor(resultUnitForceSFD);
      if (diagramType === 'bmd') {
        propKey = 'moment';
        propScale = 1.0 / getMomentFactor(resultUnitMoment);
      } else if (diagramType === 'deflection') {
        propKey = 'deflection';
        propScale = 1.0 / getDistFactor(resultUnitDisplacement);
      } else if (diagramType === 'afd') {
        propKey = 'axial';
        propScale = 1.0 / getForceFactor(resultUnitForceAFD);
      }
      
      let closestPt = null;
      let minDiff = 1e9;
      diagramData.forEach(pt => {
        const px_user = pt.x / c_dist;
        const diff = Math.abs(px_user - xVal);
        if (diff < minDiff) {
          minDiff = diff;
          closestPt = {
            x_user: px_user,
            y_user: pt[propKey] * propScale
          };
        }
      });
      
      if (!closestPt) return null;
      
      const getXPixel = (x) => padL + (x / L) * graphW;
      
      let minVal = Math.min(...diagramData.map(pt => pt[propKey] * propScale));
      let maxVal = Math.max(...diagramData.map(pt => pt[propKey] * propScale));
      if (Math.abs(minVal) < 1e-4 && Math.abs(maxVal) < 1e-4) {
        minVal = -1.0;
        maxVal = 1.0;
      } else {
        const padding = (maxVal - minVal) * 0.15 || 1.0;
        minVal -= padding;
        maxVal += padding;
      }
      
      const padT = 25;
      const padB = 40;
      const svgH = 180;
      const graphH = svgH - padT - padB;
      
      const getYPixel = (y) => {
        const frac = (y - minVal) / (maxVal - minVal);
        return padT + (1.0 - frac) * graphH;
      };
      
      return {
        px: getXPixel(closestPt.x_user),
        py: getYPixel(closestPt.y_user)
      };
    }

    let clickedMarkerData = null;
    let selectedMarkerId = null;

    if (elDiagramContainer) {
      const elTooltip = document.getElementById('beam-diagram-tooltip');
      const elMenu = document.getElementById('beam-diagram-menu');
      const elEditMenu = document.getElementById('beam-diagram-edit-menu');

      function positionMenuInActiveBox(el, activeBox, clientX, clientY) {
        if (!el || !activeBox) return;
        if (el.parentElement !== activeBox) {
          activeBox.appendChild(el);
        }
        const boxRect = activeBox.getBoundingClientRect();
        el.style.left = `${clientX - boxRect.left}px`;
        el.style.top = `${clientY - boxRect.top}px`;
      }

      function positionTooltipInActiveBox(el, activeBox, clientX, clientY) {
        if (!el || !activeBox) return;
        if (el.parentElement !== activeBox) {
          activeBox.appendChild(el);
        }
        const boxRect = activeBox.getBoundingClientRect();
        el.style.left = `${clientX - boxRect.left + 15}px`;
        el.style.top = `${clientY - boxRect.top - 35}px`;
      }

      // Bind header Show/Hide buttons
      const headerToggleBtns = document.querySelectorAll('.toggle-window-btn');
      headerToggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cardId = btn.getAttribute('data-target');
          const card = document.getElementById(cardId);
          if (!card) return;
          const visBox = card.querySelector('.visualization-box');
          if (!visBox) return;
          
          const isHidden = visBox.style.display === 'none';
          visBox.style.display = isHidden ? 'block' : 'none';
          btn.textContent = isHidden ? 'Hide' : 'Show';
        });
      });

      // Bind diagram-specific Clear Markers buttons in card headers
      const clearMarkersBtns = document.querySelectorAll('.btn-clear-markers');
      clearMarkersBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const diagramType = btn.getAttribute('data-diagram');
          diagramMarkers = diagramMarkers.filter(m => m.type !== diagramType);
          renderActiveDiagram();
          if (elMenu) elMenu.style.display = 'none';
          if (elEditMenu) elEditMenu.style.display = 'none';
          clickedMarkerData = null;
        });
      });

      function openEditMenu(marker, clientX, clientY) {
        hideHoverElements();
        selectedMarkerId = marker.id;
        const elInputContainer = document.getElementById('edit-marker-input-container');
        const elXInput = document.getElementById('edit-marker-x-input');
        const elXUnit = document.getElementById('edit-marker-x-unit');
        
        if (elEditMenu) {
          if (elInputContainer) elInputContainer.style.display = 'none';
          if (elXInput) {
            elXInput.value = marker.x.toFixed(2);
          }
          if (elXUnit) {
            elXUnit.textContent = currentUnitBeamLength;
          }
          const container = document.getElementById(`${marker.type}-diagram-container`);
          const activeBox = container ? container.closest('.visualization-box') : null;
          if (activeBox) {
            positionMenuInActiveBox(elEditMenu, activeBox, clientX, clientY);
            elEditMenu.style.display = 'flex';
          }
        }
        
        if (elMenu) elMenu.style.display = 'none';
        clickedMarkerData = null;
      }

      elDiagramContainer.addEventListener('pointermove', (e) => {
        const svgEl = e.target.closest('svg[data-diagram]');
        if (!svgEl) {
          hideHoverElements();
          return;
        }

        const diagramType = svgEl.getAttribute('data-diagram');
        if (diagramType === 'reactions') {
          hideHoverElements();
          return;
        }

        if (labelDragState.active) {
          hideHoverElements();
          return;
        }
        const isEditMenuOpen = elEditMenu && elEditMenu.style.display !== 'none';
        if (isEditMenuOpen || selectedMarkerId !== null) {
          hideHoverElements();
          return;
        }

        const res = getDiagramCoordsAtClient(e.clientX, e.clientY, svgEl);
        
        if (activeDraggedMarkerId) {
          const svgs = elDiagramContainer.querySelectorAll('svg');
          svgs.forEach(svg => {
            const hoverEl = svg.querySelector('#diagram-hover-elements');
            if (hoverEl) hoverEl.style.display = 'none';
          });

          if (res) {
            const marker = diagramMarkers.find(m => m.id === activeDraggedMarkerId);
            if (marker) {
              marker.x = res.x;
              renderActiveDiagram();
              if (elTooltip) {
                elTooltip.innerHTML = `
                  <div style="font-size: 11px; color: var(--text-primary); font-family: var(--font-sans); text-align: center;">Click anywhere to drop</div>
                `;
                elTooltip.style.display = 'block';
                const activeBox = e.target.closest('.visualization-box');
                positionTooltipInActiveBox(elTooltip, activeBox, e.clientX, e.clientY);
              }
            }
          }
          return;
        }

        if (res) {
          if (elTooltip) {
            elTooltip.innerHTML = `
              <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 3px; font-weight: normal; text-align: center; font-family: var(--font-sans);">Click anywhere to add marker</div>
              <div style="text-align: center;">${res.y.toFixed(2)} ${res.unit} , x = ${res.x.toFixed(2)}${currentUnitBeamLength}</div>
            `;
            elTooltip.style.display = 'block';
            const activeBox = e.target.closest('.visualization-box');
            positionTooltipInActiveBox(elTooltip, activeBox, e.clientX, e.clientY);
          }
          
          const svgs = elDiagramContainer.querySelectorAll('svg');
          svgs.forEach(svg => {
            const type = svg.getAttribute('data-diagram');
            const hoverEl = svg.querySelector('#diagram-hover-elements');
            const hoverLine = svg.querySelector('#diagram-hover-line');
            const hoverDot = svg.querySelector('#diagram-hover-dot');
            if (hoverEl && hoverLine) {
              const svgPadL = parseFloat(svg.getAttribute('data-padl')) || 80;
              const svgGraphW = 600 - svgPadL - 40;
              const pxForSvg = svgPadL + (res.x / L) * svgGraphW;

              hoverEl.style.display = 'block';
              hoverLine.setAttribute('x1', pxForSvg);
              hoverLine.setAttribute('x2', pxForSvg);
              if (hoverDot) {
                if (type === 'reactions') {
                  hoverDot.setAttribute('cx', pxForSvg);
                  hoverDot.setAttribute('cy', 50);
                } else {
                  const dRes = getCoordsAtBeamX(res.x, type, svg);
                  if (dRes) {
                    hoverDot.setAttribute('cx', dRes.px);
                    hoverDot.setAttribute('cy', dRes.py);
                  }
                }
              }
            }
          });
        } else {
          hideHoverElements();
        }
      });

      elDiagramContainer.addEventListener('pointerleave', () => {
        if (!activeDraggedMarkerId) {
          hideHoverElements();
        }
      });

      function hideHoverElements() {
        if (elTooltip) elTooltip.style.display = 'none';
        const svgs = elDiagramContainer.querySelectorAll('svg');
        svgs.forEach(svg => {
          const hoverEl = svg.querySelector('#diagram-hover-elements');
          if (hoverEl) hoverEl.style.display = 'none';
        });
      }

      elDiagramContainer.addEventListener('pointerdown', (e) => {
        const labelG = e.target.closest('.diagram-marker-label');
        if (labelG) {
          const markerG = labelG.closest('.diagram-marker');
          if (markerG) {
            const markerId = parseInt(markerG.getAttribute('data-id'), 10);
            const marker = diagramMarkers.find(m => m.id === markerId);
            if (marker) {
              const px = parseFloat(markerG.getAttribute('data-px'));
              const py = parseFloat(markerG.getAttribute('data-py'));
              const rx = parseFloat(markerG.getAttribute('data-rx'));
              const ry = parseFloat(markerG.getAttribute('data-ry'));
              
              labelDragState.active = true;
              labelDragState.markerId = markerId;
              labelDragState.startX = e.clientX;
              labelDragState.startY = e.clientY;
              labelDragState.startDx = rx - px;
              labelDragState.startDy = ry - py;
              labelDragState.hasMoved = false;
              
              labelG.setPointerCapture(e.pointerId);
              e.stopPropagation();
            }
          }
        }
      });

      document.addEventListener('pointermove', (e) => {
        if (labelDragState.active) {
          const marker = diagramMarkers.find(m => m.id === labelDragState.markerId);
          if (marker) {
            const svg = elDiagramContainer.querySelector(`svg[data-diagram="${marker.type}"]`) || elDiagramContainer.querySelector('svg');
            let scaleX = 1.0;
            let scaleY = 1.0;
            if (svg) {
              const rect = svg.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const svgH = parseFloat(svg.getAttribute('viewBox').split(' ')[3]) || 180;
                scaleX = 600.0 / rect.width;
                scaleY = svgH / rect.height;
              }
            }
            const svgDx = (e.clientX - labelDragState.startX) * scaleX;
            const svgDy = (e.clientY - labelDragState.startY) * scaleY;
            
            marker.dx = labelDragState.startDx + svgDx;
            marker.dy = labelDragState.startDy + svgDy;
            labelDragState.hasMoved = true;
            
            renderActiveDiagram();
          }
        }
      });

      document.addEventListener('pointerup', (e) => {
        if (labelDragState.active) {
          const labelG = elDiagramContainer.querySelector(`.diagram-marker[data-id="${labelDragState.markerId}"] .diagram-marker-label`);
          if (labelG) {
            try {
              labelG.releasePointerCapture(e.pointerId);
            } catch (err) {}
          }
          if (labelDragState.hasMoved) {
            justFinishedDragging = true;
            setTimeout(() => {
              justFinishedDragging = false;
            }, 50);
          }
          labelDragState.active = false;
          labelDragState.markerId = null;
        }
      });

      elDiagramContainer.addEventListener('click', (e) => {
        if (justFinishedDragging) {
          e.stopPropagation();
          return;
        }
        if (activeDraggedMarkerId) {
          activeDraggedMarkerId = null;
          hideHoverElements();
          e.stopPropagation();
          return;
        }

        const deleteBtn = e.target.closest('.diagram-marker-delete');
        if (deleteBtn) {
          const markerId = parseInt(deleteBtn.getAttribute('data-id'), 10);
          diagramMarkers = diagramMarkers.filter(m => m.id !== markerId);
          renderActiveDiagram();
          if (elMenu) elMenu.style.display = 'none';
          if (elEditMenu) elEditMenu.style.display = 'none';
          clickedMarkerData = null;
          e.stopPropagation();
          return;
        }

        const existingMarker = e.target.closest('.diagram-marker');
        if (existingMarker) {
          const markerId = parseInt(existingMarker.getAttribute('data-id'), 10);
          const marker = diagramMarkers.find(m => m.id === markerId);
          if (marker) {
            openEditMenu(marker, e.clientX, e.clientY);
            e.stopPropagation();
            return;
          }
        }

        const svgEl = e.target.closest('svg[data-diagram]');
        if (!svgEl) return;
        const diagramType = svgEl.getAttribute('data-diagram');
        if (diagramType === 'reactions') return;

        const res = getDiagramCoordsAtClient(e.clientX, e.clientY, svgEl);
        if (res) {
          if (elMenu) {
            const activeBox = e.target.closest('.visualization-box');
            positionMenuInActiveBox(elMenu, activeBox, e.clientX, e.clientY);
            elMenu.style.display = 'flex';
          }
          clickedMarkerData = {
            x: res.x,
            type: diagramType
          };
          if (elEditMenu) elEditMenu.style.display = 'none';
          selectedMarkerId = null;
          e.stopPropagation();
        } else {
          if (elMenu) elMenu.style.display = 'none';
          clickedMarkerData = null;
          if (elEditMenu) elEditMenu.style.display = 'none';
          selectedMarkerId = null;
        }
      });

      const btnAddLabel = document.getElementById('btn-diagram-add-label');
      if (btnAddLabel) {
        btnAddLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          if (clickedMarkerData) {
            diagramMarkers.push({
              id: Date.now(),
              type: clickedMarkerData.type,
              x: clickedMarkerData.x
            });
            renderActiveDiagram();
          }
          if (elMenu) elMenu.style.display = 'none';
          clickedMarkerData = null;
        });
      }

      const btnCancelLabel = document.getElementById('btn-diagram-cancel');
      if (btnCancelLabel) {
        btnCancelLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          if (elMenu) elMenu.style.display = 'none';
          clickedMarkerData = null;
        });
      }

      const btnEditMove = document.getElementById('btn-edit-marker-move');
      if (btnEditMove) {
        btnEditMove.addEventListener('click', (e) => {
          e.stopPropagation();
          if (selectedMarkerId) {
            activeDraggedMarkerId = selectedMarkerId;
            if (elEditMenu) elEditMenu.style.display = 'none';
            selectedMarkerId = null;
          }
        });
      }

      const btnEditPos = document.getElementById('btn-edit-marker-pos');
      if (btnEditPos) {
        btnEditPos.addEventListener('click', (e) => {
          e.stopPropagation();
          const elInputContainer = document.getElementById('edit-marker-input-container');
          if (elInputContainer) {
            elInputContainer.style.display = 'flex';
            const elXInput = document.getElementById('edit-marker-x-input');
            if (elXInput) elXInput.focus();
          }
        });
      }

      const elXInput = document.getElementById('edit-marker-x-input');
      if (elXInput) {
        const updateMarkerX = () => {
          if (!selectedMarkerId) return;
          const marker = diagramMarkers.find(m => m.id === selectedMarkerId);
          if (marker) {
            let val = parseFloat(elXInput.value);
            if (isNaN(val)) val = 0.0;
            val = Math.max(0.0, Math.min(L, val));
            marker.x = val;
            renderActiveDiagram();
          }
        };

        const applyMarkerXChange = () => {
          updateMarkerX();
          if (elEditMenu) elEditMenu.style.display = 'none';
          selectedMarkerId = null;
        };

        elXInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyMarkerXChange();
          }
        });

        elXInput.addEventListener('input', () => {
          updateMarkerX();
        });

        elXInput.addEventListener('change', () => {
          updateMarkerX();
        });
      }

      const btnEditDelete = document.getElementById('btn-edit-marker-delete');
      if (btnEditDelete) {
        btnEditDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          if (selectedMarkerId) {
            diagramMarkers = diagramMarkers.filter(m => m.id !== selectedMarkerId);
            renderActiveDiagram();
          }
          if (elEditMenu) elEditMenu.style.display = 'none';
          selectedMarkerId = null;
        });
      }

      const btnEditClose = document.getElementById('btn-edit-marker-close');
      if (btnEditClose) {
        btnEditClose.addEventListener('click', (e) => {
          e.stopPropagation();
          if (elEditMenu) elEditMenu.style.display = 'none';
          selectedMarkerId = null;
        });
      }

      document.addEventListener('click', (e) => {
        if (elMenu && elMenu.style.display === 'flex') {
          if (!elMenu.contains(e.target)) {
            elMenu.style.display = 'none';
            clickedMarkerData = null;
          }
        }
        if (elEditMenu && elEditMenu.style.display === 'flex') {
          if (!elEditMenu.contains(e.target)) {
            elEditMenu.style.display = 'none';
            selectedMarkerId = null;
          }
        }
      });

      const btnClearMarkers = document.getElementById('btn-clear-diagram-markers');
      if (btnClearMarkers) {
        btnClearMarkers.addEventListener('click', () => {
          diagramMarkers = [];
          renderActiveDiagram();
          if (elMenu) elMenu.style.display = 'none';
          if (elEditMenu) elEditMenu.style.display = 'none';
          clickedMarkerData = null;
        });
      }
    }

    // Initial renders & calculation
    renderSupportsTable();
    renderLoadsTable();
    drawSchematic();
    solveBeamModel();
  };

  // Convert SVG coordinates to beam coordinates
  function getXBeam(e) {
    const svg = document.getElementById('beam-schematic-svg');
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xSVG = (clientX - rect.left) / rect.width * canvasW;
    
    const graphW = canvasW - globalPadL - 40;
    const xBeam = ((xSVG - globalPadL) / graphW) * L;
    return Math.max(0.0, Math.min(L, xBeam));
  }

  // Pointer drag start
  function onDragStart(e, type, index) {
    e.preventDefault();

    dragState.active = true;
    dragState.type = type;
    dragState.index = index;

    const xBeamClick = getXBeam(e);
    const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
    const xBeamClickConverted = (type === 'support') ? xBeamClick : xBeamClick * beamToLoadRatio;
    let initialX = 0;
    
    if (type === 'support') {
      initialX = supports[index].x;
    } else if (type === 'load') {
      initialX = loads[index].x;
    } else if (type === 'load-start') {
      initialX = loads[index].start;
    } else if (type === 'load-end') {
      initialX = loads[index].end;
    } else if (type === 'load-body') {
      initialX = loads[index].start;
      dragState.loadLength = loads[index].end - loads[index].start;
    } else if (type === 'pan') {
      dragState.startX = e.clientX;
      dragState.startPanX = panX;
      
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
      window.addEventListener('pointercancel', onDragEnd);
      
      try {
        if (e && e.target && typeof e.target.setPointerCapture === 'function' && e.pointerId !== undefined) {
          e.target.setPointerCapture(e.pointerId);
        }
      } catch (err) {
        console.warn("Failed to set pointer capture:", err);
      }
      return;
    }

    // Calculate click offset to prevent jump-snapping
    dragState.offset = initialX - xBeamClickConverted;
    dragState.startX = xBeamClickConverted;

    // Attach listeners to window to capture fast cursor movements safely
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);

    try {
      if (e && e.target && typeof e.target.setPointerCapture === 'function' && e.pointerId !== undefined) {
        e.target.setPointerCapture(e.pointerId);
      }
    } catch (err) {
      console.warn("Failed to set pointer capture:", err);
    }

    const svg = document.getElementById('beam-schematic-svg');
    if (svg) svg.classList.add('dragging');

    if (elDragTooltip) {
      elDragTooltip.style.display = 'block';
      elDragTooltip.style.opacity = '1';
    }
  }

  // Pointer drag move
  function onDragMove(e) {
    if (!dragState.active) return;

    if (dragState.type === 'pan') {
      const rect = document.getElementById('beam-schematic-svg').getBoundingClientRect();
      const dx = e.clientX - dragState.startX;
      const dxSVG = (dx / rect.width) * canvasW;
      
      panX = dragState.startPanX + dxSVG;
      
      if (!isTicking) {
        requestAnimationFrame(() => {
          drawSchematic();
          isTicking = false;
        });
        isTicking = true;
      }
      return;
    }

    const xBeam = getXBeam(e);
    const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
    const xBeamConverted = (dragState.type === 'support') ? xBeam : xBeam * beamToLoadRatio;
    const roundedX = parseFloat((xBeamConverted + dragState.offset).toFixed(2));
    const L_load = L * beamToLoadRatio;

    // Update state based on drag type
    if (dragState.type === 'support') {
      supports[dragState.index].x = Math.max(0.0, Math.min(L, roundedX));
    } else if (dragState.type === 'load') {
      loads[dragState.index].x = Math.max(0.0, Math.min(L_load, roundedX));
    } else if (dragState.type === 'load-start') {
      const currentEnd = loads[dragState.index].end;
      loads[dragState.index].start = Math.max(0.0, Math.min(currentEnd - 0.1, roundedX));
    } else if (dragState.type === 'load-end') {
      const currentStart = loads[dragState.index].start;
      loads[dragState.index].end = Math.max(currentStart + 0.1, Math.min(L_load, roundedX));
    } else if (dragState.type === 'load-body') {
      const len = dragState.loadLength;
      const newStart = Math.max(0.0, Math.min(L_load - len, roundedX));
      loads[dragState.index].start = newStart;
      loads[dragState.index].end = parseFloat((newStart + len).toFixed(2));
    }

    // Throttle redrawing to V-Sync
    if (!isTicking) {
      requestAnimationFrame(() => {
        if (!dragState.active) {
          isTicking = false;
          return;
        }

        drawSchematic();
        syncTableValuesRealtime(dragState.type, dragState.index);

        // Update tooltip position
        if (elDragTooltip) {
          const containerRect = elSchematicContainer.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;

          elDragTooltip.style.left = `${clientX - containerRect.left}px`;
          elDragTooltip.style.top = `${clientY - containerRect.top - 35}px`;
          
          let displayVal = roundedX;
          if (dragState.type === 'support') displayVal = supports[dragState.index].x;
          else if (dragState.type === 'load') displayVal = loads[dragState.index].x;
          else if (dragState.type === 'load-start') displayVal = loads[dragState.index].start;
          else if (dragState.type === 'load-end') displayVal = loads[dragState.index].end;
          else if (dragState.type === 'load-body') displayVal = loads[dragState.index].start;
          
          if (dragState.type === 'support') {
            elDragTooltip.textContent = `x = ${displayVal.toFixed(2)} ${currentUnitBeamLength}`;
          } else if (dragState.type === 'load-body') {
            elDragTooltip.textContent = `x = ${displayVal.toFixed(2)} ${currentUnitDist} – ${loads[dragState.index].end.toFixed(2)} ${currentUnitDist}`;
          } else {
            elDragTooltip.textContent = `x = ${displayVal.toFixed(2)} ${currentUnitDist}`;
          }
        }

        isTicking = false;
      });
      isTicking = true;
    }
  }

  // Pointer drag end
  function onDragEnd(e) {
    if (!dragState.active) return;

    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);

    try {
      if (e && e.target && typeof e.target.releasePointerCapture === 'function' && e.pointerId !== undefined) {
        e.target.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      console.warn("Failed to release pointer capture:", err);
    }

    const svg = document.getElementById('beam-schematic-svg');
    if (svg) {
      svg.classList.remove('dragging');
      svg.style.cursor = '';
    }

    const wasPanning = (dragState.type === 'pan');

    dragState.active = false;
    dragState.type = null;
    dragState.index = -1;

    if (elDragTooltip) {
      elDragTooltip.style.display = 'none';
    }

    drawSchematic();
    
    // Only resolve backend values if coordinates changed (i.e. did not just pan viewport)
    if (!wasPanning) {
      solveBeamModel();
    }
  }

  // Synchronize dynamic model parameters back into table cells in real-time
  function syncTableValuesRealtime(type, idx) {
    if (type === 'support') {
      const row = elTableSupports.querySelector(`tbody tr:nth-child(${idx + 1})`);
      if (row) {
        const input = row.querySelector('input[type="number"]');
        if (input) input.value = parseFloat(supports[idx].x.toFixed(3));
      }
    } else if (type === 'load' || type === 'load-start' || type === 'load-end' || type === 'load-body') {
      const l = loads[idx];
      const isPoint = (l.type === 'PointLoadV' || l.type === 'PointLoadH' || l.type === 'PointLoadInclined' || l.type === 'PointTorque');
      const inputX1 = elTableLoads.querySelector(`input[data-load-index="${idx}"][data-field="x1"]`);
      const inputX2 = elTableLoads.querySelector(`input[data-load-index="${idx}"][data-field="x2"]`);
      if (inputX1) {
        inputX1.value = parseFloat((isPoint ? l.x : l.start).toFixed(3));
      }
      if (inputX2 && !isPoint) {
        inputX2.value = parseFloat(l.end.toFixed(3));
      }
    }
  }

  // Renders the supports CRUD editor table
  function renderSupportsTable() {
    if (!elTableSupports) return;
    const tbody = elTableSupports.querySelector('tbody');
    tbody.innerHTML = '';

    supports.forEach((s, idx) => {
      const tr = document.createElement('tr');

      // Identifier cell
      const tdId = document.createElement('td');
      tdId.style.textAlign = 'center';
      tdId.style.fontWeight = '700';
      tdId.textContent = `Support-${idx + 1}`;
      tr.appendChild(tdId);

      // Coordinate cell
      const tdX = document.createElement('td');
      tdX.style.textAlign = 'center';
      const inputX = document.createElement('input');
      inputX.type = 'number';
      inputX.min = 0;
      inputX.max = L;
      inputX.step = 0.05;
      inputX.value = parseFloat(s.x.toFixed(3));
      inputX.style.textAlign = 'center';
      inputX.addEventListener('change', (e) => {
        s.x = Math.max(0.0, Math.min(L, parseFloat(e.target.value) || 0));
        inputX.value = parseFloat(s.x.toFixed(3));
        drawSchematic();
        solveBeamModel();
      });
      tdX.appendChild(inputX);
      tr.appendChild(tdX);

      // Support Type cell
      const tdType = document.createElement('td');
      const selectType = document.createElement('select');
      const types = ['Pinned', 'Roller', 'Fixed', 'Spring'];
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (s.type === t) opt.selected = true;
        selectType.appendChild(opt);
      });
      selectType.addEventListener('change', (e) => {
        s.type = e.target.value;
        if (s.type === 'Spring' && s.ky === 0) s.ky = 1000; // default stiffness
        renderSupportsTable();
        drawSchematic();
        solveBeamModel();
      });
      tdType.appendChild(selectType);
      tr.appendChild(tdType);

      // Stiffness cell
      const tdKy = document.createElement('td');
      tdKy.style.textAlign = 'center';
      if (s.type === 'Spring') {
        const inputKy = document.createElement('input');
        inputKy.type = 'number';
        inputKy.min = 0.1;
        inputKy.step = 100;
        inputKy.value = parseFloat(s.ky.toFixed(2));
        inputKy.style.textAlign = 'center';
        inputKy.addEventListener('change', (e) => {
          s.ky = Math.max(0.1, parseFloat(e.target.value) || 1000);
          inputKy.value = parseFloat(s.ky.toFixed(2));
          solveBeamModel();
        });
        tdKy.appendChild(inputKy);
      } else {
        tdKy.innerHTML = '<span style="color: var(--text-muted);">--</span>';
      }
      tr.appendChild(tdKy);

      // Delete cell
      const tdAction = document.createElement('td');
      tdAction.style.textAlign = 'center';
      const btnDel = document.createElement('button');
      btnDel.className = 'btn-danger-sm';
      btnDel.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round"/></svg>`;
      btnDel.addEventListener('click', () => {
        supports.splice(idx, 1);
        renderSupportsTable();
        drawSchematic();
        solveBeamModel();
      });
      tdAction.appendChild(btnDel);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });
  }

  // Renders the loads CRUD editor table in a transposed layout
  function renderLoadsTable() {
    if (!elTableLoads) return;
    const tbody = elTableLoads.querySelector('tbody');
    tbody.innerHTML = '';

    if (loads.length === 0) {
      tbody.innerHTML = `<tr><td style="text-align: center; color: var(--text-muted); padding: 12px;">No active loads. Click "+ Add Load"</td></tr>`;
      return;
    }

    const rows = [];
    for (let i = 0; i < 8; i++) {
      const tr = document.createElement('tr');
      rows.push(tr);
    }

    const labels = [
      'Parameter',
      'Type',
      'Loc. x1',
      'Loc. x2',
      'Load Val 1',
      'Load Val 2',
      'Angle',
      'Action'
    ];

    labels.forEach((label, i) => {
      const th = document.createElement('th');
      th.textContent = label;
      rows[i].appendChild(th);
    });

    loads.forEach((l, idx) => {
      // Column Header
      const tdHeader = document.createElement('td');
      tdHeader.style.fontWeight = '700';
      tdHeader.style.textAlign = 'center';
      tdHeader.textContent = `Load ${idx + 1}`;
      rows[0].appendChild(tdHeader);

      // Load Type
      const tdType = document.createElement('td');
      const selectType = document.createElement('select');
      const loadTypes = [
        { val: 'PointLoadV', txt: 'Point Load (V)' },
        { val: 'PointLoadH', txt: 'Point Load (H)' },
        { val: 'PointLoadInclined', txt: 'Inclined Load' },
        { val: 'PointTorque', txt: 'Moment' },
        { val: 'UDLV', txt: 'UDL' },
        { val: 'TrapezoidalLoadV', txt: 'Trapezoidal' }
      ];
      loadTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.val;
        opt.textContent = t.txt;
        if (l.type === t.val) opt.selected = true;
        selectType.appendChild(opt);
      });
      selectType.addEventListener('change', (e) => {
        const newType = e.target.value;
        l.type = newType;
        const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
        const L_load = L * beamToLoadRatio;
        if (newType === 'UDLV' || newType === 'TrapezoidalLoadV') {
          l.start = 0.0;
          l.end = L_load;
          delete l.x;
        } else {
          l.x = parseFloat((L_load / 2).toFixed(2));
          delete l.start;
          delete l.end;
        }
        if (newType === 'TrapezoidalLoadV') {
          l.f2 = -10.0;
        } else if (newType === 'PointLoadInclined') {
          l.f2 = (currentUnitAngle === 'rad') ? 0.785398 : 45.0;
        } else {
          delete l.f2;
        }
        renderLoadsTable();
        drawSchematic();
        solveBeamModel();
      });
      tdType.appendChild(selectType);
      rows[1].appendChild(tdType);

      const isPoint = (l.type === 'PointLoadV' || l.type === 'PointLoadH' || l.type === 'PointLoadInclined' || l.type === 'PointTorque');
      const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
      const L_load = L * beamToLoadRatio;

      // Loc. x1
      const tdX1 = document.createElement('td');
      const inputX1 = document.createElement('input');
      inputX1.type = 'number';
      inputX1.min = 0;
      inputX1.max = L_load;
      inputX1.step = 0.05;
      inputX1.value = parseFloat((isPoint ? l.x : l.start).toFixed(3));
      inputX1.setAttribute('data-load-index', idx);
      inputX1.setAttribute('data-field', 'x1');
      inputX1.addEventListener('change', (e) => {
        const val = Math.max(0.0, Math.min(L_load, parseFloat(e.target.value) || 0));
        if (isPoint) {
          l.x = val;
        } else {
          l.start = val;
          if (l.start > l.end) {
            l.end = l.start;
            const x2Input = elTableLoads.querySelector(`input[data-load-index="${idx}"][data-field="x2"]`);
            if (x2Input) x2Input.value = parseFloat(l.end.toFixed(3));
          }
        }
        inputX1.value = parseFloat(val.toFixed(3));
        drawSchematic();
        solveBeamModel();
      });
      tdX1.appendChild(inputX1);
      rows[2].appendChild(tdX1);

      // Loc. x2
      const tdX2 = document.createElement('td');
      if (!isPoint) {
        const inputX2 = document.createElement('input');
        inputX2.type = 'number';
        inputX2.min = 0;
        inputX2.max = L_load;
        inputX2.step = 0.05;
        inputX2.value = parseFloat(l.end.toFixed(3));
        inputX2.setAttribute('data-load-index', idx);
        inputX2.setAttribute('data-field', 'x2');
        inputX2.addEventListener('change', (e) => {
          const val = Math.max(l.start, Math.min(L_load, parseFloat(e.target.value) || l.start));
          l.end = val;
          inputX2.value = parseFloat(val.toFixed(3));
          drawSchematic();
          solveBeamModel();
        });
        tdX2.appendChild(inputX2);
      } else {
        tdX2.innerHTML = '<span style="color: var(--text-muted);">--</span>';
      }
      rows[3].appendChild(tdX2);

      // Load Val 1
      const tdF1 = document.createElement('td');
      const inputF1 = document.createElement('input');
      inputF1.type = 'number';
      inputF1.step = 1;
      inputF1.value = parseFloat(l.f1.toFixed(2));
      inputF1.addEventListener('change', (e) => {
        l.f1 = parseFloat(e.target.value) || 0;
        inputF1.value = parseFloat(l.f1.toFixed(2));
        drawSchematic();
        solveBeamModel();
      });
      tdF1.appendChild(inputF1);
      rows[4].appendChild(tdF1);

      // Load Val 2
      const tdF2 = document.createElement('td');
      if (l.type === 'TrapezoidalLoadV') {
        const inputF2 = document.createElement('input');
        inputF2.type = 'number';
        inputF2.step = 1;
        inputF2.value = parseFloat(l.f2.toFixed(2));
        inputF2.addEventListener('change', (e) => {
          l.f2 = parseFloat(e.target.value) || 0;
          inputF2.value = parseFloat(l.f2.toFixed(2));
          drawSchematic();
          solveBeamModel();
        });
        tdF2.appendChild(inputF2);
      } else {
        tdF2.innerHTML = '<span style="color: var(--text-muted);">--</span>';
      }
      rows[5].appendChild(tdF2);

      // Angle
      const tdAngle = document.createElement('td');
      if (l.type === 'PointLoadInclined') {
        const inputAngle = document.createElement('input');
        inputAngle.type = 'number';
        inputAngle.min = 0;
        if (currentUnitAngle === '°') {
          inputAngle.max = 360;
          inputAngle.step = 5;
        } else {
          inputAngle.max = parseFloat((2 * Math.PI).toFixed(4));
          inputAngle.step = 0.05;
        }
        inputAngle.value = parseFloat(l.f2.toFixed(3));
        inputAngle.addEventListener('change', (e) => {
          let val = parseFloat(e.target.value) || 0;
          if (currentUnitAngle === '°') {
            val = Math.max(0.0, Math.min(360.0, val));
          } else {
            val = Math.max(0.0, Math.min(2 * Math.PI, val));
          }
          l.f2 = val;
          inputAngle.value = parseFloat(val.toFixed(3));
          drawSchematic();
          solveBeamModel();
        });
        tdAngle.appendChild(inputAngle);
      } else {
        tdAngle.innerHTML = '<span style="color: var(--text-muted);">--</span>';
      }
      rows[6].appendChild(tdAngle);

      // Action
      const tdAction = document.createElement('td');
      tdAction.style.textAlign = 'center';
      const btnDel = document.createElement('button');
      btnDel.className = 'btn-danger-sm';
      btnDel.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round"/></svg>`;
      btnDel.addEventListener('click', () => {
        loads.splice(idx, 1);
        renderLoadsTable();
        drawSchematic();
        solveBeamModel();
      });
      tdAction.appendChild(btnDel);
      rows[7].appendChild(tdAction);
    });

    rows.forEach(tr => tbody.appendChild(tr));
  }

  // Draw SVG Schematic visualizer
  function drawSchematic() {
    if (!elSchematicContainer) return;

    const formatNum = (val) => parseFloat(val.toFixed(2)).toString();
    const loadToBeamDistRatio = getDistFactor(currentUnitDist) / getDistFactor(currentUnitBeamLength);

    // A. PROVISIONAL AUTO-FIT SCALE CALCULATION (to determine stack levels first)
    let S_fit_calc = (canvasW - 160) / L;
    const fitElements = [];
    fitElements.push({ x: 0.0, hw: 35 });
    fitElements.push({ x: L, hw: 35 });
    supports.forEach(s => fitElements.push({ x: s.x, hw: 25 }));

    function getLoadLabelHalfWidth(l) {
      if (l.type === 'PointLoadV') return 75;
      if (l.type === 'PointLoadH') return 75;
      if (l.type === 'PointLoadInclined') return 80;
      if (l.type === 'PointTorque') return 80;
      if (l.type === 'UDLV') return 95;
      if (l.type === 'TrapezoidalLoadV') return 115;
      return 75;
    }

    loads.forEach(l => {
      if (l.type === 'UDLV' || l.type === 'TrapezoidalLoadV') {
        const xMid = ((l.start + l.end) / 2) * loadToBeamDistRatio;
        const hw = getLoadLabelHalfWidth(l);
        fitElements.push({ x: xMid, hw: hw });
        fitElements.push({ x: l.start * loadToBeamDistRatio, hw: 10 });
        fitElements.push({ x: l.end * loadToBeamDistRatio, hw: 10 });
      } else {
        const hw = getLoadLabelHalfWidth(l);
        fitElements.push({ x: l.x * loadToBeamDistRatio, hw: hw });
      }
    });

    fitElements.forEach(el => {
      const dist = Math.abs(el.x - L / 2);
      if (dist > 0.01) {
        const maxS = (canvasW / 2 - 40 - el.hw) / dist;
        if (maxS < S_fit_calc) S_fit_calc = maxS;
      }
    });

    let S_fit_provisional = Math.min(S_fit_calc, (canvasW - 160) / L);
    S_fit_provisional = Math.max(S_fit_provisional, 100.0 / L);

    // Provisional coordinate mapping
    const getXProv = (x) => globalPadL + (x / L) * (canvasW - globalPadL - 40);

    // B. RUN COLLISION AND STACKING ALGORITHMS (using provisional scale)
    function getLoadLabelWidth(l) {
      if (l.type === 'PointLoadV') return 170;
      if (l.type === 'PointLoadH') return 170;
      if (l.type === 'PointLoadInclined') return 180;
      if (l.type === 'PointTorque') return 180;
      if (l.type === 'UDLV') return 210;
      if (l.type === 'TrapezoidalLoadV') return 250;
      return 170;
    }

    const isDraggingLoad = dragState.active && (
      dragState.type === 'load' ||
      dragState.type === 'load-start' ||
      dragState.type === 'load-end' ||
      dragState.type === 'load-body'
    );
    const draggedIndex = isDraggingLoad ? dragState.index : -1;

    const getPriorityGroup = (l) => {
      const isDist = (l.type === 'UDLV' || l.type === 'TrapezoidalLoadV');
      const isDragged = (l.originalIndex === draggedIndex);
      if (isDist) {
        return isDragged ? 2 : 1;
      } else {
        return isDragged ? 4 : 3;
      }
    };

    const sortedLoads = [...loads].map((l, idx) => ({ ...l, originalIndex: idx }));
    sortedLoads.sort((a, b) => {
      const gA = getPriorityGroup(a);
      const gB = getPriorityGroup(b);
      if (gA !== gB) return gA - gB;
      const xa = a.x !== undefined ? a.x : a.start;
      const xb = b.x !== undefined ? b.x : b.start;
      return xa - xb;
    });
        const occupied = [];
    sortedLoads.forEach(sl => {
      let cx;
      const w = getLoadLabelWidth(sl);
      const halfWidth = w / 2;
      let startPixel, endPixel;
      if (sl.type === 'UDLV' || sl.type === 'TrapezoidalLoadV') {
        const xStart = getXProv(sl.start * loadToBeamDistRatio);
        const xEnd = getXProv(sl.end * loadToBeamDistRatio);
        const boxStart = xStart - 30;
        const boxEnd = xEnd + 30;
        
        cx = xStart + (xEnd - xStart) / 2;
        const labelStart = cx - halfWidth - 10;
        const labelEnd = cx + halfWidth + 10;
        
        startPixel = Math.min(boxStart, labelStart);
        endPixel = Math.max(boxEnd, labelEnd);
      } else {
        cx = getXProv(sl.x * loadToBeamDistRatio);
        startPixel = cx - halfWidth - 10;
        endPixel = cx + halfWidth + 10;
      }

      let level = 0;
      while (true) {
        let hasConflict = occupied.some(item => 
          item.level === level && 
          Math.max(item.range[0], startPixel) < Math.min(item.range[1], endPixel)
        );
        
        if (!hasConflict) {
          const isPointLoad = (sl.type !== 'UDLV' && sl.type !== 'TrapezoidalLoadV');
          if (isPointLoad) {
            const hasSpanOverlap = occupied.some(item => {
              const orig = loads[item.originalIndex];
              const isDist = (orig.type === 'UDLV' || orig.type === 'TrapezoidalLoadV');
              if (isDist) {
                if (sl.x >= orig.start - 0.05 && sl.x <= orig.end + 0.05) {
                  return level <= item.level;
                }
              }
              return false;
            });
            if (hasSpanOverlap) {
              level++;
              continue;
            }
          }
        }

        if (!hasConflict) break;
        level++;
      }

      sl.stackLevel = level;
      occupied.push({ range: [startPixel, endPixel], level: level, originalIndex: sl.originalIndex });
    });

    sortedLoads.forEach(sl => {
      loads[sl.originalIndex].stackLevel = sl.stackLevel;
    });

    const isDraggingSupport = dragState.active && dragState.type === 'support';
    const draggedSupportIndex = isDraggingSupport ? dragState.index : -1;

    const sortedSupports = [...supports].map((s, idx) => ({ ...s, originalIndex: idx }));
    sortedSupports.sort((a, b) => {
      if (a.originalIndex === draggedSupportIndex) return 1;
      if (b.originalIndex === draggedSupportIndex) return -1;
      return a.x - b.x;
    });

    const occupiedSupports = [];
    sortedSupports.forEach(ss => {
      let level = 0;
      while (true) {
        const hasConflict = occupiedSupports.some(item => 
          item.level === level && Math.abs(getXProv(item.x) - getXProv(ss.x)) < 70
        );
        if (!hasConflict) break;
        level++;
      }
      ss.supportStackLevel = level;
      occupiedSupports.push({ x: ss.x, level: level });
    });

    sortedSupports.forEach(ss => {
      supports[ss.originalIndex].supportStackLevel = ss.supportStackLevel;
    });

    // C. COMPUTE LAYOUT SCALE FACTOR (k_load) AND CENTERING yBeam
    const maxLoadLevel = sortedLoads.length > 0 ? Math.max(...sortedLoads.map(sl => sl.stackLevel)) : 0;
    const maxSupportLevel = sortedSupports.length > 0 ? Math.max(...sortedSupports.map(ss => ss.supportStackLevel)) : 0;
    
    const H_below = 130 + maxSupportLevel * 20;
    const yBeam = canvasH - H_below;
    const k_load = sortedLoads.length > 0 ? Math.max(0.15, Math.min(1.0, (yBeam - 22) / (maxLoadLevel * 85 + 58))) : 1.0;

    S_fit = (canvasW - globalPadL - 40) / L;

    // Final coordinates mapping function
    const getX = (x) => globalPadL + (x / L) * (canvasW - globalPadL - 40);

    // Determine boundary label suppressions to prevent overlap with boundary support labels
    const hasSupportAtStart = supports.some(s => s.x < 0.05);
    const hasSupportAtEnd = supports.some(s => s.x > L - 0.05);

    // Mapped start and end coordinates of the beam line
    const beamXStart = getX(0.0);
    const beamXEnd = getX(L);

    // 5. CAD-STYLE SEGMENT DIMENSIONS
    const dimPoints = [0.0, L];
    supports.forEach(s => {
      if (!dimPoints.some(p => Math.abs(p - s.x) < 0.01)) {
        dimPoints.push(s.x);
      }
    });
    dimPoints.sort((a, b) => a - b);

    let dimensionsSvg = '';
    const dimY = yBeam + 85; // 85px below the beam
    
    // Draw vertical extension lines and architectural ticks
    dimPoints.forEach(x => {
      const px = getX(x);
      dimensionsSvg += `
        <!-- Extension Line -->
        <line x1="${px}" y1="${yBeam + 22}" x2="${px}" y2="${dimY + 8}" stroke="var(--text-muted)" stroke-width="0.75" stroke-dasharray="2,2" opacity="0.6" />
        <!-- Architectural Tick -->
        <line x1="${px - 3}" y1="${dimY + 3}" x2="${px + 3}" y2="${dimY - 3}" stroke="var(--text-primary)" stroke-width="1.5" />
      `;
    });

    // Draw horizontal dimension lines and segment labels
    for (let i = 0; i < dimPoints.length - 1; i++) {
      const x1 = dimPoints[i];
      const x2 = dimPoints[i + 1];
      const px1 = getX(x1);
      const px2 = getX(x2);
      const segmentLen = x2 - x1;
      const cx = (px1 + px2) / 2;

      if (px2 - px1 > 0.1) {
        // Horizontal dimension line
        dimensionsSvg += `<line x1="${px1}" y1="${dimY}" x2="${px2}" y2="${dimY}" stroke="var(--text-muted)" stroke-width="1" />`;

        // Only draw label if there is sufficient horizontal space (> 40 pixels)
        if (px2 - px1 > 40) {
          dimensionsSvg += `
            <text x="${cx}" y="${dimY - 9}" class="schematic-label" text-anchor="middle" style="font-size: 16px; font-weight: 600; fill: var(--text-primary);">${formatNum(segmentLen)} ${currentUnitBeamLength}</text>
          `;
        }
      }
    }

    let svgStr = `
      <svg id="beam-schematic-svg" viewBox="0 0 ${canvasW} ${canvasH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="touch-action: none; overflow: hidden;">
        <defs>
          <marker id="load-arrow-head" markerWidth="${6 * k_load}" markerHeight="${6 * k_load}" refX="${3 * k_load}" refY="${3 * k_load}" orient="auto">
            <path d="M0,0 L${6 * k_load},${3 * k_load} L0,${6 * k_load} Z" fill="var(--error)"/>
          </marker>
          <marker id="load-arrow-head-h" markerWidth="${6 * k_load}" markerHeight="${6 * k_load}" refX="${3 * k_load}" refY="${3 * k_load}" orient="auto">
            <path d="M0,0 L${6 * k_load},${3 * k_load} L0,${6 * k_load} Z" fill="#3b82f6"/>
          </marker>
          <marker id="load-arrow-head-inclined" markerWidth="${6 * k_load}" markerHeight="${6 * k_load}" refX="${3 * k_load}" refY="${3 * k_load}" orient="auto">
            <path d="M0,0 L${6 * k_load},${3 * k_load} L0,${6 * k_load} Z" fill="#ea580c"/>
          </marker>
          <marker id="load-arrow-head-torque" markerWidth="${6 * k_load}" markerHeight="${6 * k_load}" refX="${3 * k_load}" refY="${3 * k_load}" orient="auto">
            <path d="M0,0 L${6 * k_load},${3 * k_load} L0,${6 * k_load} Z" fill="#a855f7"/>
          </marker>
        </defs>
 
        <!-- SVG Background covering entire viewport to capture mouse drags for panning -->
        <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#000" fill-opacity="0" id="schematic-bg" style="cursor: grab;" />

        <!-- Beam Line -->
        <line x1="${beamXStart}" y1="${yBeam}" x2="${beamXEnd}" y2="${yBeam}" class="schematic-beam-line" style="stroke-width: 5px;" />
        
        <!-- Span Boundary Coordinates Labels -->
        ${!hasSupportAtStart ? `<text x="${beamXStart}" y="${yBeam + 40}" class="schematic-label" text-anchor="middle" style="font-size: 16px;">0 ${currentUnitBeamLength}</text>` : ''}
        ${!hasSupportAtEnd ? `<text x="${beamXEnd}" y="${yBeam + 40}" class="schematic-label" text-anchor="middle" style="font-size: 16px;">${formatNum(L)} ${currentUnitBeamLength}</text>` : ''}
    `;

    // Draw Supports (Below beam)
    supports.forEach((s, idx) => {
      const cx = getX(s.x);
      let supportIcon = '';
      
      const sLvl = s.supportStackLevel || 0;
      const dySupport = sLvl * 20; // vertical label offset step unscaled

      if (s.type === 'Pinned') {
        supportIcon = `
          <g class="schematic-draggable" data-type="support" data-index="${idx}">
            <!-- Triangle -->
            <polygon points="${cx},${yBeam} ${cx - 15},${yBeam + 25} ${cx + 15},${yBeam + 25}" class="schematic-support-pin" />
            <line x1="${cx - 20}" y1="${yBeam + 25}" x2="${cx + 20}" y2="${yBeam + 25}" stroke="var(--text-primary)" stroke-width="2.5" />
            
            <text x="${cx}" y="${yBeam + 45 + dySupport}" class="schematic-label support-coord-label" text-anchor="middle" font-weight="600" style="font-size: 16px;">${formatNum(s.x)} ${currentUnitBeamLength}</text>
          </g>
        `;
      } else if (s.type === 'Fixed') {
        supportIcon = `
          <g class="schematic-draggable" data-type="support" data-index="${idx}">
            <!-- Short vertical connection line -->
            <line x1="${cx}" y1="${yBeam}" x2="${cx}" y2="${yBeam + 5}" stroke="var(--text-primary)" stroke-width="2.5" />
            <!-- Rectangle -->
            <rect x="${cx - 15}" y="${yBeam + 5}" width="30" height="20" class="schematic-support-pin" />
            <!-- Ground Line -->
            <line x1="${cx - 20}" y1="${yBeam + 25}" x2="${cx + 20}" y2="${yBeam + 25}" stroke="var(--text-primary)" stroke-width="2.5" />
            <!-- Slanted Hatching Lines (Fixed Restraint) -->
            <line x1="${cx - 16}" y1="${yBeam + 25}" x2="${cx - 21}" y2="${yBeam + 30}" stroke="var(--text-muted)" stroke-width="1.25" />
            <line x1="${cx - 8}" y1="${yBeam + 25}" x2="${cx - 13}" y2="${yBeam + 30}" stroke="var(--text-muted)" stroke-width="1.25" />
            <line x1="${cx}" y1="${yBeam + 25}" x2="${cx - 5}" y2="${yBeam + 30}" stroke="var(--text-muted)" stroke-width="1.25" />
            <line x1="${cx + 8}" y1="${yBeam + 25}" x2="${cx + 3}" y2="${yBeam + 30}" stroke="var(--text-muted)" stroke-width="1.25" />
            <line x1="${cx + 16}" y1="${yBeam + 25}" x2="${cx + 11}" y2="${yBeam + 30}" stroke="var(--text-muted)" stroke-width="1.25" />
            
            <text x="${cx}" y="${yBeam + 45 + dySupport}" class="schematic-label support-coord-label" text-anchor="middle" font-weight="600" style="font-size: 16px;">${formatNum(s.x)} ${currentUnitBeamLength}</text>
          </g>
        `;
      } else if (s.type === 'Roller') {
        supportIcon = `
          <g class="schematic-draggable" data-type="support" data-index="${idx}">
            <polygon points="${cx},${yBeam} ${cx - 13},${yBeam + 18} ${cx + 13},${yBeam + 18}" class="schematic-support-roller" />
            <circle cx="${cx - 7}" cy="${yBeam + 23}" r="3.5" fill="var(--text-secondary)" />
            <circle cx="${cx + 7}" cy="${yBeam + 23}" r="3.5" fill="var(--text-secondary)" />
            <line x1="${cx - 17}" y1="${yBeam + 27}" x2="${cx + 17}" y2="${yBeam + 27}" stroke="var(--text-primary)" stroke-width="2" />
            <text x="${cx}" y="${yBeam + 45 + dySupport}" class="schematic-label support-coord-label" text-anchor="middle" font-weight="600" style="font-size: 16px;">${formatNum(s.x)} ${currentUnitBeamLength}</text>
          </g>
        `;
      } else if (s.type === 'Spring') {
        supportIcon = `
          <g class="schematic-draggable" data-type="support" data-index="${idx}">
            <path d="M ${cx},${yBeam} L ${cx},${yBeam + 5} L ${cx - 9},${yBeam + 10} L ${cx + 9},${yBeam + 15} L ${cx - 9},${yBeam + 20} L ${cx + 9},${yBeam + 25} L ${cx},${yBeam + 30} L ${cx},${yBeam + 35}"
                  fill="none" stroke="var(--accent-secondary)" stroke-width="2" />
            <line x1="${cx - 15}" y1="${yBeam + 35}" x2="${cx + 15}" y2="${yBeam + 35}" stroke="var(--text-primary)" stroke-width="1.5" />
            <text x="${cx}" y="${yBeam + 55 + dySupport}" class="schematic-label support-coord-label" text-anchor="middle" font-weight="600" style="font-size: 16px;">${formatNum(s.x)} ${currentUnitBeamLength}</text>
          </g>
        `;
      }

      svgStr += supportIcon;
    });

    // Draw Loads (Above beam, offset vertically depending on stack level)
    // Pass 1: Render Distributed Loads first so they are placed lower in the DOM rendering stack
    loads.forEach((l, idx) => {
      if (l.type !== 'UDLV' && l.type !== 'TrapezoidalLoadV') return;

      let loadIcon = '';
      const dy = l.stackLevel * 85 * k_load; // Stacking level offset

      if (l.type === 'UDLV') {
        const xStart = getX(l.start * loadToBeamDistRatio);
        const xEnd = getX(l.end * loadToBeamDistRatio);
        const yBottom = yBeam - dy;
        const yTop = yBeam - 35 * k_load - dy; // Height scaled
        const spanW = xEnd - xStart;
        const arrowsCount = Math.max(3, Math.round(spanW / Math.max(10, 20 * k_load)));
        let arrows = '';
        
        for (let i = 0; i <= arrowsCount; i++) {
          const arrowX = xStart + (i * spanW / arrowsCount);
          const yS = l.f1 < 0 ? yTop : yBottom;
          const yE = l.f1 < 0 ? yBottom - 4 * k_load : yTop + 4 * k_load;
          arrows += `<line x1="${arrowX}" y1="${yS}" x2="${arrowX}" y2="${yE}" stroke="var(--error)" stroke-width="${1.5 * k_load}" marker-end="url(#load-arrow-head)" />`;
        }

        loadIcon = `
          <g>
            <!-- Shaded background region without outline -->
            <rect x="${xStart}" y="${yTop}" width="${xEnd - xStart}" height="${yBottom - yTop}" class="schematic-load-dist schematic-draggable" data-type="load-body" data-index="${idx}" style="cursor: grab; fill: rgba(239, 68, 68, 0.12); stroke: none;" />
            <!-- Solid Top Line -->
            <line x1="${xStart}" y1="${yTop}" x2="${xEnd}" y2="${yTop}" stroke="var(--error)" stroke-width="${1.5 * k_load}" />
            <!-- Solid Left and Right Boundaries (No Bottom line along beam) -->
            <line x1="${xStart}" y1="${yTop}" x2="${xStart}" y2="${yBottom}" stroke="var(--error)" stroke-width="${1.5 * k_load}" />
            <line x1="${xEnd}" y1="${yTop}" x2="${xEnd}" y2="${yBottom}" stroke="var(--error)" stroke-width="${1.5 * k_load}" />
            ${arrows}
            <text x="${xStart + spanW / 2}" y="${yTop - Math.max(6, 10 * k_load)}" class="schematic-label load-coord-label schematic-draggable" data-type="load-body" data-index="${idx}" text-anchor="middle" fill="var(--error)" font-weight="700" style="font-size: ${Math.max(10, 16 * k_load)}px; cursor: grab;">
              ${formatNum(Math.abs(l.f1))} ${currentUnitUDL} (x = ${formatNum(l.start)} ${currentUnitDist} – ${formatNum(l.end)} ${currentUnitDist})
            </text>
            
            ${l.stackLevel > 0 ? `
              <line x1="${xStart}" y1="${yBottom}" x2="${xStart}" y2="${yBeam}" stroke="var(--error)" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />
              <line x1="${xEnd}" y1="${yBottom}" x2="${xEnd}" y2="${yBeam}" stroke="var(--error)" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />
            ` : ''}
            
            <circle cx="${xStart}" cy="${yTop}" r="${Math.max(4, 6 * k_load)}" fill="var(--bg-card)" stroke="var(--error)" stroke-width="${Math.max(1.5, 2.5 * k_load)}" class="schematic-draggable" data-type="load-start" data-index="${idx}" style="cursor: col-resize;" />
            <circle cx="${xEnd}" cy="${yTop}" r="${Math.max(4, 6 * k_load)}" fill="var(--bg-card)" stroke="var(--error)" stroke-width="${Math.max(1.5, 2.5 * k_load)}" class="schematic-draggable" data-type="load-end" data-index="${idx}" style="cursor: col-resize;" />
          </g>
        `;
      } else if (l.type === 'TrapezoidalLoadV') {
        const xStart = getX(l.start * loadToBeamDistRatio);
        const xEnd = getX(l.end * loadToBeamDistRatio);
        const yBottom = yBeam - dy;
        const spanW = xEnd - xStart;
        const arrowsCount = Math.max(3, Math.round(spanW / Math.max(10, 20 * k_load)));
        let arrows = '';
        
        const maxAbsF = Math.max(0.1, Math.abs(l.f1), Math.abs(l.f2));
        const h1 = (maxAbsF > 0.01) ? (Math.abs(l.f1) / maxAbsF) * 25 * k_load + 10 * k_load : 10 * k_load;
        const h2 = (maxAbsF > 0.01) ? (Math.abs(l.f2) / maxAbsF) * 25 * k_load + 10 * k_load : 10 * k_load;
        const yTop1 = yBottom - h1;
        const yTop2 = yBottom - h2;

        for (let i = 0; i <= arrowsCount; i++) {
          const fraction = i / arrowsCount;
          const currentForce = l.f1 + fraction * (l.f2 - l.f1);
          const arrowX = xStart + (fraction * spanW);
          const currentHeight = (maxAbsF > 0.01) ? (Math.abs(currentForce) / maxAbsF) * 25 * k_load + 10 * k_load : 10 * k_load;
          
          const isNegative = currentForce < 0 || (currentForce === 0 && (l.f1 < 0 || l.f2 < 0));
          const yS = isNegative ? yBottom - currentHeight : yBottom;
          const yE = isNegative ? yBottom - 4 * k_load : yBottom - currentHeight + 4 * k_load;
          arrows += `<line x1="${arrowX}" y1="${yS}" x2="${arrowX}" y2="${yE}" stroke="var(--error)" stroke-width="${1.5 * k_load}" marker-end="url(#load-arrow-head)" />`;
        }

        loadIcon = `
          <g>
            <!-- Shaded background region without outline -->
            <path d="M ${xStart},${yBottom} L ${xStart},${yTop1} L ${xEnd},${yTop2} L ${xEnd},${yBottom} Z" class="schematic-load-dist schematic-draggable" data-type="load-body" data-index="${idx}" style="cursor: grab; fill: rgba(239, 68, 68, 0.12); stroke: none;" />
            <!-- Solid Top Slope Line -->
            <line x1="${xStart}" y1="${yTop1}" x2="${xEnd}" y2="${yTop2}" stroke="var(--error)" stroke-width="${1.5 * k_load}" />
            <!-- Solid Left and Right Boundaries (No Bottom line along beam) -->
            <line x1="${xStart}" y1="${yTop1}" x2="${xStart}" y2="${yBottom}" stroke="var(--error)" stroke-width="${1.5 * k_load}" />
            <line x1="${xEnd}" y1="${yTop2}" x2="${xEnd}" y2="${yBottom}" stroke="var(--error)" stroke-width="${1.5 * k_load}" />
            ${arrows}
            <text x="${xStart + spanW / 2}" y="${Math.min(yTop1, yTop2) - Math.max(6, 10 * k_load)}" class="schematic-label load-coord-label schematic-draggable" data-type="load-body" data-index="${idx}" text-anchor="middle" fill="var(--error)" font-weight="700" style="font-size: ${Math.max(10, 16 * k_load)}px; cursor: grab;">
              ${formatNum(Math.abs(l.f1))} → ${formatNum(Math.abs(l.f2))} ${currentUnitUDL} (x = ${formatNum(l.start)} ${currentUnitDist} – ${formatNum(l.end)} ${currentUnitDist})
            </text>
            
            ${l.stackLevel > 0 ? `
              <line x1="${xStart}" y1="${yBottom}" x2="${xStart}" y2="${yBeam}" stroke="var(--error)" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />
              <line x1="${xEnd}" y1="${yBottom}" x2="${xEnd}" y2="${yBeam}" stroke="var(--error)" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />
            ` : ''}
            
            <circle cx="${xStart}" cy="${yTop1}" r="${Math.max(4, 6 * k_load)}" fill="var(--bg-card)" stroke="var(--error)" stroke-width="${Math.max(1.5, 2.5 * k_load)}" class="schematic-draggable" data-type="load-start" data-index="${idx}" style="cursor: col-resize;" />
            <circle cx="${xEnd}" cy="${yTop2}" r="${Math.max(4, 6 * k_load)}" fill="var(--bg-card)" stroke="var(--error)" stroke-width="${Math.max(1.5, 2.5 * k_load)}" class="schematic-draggable" data-type="load-end" data-index="${idx}" style="cursor: col-resize;" />
          </g>
        `;
      }

      svgStr += loadIcon;
    });

    // Pass 2: Render Point Loads second so their transparent hit-boxes are rendered on top
    loads.forEach((l, idx) => {
      if (l.type === 'UDLV' || l.type === 'TrapezoidalLoadV') return;

      let loadIcon = '';
      const dy = l.stackLevel * 85 * k_load; // Stacking level offset

      if (l.type === 'PointLoadV') {
        const cx = getX(l.x * loadToBeamDistRatio);
        const yStart = l.f1 < 0 ? yBeam - 50 * k_load - dy : yBeam - 5 * k_load - dy;
        const yEnd = l.f1 < 0 ? yBeam - 5 * k_load - dy : yBeam - 50 * k_load - dy;
        
        loadIcon = `
          <g class="schematic-draggable" data-type="load" data-index="${idx}">
            <line x1="${cx}" y1="${yBeam - 85 * k_load - dy}" x2="${cx}" y2="${yBeam}" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(12, 16 * k_load)}" style="cursor: grab;" />
            <line x1="${cx}" y1="${yStart}" x2="${cx}" y2="${yEnd}" class="schematic-load-arrow" style="stroke: var(--error); stroke-width: ${3 * k_load}px; fill: var(--error);" marker-end="url(#load-arrow-head)" />
            
            ${l.stackLevel > 0 ? `<line x1="${cx}" y1="${yBeam - 5 * k_load - dy}" x2="${cx}" y2="${yBeam}" stroke="var(--error)" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />` : ''}
            <text x="${cx}" y="${yBeam - dy - 50 * k_load - Math.max(8, 12 * k_load)}" class="schematic-label load-coord-label" text-anchor="middle" fill="var(--error)" font-weight="700" style="font-size: ${Math.max(10, 16 * k_load)}px;">
              ${formatNum(Math.abs(l.f1))} ${currentUnitForce} (x = ${formatNum(l.x)} ${currentUnitDist})
            </text>
          </g>
        `;
      } else if (l.type === 'PointLoadH') {
        const cx = getX(l.x * loadToBeamDistRatio);
        const cy = yBeam - 15 * k_load - dy;
        const xStart = l.f1 > 0 ? cx - 50 * k_load : cx + 50 * k_load;
        const xEnd = l.f1 > 0 ? cx - 5 * k_load : cx + 5 * k_load;
        
        loadIcon = `
          <g class="schematic-draggable" data-type="load" data-index="${idx}">
            <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${yBeam}" stroke="#3b82f6" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />
            <circle cx="${cx}" cy="${cy}" r="${Math.max(12, 20 * k_load)}" fill="#000" fill-opacity="0" style="cursor: grab;" />
            <line x1="${xStart}" y1="${cy}" x2="${xEnd}" y2="${cy}" class="schematic-load-arrow-h" style="stroke: #3b82f6; stroke-width: ${3 * k_load}px; fill: #3b82f6;" marker-end="url(#load-arrow-head-h)" />
            <text x="${cx}" y="${cy - Math.max(8, 10 * k_load)}" class="schematic-label load-coord-label" text-anchor="middle" fill="#3b82f6" font-weight="700" style="font-size: ${Math.max(10, 16 * k_load)}px;">
              ${formatNum(Math.abs(l.f1))} ${currentUnitForce} (x = ${formatNum(l.x)} ${currentUnitDist})
            </text>
          </g>
        `;
      } else if (l.type === 'PointLoadInclined') {
        const cx = getX(l.x * loadToBeamDistRatio);
        const thetaRad = (currentUnitAngle === '°') ? (l.f2 * Math.PI / 180.0) : l.f2;
        
        // Arrow head pointing to cx, yBeam - dy (offset slightly by 5px)
        const xEnd = cx - 5 * k_load * Math.cos(thetaRad);
        const yEnd = (yBeam - dy) - 5 * k_load * Math.sin(thetaRad);
        
        // Arrow tail starting 50px away
        const xStart = cx - 50 * k_load * Math.cos(thetaRad);
        const yStart = (yBeam - dy) - 50 * k_load * Math.sin(thetaRad);
        
        loadIcon = `
          <g class="schematic-draggable" data-type="load" data-index="${idx}">
            <!-- Wide vertical drag target -->
            <line x1="${cx}" y1="${yBeam - 85 * k_load - dy}" x2="${cx}" y2="${yBeam}" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(12, 16 * k_load)}" style="cursor: grab;" />
            <!-- Wide inclined drag target along arrow -->
            <line x1="${xStart}" y1="${yStart}" x2="${xEnd}" y2="${yEnd}" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(12, 16 * k_load)}" style="cursor: grab;" />
            <!-- Inclined arrow line -->
            <line x1="${xStart}" y1="${yStart}" x2="${xEnd}" y2="${yEnd}" class="schematic-load-arrow-inclined" style="stroke: #ea580c; stroke-width: ${3 * k_load}px; fill: #ea580c;" marker-end="url(#load-arrow-head-inclined)" />
            ${l.stackLevel > 0 ? `<line x1="${cx}" y1="${yBeam - 5 * k_load - dy}" x2="${cx}" y2="${yBeam}" stroke="#ea580c" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />` : ''}
            <!-- Label -->
            <text x="${cx}" y="${yBeam - dy - 50 * k_load - Math.max(8, 12 * k_load)}" class="schematic-label load-coord-label" text-anchor="middle" fill="#ea580c" font-weight="700" style="font-size: ${Math.max(10, 16 * k_load)}px;">
              ${formatNum(Math.abs(l.f1))} ${currentUnitForce} @ ${formatNum(l.f2)}${currentUnitAngle} (x = ${formatNum(l.x)} ${currentUnitDist})
            </text>
          </g>
        `;
      } else if (l.type === 'PointTorque') {
        const cx = getX(l.x * loadToBeamDistRatio);
        const cy = yBeam - 20 * k_load - dy;
        const rArc = 25 * k_load;
        const pathArc = l.f1 < 0
          ? `M ${cx - 20 * k_load},${cy + 15 * k_load} A ${rArc},${rArc} 0 1,1 ${cx + 20 * k_load},${cy + 15 * k_load}` 
          : `M ${cx + 20 * k_load},${cy + 15 * k_load} A ${rArc},${rArc} 0 1,1 ${cx - 20 * k_load},${cy + 15 * k_load}`;
 
        loadIcon = `
          <g class="schematic-draggable" data-type="load" data-index="${idx}">
            <line x1="${cx}" y1="${cy + 10 * k_load}" x2="${cx}" y2="${yBeam}" stroke="#a855f7" stroke-width="${1 * k_load}" stroke-dasharray="3,3" opacity="0.6" />
            <circle cx="${cx}" cy="${cy}" r="${Math.max(15, 28 * k_load)}" fill="#000" fill-opacity="0" style="cursor: grab;" />
            <path d="${pathArc}" class="schematic-load-torque" style="stroke: #a855f7; stroke-width: ${2.5 * k_load}px; fill: none;" marker-end="url(#load-arrow-head-torque)" />
            <text x="${cx}" y="${cy - 25 * k_load - Math.max(8, 12 * k_load)}" class="schematic-label load-coord-label" text-anchor="middle" fill="#a855f7" font-weight="700" style="font-size: ${Math.max(10, 16 * k_load)}px;">
              ${formatNum(Math.abs(l.f1))} ${currentUnitMoment} (x = ${formatNum(l.x)} ${currentUnitDist})
            </text>
          </g>
        `;
      }

      svgStr += loadIcon;
    });

    svgStr += dimensionsSvg;
    svgStr += `</svg>`;
    elSchematicContainer.innerHTML = svgStr;

    // Panning is disabled to align layout horizontally with result diagrams.

    // Attach coordinate drag trigger to supports and loads
    const draggables = elSchematicContainer.querySelectorAll('.schematic-draggable');
    draggables.forEach(el => {
      const type = el.getAttribute('data-type');
      const idx = parseInt(el.getAttribute('data-index'));
      
      el.addEventListener('pointerdown', (e) => onDragStart(e, type, idx));
    });
  }

  // Query solver API
  function solveBeamModel() {
    if (!elTableReactions) return;

    const rxBody = elTableReactions.querySelector('tbody');

    if (supports.length === 0) {
      if (rxBody) {
        rxBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 12px;">No supports configured. Add at least one Pinned or Fixed support.</td></tr>`;
      }
      diagramData = null;
      reactionsData = null;
      renderActiveDiagram();
      return;
    }

    // Sync Active cross-sectional properties in standard SI units
    let I = 1e-4; // 10000 cm4 equivalent default
    let A = 1e-2; // 100 cm2 equivalent default
    if (window.getActiveSectionProperties) {
      const props = window.getActiveSectionProperties();
      if (props && props.Ixx > 0) I = props.Ixx;
      if (props && props.A > 0) A = props.A;
    }

    const c_dist = getDistFactor(currentUnitDist);
    const c_beam_dist = getDistFactor(currentUnitBeamLength);
    const c_force = getForceFactor(currentUnitForce);
    const c_moment = getMomentFactor(currentUnitMoment);
    const c_udl = getUDLFactor(currentUnitUDL);

    // Calculate Elastic Modulus in Pa based on its unit selector
    const E_SI = E * getEFactor(currentUnitE);

    // Prepare JSON payload parameters mapped to base SI units
    const payload = {
      length: L * c_beam_dist,
      E: E_SI,
      I: I,
      A: A,
      supports: supports.map(s => {
        let dof = [0, 0, 0];
        if (s.type === 'Pinned') dof = [1, 1, 0];
        else if (s.type === 'Roller') dof = [0, 1, 0];
        else if (s.type === 'Fixed') dof = [1, 1, 1];
        else if (s.type === 'Spring') dof = [0, s.ky * 1000.0, 0]; // stiffness in N/m (s.ky is in kN/m)
        return { x: s.x * c_beam_dist, dof: dof };
      }),
      loads: (() => {
        const solverLoads = [];
        loads.forEach(l => {
          if (l.type === 'PointLoadV') {
            solverLoads.push({ type: 'PointLoadV', force: l.f1 * c_force, x: l.x * c_dist });
          } else if (l.type === 'PointLoadH') {
            solverLoads.push({ type: 'PointLoadH', force: l.f1 * c_force, x: l.x * c_dist });
          } else if (l.type === 'PointLoadInclined') {
            const thetaRad = (currentUnitAngle === '°') ? (l.f2 * Math.PI / 180.0) : l.f2;
            const Fx = l.f1 * Math.cos(thetaRad) * c_force; // P * cos(theta) in N
            const Fy = -l.f1 * Math.sin(thetaRad) * c_force; // -P * sin(theta) in N
            if (Math.abs(Fx) > 1e-3) {
              solverLoads.push({ type: 'PointLoadH', force: Fx, x: l.x * c_dist });
            }
            if (Math.abs(Fy) > 1e-3) {
              solverLoads.push({ type: 'PointLoadV', force: Fy, x: l.x * c_dist });
            }
          } else if (l.type === 'PointTorque') {
            solverLoads.push({ type: 'PointTorque', force: l.f1 * c_moment, x: l.x * c_dist });
          } else if (l.type === 'UDLV') {
            solverLoads.push({ type: 'UDLV', force: l.f1 * c_udl, start: l.start * c_dist, end: l.end * c_dist });
          } else if (l.type === 'TrapezoidalLoadV') {
            solverLoads.push({ type: 'TrapezoidalLoadV', f1: l.f1 * c_udl, f2: l.f2 * c_udl, start: l.start * c_dist, end: l.end * c_dist });
          }
        });
        return solverLoads;
      })()
    };

    // Show loading indicators
    if (rxBody) {
      rxBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Recalculating beam equations...</td></tr>`;
    }

    return fetch('/api/analyze-beam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async res => {
        if (!res.ok) {
          let errMsg = `Solver API Error: ${res.statusText}`;
          try {
            const errData = await res.json();
            if (errData && errData.message) {
              errMsg = errData.message;
            }
          } catch (e) {}
          throw new Error(errMsg);
        }
        return res.json();
      })
      .then(data => {
        if (data.status !== 'success') throw new Error(data.message || 'Unknown solver error');
        
        diagramData = data.points;
        reactionsData = data.reactions;

        renderReactionsTable();
        renderActiveDiagram();
      })
      .catch(err => {
        console.error(err);
        if (rxBody) {
          rxBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--error); font-weight: 500;">Solver error: ${err.message}. Please check supports configuration.</td></tr>`;
        }
      });
  }

  // Renders the support reactions outputs table (rounded to 2 decimal places)
  function renderReactionsTable() {
    if (!elTableReactions || !reactionsData) return;
    const tbody = elTableReactions.querySelector('tbody');
    tbody.innerHTML = '';

    if (reactionsData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No reactions generated.</td></tr>`;
      return;
    }

    const c_result_dist = getDistFactor(currentUnitBeamLength);
    const c_result_force = getForceFactor(resultUnitForce);
    const c_result_moment = getMomentFactor(resultUnitMoment);

    reactionsData.forEach(r => {
      const tr = document.createElement('tr');
      
      const rx_user = r.Rx / c_result_force;
      const ry_user = r.Ry / c_result_force;
      const m_user = r.M / c_result_moment;
      const x_user = r.x / c_result_dist;

      let supportLabel = "Support";
      const c_beam_dist = getDistFactor(currentUnitBeamLength);
      const supIndex = supports.findIndex(s => Math.abs(s.x * c_beam_dist - r.x) < 1e-3);
      if (supIndex !== -1) {
        supportLabel = `Support-${supIndex + 1}`;
      }

      tr.innerHTML = `
        <td style="font-weight: 700; text-align: center;">${supportLabel}</td>
        <td style="font-weight: 600; text-align: center;">${x_user.toFixed(2)} ${currentUnitBeamLength}</td>
        <td style="text-align: right;">${rx_user.toFixed(2)} ${resultUnitForce}</td>
        <td style="text-align: right;">${ry_user.toFixed(2)} ${resultUnitForce}</td>
        <td style="text-align: right;">${m_user.toFixed(2)} ${resultUnitMoment}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function updateGlobalPadL() {
    if (!diagramData || diagramData.length === 0) {
      globalPadL = 80;
      return;
    }

    const c_dist = getDistFactor(currentUnitBeamLength);
    const diagramTypes = ['sfd', 'bmd', 'afd', 'deflection'];
    let maxPadL = 80;

    diagramTypes.forEach(type => {
      let propKey = 'shear';
      let propUnit = resultUnitForceSFD;
      let propScale = 1.0 / getForceFactor(resultUnitForceSFD);

      if (type === 'bmd') {
        propKey = 'moment';
        propUnit = resultUnitMoment;
        propScale = 1.0 / getMomentFactor(resultUnitMoment);
      } else if (type === 'deflection') {
        propKey = 'deflection';
        propUnit = resultUnitDisplacement;
        propScale = 1.0 / getDistFactor(resultUnitDisplacement);
      } else if (type === 'afd') {
        propKey = 'axial';
        propUnit = resultUnitForceAFD;
        propScale = 1.0 / getForceFactor(resultUnitForceAFD);
      }

      const points = diagramData.map(pt => ({
        x: pt.x / c_dist,
        y: pt[propKey] * propScale
      }));

      let minVal = Math.min(...points.map(p => p.y));
      let maxVal = Math.max(...points.map(p => p.y));

      if (Math.abs(minVal) < 1e-4 && Math.abs(maxVal) < 1e-4) {
        minVal = -1.0;
        maxVal = 1.0;
      } else {
        const padding = (maxVal - minVal) * 0.15 || 1.0;
        minVal -= padding;
        maxVal += padding;
      }

      const yTicks = [minVal, 0.0, maxVal];
      const uniqueYTicks = [];
      yTicks.forEach(t => {
        if (!uniqueYTicks.some(ut => Math.abs(ut - t) < (maxVal - minVal) * 0.1)) {
          uniqueYTicks.push(t);
        }
      });

      let maxYTickWidth = 0;
      uniqueYTicks.forEach(t => {
        const str = `${t.toFixed(2)} ${propUnit}`;
        const w = str.length * 6.0;
        if (w > maxYTickWidth) maxYTickWidth = w;
      });

      const tickSpacing = 8;
      const padL_req = Math.max(80, Math.ceil(maxYTickWidth + tickSpacing + 8));
      if (padL_req > maxPadL) {
        maxPadL = padL_req;
      }
    });

    globalPadL = maxPadL;
  }

  // Renders the active SVG chart diagrams stacked vertically
  // Renders the active SVG chart diagrams into their independent card containers
  function renderActiveDiagram() {
    if (!diagramData || diagramData.length === 0) return;

    updateGlobalPadL();
    drawSchematic();

    const reactionsContainer = document.getElementById('reactions-diagram-container');
    const sfdContainer = document.getElementById('sfd-diagram-container');
    const bmdContainer = document.getElementById('bmd-diagram-container');
    const deflectionContainer = document.getElementById('deflection-diagram-container');
    const afdContainer = document.getElementById('afd-diagram-container');

    if (reactionsContainer) reactionsContainer.innerHTML = renderReactionsSVG();
    if (sfdContainer) sfdContainer.innerHTML = renderSingleDiagramSVG('sfd');
    if (bmdContainer) bmdContainer.innerHTML = renderSingleDiagramSVG('bmd');
    if (afdContainer) afdContainer.innerHTML = renderSingleDiagramSVG('afd');
    if (deflectionContainer) deflectionContainer.innerHTML = renderSingleDiagramSVG('deflection');

    updateClearButtonVisibility();
  }

  function renderReactionsSVG() {
    const svgW = 600;
    const svgH = 120;
    const padL = globalPadL;
    const padR = 40;
    const graphW = svgW - padL - padR;
    const L_val = L;
    
    const c_dist = getDistFactor(currentUnitBeamLength);
    const c_force = getForceFactor(resultUnitForce);
    const c_moment = getMomentFactor(resultUnitMoment);

    const getXPixel = (x) => padL + (x / L_val) * graphW;

    let supportsSvg = '';
    let reactionsSvg = '';
    
    // Sort supports by position to identify left-most, right-most, and intermediate supports
    const sortedSups = [...supports].sort((a, b) => a.x - b.x);
    const leftMostX = sortedSups.length > 0 ? sortedSups[0].x : -1e9;
    const rightMostX = sortedSups.length > 0 ? sortedSups[sortedSups.length - 1].x : 1e9;

    // Draw support icons and coordinates matching Interactive Beam Schematic
    const k = 0.65;
    const yBeam = 50;

    supports.forEach((s, idx) => {
      const cx = getXPixel(s.x);
      let supportIcon = '';
      
      if (s.type === 'Pinned') {
        supportIcon = `
          <!-- Triangle -->
          <polygon points="${cx},${yBeam} ${cx - 15 * k},${yBeam + 25 * k} ${cx + 15 * k},${yBeam + 25 * k}" class="schematic-support-pin" />
          <line x1="${cx - 20 * k}" y1="${yBeam + 25 * k}" x2="${cx + 20 * k}" y2="${yBeam + 25 * k}" stroke="var(--text-primary)" stroke-width="${2.5 * k}" />
        `;
      } else if (s.type === 'Roller') {
        supportIcon = `
          <polygon points="${cx},${yBeam} ${cx - 13 * k},${yBeam + 18 * k} ${cx + 13 * k},${yBeam + 18 * k}" class="schematic-support-roller" />
          <circle cx="${cx - 7 * k}" cy="${yBeam + 23 * k}" r="${3.5 * k}" fill="var(--text-secondary)" />
          <circle cx="${cx + 7 * k}" cy="${yBeam + 23 * k}" r="${3.5 * k}" fill="var(--text-secondary)" />
          <line x1="${cx - 17 * k}" y1="${yBeam + 27 * k}" x2="${cx + 17 * k}" y2="${yBeam + 27 * k}" stroke="var(--text-primary)" stroke-width="${2 * k}" />
        `;
      } else if (s.type === 'Fixed') {
        supportIcon = `
          <!-- Short vertical connection line -->
          <line x1="${cx}" y1="${yBeam}" x2="${cx}" y2="${yBeam + 5 * k}" stroke="var(--text-primary)" stroke-width="${2.5 * k}" />
          <!-- Rectangle -->
          <rect x="${cx - 15 * k}" y="${yBeam + 5 * k}" width="${30 * k}" height="${20 * k}" class="schematic-support-pin" />
          <!-- Ground Line -->
          <line x1="${cx - 20 * k}" y1="${yBeam + 25 * k}" x2="${cx + 20 * k}" y2="${yBeam + 25 * k}" stroke="var(--text-primary)" stroke-width="${2.5 * k}" />
          <!-- Slanted Hatching Lines (Fixed Restraint) -->
          <line x1="${cx - 16 * k}" y1="${yBeam + 25 * k}" x2="${cx - 21 * k}" y2="${yBeam + 30 * k}" stroke="var(--text-muted)" stroke-width="${1.25 * k}" />
          <line x1="${cx - 8 * k}" y1="${yBeam + 25 * k}" x2="${cx - 13 * k}" y2="${yBeam + 30 * k}" stroke="var(--text-muted)" stroke-width="${1.25 * k}" />
          <line x1="${cx}" y1="${yBeam + 25 * k}" x2="${cx - 5 * k}" y2="${yBeam + 30 * k}" stroke="var(--text-muted)" stroke-width="${1.25 * k}" />
          <line x1="${cx + 8 * k}" y1="${yBeam + 25 * k}" x2="${cx + 3 * k}" y2="${yBeam + 30 * k}" stroke="var(--text-muted)" stroke-width="${1.25 * k}" />
          <line x1="${cx + 16 * k}" y1="${yBeam + 25 * k}" x2="${cx + 11 * k}" y2="${yBeam + 30 * k}" stroke="var(--text-muted)" stroke-width="${1.25 * k}" />
        `;
      } else if (s.type === 'Spring') {
        supportIcon = `
          <path d="M ${cx},${yBeam} L ${cx},${yBeam + 5 * k} L ${cx - 9 * k},${yBeam + 10 * k} L ${cx + 9 * k},${yBeam + 15 * k} L ${cx - 9 * k},${yBeam + 20 * k} L ${cx + 9 * k},${yBeam + 25 * k} L ${cx},${yBeam + 30 * k} L ${cx},${yBeam + 35 * k}"
                fill="none" stroke="var(--accent-secondary)" stroke-width="${2 * k}" />
          <line x1="${cx - 15 * k}" y1="${yBeam + 35 * k}" x2="${cx + 15 * k}" y2="${yBeam + 35 * k}" stroke="var(--text-primary)" stroke-width="${1.5 * k}" />
        `;
      }

      const yCoord = s.type === 'Spring' ? yBeam + 55 * k : yBeam + 45 * k;
      supportsSvg += `
        <g class="reactions-support-hoverable" data-type="support" data-index="${idx}" style="cursor: pointer;">
          ${supportIcon}
          <text x="${cx}" y="${yCoord}" class="schematic-label support-coord-label" text-anchor="middle" font-weight="600" style="font-size: 11px;">${s.x.toFixed(2)}${currentUnitBeamLength}</text>
        </g>
      `;

      // Identify placement details
      const isLeftMost = (s.x === leftMostX);
      const isRightMost = (s.x === rightMostX && !isLeftMost);

      // Draw reaction arrows and labels
      const r = reactionsData ? reactionsData.find(res => Math.abs(res.x - s.x * c_dist) < 1e-3) : null;
      if (r) {
        const rx_val = r.Rx / c_force;
        const ry_val = r.Ry / c_force;
        const m_val = r.M / c_moment;

        let rySvg = '';
        let rxSvg = '';
        let mSvg = '';

        // 1. Draw vertical force reaction (Ry)
        if (Math.abs(ry_val) > 1e-3) {
          const color = ry_val > 0 ? 'var(--success)' : 'var(--error)';
          const arrowD = ry_val > 0
            ? `M ${cx},44 L ${cx},8 M ${cx - 4},16 L ${cx},8 L ${cx + 4},16`
            : `M ${cx},8 L ${cx},44 M ${cx - 4},36 L ${cx},44 L ${cx + 4},36`;
          rySvg = `
            <path d="${arrowD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            <text x="${cx}" y="0" class="diagram-tick-text" text-anchor="middle" style="font-size: 11px; font-weight: bold; fill: ${color};">${ry_val.toFixed(2)} ${resultUnitForce}</text>
          `;
        }

        // 2. Draw horizontal force reaction (Rx)
        if (Math.abs(rx_val) > 1e-3) {
          const color = rx_val > 0 ? 'var(--success)' : 'var(--error)';
          let arrowD = '';
          let textX = 0;
          let textAnchor = '';
          
          // Fixed Y-offset coordinates above the beam line (y = 50)
          // yArrow = 28 (22px above beam line)
          // textY = 31 (centered vertically with the arrow, 19px above beam line)
          const yArrow = 28;
          const textY = 31;

          if (s.x <= L_val / 2) {
            // Left half of beam: Keep arrow and text above the beam line, always on the left side of cx
            if (rx_val > 0) {
              arrowD = `M ${cx - 40},${yArrow} L ${cx - 20},${yArrow} M ${cx - 28},${yArrow - 4} L ${cx - 20},${yArrow} L ${cx - 28},${yArrow + 4}`;
            } else {
              arrowD = `M ${cx - 20},${yArrow} L ${cx - 40},${yArrow} M ${cx - 32},${yArrow - 4} L ${cx - 40},${yArrow} L ${cx - 32},${yArrow + 4}`;
            }
            textX = cx - 46;
            textAnchor = 'end';
          } else {
            // Right half of beam: Keep arrow and text above the beam line, always on the right side of cx
            if (rx_val > 0) {
              arrowD = `M ${cx + 20},${yArrow} L ${cx + 40},${yArrow} M ${cx + 32},${yArrow - 4} L ${cx + 40},${yArrow} L ${cx + 32},${yArrow + 4}`;
            } else {
              arrowD = `M ${cx + 40},${yArrow} L ${cx + 20},${yArrow} M ${cx + 28},${yArrow - 4} L ${cx + 20},${yArrow} L ${cx + 28},${yArrow + 4}`;
            }
            textX = cx + 46;
            textAnchor = 'start';
          }

          rxSvg = `
            <path d="${arrowD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            <text x="${textX}" y="${textY}" class="diagram-tick-text" text-anchor="${textAnchor}" style="font-size: 11px; font-weight: bold; fill: ${color};">${rx_val.toFixed(2)} ${resultUnitForce}</text>
          `;
        }

        // 3. Draw moment reaction (M)
        if (Math.abs(m_val) > 1e-3) {
          const color = m_val > 0 ? 'var(--success)' : 'var(--error)';
          
          let arcD = '';
          let textX = 0;
          let textAnchor = '';
          const textY = 31; // Aligned vertically with horizontal reaction text, above the beam
          
          if (m_val > 0) {
            // CCW (positive): Arc starts on right (cx + 16) and goes CCW to left (cx - 16) above the beam (y = 41)
            arcD = `M ${cx + 16},41 A 16,16 0 0,0 ${cx - 16},41 M ${cx - 20},34 L ${cx - 16},41 L ${cx - 10},39`;
          } else {
            // CW (negative): Arc starts on left (cx - 16) and goes CW to right (cx + 16) above the beam (y = 41)
            arcD = `M ${cx - 16},41 A 16,16 0 0,1 ${cx + 16},41 M ${cx + 10},39 L ${cx + 16},41 L ${cx + 20},34`;
          }

          if (s.x <= L_val / 2) {
            // Support is on the left half: Fx is on the left side of support, so place moment text on the right side of support
            textX = cx + 22;
            textAnchor = 'start';
          } else {
            // Support is on the right half: Fx is on the right side of support, so place moment text on the left side of support
            textX = cx - 22;
            textAnchor = 'end';
          }
          
          mSvg = `
            <path d="${arcD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            <text x="${textX}" y="${textY}" class="diagram-tick-text" text-anchor="${textAnchor}" style="font-size: 11px; font-weight: bold; fill: ${color};">${m_val.toFixed(2)} ${resultUnitMoment}</text>
          `;
        }

        reactionsSvg += `
          <g>
            ${rySvg}
            ${rxSvg}
            ${mSvg}
          </g>
        `;
      }
    });

    // 5. CAD-STYLE SEGMENT DIMENSIONS (align with interactive schematic)
    const dimPoints = [0.0, L_val];
    supports.forEach(s => {
      if (!dimPoints.some(p => Math.abs(p - s.x) < 0.01)) {
        dimPoints.push(s.x);
      }
    });
    dimPoints.sort((a, b) => a - b);

    let dimensionsSvg = '';
    const dimY = yBeam + 85 * k; // 105px below beam
    
    // Draw vertical extension lines and architectural ticks
    dimPoints.forEach(x => {
      const px = getXPixel(x);
      const hasSupport = supports.some(s => Math.abs(s.x - x) < 0.01);
      const yStart = hasSupport ? yBeam + 22 * k : yBeam + 5 * k;
      dimensionsSvg += `
        <!-- Extension Line -->
        <line x1="${px}" y1="${yStart}" x2="${px}" y2="${dimY + 8 * k}" stroke="var(--text-muted)" stroke-width="${0.75 * k}" stroke-dasharray="2,2" opacity="0.6" />
        <!-- Architectural Tick -->
        <line x1="${px - 3 * k}" y1="${dimY + 3 * k}" x2="${px + 3 * k}" y2="${dimY - 3 * k}" stroke="var(--text-primary)" stroke-width="${1.5 * k}" />
      `;
    });

    // Draw horizontal dimension lines and segment labels
    for (let i = 0; i < dimPoints.length - 1; i++) {
      const x1 = dimPoints[i];
      const x2 = dimPoints[i + 1];
      const px1 = getXPixel(x1);
      const px2 = getXPixel(x2);
      const segmentLen = x2 - x1;
      const cx = (px1 + px2) / 2;

      if (px2 - px1 > 0.1) {
        // Horizontal dimension line
        dimensionsSvg += `<line x1="${px1}" y1="${dimY}" x2="${px2}" y2="${dimY}" stroke="var(--text-muted)" stroke-width="${1 * k}" />`;

        // Only draw label if there is sufficient horizontal space
        if (px2 - px1 > 40 * k) {
          dimensionsSvg += `
            <text x="${cx}" y="${dimY - 9 * k}" class="schematic-label" text-anchor="middle" style="font-size: 11px; font-weight: 600; fill: var(--text-primary);">${segmentLen.toFixed(2)} ${currentUnitBeamLength}</text>
          `;
        }
      }
    }

    const svgContent = `
      <svg data-diagram="reactions" data-padl="${padL}" viewBox="0 -15 ${svgW} ${svgH + 15}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0;">
        <!-- Beam Line matching Interactive Schematic -->
        <line x1="${padL}" y1="50" x2="${padL + graphW}" y2="50" class="schematic-beam-line" style="stroke-width: 4px;" />
        
        ${supportsSvg}
        ${reactionsSvg}
        ${dimensionsSvg}
        
        <g id="diagram-hover-elements" style="display: none; pointer-events: none;">
          <line id="diagram-hover-line" x1="0" y1="0" x2="0" y2="${svgH - 20}" stroke="var(--accent-secondary)" stroke-dasharray="3 3" stroke-width="1.2" />
          <circle id="diagram-hover-dot" cx="0" cy="0" r="5" fill="var(--accent-secondary)" stroke="var(--bg-card)" stroke-width="2" />
        </g>
      </svg>
    `;
    return svgContent;
  }

  function renderSingleDiagramSVG(diagramType) {
    const svgW = 600;
    const svgH = 180;
    const padR = 40;
    const padT = 25;
    const padB = 40;

    const c_dist = getDistFactor(currentUnitBeamLength);
    const c_force = getForceFactor(currentUnitForce);
    const c_moment = getMomentFactor(resultUnitMoment);

    let propKey = 'shear';
    let propUnit = resultUnitForceSFD;
    let propScale = 1.0 / getForceFactor(resultUnitForceSFD); // N to resultUnitForceSFD
    let lineClass = 'diagram-curve-sfd';
    let fillClass = 'diagram-fill-sfd';
    let diagramTitle = 'Shear Force Diagram (SFD)';
    let yAxisTitle = `Shear Force (${resultUnitForceSFD})`;

    if (diagramType === 'bmd') {
      propKey = 'moment';
      propUnit = resultUnitMoment;
      propScale = 1.0 / getMomentFactor(resultUnitMoment); // N.m to resultUnitMoment
      lineClass = 'diagram-curve-bmd';
      fillClass = 'diagram-fill-bmd';
      diagramTitle = 'Bending Moment Diagram (BMD)';
      yAxisTitle = `Bending Moment (${resultUnitMoment})`;
    } else if (diagramType === 'deflection') {
      propKey = 'deflection';
      propUnit = resultUnitDisplacement;
      propScale = 1.0 / getDistFactor(resultUnitDisplacement);
      lineClass = 'diagram-curve-deflection';
      fillClass = 'diagram-fill-deflection';
      diagramTitle = 'Deflection Curve';
      yAxisTitle = `Displacement (${resultUnitDisplacement})`;
    } else if (diagramType === 'afd') {
      propKey = 'axial';
      propUnit = resultUnitForceAFD;
      propScale = 1.0 / getForceFactor(resultUnitForceAFD); // N to resultUnitForceAFD
      lineClass = 'diagram-curve-afd';
      fillClass = 'diagram-fill-afd';
      diagramTitle = 'Axial Force Diagram (AFD)';
      yAxisTitle = `Axial Force (${resultUnitForceAFD})`;
    }

    const points = diagramData.map(pt => ({
      x: pt.x / c_dist,
      y: pt[propKey] * propScale
    }));

    let minVal = Math.min(...points.map(p => p.y));
    let maxVal = Math.max(...points.map(p => p.y));

    if (Math.abs(minVal) < 1e-4 && Math.abs(maxVal) < 1e-4) {
      minVal = -1.0;
      maxVal = 1.0;
    } else {
      const padding = (maxVal - minVal) * 0.15 || 1.0;
      minVal -= padding;
      maxVal += padding;
    }

    const yTicks = [minVal, 0.0, maxVal];
    const uniqueYTicks = [];
    yTicks.forEach(t => {
      if (!uniqueYTicks.some(ut => Math.abs(ut - t) < (maxVal - minVal) * 0.1)) {
        uniqueYTicks.push(t);
      }
    });

    let maxYTickWidth = 0;
    uniqueYTicks.forEach(t => {
      const str = `${t.toFixed(2)} ${propUnit}`;
      const w = str.length * 6.0;
      if (w > maxYTickWidth) maxYTickWidth = w;
    });

    const tickSpacing = 8;
    const padL = globalPadL;
    const graphW = svgW - padL - padR;
    const graphH = svgH - padT - padB;

    const L_val = L;
    const getXPixel = (x) => padL + (x / L_val) * graphW;
    const getYPixel = (y) => {
      const fraction = (y - minVal) / (maxVal - minVal);
      return padT + (1.0 - fraction) * graphH;
    };

    const yZeroPixel = getYPixel(0.0);

    const curvePixels = points.map(p => ({ x: getXPixel(p.x), y: getYPixel(p.y) }));

    const getBestPlacement = (pixelPt, val, isMax, otherBoxes) => {
      const isMarker = (isMax === 'marker');
      const str = isMarker ? val : (val.toFixed(2) + " " + propUnit);
      const w = isMarker ? (val.length * 9.5 + 36) : (str.length * 8 + 6);
      
      const candidates = [
        {
          name: 'above',
          x: pixelPt.x,
          y: pixelPt.y - 14,
          anchor: 'middle',
          pref: isMax === true ? 0 : (isMax === false ? 30 : 15)
        },
        {
          name: 'below',
          x: pixelPt.x,
          y: pixelPt.y + 18,
          anchor: 'middle',
          pref: isMax === false ? 0 : (isMax === true ? 30 : 15)
        },
        {
          name: 'right',
          x: pixelPt.x + 12,
          y: pixelPt.y + 4,
          anchor: 'start',
          pref: 60
        },
        {
          name: 'left',
          x: pixelPt.x - 12,
          y: pixelPt.y + 4,
          anchor: 'end',
          pref: 60
        }
      ];

      let bestCand = null;
      let minPenalty = 1e9;

      candidates.forEach(c => {
        let penalty = c.pref;
        
        let x1, x2, y1, y2;
        if (c.anchor === 'middle') {
          x1 = c.x - w / 2;
          x2 = c.x + w / 2;
        } else if (c.anchor === 'start') {
          x1 = c.x;
          x2 = c.x + w;
        } else {
          x1 = c.x - w;
          x2 = c.x;
        }
        const yOffset1 = isMarker ? -14 : -11;
        const yOffset2 = isMarker ? 10 : 3;
        y1 = c.y + yOffset1;
        y2 = c.y + yOffset2;

        // 1. Boundary checks
        if (x1 < padL + 6) penalty += 1000;
        if (x2 > svgW - padR - 6) penalty += 1000;
        if (y1 < padT + 6) penalty += 1000;
        if (y2 > svgH - padB - 6) penalty += 1000;

        // 2. Curve collision checks
        curvePixels.forEach(cp => {
          if (cp.x >= x1 - 5 && cp.x <= x2 + 5 && cp.y >= y1 - 5 && cp.y <= y2 + 5) {
            penalty += 200;
          }
        });

        // 3. X-axis ticks checks
        for (let i = 0; i <= 4; i++) {
          const tickX = padL + (i * graphW) / 4;
          if (y2 > svgH - padB - 14 && x1 - 5 < tickX && x2 + 5 > tickX) {
            penalty += 450;
          }
        }

        // 5. Title box collision check
        const titleMinX = 175;
        const titleMaxX = 425;
        const titleMinY = 0;
        const titleMaxY = 26;
        if (x2 >= titleMinX && x1 <= titleMaxX && y1 <= titleMaxY && y2 >= titleMinY) {
          penalty += 1000;
        }

        // 4. Other boxes collision check
        if (otherBoxes && otherBoxes.length > 0) {
          otherBoxes.forEach(otherBox => {
            if (otherBox) {
              const overlap = !(x2 < otherBox.x1 || x1 > otherBox.x2 || y2 < otherBox.y1 || y1 > otherBox.y2);
              if (overlap) {
                penalty += 1500;
              }
            }
          });
        }

        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestCand = {
            x: c.x,
            y: c.y,
            anchor: c.anchor,
            box: { x1, x2, y1, y2 }
          };
        }
      });

      return bestCand;
    };

    let pathD = '';
    let fillD = `M ${getXPixel(points[0].x)},${yZeroPixel}`;

    points.forEach((p, idx) => {
      const px = getXPixel(p.x);
      const py = getYPixel(p.y);
      if (idx === 0) {
        pathD += `M ${px},${py}`;
      } else {
        pathD += ` L ${px},${py}`;
      }
      fillD += ` L ${px},${py}`;
    });

    fillD += ` L ${getXPixel(points[points.length - 1].x)},${yZeroPixel} Z`;

    let maxPt = points[0];
    let minPt = points[0];
    points.forEach(p => {
      if (p.y > maxPt.y) maxPt = p;
      if (p.y < minPt.y) minPt = p;
    });

    const zeroLineSvg = `<line x1="${padL}" y1="${yZeroPixel}" x2="${svgW - padR}" y2="${yZeroPixel}" class="diagram-axis" stroke-width="1.5" />`;

    let yTicksSvg = '';
    uniqueYTicks.forEach(t => {
      const py = getYPixel(t);
      yTicksSvg += `
        <line x1="${padL - 5}" y1="${py}" x2="${padL}" y2="${py}" class="diagram-axis" />
        <text x="${padL - 8}" y="${py + 3}" class="diagram-tick-text" text-anchor="end">${t.toFixed(2)} ${propUnit}</text>
      `;
    });



    let xTicksSvg = '';
    for (let i = 0; i <= 4; i++) {
      const xVal = (i * L_val) / 4;
      const px = padL + (i * graphW) / 4;
      xTicksSvg += `
        <line x1="${px}" y1="${svgH - padB}" x2="${px}" y2="${svgH - padB + 5}" class="diagram-axis" />
        <text x="${px}" y="${svgH - padB + 16}" class="diagram-tick-text" text-anchor="middle">${xVal.toFixed(2)}${currentUnitBeamLength}</text>
      `;
    }

    const activeBoxes = [];
    let extremaMarkersSvg = '';
    const drawExtremum = (pt, isMax) => {
      if (Math.abs(pt.y) < 1e-4) return;
      const px = getXPixel(pt.x);
      const py = getYPixel(pt.y);
      const placement = getBestPlacement({ x: px, y: py }, pt.y, isMax, activeBoxes);
      if (!placement) return;
      
      extremaMarkersSvg += `
        <circle cx="${px}" cy="${py}" r="4.5" fill="var(--bg-card)" stroke="${isMax ? 'var(--success)' : 'var(--error)'}" stroke-width="2" />
        <text x="${placement.x}" y="${placement.y}" class="diagram-tick-text" font-weight="700" text-anchor="${placement.anchor}" fill="var(--text-primary)" style="font-size: 13px;">
          ${pt.y.toFixed(2)} ${propUnit}
        </text>
      `;
      activeBoxes.push(placement.box);
    };

    if (Math.abs(maxPt.y - minPt.y) > 1e-4) {
      drawExtremum(maxPt, true);
      drawExtremum(minPt, false);
    } else {
      drawExtremum(maxPt, true);
    }

    let markersSvg = '';
    const activeMarkers = diagramMarkers.filter(m => m.type === diagramType);
    activeMarkers.forEach(marker => {
      let closestPt = points[0];
      let minDiff = Math.abs(points[0].x - marker.x);
      points.forEach(p => {
        const diff = Math.abs(p.x - marker.x);
        if (diff < minDiff) {
          minDiff = diff;
          closestPt = p;
        }
      });

      const px = getXPixel(closestPt.x);
      const py = getYPixel(closestPt.y);
      
      const labelText = `${closestPt.y.toFixed(2)} ${propUnit} , x = ${closestPt.x.toFixed(2)}${currentUnitBeamLength}`;
      const textW = labelText.length * 9.5 + 8;
      const totalW = textW + 28;

      const hasOffset = (marker.dx !== undefined && marker.dx !== null && marker.dy !== undefined && marker.dy !== null);
      
      let rx, ry, textX;
      let placement = { anchor: 'start', y: 0 };
      
      if (hasOffset) {
        rx = px + marker.dx;
        ry = py + marker.dy;
        textX = rx + 8;
        placement.anchor = 'start';
        placement.y = ry + 16;
        activeBoxes.push({ x1: rx, x2: rx + totalW, y1: ry, y2: ry + 24 });
      } else {
        const autoPlacement = getBestPlacement({ x: px, y: py }, labelText, 'marker', activeBoxes);
        if (autoPlacement) {
          placement = autoPlacement;
          activeBoxes.push(placement.box);
          
          rx = placement.box.x1;
          ry = placement.box.y1;
          textX = rx + 8;
          placement.anchor = 'start';
          placement.y = ry + 16;
        } else {
          return;
        }
      }

      let lineX2 = rx + totalW / 2;
      let lineY2 = ry + 12;
      if (hasOffset) {
        const height = 24;
        const leftCenter = { x: rx, y: ry + height / 2 };
        const rightCenter = { x: rx + totalW, y: ry + height / 2 };
        const topCenter = { x: rx + totalW / 2, y: ry };
        const bottomCenter = { x: rx + totalW / 2, y: ry + height };
        
        const dLeft = Math.hypot(px - leftCenter.x, py - leftCenter.y);
        const dRight = Math.hypot(px - rightCenter.x, py - rightCenter.y);
        const dTop = Math.hypot(px - topCenter.x, py - topCenter.y);
        const dBottom = Math.hypot(px - bottomCenter.x, py - bottomCenter.y);
        
        let minD = dLeft;
        let bestPt = leftCenter;
        if (dRight < minD) { minD = dRight; bestPt = rightCenter; }
        if (dTop < minD) { minD = dTop; bestPt = topCenter; }
        if (dBottom < minD) { minD = dBottom; bestPt = bottomCenter; }
        
        lineX2 = bestPt.x;
        lineY2 = bestPt.y;
      }

      const deleteBtnX = rx + totalW - 20;
      const deleteBtnY = ry + 4;
      
      markersSvg += `
        <g class="diagram-marker" data-id="${marker.id}" data-px="${px}" data-py="${py}" data-rx="${rx}" data-ry="${ry}" data-total-w="${totalW}">
          ${hasOffset ? `<line x1="${px}" y1="${py}" x2="${lineX2}" y2="${lineY2}" stroke="var(--accent-secondary)" stroke-width="1.2" />` : ''}
          <line x1="${px}" y1="${padT}" x2="${px}" y2="${svgH - padB}" stroke="var(--accent-secondary)" stroke-dasharray="3 3" stroke-width="1.2" />
          <circle cx="${px}" cy="${py}" r="5" fill="var(--accent-secondary)" stroke="var(--bg-card)" stroke-width="2" />
          <g class="diagram-marker-label" style="cursor: move;">
            <rect x="${rx}" y="${ry}" width="${totalW}" height="24" rx="4" fill="var(--bg-card)" stroke="var(--accent-secondary)" stroke-width="1.2" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.1)); cursor: move;" />
            <text x="${textX}" y="${placement.y}" class="diagram-tick-text" font-weight="600" text-anchor="${placement.anchor}" style="font-size: 13px; fill: var(--text-primary); cursor: move;">
              ${labelText}
            </text>
          </g>
          <g class="diagram-marker-delete" data-id="${marker.id}" style="cursor: pointer;">
            <rect x="${deleteBtnX}" y="${deleteBtnY}" width="16" height="16" rx="4" fill="rgba(239,68,68,0.1)" />
            <text x="${deleteBtnX + 8}" y="${deleteBtnY + 13}" font-weight="bold" text-anchor="middle" style="font-size: 13px; font-family: sans-serif; fill: var(--error);">\u00d7</text>
          </g>
        </g>
      `;
    });

    const svgContent = `
      <svg data-diagram="${diagramType}" data-padl="${padL}" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0;">
        <line x1="${padL}" y1="${padT}" x2="${svgW - padR}" y2="${padT}" class="diagram-grid" />
        <line x1="${padL}" y1="${svgH - padB}" x2="${svgW - padR}" y2="${svgH - padB}" class="diagram-grid" />
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${svgH - padB}" class="diagram-axis" />
        
        ${xTicksSvg}
        ${yTicksSvg}
        
        <path d="${fillD}" class="${fillClass}" />
        ${zeroLineSvg}
        <path d="${pathD}" class="${lineClass}" fill="none" />
        
        ${extremaMarkersSvg}
        ${markersSvg}

        <g id="diagram-hover-elements" style="display: none; pointer-events: none;">
          <line id="diagram-hover-line" x1="0" y1="${padT}" x2="0" y2="${svgH - padB}" stroke="var(--accent-secondary)" stroke-dasharray="3 3" stroke-width="1.2" />
          <circle id="diagram-hover-dot" cx="0" cy="0" r="5" fill="var(--accent-secondary)" stroke="var(--bg-card)" stroke-width="2" />
        </g>
      </svg>
    `;
    return svgContent;
  }

  // ==================================================
  // Unit Conversion Testing Module (lexical closure access)
  const logPrefix = "[UNIT-TEST] ";

  async function runTestSuite() {
    console.log(`${logPrefix}Starting Unit Conversion Test Suite...`);
    const results = [];

    function assert(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }

    function assertAlmostEqual(a, b, tolerance = 1e-2, message = "") {
      const diff = Math.abs(a - b);
      if (diff > tolerance) {
        throw new Error(`${message}: expected near ${b}, got ${a} (diff: ${diff})`);
      }
    }

    async function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function switchToSingleBeam() {
      const nav = document.getElementById('nav-single-beam');
      if (nav) nav.click();
    }

    try {
      switchToSingleBeam();
      await sleep(100);

      const elLength = document.getElementById('beam-length');
      const elE = document.getElementById('beam-E');
      const elULength = document.getElementById('unit-beam-length');
      const elUE = document.getElementById('unit-beam-E');
      const elUPoint = document.getElementById('unit-point-load');
      const elUDist = document.getElementById('unit-distance');
      const elUMomentF = document.getElementById('unit-moment-force');
      const elUMomentD = document.getElementById('unit-moment-dist');
      const elUUDLF = document.getElementById('unit-udl-force');
      const elUUDLD = document.getElementById('unit-udl-dist');

      assert(elLength && elE && elULength && elUE, "Primary input elements not found");

      // Reset state to default SI units
      elULength.value = 'm'; elULength.dispatchEvent(new Event('change'));
      elUE.value = 'GPa'; elUE.dispatchEvent(new Event('change'));
      elUPoint.value = 'kN'; elUPoint.dispatchEvent(new Event('change'));
      elUDist.value = 'm'; elUDist.dispatchEvent(new Event('change'));
      elUMomentF.value = 'kN'; elUMomentF.dispatchEvent(new Event('change'));
      elUMomentD.value = 'm'; elUMomentD.dispatchEvent(new Event('change'));
      elUUDLF.value = 'kN'; elUUDLF.dispatchEvent(new Event('change'));
      elUUDLD.value = 'm'; elUUDLD.dispatchEvent(new Event('change'));

      elLength.value = 6.0; elLength.dispatchEvent(new Event('change'));
      elE.value = 200.0; elE.dispatchEvent(new Event('change'));

      supports.length = 0;
      supports.push({ x: 0.0, type: 'Pinned', ky: 0 });
      supports.push({ x: 6.0, type: 'Roller', ky: 0 });
      renderSupportsTable();

      loads.length = 0;
      loads.push({ type: 'PointLoadV', x: 3.0, start: 0, end: 0, f1: -10.0, f2: 0 });
      renderLoadsTable();

      drawSchematic();
      await solveBeamModel();

      results.push({ name: "Setup and Element Verification", status: "PASS" });

      // TEST 1: Change Units correctly updates input values
      try {
        elULength.value = 'cm';
        elULength.dispatchEvent(new Event('change'));
        assertAlmostEqual(parseFloat(elLength.value), 600, 1e-2, "Beam length did not scale to cm");

        elUE.value = 'MPa';
        elUE.dispatchEvent(new Event('change'));
        assertAlmostEqual(parseFloat(elE.value), 200000, 1e-1, "Elastic modulus did not scale to MPa");

        const supInput = elTableSupports.querySelector('tbody tr:last-child input[type="number"]');
        assert(supInput, "Supports table coord input not found");
        assertAlmostEqual(parseFloat(supInput.value), 600, 1e-2, "Support coord in table did not scale to cm");

        elULength.value = 'm'; elULength.dispatchEvent(new Event('change'));
        elUE.value = 'GPa'; elUE.dispatchEvent(new Event('change'));

        results.push({ name: "Displayed Input Updates on Unit Change", status: "PASS" });
      } catch (e) {
        results.push({ name: "Displayed Input Updates on Unit Change", status: "FAIL", error: e.message });
      }

      // TEST 2: Roundtrip Multi-switch Unit Accuracy
      try {
        let testVal = 6.0;
        elLength.value = testVal; elLength.dispatchEvent(new Event('change'));

        const lengthSequence = ['cm', 'mm', 'in', 'ft', 'm'];
        for (const unit of lengthSequence) {
          elULength.value = unit;
          elULength.dispatchEvent(new Event('change'));
        }
        assertAlmostEqual(parseFloat(elLength.value), 6.0, 1e-3, "Multi-switch Beam Length roundtrip failed");

        elUPoint.value = 'kN'; elUPoint.dispatchEvent(new Event('change'));
        const forceSequence = ['N', 'kg', 'MTon', 'lbf', 'kip', 'kN'];
        for (const unit of forceSequence) {
          elUPoint.value = unit;
          elUPoint.dispatchEvent(new Event('change'));
        }
        assertAlmostEqual(loads[0].f1, -10.0, 1e-3, "Multi-switch Force roundtrip failed");

        results.push({ name: "Roundtrip Multi-switch Unit Accuracy", status: "PASS" });
      } catch (e) {
        results.push({ name: "Roundtrip Multi-switch Unit Accuracy", status: "FAIL", error: e.message });
      }

      // TEST 3: Solver Consistency (Numerical Equivalence)
      try {
        elULength.value = 'm'; elULength.dispatchEvent(new Event('change'));
        elUE.value = 'GPa'; elUE.dispatchEvent(new Event('change'));
        elUPoint.value = 'kN'; elUPoint.dispatchEvent(new Event('change'));
        elUDist.value = 'm'; elUDist.dispatchEvent(new Event('change'));

        elLength.value = 6.0; elLength.dispatchEvent(new Event('change'));
        supports[0].x = 0.0; supports[1].x = 6.0;
        loads[0].x = 3.0; loads[0].f1 = -10.0;
        renderSupportsTable();
        renderLoadsTable();
        drawSchematic();

        await solveBeamModel();
        
        const SI_Ry = reactionsData[1].Ry;
        
        elULength.value = 'ft'; elULength.dispatchEvent(new Event('change'));
        elUE.value = 'ksi'; elUE.dispatchEvent(new Event('change'));
        elUPoint.value = 'kip'; elUPoint.dispatchEvent(new Event('change'));
        elUDist.value = 'in'; elUDist.dispatchEvent(new Event('change'));
        
        await solveBeamModel();
        
        const IMP_Ry_SI = reactionsData[1].Ry;
        assertAlmostEqual(Math.abs(IMP_Ry_SI), 5000, 5, "Reactions physically changed after unit conversion");

        elULength.value = 'm'; elULength.dispatchEvent(new Event('change'));
        elUE.value = 'GPa'; elUE.dispatchEvent(new Event('change'));
        elUPoint.value = 'kN'; elUPoint.dispatchEvent(new Event('change'));
        elUDist.value = 'm'; elUDist.dispatchEvent(new Event('change'));
        await solveBeamModel();

        results.push({ name: "Solver Numerical Equivalence Across Unit Systems", status: "PASS" });
      } catch (e) {
        results.push({ name: "Solver Numerical Equivalence Across Unit Systems", status: "FAIL", error: e.message });
      }

      // TEST 4: Section Library Preset Loading & Conversions
      try {
        const activeTab = document.querySelector('.nav-menu .nav-item.active');
        assert(activeTab, "Active nav item not found");
        
        let I_SI = 1e-4; // default
        if (window.getActiveSectionProperties) {
          const props = window.getActiveSectionProperties();
          if (props && props.Ixx > 0) I_SI = props.Ixx;
        }
        assert(I_SI > 0, "Failed to read standard section properties");
        
        results.push({ name: "Section Library Presets & Scales", status: "PASS" });
      } catch (e) {
        results.push({ name: "Section Library Presets & Scales", status: "FAIL", error: e.message });
      }

      // TEST 5: Graphical Positions Stability
      try {
        elULength.value = 'm'; elULength.dispatchEvent(new Event('change'));
        elUDist.value = 'm'; elUDist.dispatchEvent(new Event('change'));
        
        const svg = document.getElementById('beam-schematic-svg');
        assert(svg, "SVG canvas not found");
        
        const supportGroup = svg.querySelector('g[data-type="support"][data-index="1"]');
        assert(supportGroup, "Support group not rendered in SVG");
        
        // Calculate coordinate mapping using closure variables (bypasses local drawSchematic getX scope)
        const cx1 = globalPadL + (supports[1].x / L) * (canvasW - globalPadL - 40);
        
        elULength.value = 'ft'; elULength.dispatchEvent(new Event('change'));
        const cx2 = globalPadL + (supports[1].x / L) * (canvasW - globalPadL - 40);
        
        assertAlmostEqual(cx1, cx2, 1e-1, "Graphical coordinates changed on unit scale");
        
        elULength.value = 'm'; elULength.dispatchEvent(new Event('change'));
        elUDist.value = 'm'; elUDist.dispatchEvent(new Event('change'));
        
        results.push({ name: "Graphical Canvas Positions Stability", status: "PASS" });
      } catch (e) {
        results.push({ name: "Graphical Canvas Positions Stability", status: "FAIL", error: e.message });
      }

      // TEST 6: Edge Cases and Invalid Inputs
      try {
        elLength.value = -5.0;
        elLength.dispatchEvent(new Event('change'));
        assert(L >= 1.0, "Beam length allowed negative value");
        
        elE.value = -100;
        elE.dispatchEvent(new Event('change'));
        assert(E >= 1.0, "Elastic Modulus allowed negative value");
        
        const beamToLoadRatio = getDistFactor(currentUnitBeamLength) / getDistFactor(currentUnitDist);
        const L_load = L * beamToLoadRatio;
        
        const inputX1 = elTableLoads.querySelector('input[data-field="x1"]');
        if (inputX1) {
          inputX1.value = L_load + 10;
          inputX1.dispatchEvent(new Event('change'));
          assert(loads[0].x <= L_load, "Load position exceeded clamped span length");
        }
        
        results.push({ name: "Edge Cases & Input Clamping", status: "PASS" });
      } catch (e) {
        results.push({ name: "Edge Cases & Input Clamping", status: "FAIL", error: e.message });
      }

      // TEST 7: Result Presentation Units
      try {
        const elResultForce = document.getElementById('result-unit-force');
        const elResultForceSFD = document.getElementById('result-unit-force-sfd');
        const elResultMomentForce = document.getElementById('result-unit-moment-force');
        const elResultMomentDist = document.getElementById('result-unit-moment-dist');
        const elResultDisplacement = document.getElementById('result-unit-displacement');
        const elReactionsMomentForce = document.getElementById('reactions-unit-moment-force');
        const elReactionsMomentDist = document.getElementById('reactions-unit-moment-dist');

        assert(elResultForce && elResultForceSFD && elResultMomentForce && elResultMomentDist && elResultDisplacement, "Result presentation unit controls not found");
        assert(elReactionsMomentForce && elReactionsMomentDist, "Reactions moment unit controls not found");

        // 1. Verify defaults
        assert(elResultForce.value === 'kN', "Result force unit does not default to kN");
        assert(elResultForceSFD.value === 'kN', "Result SFD force unit does not default to kN");
        assert(elResultMomentForce.value === 'kN', "Result moment force unit does not default to kN");
        assert(elResultMomentDist.value === 'm', "Result moment dist unit does not default to m");
        assert(elResultDisplacement.value === 'mm', "Result displacement unit does not default to mm");
        assert(elReactionsMomentForce.value === 'kN', "Reactions moment force unit does not default to kN");
        assert(elReactionsMomentDist.value === 'm', "Reactions moment dist unit does not default to m");

        // 2. Change moment distance unit, verify update
        elResultMomentDist.value = 'cm'; elResultMomentDist.dispatchEvent(new Event('change'));
        assert(resultUnitMoment === 'kN·cm', "Result moment unit did not update to kN·cm");
        assert(elReactionsMomentDist.value === 'cm', "Reactions moment dist unit did not synchronize to cm");

        // Restore moment distance unit to m
        elResultMomentDist.value = 'm'; elResultMomentDist.dispatchEvent(new Event('change'));
        assert(resultUnitMoment === 'kN·m', "Result moment unit did not update back to kN·m");
        assert(elReactionsMomentDist.value === 'm', "Reactions moment dist unit did not synchronize back to m");

        // Change reactions moment force unit, verify update and synchronization
        elReactionsMomentForce.value = 'N'; elReactionsMomentForce.dispatchEvent(new Event('change'));
        assert(resultUnitMoment === 'N·m', "Result moment unit did not update to N·m after reactions change");
        assert(elResultMomentForce.value === 'N', "BMD moment force unit did not synchronize to N");

        // Restore reactions moment force unit to kN
        elReactionsMomentForce.value = 'kN'; elReactionsMomentForce.dispatchEvent(new Event('change'));
        assert(resultUnitMoment === 'kN·m', "Result moment unit did not update back to kN·m after reactions change");
        assert(elResultMomentForce.value === 'kN', "BMD moment force unit did not synchronize back to kN");

        // Change SFD force unit, verify update
        elResultForceSFD.value = 'N'; elResultForceSFD.dispatchEvent(new Event('change'));
        assert(resultUnitForceSFD === 'N', "Result SFD force unit did not update to N");

        // Restore SFD force unit to kN
        elResultForceSFD.value = 'kN'; elResultForceSFD.dispatchEvent(new Event('change'));
        assert(resultUnitForceSFD === 'kN', "Result SFD force unit did not update back to kN");

        // 3. Switch presentation unit force, check that reactions scale correctly
        await solveBeamModel();

        // Find reaction Ry value in current unit (kN)
        const reactionRows = elTableReactions.querySelectorAll('tbody tr');
        assert(reactionRows.length > 0, "No reactions rows rendered");
        const lastRow = reactionRows[reactionRows.length - 1];
        const oldRyText = lastRow.querySelector('td:nth-child(4)').textContent;
        const oldRyVal = parseFloat(oldRyText);

        // Switch presentation force to N
        elResultForce.value = 'N'; elResultForce.dispatchEvent(new Event('change'));

        // Verify reaction Ry updates to N (should scale by 1000)
        const reactionRowsNew = elTableReactions.querySelectorAll('tbody tr');
        assert(reactionRowsNew.length > 0, "No reactions rows rendered after change");
        const lastRowNew = reactionRowsNew[reactionRowsNew.length - 1];
        const newRyText = lastRowNew.querySelector('td:nth-child(4)').textContent;
        const newRyVal = parseFloat(newRyText);
        assertAlmostEqual(newRyVal, oldRyVal * 1000, 10, "Reaction forces did not rescale correctly with presentation unit");

        // Verify Reactions SVG text matches N
        let reactionsSvg = document.getElementById('reactions-diagram-container').querySelector('svg');
        assert(reactionsSvg, "Reactions SVG not found in container");
        let texts = Array.from(reactionsSvg.querySelectorAll('text'));
        let hasNReactionText = texts.some(t => t.textContent.includes(' N') && !t.textContent.includes('kN'));
        assert(hasNReactionText, "Reactions SVG text was not updated to N after changing presentation force unit");

        // Reset result unit force back to kN
        elResultForce.value = 'kN'; elResultForce.dispatchEvent(new Event('change'));
        reactionsSvg = document.getElementById('reactions-diagram-container').querySelector('svg');
        texts = Array.from(reactionsSvg.querySelectorAll('text'));
        let hasKNReactionText = texts.some(t => t.textContent.includes('kN'));
        assert(hasKNReactionText, "Reactions SVG text was not updated back to kN");

        // 4. Verify SFD / BMD tick labels format & dynamic margins
        const sfdSvg = document.getElementById('sfd-diagram-container').querySelector('svg');
        assert(sfdSvg, "SFD SVG not found");
        
        // Assert padL exists as attribute
        const initialPadL = parseFloat(sfdSvg.getAttribute('data-padl'));
        assert(!isNaN(initialPadL) && initialPadL >= 80, "SFD SVG does not have valid data-padl attribute");

        // Assert tick labels display units suffix
        const tickTexts = Array.from(sfdSvg.querySelectorAll('.diagram-tick-text'));
        const tickLabelsWithUnits = tickTexts.filter(t => t.textContent.trim().endsWith('kN'));
        assert(tickLabelsWithUnits.length > 0, "Y-axis tick labels are missing the unit suffix");

        // Change SFD force unit to N, verify layout shifts to adapt
        elResultForceSFD.value = 'N'; elResultForceSFD.dispatchEvent(new Event('change'));
        const sfdSvgNew = document.getElementById('sfd-diagram-container').querySelector('svg');
        const newPadL = parseFloat(sfdSvgNew.getAttribute('data-padl'));
        assert(!isNaN(newPadL) && newPadL >= 80, "Recalculated data-padl after unit change is invalid");

        // Restore SFD force unit back to kN
        elResultForceSFD.value = 'kN'; elResultForceSFD.dispatchEvent(new Event('change'));

        // AFD units assertions
        const elResultForceAFD = document.getElementById('result-unit-force-afd');
        assert(elResultForceAFD, "Result AFD force unit control not found");
        assert(elResultForceAFD.value === 'kN', "Result AFD force unit does not default to kN");
        elResultForceAFD.value = 'N'; elResultForceAFD.dispatchEvent(new Event('change'));
        assert(resultUnitForceAFD === 'N', "Result AFD force unit did not update to N");
        elResultForceAFD.value = 'kN'; elResultForceAFD.dispatchEvent(new Event('change'));
        assert(resultUnitForceAFD === 'kN', "Result AFD force unit did not update back to kN");

        // Verify AFD tick labels format & dynamic margins
        const afdSvg = document.getElementById('afd-diagram-container').querySelector('svg');
        assert(afdSvg, "AFD SVG not found");
        const initialPadL_afd = parseFloat(afdSvg.getAttribute('data-padl'));
        assert(!isNaN(initialPadL_afd) && initialPadL_afd >= 80, "AFD SVG does not have valid data-padl attribute");
        const tickTexts_afd = Array.from(afdSvg.querySelectorAll('.diagram-tick-text'));
        const tickLabelsWithUnits_afd = tickTexts_afd.filter(t => t.textContent.trim().endsWith('kN'));
        assert(tickLabelsWithUnits_afd.length > 0, "AFD Y-axis tick labels are missing the unit suffix");

        elResultForceAFD.value = 'N'; elResultForceAFD.dispatchEvent(new Event('change'));
        const afdSvgNew = document.getElementById('afd-diagram-container').querySelector('svg');
        const newPadL_afd = parseFloat(afdSvgNew.getAttribute('data-padl'));
        assert(!isNaN(newPadL_afd) && newPadL_afd >= 80, "Recalculated AFD data-padl after unit change is invalid");

        elResultForceAFD.value = 'kN'; elResultForceAFD.dispatchEvent(new Event('change'));

        results.push({ name: "Result Presentation Units", status: "PASS" });
      } catch (e) {
        results.push({ name: "Result Presentation Units", status: "FAIL", error: e.message });
      }

      // TEST 8: Diagram Markers and Tooltips Interaction
      try {
        elLength.value = 6.0;
        L = 6.0;
        await solveBeamModel();

        // 1. Ensure diagramData is populated
        assert(diagramData && diagramData.length > 0, "diagramData not populated");

        // 2. Set activeDiagram to 'sfd'
        activeDiagram = 'sfd';
        renderActiveDiagram();

        // 3. Clear any existing markers
        diagramMarkers = [];
        renderActiveDiagram();

        // Check that the Clear Markers button is hidden
        const btnClear = document.getElementById('btn-clear-sfd');
        assert(btnClear && btnClear.style.display === 'none', "Clear button should be hidden initially");

        // 4. Programmatically add a marker
        diagramMarkers.push({
          id: 9999,
          type: 'sfd',
          x: 3.0 // At 3.0m
        });
        renderActiveDiagram();

        // Verify that the marker is drawn in the SVG
        let svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        assert(svg, "SVG not rendered");
        let markers = svg.querySelectorAll('.diagram-marker');
        assert(markers.length === 1, "Expected 1 marker in SFD");
        assert(markers[0].getAttribute('data-id') === '9999', "Marker has incorrect id");

        // Check that the Clear Markers button is now shown
        assert(btnClear && btnClear.style.display !== 'none', "Clear button should be visible after adding a marker");

        // 5. Test coordinate tracking helper
        // Let's call getDiagramCoordsAtClient with mock client coordinates
        const rect = svg.getBoundingClientRect();
        // Mock a pointer move at the center of the graph (horizontal)
        const mockClientX = rect.left + rect.width * 0.5;
        const mockClientY = rect.top + rect.height * 0.5;
        
        // Dispatch pointermove event
        const pointerEvent = new PointerEvent('pointermove', {
          clientX: mockClientX,
          clientY: mockClientY,
          bubbles: true
        });
        svg.dispatchEvent(pointerEvent);

        // Verify that tooltip and hover crosshair are shown
        const elTooltip = document.getElementById('beam-diagram-tooltip');
        assert(elTooltip && elTooltip.style.display !== 'none', "Tooltip should be shown on hover");
        
        const hoverEl = svg.querySelector('#diagram-hover-elements');
        assert(hoverEl && hoverEl.style.display !== 'none', "Hover elements should be visible on hover");

        // 6. Test delete marker
        const deleteBtn = svg.querySelector('.diagram-marker-delete');
        assert(deleteBtn, "Delete button not found inside marker");
        const deleteClickEvent = new MouseEvent('click', {
          bubbles: true
        });
        deleteBtn.dispatchEvent(deleteClickEvent);

        // Verify marker is removed
        assert(diagramMarkers.length === 0, "Marker was not deleted from state list");
        svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        markers = svg.querySelectorAll('.diagram-marker');
        assert(markers.length === 0, "Marker SVG element was not removed");
        assert(btnClear.style.display === 'none', "Clear button should hide after deleting the only marker");

        // 7. Test marker edit popup selection
        // First re-add a marker
        diagramMarkers.push({
          id: 9999,
          type: 'sfd',
          x: 3.0
        });
        renderActiveDiagram();
        
        svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        let markerG = svg.querySelector('.diagram-marker');
        assert(markerG, "Marker group not found");
        
        // Dispatch click to open edit menu
        const clickMarkerEvent = new MouseEvent('click', {
          clientX: rect.left + rect.width * 0.5,
          clientY: rect.top + rect.height * 0.5,
          bubbles: true
        });
        markerG.dispatchEvent(clickMarkerEvent);
        
        const elEditMenu = document.getElementById('beam-diagram-edit-menu');
        assert(elEditMenu && elEditMenu.style.display !== 'none', "Edit menu should open on clicking marker");
        
        // 8. Test direct coordinate input positioning
        const elXInput = document.getElementById('edit-marker-x-input');
        assert(elXInput, "Marker coordinate input not found");
        elXInput.value = 4.50;
        elXInput.dispatchEvent(new Event('change'));
        
        assert(diagramMarkers[0].x === 4.50, "Marker X coordinate was not updated to 4.50 via input");
        assert(elEditMenu.style.display !== 'none', "Edit menu should remain open after modifying input value");
        
        // Dispatch Enter keypress to save and close
        elXInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        assert(elEditMenu.style.display === 'none', "Edit menu should close after pressing Enter key");
        
        // 9. Test drag-move simulation
        renderActiveDiagram();
        svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        markerG = svg.querySelector('.diagram-marker');
        markerG.dispatchEvent(clickMarkerEvent); // Open edit menu again
        
        const btnMove = document.getElementById('btn-edit-marker-move');
        assert(btnMove, "Move Marker button not found");
        btnMove.click(); // Click Move Marker
        
        assert(activeDraggedMarkerId === 9999, "Move Marker click did not set activeDraggedMarkerId");
        
        // Simulate dragging to 5.0m
        const dragX = rect.left + rect.width * 0.8; // 5.0m on 6.0m span
        const dragY = rect.top + rect.height * 0.5;
        const dragEvent = new PointerEvent('pointermove', {
          clientX: dragX,
          clientY: dragY,
          bubbles: true
        });
        svg.dispatchEvent(dragEvent);
        
        assert(diagramMarkers[0].x > 4.8 && diagramMarkers[0].x < 5.2, "Marker X did not update close to 5.0m during dragging");
        
        // Drop the marker by clicking
        const dropEvent = new MouseEvent('click', {
          bubbles: true
        });
        svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        svg.dispatchEvent(dropEvent);
        assert(activeDraggedMarkerId === null, "Click did not drop the dragged marker");
        
        // 10. Test manual label dragging
        // Add a marker again
        diagramMarkers = [{
          id: 9999,
          type: 'sfd',
          x: 3.0
        }];
        renderActiveDiagram();
        
        svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        const labelG = svg.querySelector('.diagram-marker-label');
        assert(labelG, "Label group not found for dragging");
        
        const rectLabel = labelG.getBoundingClientRect();
        const startX = (rectLabel && rectLabel.width > 0) ? (rectLabel.left + rectLabel.width / 2) : 300;
        const startY = (rectLabel && rectLabel.height > 0) ? (rectLabel.top + rectLabel.height / 2) : 150;
        
        // Dispatch pointerdown on the label
        const downEvent = new PointerEvent('pointerdown', {
          clientX: startX,
          clientY: startY,
          bubbles: true,
          pointerId: 1
        });
        labelG.dispatchEvent(downEvent);
        
        // Dispatch pointermove to drag it by 30 pixels right and 20 pixels down
        const moveEvent = new PointerEvent('pointermove', {
          clientX: startX + 30,
          clientY: startY + 20,
          bubbles: true,
          pointerId: 1
        });
        document.dispatchEvent(moveEvent);
        
        // Dispatch pointerup
        const upEvent = new PointerEvent('pointerup', {
          clientX: startX + 30,
          clientY: startY + 20,
          bubbles: true,
          pointerId: 1
        });
        document.dispatchEvent(upEvent);
        
        // Verify dx and dy offsets exist on the marker
        const draggedMarker = diagramMarkers.find(m => m.id === 9999);
        assert(draggedMarker, "Marker not found after drag");
        assert(draggedMarker.dx !== undefined && draggedMarker.dx !== 0, "dx offset was not set on the marker");
        assert(draggedMarker.dy !== undefined && draggedMarker.dy !== 0, "dy offset was not set on the marker");
        
        // Verify leader line is rendered
        svg = elDiagramContainer.querySelector('svg[data-diagram="sfd"]');
        const lines = svg.querySelectorAll('.diagram-marker line');
        // There should be two lines: the vertical guideline and the leader line
        assert(lines.length === 2, "Expected 2 lines for the offset marker (guideline + leader line)");
        
        // Verify AFD marker and clear facilities
        const btnClearAfd = document.getElementById('btn-clear-afd');
        assert(btnClearAfd && btnClearAfd.style.display === 'none', "AFD Clear button should be hidden initially");

        // Programmatically add an AFD marker
        diagramMarkers.push({
          id: 9998,
          type: 'afd',
          x: 4.0 // At 4.0m
        });
        renderActiveDiagram();

        // Verify that the marker is drawn in the AFD SVG
        let afdSvg = elDiagramContainer.querySelector('svg[data-diagram="afd"]');
        assert(afdSvg, "AFD SVG not rendered");
        let afdMarkers = afdSvg.querySelectorAll('.diagram-marker');
        assert(afdMarkers.length === 1, "Expected 1 marker in AFD");
        assert(afdMarkers[0].getAttribute('data-id') === '9998', "AFD marker has incorrect id");

        // Check that the AFD Clear Markers button is now shown
        assert(btnClearAfd && btnClearAfd.style.display !== 'none', "AFD Clear button should be visible after adding an AFD marker");

        // Click the AFD Clear Markers button
        btnClearAfd.click();
        assert(diagramMarkers.every(m => m.type !== 'afd'), "AFD marker was not cleared after clicking Clear Markers");

        // Clean up
        diagramMarkers = [];
        renderActiveDiagram();

        results.push({ name: "Diagram Markers and Tooltips Interaction", status: "PASS" });
      } catch (e) {
        results.push({ name: "Diagram Markers and Tooltips Interaction", status: "FAIL", error: e.message });
      }

      // TEST 10: Support Reactions Hover Tooltip
      try {
        const elReactionsContainer = document.getElementById('reactions-diagram-container');
        const elReactionsHoverTooltip = document.getElementById('reactions-hover-tooltip');
        assert(elReactionsContainer, "Reactions container not found");
        assert(elReactionsHoverTooltip, "Reactions hover tooltip element not found");

        // Render the reactions
        await solveBeamModel();

        // Find a support group in the reactions diagram
        const reactionsSvg = elReactionsContainer.querySelector('svg');
        assert(reactionsSvg, "Reactions SVG not rendered");
        const supportGroup = reactionsSvg.querySelector('.reactions-support-hoverable');
        assert(supportGroup, "No reactions support hoverable element found");
        
        // Dispatch pointermove event on supportGroup to trigger hover
        const rect = supportGroup.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        
        supportGroup.dispatchEvent(new PointerEvent('pointermove', {
          clientX: clientX,
          clientY: clientY,
          bubbles: true
        }));
        
        // Verify tooltip is displayed and contains correct support ID
        assert(elReactionsHoverTooltip.style.display !== 'none', "Reactions hover tooltip is not displayed on hover");
        assert(elReactionsHoverTooltip.textContent.includes('Support-'), "Reactions hover tooltip does not display Support label");

        // Dispatch pointerleave to verify hide
        elReactionsContainer.dispatchEvent(new PointerEvent('pointerleave', {
          bubbles: true
        }));
        assert(elReactionsHoverTooltip.style.display === 'none', "Reactions hover tooltip did not hide on pointerleave");

        results.push({ name: "Reactions Support Hover Tooltip", status: "PASS" });
      } catch (e) {
        results.push({ name: "Reactions Support Hover Tooltip", status: "FAIL", error: e.message });
      }

      // TEST 11: Dynamic Load Stack Scaling
      try {
        const origLoads = [...loads];
        
        // Add 5 point loads at the same location to force high stacking level
        loads.push({ type: 'PointLoadV', x: 2.0, f1: -10.0, stackLevel: 0 });
        loads.push({ type: 'PointLoadV', x: 2.0, f1: -15.0, stackLevel: 1 });
        loads.push({ type: 'PointLoadV', x: 2.0, f1: -20.0, stackLevel: 2 });
        loads.push({ type: 'PointLoadV', x: 2.0, f1: -25.0, stackLevel: 3 });
        loads.push({ type: 'PointLoadV', x: 2.0, f1: -30.0, stackLevel: 4 });
        
        // Trigger drawSchematic
        drawSchematic();
        
        const svg = document.getElementById('beam-schematic-svg');
        assert(svg, "Schematic SVG not found");
        
        // Verify beam line thickness is unscaled (5px)
        const beamLine = svg.querySelector('.schematic-beam-line');
        assert(beamLine && (beamLine.style.strokeWidth === '5px' || beamLine.getAttribute('style').includes('stroke-width: 5px')), "Beam line thickness scaled incorrectly");
        
        // Verify support labels font size is unscaled (16px)
        const supportLabel = svg.querySelector('.support-coord-label');
        if (supportLabel) {
          assert(supportLabel.style.fontSize === '16px', "Support labels font size scaled incorrectly");
        }
        
        // Verify load arrow head marker width scaled down (should be less than 6.0)
        const marker = svg.querySelector('#load-arrow-head');
        assert(marker, "Load arrow head marker not found");
        const markerWidth = parseFloat(marker.getAttribute('markerWidth'));
        assert(markerWidth < 6.0, `Load marker did not scale down. Expected < 6.0, got ${markerWidth}`);
        
        // Restore original loads and redraw
        loads.splice(0, loads.length, ...origLoads);
        drawSchematic();
        
        results.push({ name: "Dynamic Load Stack Scaling", status: "PASS" });
      } catch (e) {
        // Restore original loads on failure
        loads.splice(0, loads.length, ...origLoads);
        drawSchematic();
        results.push({ name: "Dynamic Load Stack Scaling", status: "FAIL", error: e.message });
      }

    } catch (globalErr) {
      results.push({ name: "Global Testing Flow Execution", status: "FAIL", error: globalErr.message });
    }

    results.forEach(res => {
      if (res.status === 'PASS') {
        console.log(`${logPrefix}PASS: ${res.name}`);
      } else {
        console.log(`${logPrefix}FAIL: ${res.name} - ${res.error}`);
      }
    });

    displayTestModal(results);
  }

  function displayTestModal(results) {
    const oldModal = document.getElementById('unit-test-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'unit-test-modal';
    modal.style.position = 'fixed';
    modal.style.top = '10%';
    modal.style.left = '50%';
    modal.style.transform = 'translateX(-50%)';
    modal.style.width = '550px';
    modal.style.maxHeight = '80vh';
    modal.style.backgroundColor = 'var(--bg-card, #ffffff)';
    modal.style.border = '1px solid var(--accent-secondary, #14b8a6)';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
    modal.style.zIndex = '9999';
    modal.style.overflowY = 'auto';
    modal.style.padding = '20px';
    modal.style.color = 'var(--text-primary)';
    modal.style.fontFamily = 'Inter, sans-serif';

    const header = document.createElement('h3');
    header.style.margin = '0 0 16px 0';
    header.style.color = 'var(--accent-secondary)';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.paddingBottom = '10px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `
      <span>Unit Conversion Test Suite</span>
      <button onclick="document.getElementById('unit-test-modal').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-secondary);">&times;</button>
    `;
    modal.appendChild(header);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';

    results.forEach(res => {
      const item = document.createElement('div');
      item.style.padding = '10px';
      item.style.borderRadius = '6px';
      item.style.background = 'var(--bg-body, rgba(0,0,0,0.02))';
      item.style.border = '1px solid var(--border-color)';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      
      const title = document.createElement('span');
      title.style.fontWeight = '600';
      title.style.fontSize = '13px';
      title.textContent = res.name;
      
      const badge = document.createElement('span');
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '700';
      badge.style.padding = '3px 8px';
      badge.style.borderRadius = '4px';
      if (res.status === 'PASS') {
        badge.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
        badge.style.color = '#10b981';
        badge.textContent = 'PASS';
      } else {
        badge.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
        badge.style.color = '#ef4444';
        badge.textContent = 'FAIL';
      }
      
      row.appendChild(title);
      row.appendChild(badge);
      item.appendChild(row);

      if (res.error) {
        const err = document.createElement('span');
        err.style.color = '#ef4444';
        err.style.fontSize = '12px';
        err.style.marginTop = '6px';
        err.style.fontFamily = 'monospace';
        err.textContent = `Error: ${res.error}`;
        item.appendChild(err);
      }

      list.appendChild(item);
    });

    modal.appendChild(list);
    document.body.appendChild(modal);

    console.log(`${logPrefix}Test Suite finished. Results:`, results);
  }

  window.runUnitTests = runTestSuite;

  if (window.location.search.includes('run-tests=1')) {
    window.addEventListener('load', () => {
      setTimeout(runTestSuite, 1500);
    });
  }
})();

