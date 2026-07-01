/**
 * Apex Structural Analysis Suite - App Controller
 * Integrates input, output, presets, visualization, and unit testing.
 * Supports cover plates.
 */

// Global Section Database
let SECTION_DATABASE = null;

// Dynamic input field configuration settings per unit type
const UNIT_INPUT_CONFIGS = {
  mm: {
    depth: { min: 10, step: 1 },
    width: { min: 5, step: 1 },
    thickness: { min: 1, step: 0.1 }
  },
  cm: {
    depth: { min: 1.0, step: 0.1 },
    width: { min: 0.5, step: 0.1 },
    thickness: { min: 0.1, step: 0.01 }
  },
  m: {
    depth: { min: 0.010, step: 0.001 },
    width: { min: 0.005, step: 0.001 },
    thickness: { min: 0.001, step: 0.0001 }
  },
  in: {
    depth: { min: 0.4, step: 0.05 },
    width: { min: 0.2, step: 0.05 },
    thickness: { min: 0.04, step: 0.005 }
  }
};

// Dynamically updates steps and minimum values for input elements
function updateInputSpecs() {
  const cfg = UNIT_INPUT_CONFIGS[STATE.inputUnit] || UNIT_INPUT_CONFIGS.mm;
  
  // Depth
  elD.min = cfg.depth.min;
  elD.step = cfg.depth.step;
  elSliderD.min = cfg.depth.min;
  elSliderD.step = cfg.depth.step;
  
  // Widths
  const widthInputs = [
    { num: elBtf, slider: elSliderBtf },
    { num: elBbf, slider: elSliderBbf },
    { num: elBtp, slider: elSliderBtp },
    { num: elBbp, slider: elSliderBbp }
  ];
  widthInputs.forEach(pair => {
    pair.num.min = cfg.width.min;
    pair.num.step = cfg.width.step;
    pair.slider.min = cfg.width.min;
    pair.slider.step = cfg.width.step;
  });
  
  // Thicknesses
  const thickInputs = [
    { num: elTtf, slider: elSliderTtf },
    { num: elTbf, slider: elSliderTbf },
    { num: elTw, slider: elSliderTw },
    { num: elTtp, slider: elSliderTtp },
    { num: elTbp, slider: elSliderTbp }
  ];
  thickInputs.forEach(pair => {
    pair.num.min = cfg.thickness.min;
    pair.num.step = cfg.thickness.step;
    pair.slider.min = cfg.thickness.min;
    pair.slider.step = cfg.thickness.step;
  });
}


// Application State
const STATE = {
  theme: 'light',
  inputUnit: 'mm',
  outputUnit: 'cm',
  syncFlanges: false,
  currentPreset: 'custom',
  params: {
    D: 250,
    btf: 150,
    ttf: 12,
    bbf: 150,
    tbf: 12,
    tw: 8,
    
    // Cover Plate Parameters
    hasTopPlate: false,
    btp: 160,
    ttp: 10,
    hasBottomPlate: false,
    bbp: 160,
    tbp: 10
  },
  rowUnits: {
    A: 'cm',
    P: 'cm',
    yc: 'cm',
    yt: 'cm',
    Ixx: 'cm',
    Iyy: 'cm',
    rxx: 'cm',
    ryy: 'cm',
    Sxt: 'cm',
    Sxb: 'cm',
    Sy: 'cm',
    Zxx: 'cm',
    Zyy: 'cm',
    J: 'cm',
    Cw: 'cm'
  }
};

// DOM Elements
let elThemeToggle, elThemeIcon, elThemeText;
let elStandardSelect, elProfileSelect, elInputUnit, elOutputUnit, elSyncToggle;
let elTopPlateToggle, elBottomPlateToggle;
let elD, elSliderD, elBtf, elSliderBtf, elTtf, elSliderTtf;
let elBbf, elSliderBbf, elTbf, elSliderTbf, elTw, elSliderTw;
let elBtp, elSliderBtp, elTtp, elSliderTtp;
let elBbp, elSliderBbp, elTbp, elSliderTbp;
let elGroupBbf, elGroupTbf, elGroupTopPlate, elGroupBottomPlate, elValidationError;
let elBtnCopy, elToast, elToastMsg;

document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  await loadSectionDatabase();
  
  // Set default active tab dropdown options
  const activeTab = document.querySelector('.nav-menu .nav-item.active');
  let sectionKey = 'I-Section';
  if (activeTab) {
    sectionKey = activeTab.getAttribute('data-section');
    populateStandardSelect(sectionKey);
  }
  
  updateLabelsAndToggles(sectionKey);
  setupEventListeners();
  runCalculationEngineTests();
  
  updateInputSpecs();
  adjustSliderRanges(STATE.params.D);
  updateUI();
});

// Asynchronously load the steel profiles database
async function loadSectionDatabase() {
  try {
    const response = await fetch('section-presets.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    SECTION_DATABASE = await response.json();
    
    // Bind navigation linkage dynamically based on JSON keys
    bindNavigationLinkage();
  } catch (error) {
    console.error("Failed to load section profile database:", error);
    showToast("Error loading profile database.", true);
  }
}

// Dynamic labels, flange symmetry locking and cover plate hiding for Box Section vs I-Section
function updateLabelsAndToggles(sectionKey) {
  const labelD = document.querySelector('label[for="param-D"]');
  const labelBtf = document.querySelector('label[for="param-btf"]');
  const labelTtf = document.querySelector('label[for="param-ttf"]');
  const labelTw = document.querySelector('label[for="param-tw"]');
  
  const elStandardPrint = document.getElementById('print-standard-val');
  if (elStandardPrint) elStandardPrint.textContent = 'Custom';
  
  const syncToggleContainer = elSyncToggle ? elSyncToggle.closest('.switch-group') : null;
  const topPlateToggleContainer = elTopPlateToggle ? elTopPlateToggle.closest('.switch-group') : null;
  const bottomPlateToggleContainer = elBottomPlateToggle ? elBottomPlateToggle.closest('.switch-group') : null;
  
  if (sectionKey === 'Box-Section') {
    // 1. Rename labels for Box Section (removing "Top/Bottom" or "Depth" vs "Height" confusion)
    if (labelD) labelD.innerHTML = 'Overall Height <span class="label-symbol">D</span>';
    if (labelBtf) labelBtf.innerHTML = 'Width <span class="label-symbol">b</span>';
    if (labelTtf) labelTtf.innerHTML = 'Flange Thickness <span class="label-symbol">t<sub>f</sub></span>';
    if (labelTw) labelTw.innerHTML = 'Web Thickness <span class="label-symbol">t<sub>w</sub></span>';
    
    // 2. Force symmetry lock
    STATE.syncFlanges = true;
    if (elSyncToggle) elSyncToggle.checked = true;
    if (syncToggleContainer) syncToggleContainer.style.display = 'none';
    
    // Hide bottom flange fields
    if (elGroupBbf) elGroupBbf.style.display = 'none';
    if (elGroupTbf) elGroupTbf.style.display = 'none';
    
    // Sync bottom parameters to top parameters
    STATE.params.bbf = STATE.params.btf;
    STATE.params.tbf = STATE.params.ttf;
    if (elBbf) elBbf.value = STATE.params.bbf;
    if (elSliderBbf) elSliderBbf.value = STATE.params.bbf;
    if (elTbf) elTbf.value = STATE.params.tbf;
    if (elSliderTbf) elSliderTbf.value = STATE.params.tbf;
    
    // 3. Hide cover plates toggles and inputs for Box Section
    STATE.params.hasTopPlate = false;
    STATE.params.hasBottomPlate = false;
    if (elTopPlateToggle) elTopPlateToggle.checked = false;
    if (elBottomPlateToggle) elBottomPlateToggle.checked = false;
    if (elGroupTopPlate) elGroupTopPlate.style.display = 'none';
    if (elGroupBottomPlate) elGroupBottomPlate.style.display = 'none';
    if (topPlateToggleContainer) topPlateToggleContainer.style.display = 'none';
    if (bottomPlateToggleContainer) bottomPlateToggleContainer.style.display = 'none';
  } else {
    // 1. Restore labels for I-Section
    if (labelD) labelD.innerHTML = 'Overall Depth <span class="label-symbol">D</span>';
    if (labelBtf) labelBtf.innerHTML = 'Top Flange Width <span class="label-symbol">b<sub>tf</sub></span>';
    if (labelTtf) labelTtf.innerHTML = 'Top Flange Thickness <span class="label-symbol">t<sub>tf</sub></span>';
    if (labelTw) labelTw.innerHTML = 'Web Thickness <span class="label-symbol">t<sub>w</sub></span>';
    
    // 2. Restore Symmetric Flanges toggle and visibility
    if (syncToggleContainer) syncToggleContainer.style.display = 'flex';
    
    // Update bottom flange inputs visibility based on checkbox status
    if (elSyncToggle && elSyncToggle.checked) {
      if (elGroupBbf) elGroupBbf.style.display = 'none';
      if (elGroupTbf) elGroupTbf.style.display = 'none';
      STATE.syncFlanges = true;
    } else {
      if (elGroupBbf) elGroupBbf.style.display = 'block';
      if (elGroupTbf) elGroupTbf.style.display = 'block';
      STATE.syncFlanges = false;
    }
    
    // 3. Restore cover plates toggles
    if (topPlateToggleContainer) topPlateToggleContainer.style.display = 'flex';
    if (bottomPlateToggleContainer) bottomPlateToggleContainer.style.display = 'flex';
  }
}

// Bind sidebar tab statuses and click behaviors based on database availability
function bindNavigationLinkage() {
  const navItems = document.querySelectorAll('.nav-menu .nav-item');
  navItems.forEach(item => {
    const sectionKey = item.getAttribute('data-section');
    
    if (sectionKey === 'Frame-Analysis') {
      item.classList.remove('disabled');
      const lockIcon = item.querySelector('.lock-icon');
      if (lockIcon) lockIcon.remove();
      
      item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all nav items
        document.querySelectorAll('.nav-menu .nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Toggle view containers
        document.getElementById('section-properties-view').style.display = 'none';
        document.getElementById('beam-analysis-view').style.display = 'none';
        document.getElementById('frame-analysis-view').style.display = 'block';
        
        // Update header
        const headerTitle = document.querySelector('.header-title h2.print-hidden');
        if (headerTitle) {
          headerTitle.textContent = "3D Frame Analysis";
        }
        
        // Trigger initialization or recalculation in frame solver
        if (window.initFrameAnalysisView) {
          window.initFrameAnalysisView();
        }
      });
      return;
    }
    
    if (sectionKey === 'Single-Beam') {
      item.classList.remove('disabled');
      const lockIcon = item.querySelector('.lock-icon');
      if (lockIcon) lockIcon.remove();
      
      item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all nav items
        document.querySelectorAll('.nav-menu .nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Toggle view containers
        document.getElementById('section-properties-view').style.display = 'none';
        document.getElementById('beam-analysis-view').style.display = 'block';
        
        // Update header
        const headerTitle = document.querySelector('.header-title h2.print-hidden');
        if (headerTitle) {
          headerTitle.textContent = "Beam & Frame Analysis";
        }
        
        // Trigger initialization or recalculation in beam solver
        if (window.initBeamAnalysisView) {
          window.initBeamAnalysisView();
        }
      });
      return;
    }
    
    const isAvailable = SECTION_DATABASE && SECTION_DATABASE[sectionKey] && Object.keys(SECTION_DATABASE[sectionKey]).length > 0;
    
    if (isAvailable) {
      item.classList.remove('disabled');
      const lockIcon = item.querySelector('.lock-icon');
      if (lockIcon) lockIcon.remove();
      
      // Click listener to switch active tabs
      item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all nav items
        document.querySelectorAll('.nav-menu .nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Toggle view containers
        document.getElementById('beam-analysis-view').style.display = 'none';
        document.getElementById('section-properties-view').style.display = 'block';
        
        // Populate catalog options for this section
        populateStandardSelect(sectionKey);
        
        // Update headers to match active section type
        const headerTitle = document.querySelector('.header-title h2.print-hidden');
        if (headerTitle) {
          headerTitle.textContent = `${item.textContent.trim()} Property Calculator`;
        }
        const printTitle = document.getElementById('print-section-type');
        if (printTitle) {
          const typeVal = printTitle.querySelector('.type-value');
          if (typeVal) typeVal.textContent = item.textContent.trim();
        }
        
        // Reset inputs and sliders to Custom state
        STATE.currentPreset = 'custom';
        if (elStandardSelect) elStandardSelect.value = 'custom';
        if (elProfileSelect) elProfileSelect.value = 'custom';
        const elPresetPrint = document.getElementById('print-preset-val');
        if (elPresetPrint) elPresetPrint.textContent = 'Custom';
        
        updateLabelsAndToggles(sectionKey);
        updateUI();
      });
    } else {
      item.classList.add('disabled');
      let lockIcon = item.querySelector('.lock-icon');
      if (!lockIcon) {
        lockIcon = document.createElement('span');
        lockIcon.className = 'lock-icon';
        lockIcon.textContent = 'Soon';
        item.appendChild(lockIcon);
      }
    }
  });
}

// Expose STATE and getActiveSectionProperties globally
window.STATE = STATE;
window.getActiveSectionProperties = function() {
  const activeTab = document.querySelector('.nav-menu .nav-item[data-section]:not([data-section="Single-Beam"]).active') || document.querySelector('#nav-isection');
  const sectionKey = activeTab ? activeTab.getAttribute('data-section') : 'I-Section';
  const rawResults = sectionKey === 'Box-Section'
    ? calculateBoxSectionProperties(STATE.params, STATE.inputUnit)
    : calculateISectionProperties(STATE.params, STATE.inputUnit);
  return {
    Ixx: rawResults.Ixx * 1e-12, // mm4 to m4
    A: rawResults.A * 1e-6       // mm2 to m2
  };
};


// Dynamically populate the standards/databases select dropdown
function populateStandardSelect(sectionKey) {
  if (!elStandardSelect) return;
  
  // Clear and add default custom/select standard option
  elStandardSelect.innerHTML = '<option value="custom">-- Custom / Select Standard --</option>';
  
  const sectionData = SECTION_DATABASE[sectionKey];
  if (!sectionData) return;
  
  // Add standards as options
  Object.keys(sectionData).forEach(groupLabel => {
    const option = document.createElement('option');
    option.value = groupLabel;
    option.textContent = groupLabel;
    elStandardSelect.appendChild(option);
  });
  
  // Reset standard select to custom
  elStandardSelect.value = 'custom';
  const elStandardPrint = document.getElementById('print-standard-val');
  if (elStandardPrint) elStandardPrint.textContent = 'Custom';
  
  // Trigger profile dropdown update
  populateProfileSelect(sectionKey, 'custom');
}

// Dynamically populate the profiles dropdown based on the chosen standard
function populateProfileSelect(sectionKey, standardKey) {
  if (!elProfileSelect) return;
  
  // Clear existing options, keeping Custom
  elProfileSelect.innerHTML = '<option value="custom">-- Custom Dimensions --</option>';
  
  if (standardKey === 'custom') {
    elProfileSelect.value = 'custom';
    return;
  }
  
  const sectionData = SECTION_DATABASE[sectionKey];
  if (!sectionData) return;
  
  const profiles = sectionData[standardKey];
  if (!profiles) return;
  
  profiles.forEach((profile, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = profile.name;
    elProfileSelect.appendChild(option);
  });
  
  elProfileSelect.value = 'custom'; // default to custom until a profile is chosen
}

// Handles selecting a standard / manufacturer standard
function handleStandardChange(e) {
  const activeTab = document.querySelector('.nav-menu .nav-item.active');
  const sectionKey = activeTab ? activeTab.getAttribute('data-section') : 'I-Section';
  const standardKey = e.target.value;
  
  populateProfileSelect(sectionKey, standardKey);
  
  // Reset profile select and global currentPreset to custom
  elProfileSelect.value = 'custom';
  STATE.currentPreset = 'custom';
  
  const elPresetPrint = document.getElementById('print-preset-val');
  if (elPresetPrint) elPresetPrint.textContent = 'Custom';
  
  const elStandardPrint = document.getElementById('print-standard-val');
  if (elStandardPrint) {
    elStandardPrint.textContent = standardKey === 'custom' ? 'Custom' : standardKey;
  }
  
  updateUI();
}

// Handles selecting a profile preset
function handleProfileChange(e) {
  const indexVal = e.target.value;
  const elPresetPrint = document.getElementById('print-preset-val');
  
  if (indexVal === 'custom') {
    STATE.currentPreset = 'custom';
    if (elPresetPrint) elPresetPrint.textContent = 'Custom';
    updateUI();
    return;
  }
  
  const activeTab = document.querySelector('.nav-menu .nav-item.active');
  const sectionKey = activeTab ? activeTab.getAttribute('data-section') : 'I-Section';
  const standardKey = elStandardSelect.value;
  const index = Number(indexVal);
  
  const preset = SECTION_DATABASE[sectionKey][standardKey][index];
  
  if (preset) {
    STATE.currentPreset = `${standardKey}::${index}`;
    if (elPresetPrint) elPresetPrint.textContent = preset.name;
    
    const elStandardPrint = document.getElementById('print-standard-val');
    if (elStandardPrint) {
      elStandardPrint.textContent = standardKey === 'custom' ? 'Custom' : standardKey;
    }
    
    // Scale preset from mm to active input unit
    const toCurrentUnit = UNIT_CONVERSIONS[STATE.inputUnit].length;
    
    // Populate parameters
    STATE.params.D = Number((preset.D * toCurrentUnit).toFixed(4));
    STATE.params.btf = Number((preset.btf * toCurrentUnit).toFixed(4));
    STATE.params.ttf = Number((preset.ttf * toCurrentUnit).toFixed(4));
    STATE.params.bbf = Number((preset.bbf * toCurrentUnit).toFixed(4));
    STATE.params.tbf = Number((preset.tbf * toCurrentUnit).toFixed(4));
    STATE.params.tw = Number((preset.tw * toCurrentUnit).toFixed(4));
    
    // Cover plates are off for standard steel catalogs
    STATE.params.hasTopPlate = false;
    STATE.params.hasBottomPlate = false;
    elTopPlateToggle.checked = false;
    elBottomPlateToggle.checked = false;
    elGroupTopPlate.style.display = 'none';
    elGroupBottomPlate.style.display = 'none';
    
    // Auto-enable flange symmetry if not in Box Section
    if (sectionKey !== 'Box-Section') {
      STATE.syncFlanges = true;
      elSyncToggle.checked = true;
      elGroupBbf.style.display = 'none';
      elGroupTbf.style.display = 'none';
    } else {
      // Box section forces symmetry locking
      STATE.params.bbf = STATE.params.btf;
      STATE.params.tbf = STATE.params.ttf;
      elBbf.value = STATE.params.bbf;
      elSliderBbf.value = STATE.params.bbf;
      elTbf.value = STATE.params.tbf;
      elSliderTbf.value = STATE.params.tbf;
    }
    
    // Reset range slider max values based on size of shape
    adjustSliderRanges(STATE.params.D);

    // Populate inputs
    populateInputsFromState();
    updateUI();
    showToast(`Loaded preset: ${preset.name}`);
  }
}

function initializeElements() {
  // Theme Toggle
  elThemeToggle = document.getElementById('theme-toggle');
  elThemeIcon = document.getElementById('theme-icon');
  elThemeText = document.getElementById('theme-text');
  
  // Settings & Toggles
  elStandardSelect = document.getElementById('catalog-standard-select');
  elProfileSelect = document.getElementById('catalog-profile-select');
  elInputUnit = document.getElementById('input-unit');
  elOutputUnit = document.getElementById('output-unit');
  elSyncToggle = document.getElementById('sync-flanges-toggle');
  elTopPlateToggle = document.getElementById('top-plate-toggle');
  elBottomPlateToggle = document.getElementById('bottom-plate-toggle');
  
  // Number and Slider Inputs (I-Section Core)
  elD = document.getElementById('param-D');
  elSliderD = document.getElementById('slider-D');
  elBtf = document.getElementById('param-btf');
  elSliderBtf = document.getElementById('slider-btf');
  elTtf = document.getElementById('param-ttf');
  elSliderTtf = document.getElementById('slider-ttf');
  elBbf = document.getElementById('param-bbf');
  elSliderBbf = document.getElementById('slider-bbf');
  elTbf = document.getElementById('param-tbf');
  elSliderTbf = document.getElementById('slider-tbf');
  elTw = document.getElementById('param-tw');
  elSliderTw = document.getElementById('slider-tw');
  
  // Cover Plate Inputs
  elBtp = document.getElementById('param-btp');
  elSliderBtp = document.getElementById('slider-btp');
  elTtp = document.getElementById('param-ttp');
  elSliderTtp = document.getElementById('slider-ttp');
  elBbp = document.getElementById('param-bbp');
  elSliderBbp = document.getElementById('slider-bbp');
  elTbp = document.getElementById('param-tbp');
  elSliderTbp = document.getElementById('slider-tbp');
  
  // Input Groups & Validation
  elGroupBbf = document.getElementById('group-bbf');
  elGroupTbf = document.getElementById('group-tbf');
  elGroupTopPlate = document.getElementById('group-top-plate');
  elGroupBottomPlate = document.getElementById('group-bottom-plate');
  elValidationError = document.getElementById('validation-error');
  
  // Actions
  elBtnCopy = document.getElementById('btn-copy');
  
  // Feedback
  elToast = document.getElementById('toast-notify');
  elToastMsg = document.getElementById('toast-message');
}

function setupEventListeners() {
  // Theme Toggle
  elThemeToggle.addEventListener('click', toggleTheme);
  
  // Settings & Toggles
  elStandardSelect.addEventListener('change', handleStandardChange);
  elProfileSelect.addEventListener('change', handleProfileChange);
  elInputUnit.addEventListener('change', handleInputUnitChange);
  elOutputUnit.addEventListener('change', handleOutputUnitChange);
  elSyncToggle.addEventListener('change', handleSyncToggle);
  elTopPlateToggle.addEventListener('change', handleTopPlateToggle);
  elBottomPlateToggle.addEventListener('change', handleBottomPlateToggle);
  
  // Interactive Inputs (Number <-> Slider)
  bindInputPair(elD, elSliderD, 'D');
  bindInputPair(elBtf, elSliderBtf, 'btf');
  bindInputPair(elTtf, elSliderTtf, 'ttf');
  bindInputPair(elBbf, elSliderBbf, 'bbf');
  bindInputPair(elTbf, elSliderTbf, 'tbf');
  bindInputPair(elTw, elSliderTw, 'tw');
  
  // Cover Plates Number <-> Slider Bindings
  bindInputPair(elBtp, elSliderBtp, 'btp');
  bindInputPair(elTtp, elSliderTtp, 'ttp');
  bindInputPair(elBbp, elSliderBbp, 'bbp');
  bindInputPair(elTbp, elSliderTbp, 'tbp');
  
  // Interactive Hover Highlights
  setupHoverHighlights();

  // Action Buttons
  elBtnCopy.addEventListener('click', copyResultsToClipboard);

  // Row-Specific Unit Selects
  setupRowUnitSelectListeners();

  // Mobile Sidebar Event Listeners
  const elSidebar = document.querySelector('.sidebar');
  const elSidebarToggle = document.getElementById('sidebar-toggle');
  const elSidebarBackdrop = document.getElementById('sidebar-backdrop');

  if (elSidebar && elSidebarToggle && elSidebarBackdrop) {
    elSidebarToggle.addEventListener('click', () => {
      elSidebar.classList.toggle('active');
      elSidebarBackdrop.classList.toggle('active');
    });

    elSidebarBackdrop.addEventListener('click', () => {
      elSidebar.classList.remove('active');
      elSidebarBackdrop.classList.remove('active');
    });

    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.classList.contains('disabled')) return;
        elSidebar.classList.remove('active');
        elSidebarBackdrop.classList.remove('active');
      });
    });
  }
}

function setupRowUnitSelectListeners() {
  document.querySelectorAll('.row-unit-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const prop = e.target.getAttribute('data-property');
      STATE.rowUnits[prop] = e.target.value;
      updateUI();
    });
  });
}

// Reset the profile catalog preset selector to Custom
function resetPresetSelector() {
  if (STATE.currentPreset !== 'custom') {
    STATE.currentPreset = 'custom';
    if (elProfileSelect) elProfileSelect.value = 'custom';
    const elPresetPrint = document.getElementById('print-preset-val');
    if (elPresetPrint) elPresetPrint.textContent = 'Custom';
  }
}

// Validate inputs and show/hide the error/warning alert box
function validateAndShowErrors() {
  const activeTab = document.querySelector('.nav-menu .nav-item.active');
  const sectionKey = activeTab ? activeTab.getAttribute('data-section') : 'I-Section';

  const validation = sectionKey === 'Box-Section'
    ? validateBoxSectionParams(STATE.params)
    : validateISectionParams(STATE.params);
  
  if (validation.error) {
    elValidationError.textContent = validation.error;
    elValidationError.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
    elValidationError.style.borderColor = 'rgba(239, 68, 68, 0.2)';
    elValidationError.style.color = 'var(--error)';
    elValidationError.style.display = 'block';
  } else if (validation.warning) {
    elValidationError.textContent = validation.warning;
    elValidationError.style.backgroundColor = 'rgba(245, 158, 11, 0.1)'; // Amber warning background
    elValidationError.style.borderColor = 'rgba(245, 158, 11, 0.2)';
    elValidationError.style.color = '#d97706'; // Amber warning text
    elValidationError.style.display = 'block';
  } else {
    elValidationError.style.display = 'none';
  }
}

// Bind a numeric input and a slider input together
function bindInputPair(numInput, sliderInput, paramKey) {
  // Slider input event (dragging)
  sliderInput.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    STATE.params[paramKey] = val;
    
    // Sync numerical value (do not clamp during dragging)
    numInput.value = val;
    
    // Sync flanges if enabled
    if (STATE.syncFlanges && (paramKey === 'btf' || paramKey === 'ttf')) {
      const partnerKey = paramKey === 'btf' ? 'bbf' : 'tbf';
      STATE.params[partnerKey] = val;
      const elNum = partnerKey === 'bbf' ? elBbf : elTbf;
      const elSlider = partnerKey === 'bbf' ? elSliderBbf : elSliderTbf;
      elNum.value = val;
      elSlider.value = val;
    }
    
    resetPresetSelector();
    updateUI(true); // update visual drawing, hide errors
  });

  // Slider change event (completed dragging)
  sliderInput.addEventListener('change', () => {
    validateAndShowErrors();
    updateUI(false);
  });

  // Number input event (typing)
  numInput.addEventListener('input', (e) => {
    const rawVal = e.target.value;
    const numericVal = Number(rawVal);
    
    // Store user parameter (temporary NaN/zero is fine)
    STATE.params[paramKey] = isNaN(numericVal) ? 0 : numericVal;
    
    // Sync slider only if values are within the bounds of the slider
    if (!isNaN(numericVal) && numericVal >= Number(sliderInput.min) && numericVal <= Number(sliderInput.max)) {
      sliderInput.value = numericVal;
    }
    
    // Sync flanges if enabled
    if (STATE.syncFlanges && (paramKey === 'btf' || paramKey === 'ttf')) {
      const partnerKey = paramKey === 'btf' ? 'bbf' : 'tbf';
      STATE.params[partnerKey] = isNaN(numericVal) ? 0 : numericVal;
      
      const elNum = partnerKey === 'bbf' ? elBbf : elTbf;
      const elSlider = partnerKey === 'bbf' ? elSliderBbf : elSliderTbf;
      
      elNum.value = rawVal;
      if (!isNaN(numericVal) && numericVal >= Number(elSlider.min) && numericVal <= Number(elSlider.max)) {
        elSlider.value = numericVal;
      }
    }
    
    resetPresetSelector();
    updateUI(true); // update visual drawing, hide errors
  });

  // Number input change event (completed typing/focus lost)
  numInput.addEventListener('change', () => {
    validateAndShowErrors();
    updateUI(false); // update drawing and show/hide errors
  });
}

// Binds SVG element hovers to input highlighting
function setupHoverHighlights() {
  document.addEventListener('mouseover', (e) => {
    const zone = e.target.closest('.interactive-zone');
    if (zone) {
      const target = zone.getAttribute('data-target');
      highlightFormGroup(target, true);
      highlightSvgZone(target, true);
    }
  });

  document.addEventListener('mouseout', (e) => {
    const zone = e.target.closest('.interactive-zone');
    if (zone) {
      const target = zone.getAttribute('data-target');
      highlightFormGroup(target, false);
      highlightSvgZone(target, false);
    }
  });

  // Highlight SVG on input focus
  const formGroups = [
    { key: 'depth', selector: '[data-input-group="depth"]' },
    { key: 'top-flange', selector: '[data-input-group="top-flange"]' },
    { key: 'bottom-flange', selector: '[data-input-group="bottom-flange"]' },
    { key: 'web', selector: '[data-input-group="web"]' },
    { key: 'top-plate', selector: '[data-input-group="top-plate"]' },
    { key: 'bottom-plate', selector: '[data-input-group="bottom-plate"]' }
  ];

  formGroups.forEach(group => {
    const elements = document.querySelectorAll(`${group.selector} input`);
    elements.forEach(input => {
      input.addEventListener('focus', () => {
        highlightSvgZone(group.key, true);
      });
      input.addEventListener('blur', () => {
        highlightSvgZone(group.key, false);
      });
    });
  });
}

function highlightFormGroup(groupName, active) {
  let selector = '';
  if (groupName === 'top-flange') selector = '[data-input-group="top-flange"]';
  else if (groupName === 'bottom-flange') selector = '[data-input-group="bottom-flange"]';
  else if (groupName === 'web') selector = '[data-input-group="web"]';
  else if (groupName === 'depth') selector = '[data-input-group="depth"]';
  else if (groupName === 'top-plate') selector = '[data-input-group="top-plate"]';
  else if (groupName === 'bottom-plate') selector = '[data-input-group="bottom-plate"]';

  if (!selector) return;
  const els = document.querySelectorAll(selector);
  els.forEach(el => {
    if (active) {
      el.style.boxShadow = 'inset 0 0 4px rgba(20, 184, 166, 0.2)';
      el.style.borderColor = 'var(--accent-secondary)';
    } else {
      el.style.boxShadow = 'none';
      el.style.borderColor = 'transparent';
    }
  });
}

// Toggle Dark and Light themes
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  html.setAttribute('data-theme', newTheme);
  STATE.theme = newTheme;
  
  if (newTheme === 'light') {
    elThemeIcon.innerHTML = `<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke-linecap="round"/>`;
    elThemeText.textContent = 'Dark Mode';
  } else {
    elThemeIcon.innerHTML = `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 7a5 5 0 100 10 5 5 0 000-10z" stroke-linecap="round"/>`;
    elThemeText.textContent = 'Light Mode';
  }
}

/// Preset loading is handled separately by standard and profile dropdowns above.

// Dynamic adjustments for slider ranges based on shape depth
function adjustSliderRanges(depth) {
  if (!depth || isNaN(depth) || depth <= 0) return;
  
  // Convert depth to mm first to evaluate the standard thresholds
  const depthMm = depth / UNIT_CONVERSIONS[STATE.inputUnit].length;
  
  const maxFactor = depthMm > 600 ? 2.5 : (depthMm > 300 ? 2.0 : 1.5);
  const maxDMm = Math.ceil(depthMm * maxFactor);
  const maxBMm = Math.ceil(depthMm * maxFactor);
  const maxTMm = Math.ceil(depthMm * 0.2); // max thickness 20% of depth
  
  // Convert limits back to current input units
  const toUnit = UNIT_CONVERSIONS[STATE.inputUnit].length;
  const maxD = Number((maxDMm * toUnit).toFixed(4));
  const maxB = Number((maxBMm * toUnit).toFixed(4));
  const maxT = Number((maxTMm * toUnit).toFixed(4));
  
  elSliderD.max = maxD;
  elD.max = maxD;
  
  elSliderBtf.max = maxB;
  elBtf.max = maxB;
  elSliderBbf.max = maxB;
  elBbf.max = maxB;
  
  elSliderTtf.max = maxT;
  elTtf.max = maxT;
  elSliderTbf.max = maxT;
  elTbf.max = maxT;

  // Cover plates and web thickness limits
  elSliderTw.max = maxT;
  elTw.max = maxT;

  elSliderBtp.max = maxB;
  elBtp.max = maxB;
  elSliderBbp.max = maxB;
  elBbp.max = maxB;

  elSliderTtp.max = maxT;
  elTtp.max = maxT;
  elSliderTbp.max = maxT;
  elTbp.max = maxT;
}

// Populate input boxes and sliders from the STATE values
function populateInputsFromState() {
  elD.value = STATE.params.D;
  elSliderD.value = STATE.params.D;
  elBtf.value = STATE.params.btf;
  elSliderBtf.value = STATE.params.btf;
  elTtf.value = STATE.params.ttf;
  elSliderTtf.value = STATE.params.ttf;
  elBbf.value = STATE.params.bbf;
  elSliderBbf.value = STATE.params.bbf;
  elTbf.value = STATE.params.tbf;
  elSliderTbf.value = STATE.params.tbf;
  elTw.value = STATE.params.tw;
  elSliderTw.value = STATE.params.tw;

  // Cover plates
  elBtp.value = STATE.params.btp;
  elSliderBtp.value = STATE.params.btp;
  elTtp.value = STATE.params.ttp;
  elSliderTtp.value = STATE.params.ttp;
  elBbp.value = STATE.params.bbp;
  elSliderBbp.value = STATE.params.bbp;
  elTbp.value = STATE.params.tbp;
  elSliderTbp.value = STATE.params.tbp;
}

// Handle switching input units
function handleInputUnitChange(e) {
  const oldUnit = STATE.inputUnit;
  const newUnit = e.target.value;
  STATE.inputUnit = newUnit;
  
  // Convert current parameters to maintain physical size
  const convFactor = UNIT_CONVERSIONS[newUnit].length / UNIT_CONVERSIONS[oldUnit].length;
  
  const convertibleKeys = ['D', 'btf', 'ttf', 'bbf', 'tbf', 'tw', 'btp', 'ttp', 'bbp', 'tbp'];
  convertibleKeys.forEach(key => {
    STATE.params[key] = Number((STATE.params[key] * convFactor).toFixed(4));
  });
  
  // Recalculate ranges and steps
  updateInputSpecs();
  adjustSliderRanges(STATE.params.D);
  populateInputsFromState();
  updateUI();
}

// Handle switching output units
function handleOutputUnitChange(e) {
  const newUnit = e.target.value;
  STATE.outputUnit = newUnit;
  // Update all row-specific units to match the global output unit
  for (const key in STATE.rowUnits) {
    STATE.rowUnits[key] = newUnit;
    const select = document.querySelector(`.row-unit-select[data-property="${key}"]`);
    if (select) {
      select.value = newUnit;
    }
  }
  updateUI();
}

// Handle symmetry toggle
function handleSyncToggle(e) {
  const checked = e.target.checked;
  STATE.syncFlanges = checked;
  
  if (checked) {
    elGroupBbf.style.display = 'none';
    elGroupTbf.style.display = 'none';
    
    // Copy top flange to bottom flange
    STATE.params.bbf = STATE.params.btf;
    STATE.params.tbf = STATE.params.ttf;
    elBbf.value = STATE.params.bbf;
    elSliderBbf.value = STATE.params.bbf;
    elTbf.value = STATE.params.tbf;
    elSliderTbf.value = STATE.params.tbf;
    
    updateUI();
  } else {
    elGroupBbf.style.display = 'block';
    elGroupTbf.style.display = 'block';
  }
}

// Handles toggling top cover plate visibility
function handleTopPlateToggle(e) {
  STATE.params.hasTopPlate = e.target.checked;
  elGroupTopPlate.style.display = STATE.params.hasTopPlate ? 'block' : 'none';
  updateUI();
}

// Handles toggling bottom cover plate visibility
function handleBottomPlateToggle(e) {
  STATE.params.hasBottomPlate = e.target.checked;
  elGroupBottomPlate.style.display = STATE.params.hasBottomPlate ? 'block' : 'none';
  updateUI();
}

// Calculate and Update the UI drawing and results table
function updateUI(hideErrors = false) {
  // Update unit label elements
  const lenLabels = document.querySelectorAll('.unit-lbl-length');
  lenLabels.forEach(el => el.textContent = STATE.inputUnit);

  // Get active section key to route calculations & validation
  const activeTab = document.querySelector('.nav-menu .nav-item.active');
  const sectionKey = activeTab ? activeTab.getAttribute('data-section') : 'I-Section';

  // Validate inputs internally before calculating
  const validation = sectionKey === 'Box-Section'
    ? validateBoxSectionParams(STATE.params)
    : validateISectionParams(STATE.params);
  
  if (!hideErrors) {
    if (validation.error) {
      elValidationError.textContent = validation.error;
      elValidationError.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      elValidationError.style.borderColor = 'rgba(239, 68, 68, 0.2)';
      elValidationError.style.color = 'var(--error)';
      elValidationError.style.display = 'block';
    } else if (validation.warning) {
      elValidationError.textContent = validation.warning;
      elValidationError.style.backgroundColor = 'rgba(245, 158, 11, 0.1)'; // Amber warning background
      elValidationError.style.borderColor = 'rgba(245, 158, 11, 0.2)';
      elValidationError.style.color = '#d97706'; // Amber warning text
      elValidationError.style.display = 'block';
    } else {
      elValidationError.style.display = 'none';
    }
  }

  // Prevent engine calculations and SVG crashes if dimensions are physically invalid (Critical Errors)
  const { D, btf, ttf, bbf, tbf, tw } = STATE.params;
  const minWidth = Math.min(btf, bbf);
  const isBoxOverlapping = (sectionKey === 'Box-Section' && 2 * tw >= minWidth);
  if (!D || !btf || !ttf || !bbf || !tbf || !tw || D <= 0 || btf <= 0 || ttf <= 0 || bbf <= 0 || tbf <= 0 || tw <= 0 || (ttf + tbf >= D) || isBoxOverlapping || validation.error) {
    return;
  }

  // Calculate raw properties
  const rawResults = sectionKey === 'Box-Section'
    ? calculateBoxSectionProperties(STATE.params, STATE.inputUnit)
    : calculateISectionProperties(STATE.params, STATE.inputUnit);

  // Format numbers for display (always rounded to 2 decimal places)
  const fmt = (num) => {
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper to convert and update a row
  const updateRow = (propId, rawValue, type) => {
    const unit = STATE.rowUnits[propId];
    const conv = UNIT_CONVERSIONS[unit];
    let convertedValue = rawValue;
    if (type === 'length') convertedValue *= conv.length;
    else if (type === 'area') convertedValue *= conv.area;
    else if (type === 'modulus') convertedValue *= conv.modulus;
    else if (type === 'inertia') convertedValue *= conv.inertia;
    else if (type === 'warping') convertedValue *= conv.warping;
    
    document.getElementById(`res-${propId}`).textContent = fmt(convertedValue);
    
    const select = document.querySelector(`.row-unit-select[data-property="${propId}"]`);
    if (select) select.value = unit;

    const printLabel = document.getElementById(`print-unit-${propId}`);
    if (printLabel) {
      let suffix = '';
      if (type === 'area') suffix = '²';
      else if (type === 'modulus') suffix = '³';
      else if (type === 'inertia') suffix = '⁴';
      else if (type === 'warping') suffix = '⁶';
      printLabel.textContent = unit + suffix;
    }
  };

  // Update all rows
  updateRow('A', rawResults.A, 'area');
  updateRow('P', rawResults.P, 'length');
  updateRow('yc', rawResults.yc, 'length');
  updateRow('yt', rawResults.yt, 'length');
  updateRow('Ixx', rawResults.Ixx, 'inertia');
  updateRow('Iyy', rawResults.Iyy, 'inertia');
  updateRow('rxx', rawResults.rxx, 'length');
  updateRow('ryy', rawResults.ryy, 'length');
  updateRow('Sxt', rawResults.Sxt, 'modulus');
  updateRow('Sxb', rawResults.Sxb, 'modulus');
  updateRow('Sy', rawResults.Sy, 'modulus');
  updateRow('Zxx', rawResults.Zxx, 'modulus');
  updateRow('Zyy', rawResults.Zyy, 'modulus');
  updateRow('J', rawResults.J, 'inertia');
  updateRow('Cw', rawResults.Cw, 'warping');

  // Render SVG Drawing
  const drawParams = { ...STATE.params };
  const drawYc = rawResults.yc * UNIT_CONVERSIONS[STATE.inputUnit].length;
  const drawYp = rawResults.yp * UNIT_CONVERSIONS[STATE.inputUnit].length;
  
  if (sectionKey === 'Box-Section') {
    drawBoxSection('visualization-container', drawParams, { yc: drawYc, yp: drawYp }, STATE.inputUnit);
  } else {
    drawISection('visualization-container', drawParams, { yc: drawYc, yp: drawYp }, STATE.inputUnit);
  }
}

// Copy results in JSON format to clipboard
function copyResultsToClipboard() {
  const activeTab = document.querySelector('.nav-menu .nav-item.active');
  const sectionKey = activeTab ? activeTab.getAttribute('data-section') : 'I-Section';
  const rawResults = sectionKey === 'Box-Section'
    ? calculateBoxSectionProperties(STATE.params, STATE.inputUnit)
    : calculateISectionProperties(STATE.params, STATE.inputUnit);
  
  const getVal = (propId, rawValue, type) => {
    const unit = STATE.rowUnits[propId];
    const conv = UNIT_CONVERSIONS[unit];
    let val = rawValue;
    if (type === 'length') val = rawValue * conv.length;
    else if (type === 'area') val = rawValue * conv.area;
    else if (type === 'modulus') val = rawValue * conv.modulus;
    else if (type === 'inertia') val = rawValue * conv.inertia;
    else if (type === 'warping') val = rawValue * conv.warping;
    return Number(val.toFixed(2));
  };

  const getLabelSuffix = (type) => {
    if (type === 'area') return '²';
    if (type === 'modulus') return '³';
    if (type === 'inertia') return '⁴';
    if (type === 'warping') return '⁶';
    return '';
  };

  const standardVal = elStandardSelect ? elStandardSelect.value : 'custom';
  const profileName = STATE.currentPreset === 'custom' ? 'Custom' : document.getElementById('print-preset-val').textContent.trim();

  const data = {
    metadata: {
      tool: sectionKey === 'Box-Section' ? 'Box Section Properties Calculator' : 'I-Section + Cover Plates Properties Calculator',
      version: "1.2.0",
      sectionType: sectionKey === 'Box-Section' ? 'Box Section' : 'I Section',
      standard: standardVal === 'custom' ? 'Custom' : standardVal,
      profile: profileName,
      timestamp: new Date().toISOString(),
      inputUnits: STATE.inputUnit,
      copiedUnits: {
        A: STATE.rowUnits.A + getLabelSuffix('area'),
        P: STATE.rowUnits.P + getLabelSuffix('length'),
        yc: STATE.rowUnits.yc + getLabelSuffix('length'),
        yt: STATE.rowUnits.yt + getLabelSuffix('length'),
        Ixx: STATE.rowUnits.Ixx + getLabelSuffix('inertia'),
        Iyy: STATE.rowUnits.Iyy + getLabelSuffix('inertia'),
        rxx: STATE.rowUnits.rxx + getLabelSuffix('length'),
        ryy: STATE.rowUnits.ryy + getLabelSuffix('length'),
        Sxt: STATE.rowUnits.Sxt + getLabelSuffix('modulus'),
        Sxb: STATE.rowUnits.Sxb + getLabelSuffix('modulus'),
        Sy: STATE.rowUnits.Sy + getLabelSuffix('modulus'),
        Zxx: STATE.rowUnits.Zxx + getLabelSuffix('modulus'),
        Zyy: STATE.rowUnits.Zyy + getLabelSuffix('modulus'),
        J: STATE.rowUnits.J + getLabelSuffix('inertia'),
        Cw: STATE.rowUnits.Cw + getLabelSuffix('warping')
      }
    },
    inputs: { ...STATE.params },
    outputs: {
      A: getVal('A', rawResults.A, 'area'),
      P: getVal('P', rawResults.P, 'length'),
      yc: getVal('yc', rawResults.yc, 'length'),
      yt: getVal('yt', rawResults.yt, 'length'),
      Ixx: getVal('Ixx', rawResults.Ixx, 'inertia'),
      Iyy: getVal('Iyy', rawResults.Iyy, 'inertia'),
      rxx: getVal('rxx', rawResults.rxx, 'length'),
      ryy: getVal('ryy', rawResults.ryy, 'length'),
      Sxt: getVal('Sxt', rawResults.Sxt, 'modulus'),
      Sxb: getVal('Sxb', rawResults.Sxb, 'modulus'),
      Sy: getVal('Sy', rawResults.Sy, 'modulus'),
      Zxx: getVal('Zxx', rawResults.Zxx, 'modulus'),
      Zyy: getVal('Zyy', rawResults.Zyy, 'modulus'),
      J: getVal('J', rawResults.J, 'inertia'),
      Cw: getVal('Cw', rawResults.Cw, 'warping')
    }
  };
  
  navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    .then(() => {
      showToast("Copied calculated JSON results to clipboard!");
    })
    .catch(err => {
      console.error("Failed to copy:", err);
      showToast("Failed to copy results.", true);
    });
}



function showToast(msg, isError = false) {
  elToastMsg.textContent = msg;
  if (isError) {
    elToast.style.borderColor = 'var(--error)';
  } else {
    elToast.style.borderColor = 'var(--accent-secondary)';
  }
  elToast.classList.add('show');
  setTimeout(() => {
    elToast.classList.remove('show');
  }, 3000);
}

/**
 * Runs a suite of verification unit tests to validate the calculation engine.
 * Renders findings inside the verification card.
 */
function runCalculationEngineTests() {
  const testResults = [];
  let passes = 0;
  
  const assertClose = (actual, expected, tol = 0.01) => {
    const diff = Math.abs(actual - expected);
    const ratio = diff / expected;
    return ratio <= tol;
  };

  // Test Case 1: Doubly-Symmetric I-beam (IPE 200 equivalent)
  try {
    const params1 = { D: 200, btf: 100, ttf: 10, bbf: 100, tbf: 10, tw: 6 };
    const res1 = calculateISectionProperties(params1, 'mm');
    
    const test1_A = assertClose(res1.A, 3080);
    const test1_yc = assertClose(res1.yc, 100);
    const test1_Ixx = assertClose(res1.Ixx, 20982667, 0.005);
    const test1_Iyy = assertClose(res1.Iyy, 1669907, 0.005);
    const test1_Zxx = assertClose(res1.Zxx, 238600, 0.005);
    
    const tc1_passed = test1_A && test1_yc && test1_Ixx && test1_Iyy && test1_Zxx;
    testResults.push({
      name: "Case 1: Standard Doubly-Symmetric (200x100x10x6 mm)",
      status: tc1_passed ? "PASS" : "FAIL",
      details: `Area: ${tc1_passed ? 'OK' : 'Error'} | Ixx: ${test1_Ixx ? 'OK' : 'Error'} | Zxx: ${test1_Zxx ? 'OK' : 'Error'}`
    });
    if (tc1_passed) passes++;
  } catch (err) {
    testResults.push({ name: "Case 1: Standard Doubly-Symmetric", status: "FAIL", details: err.message });
  }

  // Test Case 2: Singly-Symmetric I-beam
  try {
    const params2 = { D: 300, btf: 200, ttf: 15, bbf: 100, tbf: 10, tw: 8 };
    const res2 = calculateISectionProperties(params2, 'mm');
    
    const test2_A = Math.abs(res2.A - 6200) < 0.1;
    const test2_yc = Math.abs(res2.yc - 194.677) < 0.01;
    
    const tc2_passed = test2_A && test2_yc;
    testResults.push({
      name: "Case 2: Singly-Symmetric (300x200x15 / 100x10 / web 8 mm)",
      status: tc2_passed ? "PASS" : "FAIL",
      details: `Area: ${res2.A} (exp 6200) | yc: ${res2.yc.toFixed(3)} mm (exp 194.677)`
    });
    if (tc2_passed) passes++;
  } catch (err) {
    testResults.push({ name: "Case 2: Singly-Symmetric", status: "FAIL", details: err.message });
  }

  // Test Case 3: I-beam with symmetric cover plates
  try {
    const params3 = { 
      D: 200, btf: 100, ttf: 10, bbf: 100, tbf: 10, tw: 6,
      hasTopPlate: true, btp: 120, ttp: 10,
      hasBottomPlate: true, bbp: 120, tbp: 10
    };
    const res3 = calculateISectionProperties(params3, 'mm');
    
    // Total Area = 3080 + 1200 + 1200 = 5480
    // Centroid yc = 110 mm
    // Ixx = 47,462,667 mm4 (from analytical calculations)
    const test3_A = assertClose(res3.A, 5480);
    const test3_yc = assertClose(res3.yc, 110);
    const test3_Ixx = assertClose(res3.Ixx, 47462667, 0.005);
    
    const tc3_passed = test3_A && test3_yc && test3_Ixx;
    testResults.push({
      name: "Case 3: Reinforced Doubly-Symmetric (Both plates 120x10 mm)",
      status: tc3_passed ? "PASS" : "FAIL",
      details: `Area: ${res3.A} (exp 5480) | yc: ${res3.yc} mm (exp 110) | Ixx: ${res3.Ixx.toExponential(4)} (exp 4.746e7)`
    });
    if (tc3_passed) passes++;
  } catch (err) {
    testResults.push({ name: "Case 3: Reinforced Doubly-Symmetric", status: "FAIL", details: err.message });
  }

  // Test Case 4: Standard Box Section (RHS 100x100x10 equivalent)
  try {
    const params4 = { D: 100, btf: 100, ttf: 10, bbf: 100, tbf: 10, tw: 10 };
    const res4 = calculateBoxSectionProperties(params4, 'mm');
    
    // Area: Outer area = 100*100 = 10000. Inner void = 80*80 = 6400. Area = 10000 - 6400 = 3600 mm²
    // Centroid yc = 50 mm
    // Ixx = 4,920,000 mm⁴
    const test4_A = assertClose(res4.A, 3600);
    const test4_yc = assertClose(res4.yc, 50);
    const test4_Ixx = assertClose(res4.Ixx, 4920000, 0.005);
    
    const tc4_passed = test4_A && test4_yc && test4_Ixx;
    testResults.push({
      name: "Case 4: Standard Box Section (100x100x10 mm)",
      status: tc4_passed ? "PASS" : "FAIL",
      details: `Area: ${res4.A} (exp 3600) | yc: ${res4.yc} mm (exp 50) | Ixx: ${res4.Ixx.toExponential(4)} (exp 4.92e6)`
    });
    if (tc4_passed) passes++;
  } catch (err) {
    testResults.push({ name: "Case 4: Standard Box Section", status: "FAIL", details: err.message });
  }

  // Log results to browser developer console
  console.groupCollapsed("%cApex Structural Analysis - Engine Verification Suite", "color: #14b8a6; font-weight: bold;");
  testResults.forEach(r => {
    const statusColor = r.status === "PASS" ? "color: #10b981;" : "color: #ef4444;";
    console.log(`%c[${r.status}] %c${r.name} - %c${r.details}`, statusColor, "font-weight: bold;", "color: inherit;");
  });
  if (passes === testResults.length) {
    console.log("%cVERIFICATION SUCCESS: All engine unit tests passed.", "color: #10b981; font-weight: bold;");
  } else {
    console.warn("%cVERIFICATION FAILURE: Some engine unit tests failed. Please review values.", "color: #ef4444; font-weight: bold;");
  }
  console.groupEnd();
}
