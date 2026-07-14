/**
 * Apex Structural Analysis Suite - 3D Frame UI Controller
 */
(function() {
  
  let activeUnits = {
    nodeX: 'm',
    nodeY: 'm',
    nodeZ: 'm',
    loadVal: 'kN'
  };

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
  
  
  // Selected display units for results (Displacement, Rotation, Force, Moment Force, Moment Length)
  window.ResultUnits = {
    disp: 'mm',
    rot: 'rad',
    force: 'kN',
    momentForce: 'kN',
    momentLen: 'm'
  };

  // Try to load saved result units from localStorage
  const savedResultUnits = localStorage.getItem('apex_result_units');
  if (savedResultUnits) {
    try {
      Object.assign(window.ResultUnits, JSON.parse(savedResultUnits));
    } catch (e) {}
  }

  // Conversion factors relative to solver output base units (m, rad, N, N-m)
  const resultFactors = {
    // base: m
    disp: {
      m: 1.0,
      cm: 100.0,
      mm: 1000.0
    },
    // base: rad
    rot: {
      rad: 1.0,
      deg: 180.0 / Math.PI
    },
    // base: N
    force: {
      N: 1.0,
      kN: 0.001,
      MN: 1e-6,
      kgf: 0.101971621,
      tf: 0.000101971621,
      MT: 0.000101971621
    },
    // base: m
    length: {
      m: 1.0,
      mm: 1000.0,
      cm: 100.0,
      ft: 3.2808399,
      in: 39.3700787
    }
  };

  function convertResult(val, type) {
    if (val === null || val === undefined || isNaN(val)) return 0;
    if (type === 'disp') {
      const u = window.ResultUnits.disp;
      return val * (resultFactors.disp[u] || 1.0);
    }
    if (type === 'rot') {
      const u = window.ResultUnits.rot;
      return val * (resultFactors.rot[u] || 1.0);
    }
    if (type === 'force') {
      const u = window.ResultUnits.force;
      return val * (resultFactors.force[u] || 1.0);
    }
    if (type === 'moment') {
      const uf = window.ResultUnits.momentForce;
      const ul = window.ResultUnits.momentLen;
      const fFactor = resultFactors.force[uf] || 1.0;
      const lFactor = resultFactors.length[ul] || 1.0;
      return val * fFactor * lFactor;
    }
    return val;
  }

  function syncResultUnitDropdowns() {
    document.querySelectorAll('.res-unit-disp').forEach(select => {
      select.value = window.ResultUnits.disp;
    });
    document.querySelectorAll('.res-unit-rot').forEach(select => {
      select.value = window.ResultUnits.rot;
    });
    document.querySelectorAll('.res-unit-force').forEach(select => {
      select.value = window.ResultUnits.force;
    });
    document.querySelectorAll('.res-unit-moment-force').forEach(select => {
      select.value = window.ResultUnits.momentForce;
    });
    document.querySelectorAll('.res-unit-moment-len').forEach(select => {
      select.value = window.ResultUnits.momentLen;
    });
  }

  function bindResultUnitsEvents() {
    const bindClassChange = (className, key) => {
      document.querySelectorAll(`.${className}`).forEach(select => {
        select.addEventListener('change', (e) => {
          window.ResultUnits[key] = e.target.value;
          localStorage.setItem('apex_result_units', JSON.stringify(window.ResultUnits));
          
          // Sync all dropdowns of this category
          syncResultUnitDropdowns();
          
          // Repopulate results tables with converted values
          if (window.FrameModel && window.FrameModel.results) {
            populateResultsTables(window.FrameModel.results);
          }
        });
      });
    };
    
    bindClassChange('res-unit-disp', 'disp');
    bindClassChange('res-unit-rot', 'rot');
    bindClassChange('res-unit-force', 'force');
    bindClassChange('res-unit-moment-force', 'momentForce');
    bindClassChange('res-unit-moment-len', 'momentLen');
  }

  // Wrap window.FrameModel.results to automatically update UI Analyse Model button on changes
  if (window.FrameModel && !window.FrameModel._resultsWrapped) {
    let resultsVal = window.FrameModel.results;
    Object.defineProperty(window.FrameModel, 'results', {
      get() {
        return resultsVal;
      },
      set(val) {
        resultsVal = val;
        const solveBtn = document.getElementById('btn-solve-frame');
        if (solveBtn) {
          if (!val) {
            solveBtn.classList.add('btn-analyse-required');
          } else {
            solveBtn.classList.remove('btn-analyse-required');
          }
        }
      }
    });
    window.FrameModel._resultsWrapped = true;
  }

  // Initialize the Frame Analysis tab and controls on first load
  window.initFrameAnalysisView = function() {
    // 1. Initialize WebGL Viewport
    if (!window.FrameCanvas.initialized) {
      window.FrameCanvas.init('frame-canvas-container');
      window.FrameCanvas.initialized = true;
      
      // Bind controls UI events once
      bindUIEvents();
      setupDefaultModel();
    }
    
    // Sync unit selector dropdowns
    syncResultUnitDropdowns();
    
    // 2. Refresh lists and canvas
    refreshAllDropdowns();
    updateTablesDisplay();
    window.FrameCanvas.render();
  };

  function bindUIEvents() {
    // Global Escape key listener to cancel Select in Model selection
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const startSel = document.getElementById('member-input-start');
        const endSel = document.getElementById('member-input-end');
        const isBeamsTab = document.getElementById('btn-tab-members')?.classList.contains('active');
        
        if (isBeamsTab && startSel && endSel && (startSel.value !== 'select-in-model' || endSel.value !== 'select-in-model')) {
          if (window.FrameCanvas) {
            window.FrameCanvas.selectNode(null, false);
          }
          startSel.value = 'select-in-model';
          endSel.value = 'select-in-model';
          
          refreshAllDropdowns();
          updateTablesDisplay();
          window.FrameCanvas.render();
          showToast('Beam selection cancelled.');
        }
      }
    });

    // Table Unit dropdown change listeners
    const bindUnitChangeListener = (id, key) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = activeUnits[key];
        el.addEventListener('change', (e) => {
          activeUnits[key] = e.target.value;
          updateTablesDisplay();
        });
      }
    };
    bindUnitChangeListener('node-unit-x', 'nodeX');
    bindUnitChangeListener('node-unit-y', 'nodeY');
    bindUnitChangeListener('node-unit-z', 'nodeZ');
    bindUnitChangeListener('load-unit-val', 'loadVal');

    // Tab switching for inputs panel (Add Input)
    document.querySelectorAll('#section-add-input-wrapper .frame-tabs .btn-subtab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#section-add-input-wrapper .frame-tabs .btn-subtab').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Swap inputs display
        document.querySelectorAll('#section-add-input-wrapper .frame-tab-content').forEach(p => p.style.display = 'none');
        const tabName = btn.id.replace('btn-tab-', '');
        const targetPanel = document.getElementById(`panel-tab-${tabName}`);
        if (targetPanel) {
          targetPanel.style.display = 'block';
        }

        // Swap properties display (synchronized table selection)
        document.querySelectorAll('.list-tab-content').forEach(c => c.style.display = 'none');
        const listContainerId = `list-container-${tabName}`;
        const listContainer = document.getElementById(listContainerId);
        if (listContainer) {
          listContainer.style.display = 'block';
        }

        // (Decoupled active selection tool linking from tabs to preserve selection modes)

        // Clear selection if switching tabs to avoid stray highlights (unless going between members and matsec)
        if (tabName !== 'members' && tabName !== 'matsec') {
          if (window.FrameCanvas.selectedMemberIds) {
            window.FrameCanvas.selectMember(null, false);
          }
        }
        
        updateMatSecTabUI();
      });
    });

    // Selection toolbar button tool switching
    document.querySelectorAll('.btn-select-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-select-tool').forEach(b => b.classList.remove('active-tab-btn'));
        btn.classList.add('active-tab-btn');
        const toolName = btn.id.replace('tool-select-', '');
        window.FrameCanvas.setSelectionTool(toolName);
        
        // (Decoupled active tab switching when selecting tools to support independent drawing/inspection cursors)
      });
    });

    // View direction buttons
    document.getElementById('btn-view-3d').addEventListener('click', () => window.FrameCanvas.setViewDirection('3d'));
    document.getElementById('btn-view-xy').addEventListener('click', () => window.FrameCanvas.setViewDirection('xy'));
    document.getElementById('btn-view-xz').addEventListener('click', () => window.FrameCanvas.setViewDirection('xz'));



    // Support preset selection dropdown
    document.getElementById('support-presets').addEventListener('change', (e) => {
      const preset = e.target.value;
      const dofDX = document.getElementById('support-dof-dx');
      const dofDY = document.getElementById('support-dof-dy');
      const dofDZ = document.getElementById('support-dof-dz');
      const dofRX = document.getElementById('support-dof-rx');
      const dofRY = document.getElementById('support-dof-ry');
      const dofRZ = document.getElementById('support-dof-rz');

      if (preset === 'pinned') {
        dofDX.checked = true; dofDY.checked = true; dofDZ.checked = true;
        dofRX.checked = false; dofRY.checked = false; dofRZ.checked = false;
      } else if (preset === 'fixed') {
        dofDX.checked = true; dofDY.checked = true; dofDZ.checked = true;
        dofRX.checked = true; dofRY.checked = true; dofRZ.checked = true;
      } else if (preset === 'roller-y') {
        dofDX.checked = false; dofDY.checked = true; dofDZ.checked = false;
        dofRX.checked = false; dofRY.checked = false; dofRZ.checked = false;
      }
    });

    // Load placement target toggling
    document.getElementById('load-input-target').addEventListener('change', (e) => {
      const isNode = e.target.value === 'node';
      document.getElementById('load-group-node').style.display = isNode ? 'block' : 'none';
      document.getElementById('load-group-member').style.display = isNode ? 'none' : 'block';
      
      const dirSel = document.getElementById('load-input-direction');
      const typeSel = document.getElementById('load-input-type');
      
      if (isNode) {
        // Nodal loads can only be Concentrated point forces/moments
        typeSel.value = 'Point';
        typeSel.setAttribute('disabled', 'true');
        dirSel.innerHTML = `
          <option value="FY">Global FY (Vertical)</option>
          <option value="FX">Global FX (Horizontal)</option>
          <option value="FZ">Global FZ (Lateral)</option>
          <option value="MZ">Global MZ (Moment)</option>
        `;
        document.getElementById('load-group-offset').style.display = 'none';
        document.getElementById('load-group-offset2').style.display = 'none';
        document.getElementById('load-group-magnitude2').style.display = 'none';
      } else {
        typeSel.removeAttribute('disabled');
        dirSel.innerHTML = `
          <option value="Fy">Local Fy (Member Y)</option>
          <option value="Fx">Local Fx (Member X)</option>
          <option value="Fz">Local Fz (Member Z)</option>
          <option value="Mz">Local Mz (Moment)</option>
        `;
        toggleMemberLoadFields();
      }
    });

    document.getElementById('load-input-type').addEventListener('change', toggleMemberLoadFields);



    // Results Tab switching
    const resTabs = [
      { btnId: 'btn-tab-res-displacements', panelId: 'panel-res-displacements' },
      { btnId: 'btn-tab-res-reactions', panelId: 'panel-res-reactions' },
      { btnId: 'btn-tab-res-axial', panelId: 'panel-res-axial' },
      { btnId: 'btn-tab-res-shear', panelId: 'panel-res-shear' },
      { btnId: 'btn-tab-res-moments', panelId: 'panel-res-moments' },
      { btnId: 'btn-tab-res-torsion', panelId: 'panel-res-torsion' }
    ];

    resTabs.forEach(tab => {
      const btn = document.getElementById(tab.btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('disabled')) return;

          resTabs.forEach(t => {
            const b = document.getElementById(t.btnId);
            const p = document.getElementById(t.panelId);
            if (b) {
              if (t.btnId === tab.btnId) {
                b.classList.add('active');
                b.style.color = '';
              } else {
                b.classList.remove('active');
                b.style.color = '';
              }
            }
            if (p) {
              p.style.display = (t.panelId === tab.panelId) ? 'block' : 'none';
            }
          });

          scrollSelectedResultsIntoView();
        });
      }
    });

    // --- Add Actions ---
    // Add Node
    document.getElementById('btn-add-node').addEventListener('click', () => {
      let k = 1;
      while (window.FrameModel.nodes[`N${k}`]) {
        k++;
      }
      const id = `N${k}`;
      const x = parseFloat(document.getElementById('node-input-x').value) || 0.0;
      const y = parseFloat(document.getElementById('node-input-y').value) || 0.0;
      const z = parseFloat(document.getElementById('node-input-z').value) || 0.0;

      window.FrameModel.addNode(id, x, y, z);
      showToast(`Node ${id} added successfully.`);
      
      refreshAllDropdowns();
      updateTablesDisplay();
      window.FrameCanvas.render();
    });

    // Sync Select in Model dropdown selection mode changes
    const startSel = document.getElementById('member-input-start');
    const endSel = document.getElementById('member-input-end');
    
    startSel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'select-in-model') {
        if (endSel.value !== 'select-in-model') {
          endSel.value = 'select-in-model';
        }
        if (window.FrameCanvas && window.FrameCanvas.selectedNodeIds) {
          window.FrameCanvas.selectNode(null, false);
        }
      } else {
        if (endSel.value === 'select-in-model') {
          const firstDiffNode = Array.from(endSel.options)
            .map(opt => opt.value)
            .find(v => v !== 'select-in-model' && v !== val);
          if (firstDiffNode) {
            endSel.value = firstDiffNode;
          }
        }
      }
    });

    endSel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'select-in-model') {
        if (startSel.value !== 'select-in-model') {
          startSel.value = 'select-in-model';
        }
        if (window.FrameCanvas && window.FrameCanvas.selectedNodeIds) {
          window.FrameCanvas.selectNode(null, false);
        }
      } else {
        if (startSel.value === 'select-in-model') {
          const firstDiffNode = Array.from(startSel.options)
            .map(opt => opt.value)
            .find(v => v !== 'select-in-model' && v !== val);
          if (firstDiffNode) {
            startSel.value = firstDiffNode;
          }
        }
      }
    });

    // Add Member
    document.getElementById('btn-add-member').addEventListener('click', () => {
      const startVal = startSel.value;
      const endVal = endSel.value;
      
      const selectedIds = window.FrameCanvas.selectedNodeIds;
      const isSelectInModelActive = (selectedIds && selectedIds.size > 0) || (startVal === 'select-in-model' || endVal === 'select-in-model');
      
      if (isSelectInModelActive) {
        if (!selectedIds || selectedIds.size === 0) {
          showToast('Please select exactly two nodes to create a beam.', 'error');
          return;
        }
        if (selectedIds.size === 1) {
          showToast('A second node must be selected to create a beam.', 'error');
          return;
        }
        if (selectedIds.size > 2) {
          showToast('Please select exactly two nodes to create a beam.', 'error');
          return;
        }
        if (selectedIds.size === 2) {
          const arr = Array.from(selectedIds);
          if (!validateProposedBeam(arr[0], arr[1])) {
            return;
          }
          createBeamFromModelSelection();
          return;
        }
      }

      if (!startVal || !endVal || startVal === 'select-in-model' || endVal === 'select-in-model') {
        showToast('Please specify both Start Node and End Node.', 'error');
        return;
      }
      if (startVal === endVal) {
        showToast('Start Node and End Node cannot be identical.', 'error');
        return;
      }
      
      if (!validateProposedBeam(startVal, endVal)) {
        return;
      }

      let k = 1;
      while (window.FrameModel.members[`B${k}`]) {
        k++;
      }
      const id = `B${k}`;
      const section = 'IPE 200';
      const material = 'Steel – E250';
      const beta = parseFloat(document.getElementById('member-input-beta').value) || 0.0;

      const releases = {
        Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false, Rzi: false,
        Dxj: document.getElementById('member-release-fx').checked,
        Dyj: document.getElementById('member-release-fy').checked,
        Dzj: document.getElementById('member-release-fz').checked,
        Rxj: document.getElementById('member-release-mx').checked,
        Ryj: document.getElementById('member-release-my').checked,
        Rzj: document.getElementById('member-release-mz').checked
      };

      window.FrameModel.addMember(id, startVal, endVal, section, material, beta, releases);
      showToast(`Beam ${id} added successfully.`);
      
      refreshAllDropdowns();
      updateTablesDisplay();
      window.FrameCanvas.render();
    });

    // Assign Support
    document.getElementById('btn-add-support').addEventListener('click', () => {
      const nodeId = document.getElementById('support-input-node').value;
      if (!nodeId) {
        showToast('Please select a Node.');
        return;
      }

      const restraints = [
        document.getElementById('support-dof-dx').checked,
        document.getElementById('support-dof-dy').checked,
        document.getElementById('support-dof-dz').checked,
        document.getElementById('support-dof-rx').checked,
        document.getElementById('support-dof-ry').checked,
        document.getElementById('support-dof-rz').checked
      ];

      window.FrameModel.addSupport(nodeId, restraints);
      showToast(`Support configured at Node ${nodeId}.`);
      
      updateTablesDisplay();
      window.FrameCanvas.render();
    });

    // Add Load
    document.getElementById('btn-add-load').addEventListener('click', () => {
      const isNode = document.getElementById('load-input-target').value === 'node';
      const dir = document.getElementById('load-input-direction').value;
      const type = document.getElementById('load-input-type').value;

      if (isNode) {
        const nodeId = document.getElementById('load-input-node').value;
        const force = parseFloat(document.getElementById('load-input-mag').value) * 1000.0; // convert kN to N
        if (!nodeId) return;

        window.FrameModel.addLoad({
          type: 'NodalLoad',
          nodeId,
          direction: dir,
          force
        });
      } else {
        const memberId = document.getElementById('load-input-member').value;
        const force = parseFloat(document.getElementById('load-input-mag').value) * 1000.0; // convert kN/m to N/m
        if (!memberId) return;

        if (type === 'Point') {
          const offset = parseFloat(document.getElementById('load-input-offset').value);
          window.FrameModel.addLoad({
            type: 'MemberPointLoad',
            memberId,
            direction: dir,
            force,
            offset
          });
        } else if (type === 'UDL') {
          window.FrameModel.addLoad({
            type: 'MemberDistributedLoad',
            memberId,
            direction: dir,
            w1: force,
            w2: force,
            x1: null,
            x2: null
          });
        } else if (type === 'Trapezoidal') {
          const force2 = parseFloat(document.getElementById('load-input-mag2').value) * 1000.0;
          const x1 = parseFloat(document.getElementById('load-input-offset').value);
          const x2 = parseFloat(document.getElementById('load-input-offset2').value);
          window.FrameModel.addLoad({
            type: 'MemberDistributedLoad',
            memberId,
            direction: dir,
            w1: force,
            w2: force2,
            x1,
            x2
          });
        }
      }

      showToast('Load added successfully.');
      updateTablesDisplay();
      window.FrameCanvas.render();
    });

    // --- Material / Section Assignment Trigger ---
    const btnMatSecAssign = document.getElementById('btn-matsec-assign');
    if (btnMatSecAssign) {
      btnMatSecAssign.addEventListener('click', () => {
        const selectedIds = window.FrameCanvas.selectedMemberIds;
        if (!selectedIds || selectedIds.size === 0) return;
        
        const mat = document.getElementById('matsec-input-material').value;
        const sec = document.getElementById('matsec-input-section').value;
        
        let count = 0;
        selectedIds.forEach(id => {
          if (window.FrameModel.members[id]) {
            window.FrameModel.members[id].materialName = mat;
            window.FrameModel.members[id].sectionName = sec;
            count++;
          }
        });
        
        window.FrameModel.results = null; // Invalidate cache
        updateTablesDisplay();
        window.FrameCanvas.render();
        updateMatSecTabUI();
        
        showToast(`Assigned properties to ${count} beam(s) successfully.`);
      });
    }

    // Display control checkboxes change listeners to trigger re-renders
    const displayCheckboxes = [
      'toggle-show-loads',
      'toggle-show-supports',
      'toggle-show-nodes',
      'toggle-show-beams',
      'toggle-show-axes',
      'toggle-show-dimensions',
      'toggle-show-reactions',
      'toggle-show-displ-x',
      'toggle-show-displ-y',
      'toggle-show-displ-z',
      'toggle-show-axial',
      'toggle-show-shear',
      'toggle-show-torsion',
      'toggle-show-moment-x',
      'toggle-show-moment-y',
      'toggle-show-moment-z'
    ];
    
    displayCheckboxes.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          const resultDiagramIds = [
            'toggle-show-displ-x',
            'toggle-show-displ-y',
            'toggle-show-displ-z',
            'toggle-show-axial',
            'toggle-show-shear',
            'toggle-show-torsion',
            'toggle-show-moment-x',
            'toggle-show-moment-y',
            'toggle-show-moment-z'
          ];
          
          // Implement mutual exclusivity: only one result diagram type checked at a time
          if (resultDiagramIds.includes(id) && e.target.checked) {
            resultDiagramIds.forEach(otherId => {
              if (otherId !== id) {
                const otherEl = document.getElementById(otherId);
                if (otherEl) otherEl.checked = false;
              }
            });
          }
          
          if (window.FrameCanvas) {
            window.FrameCanvas.render();
          }
        });
      }
    });

    // --- Solve Trigger ---
    document.getElementById('btn-solve-frame').addEventListener('click', async () => {
      const nodesCount = Object.keys(window.FrameModel.nodes).length;
      if (nodesCount === 0) {
        showToast('Please add nodes first.');
        return;
      }

      const solveBtn = document.getElementById('btn-solve-frame');
      solveBtn.setAttribute('disabled', 'true');
      solveBtn.innerHTML = `
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align: middle;"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round"/></svg>
        Analysing...
      `;

      try {
        const results = await window.FrameAPI.solve();
        showToast('Analysis completed successfully!');
        
        // Populate results tables
        populateResultsTables(results);
        updateTablesDisplay();
        
        // Re-render
        window.FrameCanvas.render();
      } catch (err) {
        showToast(`Error: ${err.message}`);
        console.error(err);
      } finally {
        solveBtn.removeAttribute('disabled');
        solveBtn.innerHTML = `
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align: middle;"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round"/></svg>
          Analyse Model
        `;
      }
    });

    // --- Open Report Trigger ---
    document.getElementById('btn-open-frame-report').addEventListener('click', openFrameReport);

    // --- Inline coordinate editing for Node table ---
    const tableNodes = document.getElementById('table-nodes');
    if (tableNodes) {
      tableNodes.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('editable-coord') && e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      });

      tableNodes.addEventListener('blur', (e) => {
        if (e.target.classList.contains('editable-coord')) {
          const nodeId = e.target.getAttribute('data-node-id');
          const coord = e.target.getAttribute('data-coord');
          const originalVal = parseFloat(e.target.getAttribute('data-original-val')); // in meters
          const newVal = parseFloat(e.target.innerText.trim()); // in selected unit

          const unit = coord === 'x' ? activeUnits.nodeX : (coord === 'y' ? activeUnits.nodeY : activeUnits.nodeZ);
          const newValMeters = newVal * getDistFactor(unit);

          if (isNaN(newVal)) {
            e.target.innerText = (originalVal / getDistFactor(unit)).toFixed(2);
            showToast('Invalid numeric coordinate value.');
            return;
          }

          // If coordinate hasn't changed, do nothing
          if (Math.abs(newValMeters - originalVal) < 1e-9) {
            e.target.innerText = (originalVal / getDistFactor(unit)).toFixed(2);
            return;
          }

          // Update coordinate in model
          window.FrameModel.nodes[nodeId][coord] = newValMeters;

          // Invalidate previous analysis results
          let clearedResults = false;
          if (window.FrameModel.results) {
            window.FrameModel.results = null;
            clearedResults = true;
            
            // Clear results tables
            const tbodyDisp = document.querySelector('#table-res-displacements tbody');
            const tbodyReact = document.querySelector('#table-res-reactions tbody');
            if (tbodyDisp) {
              tbodyDisp.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No displacements resolved. Click "Analyse Model".</td></tr>`;
            }
            if (tbodyReact) {
              tbodyReact.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No support reactions resolved. Click "Analyse Model".</td></tr>`;
            }
          }

          if (clearedResults) {
            showToast(`Warning: Node ${nodeId} ${coord.toUpperCase()} coordinate updated to ${newValMeters.toFixed(3)} m. Previous analysis results cleared.`);
          } else {
            showToast(`Node ${nodeId} ${coord.toUpperCase()} coordinate updated to ${newValMeters.toFixed(3)} m.`);
          }

          // Refresh tables & views
          refreshAllDropdowns();
          updateTablesDisplay();
          window.FrameCanvas.render();
        }
      }, true);
    }
    bindResultUnitsEvents();
    bindOperationsEvents();
  }

  function toggleMemberLoadFields() {
    const type = document.getElementById('load-input-type').value;
    
    const offsetGroup = document.getElementById('load-group-offset');
    const offset2Group = document.getElementById('load-group-offset2');
    const mag2Group = document.getElementById('load-group-magnitude2');
    const lblMag = document.getElementById('lbl-load-mag');

    if (type === 'Point') {
      lblMag.textContent = 'Force Magnitude (kN)';
      offsetGroup.style.display = 'block';
      document.querySelector('#load-group-offset label').textContent = 'Location (x) (m)';
      offset2Group.style.display = 'none';
      mag2Group.style.display = 'none';
    } else if (type === 'UDL') {
      lblMag.textContent = 'Distributed Load (w) (kN/m)';
      offsetGroup.style.display = 'none';
      offset2Group.style.display = 'none';
      mag2Group.style.display = 'none';
    } else if (type === 'Trapezoidal') {
      lblMag.textContent = 'Start Mag (w1) (kN/m)';
      offsetGroup.style.display = 'block';
      document.querySelector('#load-group-offset label').textContent = 'Start Offset (x1) (m)';
      offset2Group.style.display = 'block';
      mag2Group.style.display = 'block';
    }
  }

  function refreshAllDropdowns() {
    const nodes = window.FrameModel.getNodeList();
    const members = window.FrameModel.getMemberList();

    // 1. Populate Node drop-downs
    const memberNodeOptions = `<option value="select-in-model">Select in Model</option>` + nodes.map(n => `<option value="${n.id}">${n.id}</option>`).join('');
    
    const startSel = document.getElementById('member-input-start');
    const endSel = document.getElementById('member-input-end');
    const prevStart = startSel ? startSel.value : 'select-in-model';
    const prevEnd = endSel ? endSel.value : 'select-in-model';
    
    if (startSel) {
      startSel.innerHTML = memberNodeOptions;
      if (prevStart && startSel.querySelector(`option[value="${prevStart}"]`)) {
        startSel.value = prevStart;
      } else {
        startSel.value = 'select-in-model';
      }
    }
    if (endSel) {
      endSel.innerHTML = memberNodeOptions;
      if (prevEnd && endSel.querySelector(`option[value="${prevEnd}"]`)) {
        endSel.value = prevEnd;
      } else {
        endSel.value = 'select-in-model';
      }
    }

    const nodeOptions = nodes.map(n => `<option value="${n.id}">${n.id}</option>`).join('');
    document.getElementById('support-input-node').innerHTML = nodeOptions;
    document.getElementById('load-input-node').innerHTML = nodeOptions;

    // 2. Populate Member drop-downs
    const memberOptions = members.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
    document.getElementById('load-input-member').innerHTML = memberOptions;

    // 3. Populate Section Profiles drop-downs
    const sectionSel = document.getElementById('member-input-section');
    const matsecSectionSel = document.getElementById('matsec-input-section');
    let sectionOptions = `<option value="Default">Default (A=100cm², I=10000cm⁴)</option>`;
    
    // Add active section if calculated
    if (window.getActiveSectionProperties && window.getActiveSectionProperties()) {
      sectionOptions += `<option value="Active">Active Calculator Section</option>`;
    }

    // Populate from SectionRegistry
    if (Object.keys(window.SectionRegistry).length > 0) {
      sectionOptions += `<optgroup label="Custom Created Sections">`;
      for (const name in window.SectionRegistry) {
        sectionOptions += `<option value="${name}">${name}</option>`;
      }
      sectionOptions += `</optgroup>`;
    }

    // Populate from SECTION_DATABASE
    const db = window.SECTION_DATABASE;
    if (db) {
      for (const cat in db) {
        for (const subcat in db[cat]) {
          sectionOptions += `<optgroup label="${cat} - ${subcat}">`;
          db[cat][subcat].forEach(profile => {
            sectionOptions += `<option value="${profile.name}">${profile.name}</option>`;
          });
          sectionOptions += `</optgroup>`;
        }
      }
    }
    
    if (sectionSel) {
      sectionSel.innerHTML = sectionOptions;
      if (sectionSel.value === 'Default') {
        const hasIpe200 = sectionSel.querySelector('option[value="IPE 200"]');
        if (hasIpe200) sectionSel.value = 'IPE 200';
      }
    }
    if (matsecSectionSel) {
      matsecSectionSel.innerHTML = sectionOptions;
      if (matsecSectionSel.value === 'Default') {
        const hasIpe200 = matsecSectionSel.querySelector('option[value="IPE 200"]');
        if (hasIpe200) matsecSectionSel.value = 'IPE 200';
      }
    }

    // 4. Populate Material Grade drop-downs
    const materialSel = document.getElementById('member-input-material');
    const matsecMaterialSel = document.getElementById('matsec-input-material');
    if (window.MaterialDatabase) {
      let materialOptions = '';
      for (const name in window.MaterialDatabase) {
        materialOptions += `<option value="${name}">${name}</option>`;
      }
      if (materialSel) materialSel.innerHTML = materialOptions;
      if (matsecMaterialSel) matsecMaterialSel.innerHTML = materialOptions;
    }
  }

  function updateTablesDisplay() {
    // 1. Nodes Table
    const tbodyNodes = document.querySelector('#table-nodes tbody');
    const nodes = window.FrameModel.getNodeList();
    if (nodes.length === 0) {
      tbodyNodes.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No nodes defined.</td></tr>`;
    } else {
      tbodyNodes.innerHTML = nodes.map(n => `
        <tr>
          <td><strong>${n.id}</strong></td>
          <td contenteditable="true" class="editable-coord" data-node-id="${n.id}" data-coord="x" data-original-val="${n.x}">${(n.x / getDistFactor(activeUnits.nodeX)).toFixed(2)}</td>
          <td contenteditable="true" class="editable-coord" data-node-id="${n.id}" data-coord="y" data-original-val="${n.y}">${(n.y / getDistFactor(activeUnits.nodeY)).toFixed(2)}</td>
          <td contenteditable="true" class="editable-coord" data-node-id="${n.id}" data-coord="z" data-original-val="${n.z}">${(n.z / getDistFactor(activeUnits.nodeZ)).toFixed(2)}</td>
          <td>
            <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteNode('${n.id}'); window.initFrameAnalysisView();">Delete</button>
          </td>
        </tr>
      `).join('');

      // Attach click listeners to rows for selection synchronization
      const rows = tbodyNodes.querySelectorAll('tr');
      rows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedNodeIds && window.FrameCanvas.selectedNodeIds.has(rowNodeId);
          if (isSelected) {
            row.classList.add('selected-row');
          } else {
            row.classList.remove('selected-row');
          }
        }

        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn') || e.target.classList.contains('editable-coord')) {
            return; // Don't trigger standard selection click when deleting or editing
          }
          
          const firstCell = row.querySelector('td');
          if (firstCell && window.FrameCanvas) {
            const nodeId = firstCell.innerText.trim();
            const startSel = document.getElementById('member-input-start');
            const isSelectInModel = startSel && startSel.value === 'select-in-model';
            const isMulti = e.ctrlKey || e.shiftKey || isSelectInModel;
            
            window.FrameCanvas.selectNode(nodeId, isMulti);
          }
        });
      });
    }

    // 2. Members Table (Beam Tab - Geometry & Connectivity)
    const tbodyMembers = document.querySelector('#table-members tbody');
    const members = window.FrameModel.getMemberList();
    if (tbodyMembers) {
      if (members.length === 0) {
        tbodyMembers.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No beams defined.</td></tr>`;
      } else {
        tbodyMembers.innerHTML = members.map(m => {
          const rels = [];
          if (m.releases) {
            if (m.releases.Dxj) rels.push('Fx');
            if (m.releases.Dyj) rels.push('Fy');
            if (m.releases.Dzj) rels.push('Fz');
            if (m.releases.Rxj) rels.push('Mx');
            if (m.releases.Ryj) rels.push('My');
            if (m.releases.Rzj) rels.push('Mz');
          }
          const releaseStr = rels.length > 0 ? rels.join(', ') : 'Rigid';

          return `
            <tr>
              <td><strong>${m.id}</strong></td>
              <td>${m.startNode}</td>
              <td>${m.endNode}</td>
              <td>${releaseStr}</td>
              <td>
                <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteMember('${m.id}'); window.initFrameAnalysisView();">Delete</button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach selection synchronization listeners for table-members rows
        const rows = tbodyMembers.querySelectorAll('tr');
        rows.forEach(row => {
          const firstCell = row.querySelector('td');
          if (firstCell) {
            const rowMemberId = firstCell.innerText.trim();
            const isSelected = window.FrameCanvas.selectedMemberIds && window.FrameCanvas.selectedMemberIds.has(rowMemberId);
            if (isSelected) {
              row.classList.add('selected-row');
            } else {
              row.classList.remove('selected-row');
            }
          }

          row.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) return;
            const firstCell = row.querySelector('td');
            if (firstCell && window.FrameCanvas) {
              const memberId = firstCell.innerText.trim();
              const isMatSecTab = document.getElementById('btn-tab-matsec')?.classList.contains('active');
              const isMulti = e.ctrlKey || e.shiftKey || isMatSecTab;
              window.FrameCanvas.selectMember(memberId, isMulti);
            }
          });
        });
      }
    }

    // 2b. Material / Section Table (Material / Section Tab)
    const tbodyMatSec = document.querySelector('#table-matsec tbody');
    if (tbodyMatSec) {
      if (members.length === 0) {
        tbodyMatSec.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary);">No beams defined.</td></tr>`;
      } else {
        tbodyMatSec.innerHTML = members.map(m => {
          const secName = m.sectionName;
          let secSelect = `<select class="table-unit-select table-section-select" data-member-id="${m.id}" style="width: 100%; border: none; background: transparent; padding: 0; color: var(--text-primary); font-size: 0.75rem; cursor: pointer; outline: none; margin-left: -2px;">`;
          secSelect += `<option value="Default" ${secName === 'Default' ? 'selected' : ''}>Default</option>`;
          if (window.getActiveSectionProperties && window.getActiveSectionProperties()) {
            secSelect += `<option value="Active" ${secName === 'Active' ? 'selected' : ''}>Active</option>`;
          }
          if (Object.keys(window.SectionRegistry).length > 0) {
            secSelect += `<optgroup label="Custom Created Sections">`;
            for (const name in window.SectionRegistry) {
              secSelect += `<option value="${name}" ${secName === name ? 'selected' : ''}>${name}</option>`;
            }
            secSelect += `</optgroup>`;
          }
          const db = window.SECTION_DATABASE;
          if (db) {
            for (const cat in db) {
              for (const subcat in db[cat]) {
                secSelect += `<optgroup label="${cat} - ${subcat}">`;
                db[cat][subcat].forEach(profile => {
                  secSelect += `<option value="${profile.name}" ${secName === profile.name ? 'selected' : ''}>${profile.name}</option>`;
                });
                secSelect += `</optgroup>`;
              }
            }
          }
          secSelect += `</select>`;

          const matName = m.materialName || 'Steel – E250';
          let matSelect = `<select class="table-unit-select table-material-select" data-member-id="${m.id}" style="width: 100%; border: none; background: transparent; padding: 0; color: var(--text-primary); font-size: 0.75rem; cursor: pointer; outline: none; margin-left: -2px;">`;
          for (const name in window.MaterialDatabase) {
            matSelect += `<option value="${name}" ${matName === name ? 'selected' : ''}>${name}</option>`;
          }
          matSelect += `</select>`;

          return `
            <tr>
              <td><strong>${m.id}</strong></td>
              <td>${matSelect}</td>
              <td>${secSelect}</td>
            </tr>
          `;
        }).join('');

        // Attach change listeners for table selects
        tbodyMatSec.querySelectorAll('.table-section-select').forEach(sel => {
          sel.addEventListener('change', (e) => {
            const mId = e.target.getAttribute('data-member-id');
            if (window.FrameModel.members[mId]) {
              window.FrameModel.members[mId].sectionName = e.target.value;
              window.FrameModel.results = null; // Invalidate cache
              window.FrameCanvas.render();
              updateMatSecTabUI();
            }
          });
        });

        tbodyMatSec.querySelectorAll('.table-material-select').forEach(sel => {
          sel.addEventListener('change', (e) => {
            const mId = e.target.getAttribute('data-member-id');
            if (window.FrameModel.members[mId]) {
              window.FrameModel.members[mId].materialName = e.target.value;
              window.FrameModel.results = null; // Invalidate cache
              window.FrameCanvas.render();
              updateMatSecTabUI();
            }
          });
        });

        // Attach selection synchronization listeners for table-matsec rows
        const rows = tbodyMatSec.querySelectorAll('tr');
        rows.forEach(row => {
          const firstCell = row.querySelector('td');
          if (firstCell) {
            const rowMemberId = firstCell.innerText.trim();
            const isSelected = window.FrameCanvas.selectedMemberIds && window.FrameCanvas.selectedMemberIds.has(rowMemberId);
            if (isSelected) {
              row.classList.add('selected-row');
            } else {
              row.classList.remove('selected-row');
            }
          }

          row.addEventListener('click', (e) => {
            if (e.target.classList.contains('table-unit-select')) return;
            const firstCell = row.querySelector('td');
            if (firstCell && window.FrameCanvas) {
              const memberId = firstCell.innerText.trim();
              const isMulti = e.ctrlKey || e.shiftKey || true;
              window.FrameCanvas.selectMember(memberId, isMulti);
            }
          });
        });
      }
    }

    // 3. Supports Table
    const tbodySupports = document.querySelector('#table-supports tbody');
    const supports = window.FrameModel.getSupportList();
    if (supports.length === 0) {
      tbodySupports.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary);">No supports configured.</td></tr>`;
    } else {
      tbodySupports.innerHTML = supports.map(s => {
        const dofNames = ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ'];
        const displayRestraints = s.restraints
          .map((r, i) => r ? dofNames[i] : null)
          .filter(Boolean)
          .join(', ') || 'Free';
        return `
          <tr>
            <td>${s.nodeId}</td>
            <td>${displayRestraints}</td>
            <td>
              <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteSupport('${s.nodeId}'); window.initFrameAnalysisView();">Delete</button>
            </td>
          </tr>
        `;
      }).join('');

      // Attach selection synchronization listeners
      const rows = tbodySupports.querySelectorAll('tr');
      rows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas && (window.FrameCanvas.selectedSupportId === rowNodeId || (window.FrameCanvas.selectedSupportIds && window.FrameCanvas.selectedSupportIds.has(rowNodeId)));
          if (isSelected) {
            row.classList.add('selected-row');
          }
        }

        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn')) return;
          const firstCell = row.querySelector('td');
          if (firstCell && window.FrameCanvas) {
            const nodeId = firstCell.innerText.trim();
            const isMulti = e.ctrlKey || e.shiftKey;
            
            if (!window.FrameCanvas.selectedSupportIds) {
              window.FrameCanvas.selectedSupportIds = new Set();
            }

            if (isMulti) {
              if (window.FrameCanvas.selectedSupportIds.has(nodeId)) {
                window.FrameCanvas.selectedSupportIds.delete(nodeId);
              } else {
                window.FrameCanvas.selectedSupportIds.add(nodeId);
              }
              window.FrameCanvas.selectedSupportId = window.FrameCanvas.selectedSupportIds.size > 0 ? Array.from(window.FrameCanvas.selectedSupportIds)[window.FrameCanvas.selectedSupportIds.size - 1] : null;
            } else {
              window.FrameCanvas.selectedSupportIds.clear();
              window.FrameCanvas.selectedSupportIds.add(nodeId);
              window.FrameCanvas.selectedSupportId = nodeId;
            }
            
            window.FrameCanvas.render();
            window.selectSupportFromCanvas(window.FrameCanvas.selectedSupportId);
          }
        });
      });
    }

    // 4. Loads Table
    const tbodyLoads = document.querySelector('#table-loads tbody');
    const loads = window.FrameModel.loads;
    if (loads.length === 0) {
      tbodyLoads.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No loads placed.</td></tr>`;
    } else {
      tbodyLoads.innerHTML = loads.map((l, index) => {
        const target = l.type === 'NodalLoad' ? `Node ${l.nodeId}` : `Member ${l.memberId}`;
        
        const fUnit = activeUnits.loadVal;
        const dUnit = (fUnit === 'lbf' || fUnit === 'kip') ? 'ft' : 'm';
        
        let displayValStr = '';
        if (l.type === 'NodalLoad') {
          const isMoment = l.direction.startsWith('M');
          if (isMoment) {
            const factor = getForceFactor(fUnit) * getDistFactor(dUnit);
            const valConv = parseFloat(l.force) / factor;
            displayValStr = `${valConv.toFixed(1)} ${fUnit}·${dUnit}`;
          } else {
            const factor = getForceFactor(fUnit);
            const valConv = parseFloat(l.force) / factor;
            displayValStr = `${valConv.toFixed(1)} ${fUnit}`;
          }
        } else {
          if (l.type === 'MemberPointLoad') {
            const factor = getForceFactor(fUnit);
            const valConv = parseFloat(l.force) / factor;
            displayValStr = `${valConv.toFixed(1)} ${fUnit}`;
          } else {
            const factor = getForceFactor(fUnit) / getDistFactor(dUnit);
            const valConv = parseFloat(l.force) / factor;
            displayValStr = `${valConv.toFixed(1)} ${fUnit}/${dUnit}`;
          }
        }

        return `
          <tr>
            <td>${target}</td>
            <td>${l.type.replace('Member', '').replace('Load', '')}</td>
            <td>${l.direction}</td>
            <td>${displayValStr}</td>
            <td>
              <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteLoad(${index}); window.initFrameAnalysisView();">Delete</button>
            </td>
          </tr>
        `;
      }).join('');

      // Attach selection synchronization listeners
      const rows = tbodyLoads.querySelectorAll('tr');
      rows.forEach((row, idx) => {
        const isSelected = window.FrameCanvas && (window.FrameCanvas.selectedLoadIndex === idx || (window.FrameCanvas.selectedLoadIndexes && window.FrameCanvas.selectedLoadIndexes.has(idx)));
        if (isSelected) {
          row.classList.add('selected-row');
        }

        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn')) return;
          if (window.FrameCanvas) {
            const isMulti = e.ctrlKey || e.shiftKey;
            
            if (!window.FrameCanvas.selectedLoadIndexes) {
              window.FrameCanvas.selectedLoadIndexes = new Set();
            }

            if (isMulti) {
              if (window.FrameCanvas.selectedLoadIndexes.has(idx)) {
                window.FrameCanvas.selectedLoadIndexes.delete(idx);
              } else {
                window.FrameCanvas.selectedLoadIndexes.add(idx);
              }
              window.FrameCanvas.selectedLoadIndex = window.FrameCanvas.selectedLoadIndexes.size > 0 ? Array.from(window.FrameCanvas.selectedLoadIndexes)[window.FrameCanvas.selectedLoadIndexes.size - 1] : null;
            } else {
              window.FrameCanvas.selectedLoadIndexes.clear();
              window.FrameCanvas.selectedLoadIndexes.add(idx);
              window.FrameCanvas.selectedLoadIndex = idx;
            }
            
            window.FrameCanvas.render();
            window.selectLoadFromCanvas(window.FrameCanvas.selectedLoadIndex);
          }
        });
      });
    }

    // Check if analysis results exist to enable/disable result controls & tabs
    const results = window.FrameModel.results;
    const resGroup = document.getElementById('group-result-display-controls');
    const tabContainer = document.getElementById('frame-results-tabs-header');
    
    // Sync Analyse Model button status color
    const solveBtn = document.getElementById('btn-solve-frame');
    if (solveBtn) {
      if (!results) {
        solveBtn.classList.add('btn-analyse-required');
      } else {
        solveBtn.classList.remove('btn-analyse-required');
      }
    }
    
    if (!results) {
      // 1. Disable Result display checkboxes
      if (resGroup) {
        resGroup.style.opacity = '0.5';
        resGroup.style.pointerEvents = 'none';
        resGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.disabled = true;
          cb.checked = false; // uncheck
        });
      }
      
      // 3. Disable Results tabs
      if (tabContainer) {
        tabContainer.querySelectorAll('.btn-subtab').forEach(tab => {
          tab.classList.add('disabled');
          tab.style.opacity = '0.5';
          tab.style.pointerEvents = 'none';
        });
      }
      
      // 4. Reset results tables content
      const resetTbody = (id, colspan, msg) => {
        const tbody = document.querySelector(`#${id} tbody`);
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; color: var(--text-secondary);">${msg}</td></tr>`;
        }
      };
      const msg = "No active analysis results. Click 'Analyse Model'.";
      resetTbody('table-res-displacements', 7, msg);
      resetTbody('table-res-reactions', 7, msg);
      resetTbody('table-res-axial', 4, msg);
      resetTbody('table-res-shear', 5, msg);
      resetTbody('table-res-moments', 5, msg);
      resetTbody('table-res-torsion', 4, msg);
    } else {
      // 1. Enable Result display checkboxes
      if (resGroup) {
        resGroup.style.opacity = '1.0';
        resGroup.style.pointerEvents = 'auto';
        resGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.removeAttribute('disabled');
        });
      }
      
      // 3. Enable Results tabs
      if (tabContainer) {
        tabContainer.querySelectorAll('.btn-subtab').forEach(tab => {
          tab.classList.remove('disabled');
          tab.style.opacity = '1.0';
          tab.style.pointerEvents = 'auto';
        });
      }

      // 4. Default to active displacements tab
      const dispTab = document.getElementById('btn-tab-res-displacements');
      if (dispTab && !dispTab.classList.contains('active')) {
        dispTab.click();
      }

      // 5. Sync selection highlights and bind click events to Results Tables
      
      // Node-based: Displacements Table
      const resDispRows = document.querySelectorAll('#table-res-displacements tbody tr');
      resDispRows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedNodeIds && window.FrameCanvas.selectedNodeIds.has(rowNodeId);
          if (isSelected) {
            row.classList.add('selected-row');
          } else {
            row.classList.remove('selected-row');
          }
          
          row.onclick = (e) => {
            const isMulti = e.ctrlKey || e.shiftKey;
            window.FrameCanvas.selectNode(rowNodeId, isMulti);
          };
        }
      });

      // Node-based (Supports): Support Reactions Table
      const resReactRows = document.querySelectorAll('#table-res-reactions tbody tr');
      resReactRows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedSupportIds && window.FrameCanvas.selectedSupportIds.has(rowNodeId);
          if (isSelected) {
            row.classList.add('selected-row');
          } else {
            row.classList.remove('selected-row');
          }
          
          row.onclick = (e) => {
            const isMulti = e.ctrlKey || e.shiftKey;
            window.FrameCanvas.selectSupport(rowNodeId, isMulti);
            window.FrameCanvas.selectNode(rowNodeId, isMulti);
          };
        }
      });

      // Beam-based Results Tables
      const beamTables = [
        '#table-res-axial',
        '#table-res-shear',
        '#table-res-moments',
        '#table-res-torsion'
      ];
      beamTables.forEach(tableSelector => {
        const resBeamRows = document.querySelectorAll(`${tableSelector} tbody tr`);
        resBeamRows.forEach(row => {
          const firstCell = row.querySelector('td');
          if (firstCell) {
            const rowMemberId = firstCell.innerText.trim();
            const isSelected = window.FrameCanvas.selectedMemberIds && window.FrameCanvas.selectedMemberIds.has(rowMemberId);
            if (isSelected) {
              row.classList.add('selected-row');
            } else {
              row.classList.remove('selected-row');
            }
            
            row.onclick = (e) => {
              const isMulti = e.ctrlKey || e.shiftKey;
              window.FrameCanvas.selectMember(rowMemberId, isMulti);
            };
          }
        });
      });
    }
  }

  function scrollSelectedResultsIntoView(targetId = null) {
    const activePanel = document.querySelector('.res-tab-content[style*="display: block"]');
    if (!activePanel) return;

    if (targetId) {
      const rows = activePanel.querySelectorAll('tbody tr');
      for (const row of rows) {
        const firstCell = row.querySelector('td');
        if (firstCell && firstCell.innerText.trim() === targetId) {
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
      }
    }

    const selectedRow = activePanel.querySelector('tbody tr.selected-row');
    if (selectedRow) {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function populateResultsTables(results) {
    if (!results) return;

    // 1. Displacements
    const tbodyDisp = document.querySelector('#table-res-displacements tbody');
    if (tbodyDisp && results.displacements) {
      tbodyDisp.innerHTML = results.displacements.map(d => `
        <tr>
          <td><strong>${d.nodeId}</strong></td>
          <td>${convertResult(d.DX, 'disp').toFixed(3)}</td>
          <td>${convertResult(d.DY, 'disp').toFixed(3)}</td>
          <td>${convertResult(d.DZ, 'disp').toFixed(3)}</td>
          <td>${convertResult(d.RX, 'rot').toFixed(5)}</td>
          <td>${convertResult(d.RY, 'rot').toFixed(5)}</td>
          <td>${convertResult(d.RZ, 'rot').toFixed(5)}</td>
        </tr>
      `).join('');
    }

    // 2. Reactions
    const tbodyReact = document.querySelector('#table-res-reactions tbody');
    if (tbodyReact) {
      if (results.reactions && results.reactions.length > 0) {
        tbodyReact.innerHTML = results.reactions.map(r => `
          <tr>
            <td><strong>${r.nodeId}</strong></td>
            <td>${convertResult(r.FX, 'force').toFixed(2)}</td>
            <td>${convertResult(r.FY, 'force').toFixed(2)}</td>
            <td>${convertResult(r.FZ, 'force').toFixed(2)}</td>
            <td>${convertResult(r.MX, 'moment').toFixed(2)}</td>
            <td>${convertResult(r.MY, 'moment').toFixed(2)}</td>
            <td>${convertResult(r.MZ, 'moment').toFixed(2)}</td>
          </tr>
        `).join('');
      } else {
        tbodyReact.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No support node reactions.</td></tr>`;
      }
    }

    // 3. Axial Forces
    const tbodyAxial = document.querySelector('#table-res-axial tbody');
    if (tbodyAxial && results.memberForces) {
      tbodyAxial.innerHTML = results.memberForces.map(m => {
        const pts = m.points;
        const start = convertResult(pts[0].axial, 'force');
        const end = convertResult(pts[pts.length - 1].axial, 'force');
        const max = convertResult(Math.max(...pts.map(pt => Math.abs(pt.axial))), 'force');
        return `
          <tr>
            <td><strong>${m.memberId}</strong></td>
            <td>${start.toFixed(2)}</td>
            <td>${end.toFixed(2)}</td>
            <td>${max.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }

    // 4. Shear Forces
    const tbodyShear = document.querySelector('#table-res-shear tbody');
    if (tbodyShear && results.memberForces) {
      tbodyShear.innerHTML = results.memberForces.map(m => {
        const pts = m.points;
        const startVy = convertResult(pts[0].shear_Y, 'force');
        const endVy = convertResult(pts[pts.length - 1].shear_Y, 'force');
        const startVz = convertResult(pts[0].shear_Z, 'force');
        const endVz = convertResult(pts[pts.length - 1].shear_Z, 'force');
        return `
          <tr>
            <td><strong>${m.memberId}</strong></td>
            <td>${startVy.toFixed(2)}</td>
            <td>${endVy.toFixed(2)}</td>
            <td>${startVz.toFixed(2)}</td>
            <td>${endVz.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }

    // 5. Bending Moments
    const tbodyMoments = document.querySelector('#table-res-moments tbody');
    if (tbodyMoments && results.memberForces) {
      tbodyMoments.innerHTML = results.memberForces.map(m => {
        const pts = m.points;
        const startMy = convertResult(pts[0].moment_Y, 'moment');
        const endMy = convertResult(pts[pts.length - 1].moment_Y, 'moment');
        const startMz = convertResult(pts[0].moment_Z, 'moment');
        const endMz = convertResult(pts[pts.length - 1].moment_Z, 'moment');
        return `
          <tr>
            <td><strong>${m.memberId}</strong></td>
            <td>${startMy.toFixed(2)}</td>
            <td>${endMy.toFixed(2)}</td>
            <td>${startMz.toFixed(2)}</td>
            <td>${endMz.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }

    // 6. Torsion
    const tbodyTorsion = document.querySelector('#table-res-torsion tbody');
    if (tbodyTorsion && results.memberForces) {
      tbodyTorsion.innerHTML = results.memberForces.map(m => {
        const pts = m.points;
        const start = convertResult(pts[0].torque, 'moment');
        const end = convertResult(pts[pts.length - 1].torque, 'moment');
        const max = convertResult(Math.max(...pts.map(pt => Math.abs(pt.torque))), 'moment');
        return `
          <tr>
            <td><strong>${m.memberId}</strong></td>
            <td>${start.toFixed(2)}</td>
            <td>${end.toFixed(2)}</td>
            <td>${max.toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }
  }

  function setupDefaultModel() {
    // Add default portal frame to demonstrate viewports immediately
    window.FrameModel.clear();
    
    // Nodes
    window.FrameModel.addNode('N1', 0.0, 0.0, 0.0);
    window.FrameModel.addNode('N2', 0.0, 3.0, 0.0);
    window.FrameModel.addNode('N3', 4.0, 3.0, 0.0);
    window.FrameModel.addNode('N4', 4.0, 0.0, 0.0);

    // Members
    window.FrameModel.addMember('B1', 'N1', 'N2', 'IPE 200', 'Steel – E250');
    window.FrameModel.addMember('B2', 'N2', 'N3', 'IPE 200', 'Steel – E250');
    window.FrameModel.addMember('B3', 'N4', 'N3', 'IPE 200', 'Steel – E250');

    // Supports
    window.FrameModel.addSupport('N1', [true, true, true, true, false, false]); // Stabilized
    window.FrameModel.addSupport('N4', [true, true, true, false, false, false]); // Pinned

    // Loads
    window.FrameModel.addLoad({
      type: 'NodalLoad',
      nodeId: 'N2',
      direction: 'FX',
      force: 15000.0 // 15 kN lateral force
    });
    
    window.FrameModel.addLoad({
      type: 'MemberDistributedLoad',
      memberId: 'B2',
      direction: 'Fy',
      w1: -8000.0, // -8 kN/m vertical UDL
      w2: -8000.0,
      x1: null,
      x2: null
    });
  }

  // Helper values for default supports setup

  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notify');
    if (toast) {
      if (type === 'error') {
        toast.style.background = 'rgba(239, 68, 68, 0.96)';
        toast.style.color = '#ffffff';
        toast.style.borderColor = '#ef4444';
        toast.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="color: #ffffff; flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14" stroke-linecap="round"/></svg> <span id="toast-message" style="margin-left: 8px;">${message}</span>`;
      } else {
        toast.style.background = '';
        toast.style.color = '';
        toast.style.borderColor = '';
        toast.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="color: var(--accent-secondary); flex-shrink: 0;"><path d="M5 13l4 4L19 7" stroke-linecap="round"/></svg> <span id="toast-message" style="margin-left: 8px;">${message}</span>`;
      }
      
      toast.classList.add('show');
      if (toast._timeout) clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 4000);
    }
  }

  function openFrameReport() {
    const results = window.FrameModel.results;
    if (!results) {
      showToast("Analysis results are not available. Please analyse the model first.", "error");
      return;
    }

    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      showToast('Pop-up blocked! Please allow pop-ups for this site.');
      return;
    }

    const appName = window.APP_NAME || 'Apex Suite';

    // Build print HTML content
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Frame Analysis Report - ${appName}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; margin: 30px; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #4682b4; padding-bottom: 10px; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #4682b4; font-size: 1.8rem; }
          .header p { margin: 5px 0 0; font-size: 0.9rem; color: #666; }
          h2 { color: #333; font-size: 1.3rem; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: 600; }
          .footer { text-align: center; font-size: 0.8rem; color: #777; margin-top: 50px; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print {
            .no-print { display: none; }
            body { margin: 15px; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px;">
          <button onclick="window.print()" style="padding: 8px 15px; font-weight: 600; background-color: #4682b4; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Print Report</button>
        </div>

        <div class="header">
          <h1>Apex Structural Analysis Suite</h1>
          <p>Generated by ${appName}: 3D Frame Analysis Report</p>
        </div>

        <h2>Model Nodes</h2>
        <table>
          <thead>
            <tr><th>Node ID</th><th>X (m)</th><th>Y (m)</th><th>Z (m)</th></tr>
          </thead>
          <tbody>
            ${window.FrameModel.getNodeList().map(n => `
              <tr><td>${n.id}</td><td>${n.x.toFixed(3)}</td><td>${n.y.toFixed(3)}</td><td>${n.z.toFixed(3)}</td></tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Model Members</h2>
        <table>
          <thead>
            <tr><th>Member ID</th><th>Start Node</th><th>End Node</th><th>Section profile</th><th>Beta Angle (°)</th></tr>
          </thead>
          <tbody>
            ${window.FrameModel.getMemberList().map(m => `
              <tr><td>${m.id}</td><td>${m.startNode}</td><td>${m.endNode}</td><td>${m.sectionName}</td><td>${m.beta.toFixed(1)}</td></tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Resolved Nodal Displacements</h2>
        <table>
          <thead>
            <tr><th>Node</th><th>DX (mm)</th><th>DY (mm)</th><th>DZ (mm)</th><th>RX (rad)</th><th>RY (rad)</th><th>RZ (rad)</th></tr>
          </thead>
          <tbody>
            ${results.displacements.map(d => `
              <tr>
                <td><strong>${d.nodeId}</strong></td>
                <td>${(d.DX * 1000.0).toFixed(3)}</td>
                <td>${(d.DY * 1000.0).toFixed(3)}</td>
                <td>${(d.DZ * 1000.0).toFixed(3)}</td>
                <td>${d.RX.toFixed(5)}</td>
                <td>${d.RY.toFixed(5)}</td>
                <td>${d.RZ.toFixed(5)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Support Reaction Results</h2>
        <table>
          <thead>
            <tr><th>Node</th><th>FX (kN)</th><th>FY (kN)</th><th>FZ (kN)</th><th>MX (kNm)</th><th>MY (kNm)</th><th>MZ (kNm)</th></tr>
          </thead>
          <tbody>
            ${results.reactions.map(r => `
              <tr>
                <td><strong>${r.nodeId}</strong></td>
                <td>${(r.FX / 1000.0).toFixed(2)}</td>
                <td>${(r.FY / 1000.0).toFixed(2)}</td>
                <td>${(r.FZ / 1000.0).toFixed(2)}</td>
                <td>${(r.MX / 1000.0).toFixed(2)}</td>
                <td>${(r.MY / 1000.0).toFixed(2)}</td>
                <td>${(r.MZ / 1000.0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generated by ${appName}: Structural Analysis
        </div>
      </body>
      </html>
    `;

    reportWindow.document.write(htmlContent);
    reportWindow.document.close();
  }

  window.selectNodeFromCanvas = function(nodeId, isMulti = false) {
    const tableRows = document.querySelectorAll('#table-nodes tbody tr');
    let targetRow = null;

    tableRows.forEach(row => {
      const firstCell = row.querySelector('td');
      if (firstCell) {
        const rowNodeId = firstCell.innerText.trim();
        const isSelected = window.FrameCanvas.selectedNodeIds && window.FrameCanvas.selectedNodeIds.has(rowNodeId);
        if (isSelected) {
          row.classList.add('selected-row');
          if (rowNodeId === nodeId) {
            targetRow = row;
          }
        } else {
          row.classList.remove('selected-row');
        }
      }
    });

    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Sync results tables if valid results exist
    if (window.FrameModel.results) {
      // Sync Displacements Results Table
      const resDispRows = document.querySelectorAll('#table-res-displacements tbody tr');
      resDispRows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedNodeIds && window.FrameCanvas.selectedNodeIds.has(rowNodeId);
          if (isSelected) {
            row.classList.add('selected-row');
          } else {
            row.classList.remove('selected-row');
          }
        }
      });

      // Sync Support Reactions Results Table
      const resReactRows = document.querySelectorAll('#table-res-reactions tbody tr');
      resReactRows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedSupportIds && window.FrameCanvas.selectedSupportIds.has(rowNodeId);
          if (isSelected) {
            row.classList.add('selected-row');
          } else {
            row.classList.remove('selected-row');
          }
        }
      });

      // Scroll the active Results tab table to the selected node
      scrollSelectedResultsIntoView(nodeId);
    }

    const startSel = document.getElementById('member-input-start');
    const endSel = document.getElementById('member-input-end');
    if (startSel && endSel && (startSel.value === 'select-in-model' || endSel.value === 'select-in-model')) {
      const selectedIds = Array.from(window.FrameCanvas.selectedNodeIds);
      if (selectedIds.length === 1) {
        startSel.value = selectedIds[0];
        showToast(`Node 1 selected: ${selectedIds[0]}. Select a second node in the model.`);
      } else if (selectedIds.length === 2) {
        startSel.value = selectedIds[0];
        endSel.value = selectedIds[1];
      } else if (selectedIds.length > 2) {
        showToast('Please select exactly two nodes to create a beam.');
      }
    }
  };

  function isCollinear(p1, p2, q1, q2) {
    const v = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const w = { x: q2.x - q1.x, y: q2.y - q1.y, z: q2.z - q1.z };
    const u = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
    
    const lenV = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    const lenW = Math.sqrt(w.x*w.x + w.y*w.y + w.z*w.z);
    const lenU = Math.sqrt(u.x*u.x + u.y*u.y + u.z*u.z);
    
    if (lenV < 1e-9 || lenW < 1e-9) return false;
    
    const crossVW = {
      x: v.y * w.z - v.z * w.y,
      y: v.z * w.x - v.x * w.z,
      z: v.x * w.y - v.y * w.x
    };
    const lenCrossVW = Math.sqrt(crossVW.x*crossVW.x + crossVW.y*crossVW.y + crossVW.z*crossVW.z);
    if (lenCrossVW / (lenV * lenW) > 1e-5) return false;
    
    if (lenU < 1e-9) return true;
    
    const crossVU = {
      x: v.y * u.z - v.z * u.y,
      y: v.z * u.x - v.x * u.z,
      z: v.x * u.y - v.y * u.x
    };
    const lenCrossVU = Math.sqrt(crossVU.x*crossVU.x + crossVU.y*crossVU.y + crossVU.z*crossVU.z);
    return (lenCrossVU / (lenV * lenU) <= 1e-5);
  }

  function validateProposedBeam(startNodeId, endNodeId) {
    // 1. Duplicate Beam Check
    const existingMembers = window.FrameModel.getMemberList();
    const hasDuplicate = existingMembers.some(m => 
      (m.startNode === startNodeId && m.endNode === endNodeId) || 
      (m.startNode === endNodeId && m.endNode === startNodeId)
    );
    if (hasDuplicate) {
      showToast('A beam already exists between the selected nodes.', 'error');
      return false;
    }

    // 2. Collinear Overlap Check
    const q1 = window.FrameModel.nodes[startNodeId];
    const q2 = window.FrameModel.nodes[endNodeId];
    if (!q1 || !q2) return true;

    for (const m of existingMembers) {
      const p1 = window.FrameModel.nodes[m.startNode];
      const p2 = window.FrameModel.nodes[m.endNode];
      if (!p1 || !p2) continue;

      if (isCollinear(p1, p2, q1, q2)) {
        const v = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const lenV = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        if (lenV < 1e-9) continue;

        const dotVV = v.x*v.x + v.y*v.y + v.z*v.z;
        
        const q1_minus_p1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
        const q2_minus_p1 = { x: q2.x - p1.x, y: q2.y - p1.y, z: q2.z - p1.z };
        
        const tQ1 = q1_minus_p1.x*v.x + q1_minus_p1.y*v.y + q1_minus_p1.z*v.z;
        const tQ2 = q2_minus_p1.x*v.x + q2_minus_p1.y*v.y + q2_minus_p1.z*v.z;
        
        const aStart = 0;
        const aEnd = dotVV;
        const bStart = Math.min(tQ1, tQ2);
        const bEnd = Math.max(tQ1, tQ2);
        
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        
        if (overlapStart < overlapEnd) {
          const overlapLen = (overlapEnd - overlapStart) / lenV;
          if (overlapLen > 1e-4) {
            showToast('The new beam overlaps with an existing beam.', 'error');
            return false;
          }
        }
      }
    }
    return true;
  }

  function createBeamFromModelSelection() {
    const startSel = document.getElementById('member-input-start');
    const endSel = document.getElementById('member-input-end');
    const start = startSel.value;
    const end = endSel.value;
    
    if (!start || start === 'select-in-model' || !end || end === 'select-in-model') {
      showToast('Please select exactly two nodes to create a beam.');
      return;
    }
    if (start === end) {
      showToast('Start Node and End Node cannot be identical.');
      return;
    }
    
    let k = 1;
    while (window.FrameModel.members[`B${k}`]) {
      k++;
    }
    const id = `B${k}`;
    const section = 'IPE 200';
    const material = 'Steel – E250';
    const beta = parseFloat(document.getElementById('member-input-beta').value) || 0.0;

    const releases = {
      Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false, Rzi: false,
      Dxj: document.getElementById('member-release-fx').checked,
      Dyj: document.getElementById('member-release-fy').checked,
      Dzj: document.getElementById('member-release-fz').checked,
      Rxj: document.getElementById('member-release-mx').checked,
      Ryj: document.getElementById('member-release-my').checked,
      Rzj: document.getElementById('member-release-mz').checked
    };

    window.FrameModel.addMember(id, start, end, section, material, beta, releases);
    showToast(`Beam ${id} added successfully.`);
    
    if (window.FrameCanvas) {
      window.FrameCanvas.selectNode(null, false);
    }
    startSel.value = 'select-in-model';
    endSel.value = 'select-in-model';
    
    refreshAllDropdowns();
    updateTablesDisplay();
    window.FrameCanvas.render();
  }

  window.selectMemberFromCanvas = function(memberId, isMulti = false) {
    const tables = ['#table-members', '#table-matsec'];
    let targetRow = null;

    tables.forEach(tableSelector => {
      const tableRows = document.querySelectorAll(`${tableSelector} tbody tr`);
      tableRows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowMemberId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedMemberIds && window.FrameCanvas.selectedMemberIds.has(rowMemberId);
          if (isSelected) {
            row.classList.add('selected-row');
            if (rowMemberId === memberId) {
              targetRow = row;
            }
          } else {
            row.classList.remove('selected-row');
          }
        }
      });
    });

    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Sync results tables if valid results exist
    if (window.FrameModel.results) {
      const beamResultTables = [
        '#table-res-axial',
        '#table-res-shear',
        '#table-res-moments',
        '#table-res-torsion'
      ];
      beamResultTables.forEach(tableSelector => {
        const resBeamRows = document.querySelectorAll(`${tableSelector} tbody tr`);
        resBeamRows.forEach(row => {
          const firstCell = row.querySelector('td');
          if (firstCell) {
            const rowMemberId = firstCell.innerText.trim();
            const isSelected = window.FrameCanvas.selectedMemberIds && window.FrameCanvas.selectedMemberIds.has(rowMemberId);
            if (isSelected) {
              row.classList.add('selected-row');
            } else {
              row.classList.remove('selected-row');
            }
          }
        });
      });

      // Scroll the active Results tab table to the selected member
      scrollSelectedResultsIntoView(memberId);
    }

    updateMatSecTabUI();
  };

  window.selectSupportFromCanvas = function(nodeId) {
    const tableRows = document.querySelectorAll('#table-supports tbody tr');
    let targetRow = null;

    tableRows.forEach(row => {
      const firstCell = row.querySelector('td');
      if (firstCell) {
        const rowNodeId = firstCell.innerText.trim();
        const isSelected = window.FrameCanvas.selectedSupportIds && window.FrameCanvas.selectedSupportIds.has(rowNodeId);
        if (isSelected) {
          row.classList.add('selected-row');
          if (rowNodeId === nodeId) {
            targetRow = row;
          }
        } else {
          row.classList.remove('selected-row');
        }
      }
    });

    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Sync results tables if valid results exist
    if (window.FrameModel.results) {
      // Sync Support Reactions Results Table
      const resReactRows = document.querySelectorAll('#table-res-reactions tbody tr');
      resReactRows.forEach(row => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const rowNodeId = firstCell.innerText.trim();
          const isSelected = window.FrameCanvas.selectedSupportIds && window.FrameCanvas.selectedSupportIds.has(rowNodeId);
          if (isSelected) {
            row.classList.add('selected-row');
          } else {
            row.classList.remove('selected-row');
          }
        }
      });

      // Scroll the active Results tab table to the selected support node
      scrollSelectedResultsIntoView(nodeId);
    }
  };

  window.selectLoadFromCanvas = function(loadIndex) {
    const tableRows = document.querySelectorAll('#table-loads tbody tr');
    let targetRow = null;

    tableRows.forEach((row, idx) => {
      if (loadIndex !== null && idx === loadIndex) {
        row.classList.add('selected-row');
        targetRow = row;
      } else {
        row.classList.remove('selected-row');
      }
    });

    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      tableRows.forEach(row => row.classList.remove('selected-row'));
    }
  };

  function updateMatSecTabUI() {
    const badge = document.getElementById('matsec-selected-badge');
    const details = document.getElementById('matsec-current-details');
    const matSpan = document.getElementById('matsec-current-material');
    const secSpan = document.getElementById('matsec-current-section');
    const assignBtn = document.getElementById('btn-matsec-assign');
    
    if (!badge) return;
    
    const selectedIds = window.FrameCanvas.selectedMemberIds;
    if (!selectedIds || selectedIds.size === 0) {
      badge.textContent = 'None';
      details.style.display = 'none';
      assignBtn.setAttribute('disabled', 'true');
      return;
    }
    
    assignBtn.removeAttribute('disabled');
    
    const ids = Array.from(selectedIds);
    if (ids.length === 1) {
      badge.textContent = ids[0];
      const m = window.FrameModel.members[ids[0]];
      if (m) {
        matSpan.textContent = m.materialName || 'Steel – E250';
        secSpan.textContent = m.sectionName || 'Default';
        
        const matInput = document.getElementById('matsec-input-material');
        if (matInput) matInput.value = m.materialName || 'Steel – E250';
        
        const secInput = document.getElementById('matsec-input-section');
        if (secInput) secInput.value = m.sectionName || 'Default';
      }
      details.style.display = 'block';
    } else {
      badge.textContent = `${ids.length} Beams`;
      
      let commonMat = null;
      let commonSec = null;
      let matMixed = false;
      let secMixed = false;
      
      ids.forEach((id, idx) => {
        const m = window.FrameModel.members[id];
        if (m) {
          const mat = m.materialName || 'Steel – E250';
          const sec = m.sectionName || 'Default';
          if (idx === 0) {
            commonMat = mat;
            commonSec = sec;
          } else {
            if (commonMat !== mat) matMixed = true;
            if (commonSec !== sec) secMixed = true;
          }
        }
      });
      
      matSpan.textContent = matMixed ? 'Multiple Values' : commonMat;
      secSpan.textContent = secMixed ? 'Multiple Values' : commonSec;
      details.style.display = 'block';
    }
  }

  // --- OPERATIONS PANEL FUNCTIONALITY ---

  // Helper: Find if a node already exists at a coordinate within a tiny tolerance (0.1 mm)
  function findExistingNodeAt(x, y, z) {
    for (const id in window.FrameModel.nodes) {
      const n = window.FrameModel.nodes[id];
      const dist = Math.sqrt((n.x - x)**2 + (n.y - y)**2 + (n.z - z)**2);
      if (dist < 0.0001) return id; // 0.1 mm
    }
    return null;
  }

  // Bind main tabs switching, subtab switching, and operations buttons
  function bindOperationsEvents() {
    // 1. Top-Level Main Tabs Switching
    const tabAddInput = document.getElementById('btn-main-tab-add-input');
    const tabOperations = document.getElementById('btn-main-tab-operations');
    const wrapAddInput = document.getElementById('section-add-input-wrapper');
    const wrapOperations = document.getElementById('section-operations-wrapper');
    const panelOpParams = document.getElementById('panel-operation-params');
    const panelPropInfo = document.getElementById('panel-properties-info');
    const opParamsCard = document.getElementById('operations-parameters-card');

    if (tabAddInput && tabOperations && wrapAddInput && wrapOperations && panelOpParams && panelPropInfo && opParamsCard) {
      tabAddInput.addEventListener('click', () => {
        tabAddInput.classList.add('active');
        tabOperations.classList.remove('active');
        wrapAddInput.style.display = 'block';
        wrapOperations.style.display = 'none';
        opParamsCard.style.display = 'flex';
        panelPropInfo.style.display = 'flex';
        panelOpParams.style.display = 'none';
      });

      tabOperations.addEventListener('click', () => {
        tabOperations.classList.add('active');
        tabAddInput.classList.remove('active');
        wrapOperations.style.display = 'block';
        wrapAddInput.style.display = 'none';
        opParamsCard.style.display = 'flex';
        panelPropInfo.style.display = 'none';
        panelOpParams.style.display = 'flex';
        
        // Default select translation operation when entering operations tab
        const activeSubtab = document.querySelector('#section-operations-wrapper .frame-tabs .btn-subtab.active');
        if (activeSubtab) {
          const tabName = activeSubtab.id.replace('btn-tab-', '');
          if (tabName === 'node-ops') {
            selectOperation('node-translate');
          } else if (tabName === 'beam-ops') {
            selectOperation('beam-split');
          }
        }
      });
    }

    // Helper to change operation parameter view
    function selectOperation(opName) {
      document.querySelectorAll('.op-select-btn').forEach(btn => {
        if (btn.getAttribute('data-op') === opName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      document.querySelectorAll('.op-param-section').forEach(sec => {
        sec.style.display = 'none';
      });
      const targetSec = document.getElementById(`op-params-${opName}`);
      if (targetSec) {
        targetSec.style.display = 'flex';
      }
    }

    // 2. Select operation click bindings
    document.querySelectorAll('.op-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const opName = btn.getAttribute('data-op');
        selectOperation(opName);
      });
    });

    // 3. Operations Subtabs Switching
    document.querySelectorAll('#section-operations-wrapper .frame-tabs .btn-subtab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#section-operations-wrapper .frame-tabs .btn-subtab').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        
        document.querySelectorAll('#section-operations-wrapper .frame-tab-content').forEach(p => p.style.display = 'none');
        const tabName = btn.id.replace('btn-tab-', '');
        const targetPanel = document.getElementById(`panel-tab-${tabName}`);
        if (targetPanel) {
          targetPanel.style.display = 'block';
        }

        // Auto-select first operation of the chosen subtab
        if (tabName === 'node-ops') {
          selectOperation('node-translate');
        } else if (tabName === 'beam-ops') {
          selectOperation('beam-split');
        }
      });
    });

    // 4. Split Method toggling within Operation Parameters Panel
    const splitMethodSelect = document.getElementById('param-beam-splitmethod');
    if (splitMethodSelect) {
      splitMethodSelect.addEventListener('change', (e) => {
        const valGroup = document.getElementById('param-beam-splitval-group');
        const valLabel = document.getElementById('param-beam-splitval-label');
        const valInput = document.getElementById('param-beam-splitval');
        const method = e.target.value;
        if (method === 'half') {
          valGroup.style.display = 'none';
        } else if (method === 'ratio') {
          valGroup.style.display = 'block';
          valLabel.textContent = 'Ratio (0.0 to 1.0)';
          valInput.value = '0.5';
          valInput.min = '0.01';
          valInput.max = '0.99';
          valInput.step = '0.05';
        } else if (method === 'distance') {
          valGroup.style.display = 'block';
          valLabel.textContent = 'Distance (m)';
          valInput.value = '1.0';
          valInput.min = '0.01';
          valInput.removeAttribute('max');
          valInput.step = '0.5';
        }
      });
    }

    // 5. Node Translate: Mode toggle (Copies enabled/disabled based on Move/Copy selection)
    const translateModeSelect = document.getElementById('param-node-tmode');
    const translateCopiesInput = document.getElementById('param-node-tcopies');
    if (translateModeSelect && translateCopiesInput) {
      const handleTranslateModeChange = () => {
        if (translateModeSelect.value === 'move') {
          translateCopiesInput.disabled = true;
          translateCopiesInput.value = '1';
        } else {
          translateCopiesInput.disabled = false;
        }
      };
      translateModeSelect.addEventListener('change', handleTranslateModeChange);
      handleTranslateModeChange();
    }

    // 6. Node Rotate: Mode toggle (Copies enabled/disabled based on Move/Copy selection)
    const rotateModeSelect = document.getElementById('param-node-rmode');
    const rotateCopiesInput = document.getElementById('param-node-rcopies');
    if (rotateModeSelect && rotateCopiesInput) {
      const handleRotateModeChange = () => {
        if (rotateModeSelect.value === 'move') {
          rotateCopiesInput.disabled = true;
          rotateCopiesInput.value = '1';
        } else {
          rotateCopiesInput.disabled = false;
        }
      };
      rotateModeSelect.addEventListener('change', handleRotateModeChange);
      handleRotateModeChange();
    }

    // --- NODE OPERATIONS APPLY ACTION LISTENERS ---

    // Node Apply: Translate
    const btnNodeTranslate = document.getElementById('btn-apply-node-translate');
    if (btnNodeTranslate) {
      btnNodeTranslate.addEventListener('click', () => {
        const selectedNodes = Array.from(window.FrameCanvas.selectedNodeIds || []);
        if (selectedNodes.length === 0) {
          showToast('Please select at least one node in the viewport.', 'error');
          return;
        }

        const dx = parseFloat(document.getElementById('param-node-tx').value) || 0.0;
        const dy = parseFloat(document.getElementById('param-node-ty').value) || 0.0;
        const dz = parseFloat(document.getElementById('param-node-tz').value) || 0.0;
        const copies = parseInt(document.getElementById('param-node-tcopies').value) || 1;
        const mode = document.getElementById('param-node-tmode').value; // 'copy' or 'move'

        if (dx === 0 && dy === 0 && dz === 0) {
          showToast('Translation vector cannot be zero.', 'error');
          return;
        }

        if (mode === 'move') {
          selectedNodes.forEach(nodeId => {
            const n = window.FrameModel.nodes[nodeId];
            if (n) {
              n.x += dx;
              n.y += dy;
              n.z += dz;
            }
          });
          window.FrameModel.results = null;
          showToast(`Successfully moved ${selectedNodes.length} node(s).`);
        } else {
          // Copy Mode
          let createdCount = 0;
          let skippedCount = 0;
          selectedNodes.forEach(nodeId => {
            const baseNode = window.FrameModel.nodes[nodeId];
            if (!baseNode) return;
            for (let c = 1; c <= copies; c++) {
              const tx = baseNode.x + c * dx;
              const ty = baseNode.y + c * dy;
              const tz = baseNode.z + c * dz;
              const duplicateId = findExistingNodeAt(tx, ty, tz);
              if (duplicateId) {
                skippedCount++;
              } else {
                let k = 1;
                while (window.FrameModel.nodes[`N${k}`]) k++;
                window.FrameModel.addNode(`N${k}`, tx, ty, tz);
                createdCount++;
              }
            }
          });
          showToast(`Successfully copied. Spawned ${createdCount} node(s).` + (skippedCount > 0 ? ` (Skipped ${skippedCount} duplicates)` : ''));
        }
        window.initFrameAnalysisView();
      });
    }

    // Node Apply: Rotate
    const btnNodeRotate = document.getElementById('btn-apply-node-rotate');
    if (btnNodeRotate) {
      btnNodeRotate.addEventListener('click', () => {
        const selectedNodes = Array.from(window.FrameCanvas.selectedNodeIds || []);
        if (selectedNodes.length === 0) {
          showToast('Please select at least one node in the viewport.', 'error');
          return;
        }

        const axis = document.getElementById('param-node-raxis').value;
        const angleDeg = parseFloat(document.getElementById('param-node-rangle').value) || 0.0;
        const copies = parseInt(document.getElementById('param-node-rcopies').value) || 1;
        const mode = document.getElementById('param-node-rmode').value; // 'copy' or 'move'
        const cx = parseFloat(document.getElementById('param-node-rcx').value) || 0.0;
        const cy = parseFloat(document.getElementById('param-node-rcy').value) || 0.0;
        const cz = parseFloat(document.getElementById('param-node-rcz').value) || 0.0;

        if (angleDeg === 0) {
          showToast('Rotation angle cannot be zero.', 'error');
          return;
        }

        const rad = angleDeg * Math.PI / 180.0;

        if (mode === 'move') {
          selectedNodes.forEach(nodeId => {
            const n = window.FrameModel.nodes[nodeId];
            if (!n) return;
            const dx = n.x - cx;
            const dy = n.y - cy;
            const dz = n.z - cz;
            let rx, ry, rz;
            if (axis === 'Z') {
              rx = dx * Math.cos(rad) - dy * Math.sin(rad);
              ry = dx * Math.sin(rad) + dy * Math.cos(rad);
              rz = dz;
            } else if (axis === 'X') {
              rx = dx;
              ry = dy * Math.cos(rad) - dz * Math.sin(rad);
              rz = dy * Math.sin(rad) + dz * Math.cos(rad);
            } else {
              rz = dz * Math.cos(rad) - dx * Math.sin(rad);
              rx = dz * Math.sin(rad) + dx * Math.cos(rad);
              ry = dy;
            }
            n.x = rx + cx;
            n.y = ry + cy;
            n.z = rz + cz;
          });
          window.FrameModel.results = null;
          showToast(`Successfully rotated ${selectedNodes.length} node(s).`);
        } else {
          // Copy Mode
          let createdCount = 0;
          let skippedCount = 0;
          selectedNodes.forEach(nodeId => {
            const n = window.FrameModel.nodes[nodeId];
            if (!n) return;
            for (let c = 1; c <= copies; c++) {
              const theta = c * rad;
              const dx = n.x - cx;
              const dy = n.y - cy;
              const dz = n.z - cz;
              let rx, ry, rz;
              if (axis === 'Z') {
                rx = dx * Math.cos(theta) - dy * Math.sin(theta);
                ry = dx * Math.sin(theta) + dy * Math.cos(theta);
                rz = dz;
              } else if (axis === 'X') {
                rx = dx;
                ry = dy * Math.cos(theta) - dz * Math.sin(theta);
                rz = dy * Math.sin(theta) + dz * Math.cos(theta);
              } else {
                rz = dz * Math.cos(theta) - dx * Math.sin(theta);
                rx = dz * Math.sin(theta) + dx * Math.cos(theta);
                ry = dy;
              }
              const tx = rx + cx;
              const ty = ry + cy;
              const tz = rz + cz;
              const duplicateId = findExistingNodeAt(tx, ty, tz);
              if (duplicateId) {
                skippedCount++;
              } else {
                let k = 1;
                while (window.FrameModel.nodes[`N${k}`]) k++;
                window.FrameModel.addNode(`N${k}`, tx, ty, tz);
                createdCount++;
              }
            }
          });
          showToast(`Successfully rotated and copied. Spawned ${createdCount} node(s).` + (skippedCount > 0 ? ` (Skipped ${skippedCount} duplicates)` : ''));
        }
        window.initFrameAnalysisView();
      });
    }

    // Node Apply: Mirror
    const btnNodeMirror = document.getElementById('btn-apply-node-mirror');
    if (btnNodeMirror) {
      btnNodeMirror.addEventListener('click', () => {
        const selectedNodes = Array.from(window.FrameCanvas.selectedNodeIds || []);
        if (selectedNodes.length === 0) {
          showToast('Please select at least one node in the viewport.', 'error');
          return;
        }

        const plane = document.getElementById('param-node-mplane').value;
        const mcoord = parseFloat(document.getElementById('param-node-mcoord').value) || 0.0;
        const mode = document.getElementById('param-node-mmode').value; // 'copy' or 'move'

        if (mode === 'move') {
          selectedNodes.forEach(nodeId => {
            const n = window.FrameModel.nodes[nodeId];
            if (!n) return;
            if (plane === 'YZ') n.x = 2 * mcoord - n.x;
            else if (plane === 'XZ') n.y = 2 * mcoord - n.y;
            else if (plane === 'XY') n.z = 2 * mcoord - n.z;
          });
          window.FrameModel.results = null;
          showToast(`Successfully mirrored ${selectedNodes.length} node(s).`);
        } else {
          // Copy Mode
          let createdCount = 0;
          let skippedCount = 0;
          selectedNodes.forEach(nodeId => {
            const n = window.FrameModel.nodes[nodeId];
            if (!n) return;
            let tx = n.x, ty = n.y, tz = n.z;
            if (plane === 'YZ') tx = 2 * mcoord - n.x;
            else if (plane === 'XZ') ty = 2 * mcoord - n.y;
            else if (plane === 'XY') tz = 2 * mcoord - n.z;
            const duplicateId = findExistingNodeAt(tx, ty, tz);
            if (duplicateId) {
              skippedCount++;
            } else {
              let k = 1;
              while (window.FrameModel.nodes[`N${k}`]) k++;
              window.FrameModel.addNode(`N${k}`, tx, ty, tz);
              createdCount++;
            }
          });
          showToast(`Successfully mirrored and copied. Spawned ${createdCount} node(s).` + (skippedCount > 0 ? ` (Skipped ${skippedCount} duplicates)` : ''));
        }
        window.initFrameAnalysisView();
      });
    }

    // Node Apply: Merge
    const btnNodeMerge = document.getElementById('btn-apply-node-merge');
    if (btnNodeMerge) {
      btnNodeMerge.addEventListener('click', () => {
        const tolerance = parseFloat(document.getElementById('param-node-mergetol').value) || 0.001;
        const target = document.getElementById('param-node-mergetarget').value; // 'selected' or 'all'

        let nodeIds = [];
        if (target === 'selected') {
          nodeIds = Array.from(window.FrameCanvas.selectedNodeIds || []);
          if (nodeIds.length === 0) {
            showToast('Please select at least one node to merge.', 'error');
            return;
          }
        } else {
          nodeIds = Object.keys(window.FrameModel.nodes);
        }

        if (nodeIds.length < 2) {
          showToast('At least 2 nodes are required to perform a merge operation.', 'error');
          return;
        }

        // Identify overlapping groups
        let mergedCount = 0;
        const processed = new Set();

        for (let i = 0; i < nodeIds.length; i++) {
          const idA = nodeIds[i];
          if (processed.has(idA)) continue;

          const nodeA = window.FrameModel.nodes[idA];
          if (!nodeA) continue;

          for (let j = i + 1; j < nodeIds.length; j++) {
            const idB = nodeIds[j];
            if (processed.has(idB)) continue;

            const nodeB = window.FrameModel.nodes[idB];
            if (!nodeB) continue;

            const dist = Math.sqrt((nodeA.x - nodeB.x)**2 + (nodeA.y - nodeB.y)**2 + (nodeA.z - nodeB.z)**2);
            if (dist <= tolerance) {
              // Merge nodeB into nodeA
              processed.add(idB);
              
              // Update members connectivity pointing to idB
              for (const mId in window.FrameModel.members) {
                const mem = window.FrameModel.members[mId];
                if (mem.startNode === idB) mem.startNode = idA;
                if (mem.endNode === idB) mem.endNode = idA;
              }

              // Update nodal loads pointing to idB
              window.FrameModel.loads.forEach(load => {
                if (load.type === 'NodalLoad' && load.nodeId === idB) {
                  load.nodeId = idA;
                }
              });

              // Update supports pointing to idB
              if (window.FrameModel.supports[idB]) {
                if (!window.FrameModel.supports[idA]) {
                  window.FrameModel.addSupport(idA, window.FrameModel.supports[idB].restraints);
                }
                delete window.FrameModel.supports[idB];
              }

              // Delete merged node
              delete window.FrameModel.nodes[idB];
              mergedCount++;
            }
          }
        }

        if (mergedCount > 0) {
          window.FrameModel.results = null;
          showToast(`Successfully merged duplicate nodes. Removed ${mergedCount} overlapping node(s).`);
          if (window.FrameCanvas.selectedNodeIds) {
            window.FrameCanvas.selectNode(null, false);
          }
          window.initFrameAnalysisView();
        } else {
          showToast('No nodes found within the specified merge tolerance distance.', 'error');
        }
      });
    }

    // Node Apply: Renumber
    const btnNodeRenumber = document.getElementById('btn-apply-node-renumber');
    if (btnNodeRenumber) {
      btnNodeRenumber.addEventListener('click', () => {
        const startIndex = parseInt(document.getElementById('param-node-renumstart').value) || 1;
        const axis = document.getElementById('param-node-renumsort').value; // 'X', 'Y', or 'Z'

        const nodeList = Object.values(window.FrameModel.nodes);
        if (nodeList.length === 0) {
          showToast('No nodes exist in the model to renumber.', 'error');
          return;
        }

        // Sort based on coordinates along sorting axis
        nodeList.sort((a, b) => {
          if (axis === 'X') return a.x - b.x;
          if (axis === 'Y') return a.y - b.y;
          return a.z - b.z;
        });

        // Generate mapping from old ID to new ID
        const mapping = {};
        nodeList.forEach((n, idx) => {
          mapping[n.id] = `N${startIndex + idx}`;
        });

        // Recreate nodes dictionary
        const newNodes = {};
        nodeList.forEach(n => {
          const newId = mapping[n.id];
          newNodes[newId] = { id: newId, x: n.x, y: n.y, z: n.z };
        });
        window.FrameModel.nodes = newNodes;

        // Reconnect member definitions
        for (const mId in window.FrameModel.members) {
          const mem = window.FrameModel.members[mId];
          if (mapping[mem.startNode]) mem.startNode = mapping[mem.startNode];
          if (mapping[mem.endNode]) mem.endNode = mapping[mem.endNode];
        }

        // Reconnect supports
        const newSupports = {};
        for (const nodeId in window.FrameModel.supports) {
          if (mapping[nodeId]) {
            const newId = mapping[nodeId];
            newSupports[newId] = { nodeId: newId, restraints: window.FrameModel.supports[nodeId].restraints };
          }
        }
        window.FrameModel.supports = newSupports;

        // Reconnect loads
        window.FrameModel.loads.forEach(load => {
          if (load.type === 'NodalLoad' && mapping[load.nodeId]) {
            load.nodeId = mapping[load.nodeId];
          }
        });

        window.FrameModel.results = null;
        showToast('Successfully renumbered all model nodes sequentially.');
        if (window.FrameCanvas.selectedNodeIds) {
          window.FrameCanvas.selectNode(null, false);
        }
        window.initFrameAnalysisView();
      });
    }

    // Node Apply: Delete
    const btnNodeDelete = document.getElementById('btn-apply-node-delete');
    if (btnNodeDelete) {
      btnNodeDelete.addEventListener('click', () => {
        const selectedNodes = Array.from(window.FrameCanvas.selectedNodeIds || []);
        if (selectedNodes.length === 0) {
          showToast('Please select at least one node to delete.', 'error');
          return;
        }

        const confirmCheck = document.getElementById('param-node-delconfirm');
        if (!confirmCheck || !confirmCheck.checked) {
          showToast('Please check the confirmation box to delete selected nodes.', 'error');
          return;
        }

        selectedNodes.forEach(nodeId => {
          window.FrameModel.deleteNode(nodeId);
        });

        if (confirmCheck) confirmCheck.checked = false;
        if (window.FrameCanvas.selectedNodeIds) {
          window.FrameCanvas.selectNode(null, false);
        }

        showToast(`Successfully deleted ${selectedNodes.length} node(s) and any connected beams.`);
        window.initFrameAnalysisView();
      });
    }


    // --- BEAM OPERATIONS APPLY ACTION LISTENERS ---

    // Beam Apply: Split
    const btnBeamSplit = document.getElementById('btn-apply-beam-split');
    if (btnBeamSplit) {
      btnBeamSplit.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length !== 1) {
          showToast('Please select exactly one beam in the viewport to split.', 'error');
          return;
        }

        const beamId = selectedBeams[0];
        const member = window.FrameModel.members[beamId];
        if (!member) return;

        const node1 = window.FrameModel.nodes[member.startNode];
        const node2 = window.FrameModel.nodes[member.endNode];
        if (!node1 || !node2) return;

        const method = document.getElementById('param-beam-splitmethod').value;
        const splitVal = parseFloat(document.getElementById('param-beam-splitval').value) || 0.5;

        const length = Math.sqrt((node2.x - node1.x)**2 + (node2.y - node1.y)**2 + (node2.z - node1.z)**2);
        let f = 0.5;

        if (method === 'ratio') {
          if (splitVal <= 0.0 || splitVal >= 1.0) {
            showToast('Ratio must be between 0.0 and 1.0 (exclusive).', 'error');
            return;
          }
          f = splitVal;
        } else if (method === 'distance') {
          if (splitVal <= 0.0 || splitVal >= length) {
            showToast(`Distance must be greater than 0 and less than beam length (${length.toFixed(3)} m).`, 'error');
            return;
          }
          f = splitVal / length;
        }

        const xs = node1.x + f * (node2.x - node1.x);
        const ys = node1.y + f * (node2.y - node1.y);
        const zs = node1.z + f * (node2.z - node1.z);

        let newNodeId = findExistingNodeAt(xs, ys, zs);
        if (!newNodeId) {
          let k = 1;
          while (window.FrameModel.nodes[`N${k}`]) k++;
          newNodeId = `N${k}`;
          window.FrameModel.addNode(newNodeId, xs, ys, zs);
        }

        // Generate split segments IDs
        let k1 = 1;
        while (window.FrameModel.members[`B${k1}`]) k1++;
        const newBeamId1 = `B${k1}`;

        let k2 = k1 + 1;
        while (window.FrameModel.members[`B${k2}`]) k2++;
        const newBeamId2 = `B${k2}`;

        const origReleases = member.releases || {
          Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false, Rzi: false,
          Dxj: false, Dyj: false, Dzj: false, Rxj: false, Ryj: false, Rzj: false
        };

        const releases1 = {
          Dxi: origReleases.Dxi || false, Dyi: origReleases.Dyi || false, Dzi: origReleases.Dzi || false,
          Rxi: origReleases.Rxi || false, Ryi: origReleases.Ryi || false, Rzi: origReleases.Rzi || false,
          Dxj: false, Dyj: false, Dzj: false, Rxj: false, Ryj: false, Rzj: false
        };

        const releases2 = {
          Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false, Rzi: false,
          Dxj: origReleases.Dxj || false, Dyj: origReleases.Dyj || false, Dzj: origReleases.Dzj || false,
          Rxj: origReleases.Rxj || false, Ryj: origReleases.Ryj || false, Rzj: origReleases.Rzj || false
        };

        window.FrameModel.addMember(newBeamId1, member.startNode, newNodeId, member.sectionName, member.materialName, member.beta || 0.0, releases1);
        window.FrameModel.addMember(newBeamId2, newNodeId, member.endNode, member.sectionName, member.materialName, member.beta || 0.0, releases2);
        window.FrameModel.deleteMember(beamId);

        if (window.FrameCanvas.selectedMemberIds) {
          window.FrameCanvas.selectMember(null, false);
        }

        showToast(`Beam ${beamId} successfully split into ${newBeamId1} and ${newBeamId2}.`);
        window.initFrameAnalysisView();
      });
    }

    // Beam Apply: Merge
    const btnBeamMerge = document.getElementById('btn-apply-beam-merge');
    if (btnBeamMerge) {
      btnBeamMerge.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length !== 2) {
          showToast('Please select exactly two adjacent beams to merge.', 'error');
          return;
        }

        const beam1 = window.FrameModel.members[selectedBeams[0]];
        const beam2 = window.FrameModel.members[selectedBeams[1]];
        if (!beam1 || !beam2) return;

        // Find common node
        let commonNode = null;
        let extNode1 = null;
        let extNode2 = null;

        if (beam1.startNode === beam2.startNode) {
          commonNode = beam1.startNode;
          extNode1 = beam1.endNode;
          extNode2 = beam2.endNode;
        } else if (beam1.startNode === beam2.endNode) {
          commonNode = beam1.startNode;
          extNode1 = beam1.endNode;
          extNode2 = beam2.startNode;
        } else if (beam1.endNode === beam2.startNode) {
          commonNode = beam1.endNode;
          extNode1 = beam1.startNode;
          extNode2 = beam2.endNode;
        } else if (beam1.endNode === beam2.endNode) {
          commonNode = beam1.endNode;
          extNode1 = beam1.startNode;
          extNode2 = beam2.startNode;
        }

        if (!commonNode) {
          showToast('The two selected beams must share a common node to be merged.', 'error');
          return;
        }

        const nc = window.FrameModel.nodes[commonNode];
        const n1 = window.FrameModel.nodes[extNode1];
        const n2 = window.FrameModel.nodes[extNode2];

        // Verify collinearity
        const dx1 = nc.x - n1.x, dy1 = nc.y - n1.y, dz1 = nc.z - n1.z;
        const dx2 = n2.x - nc.x, dy2 = n2.y - nc.y, dz2 = n2.z - nc.z;

        const len1 = Math.sqrt(dx1**2 + dy1**2 + dz1**2);
        const len2 = Math.sqrt(dx2**2 + dy2**2 + dz2**2);

        const dot = (dx1*dx2 + dy1*dy2 + dz1*dz2) / (len1 * len2);
        if (Math.abs(dot) < 0.99) {
          showToast('The selected beams are not collinear.', 'error');
          return;
        }

        // Construct releases
        const mergedReleases = {
          Dxi: beam1.releases.Dxi || beam2.releases.Dxi || false,
          Dyi: beam1.releases.Dyi || beam2.releases.Dyi || false,
          Dzi: beam1.releases.Dzi || beam2.releases.Dzi || false,
          Rxi: beam1.releases.Rxi || beam2.releases.Rxi || false,
          Ryi: beam1.releases.Ryi || beam2.releases.Ryi || false,
          Rzi: beam1.releases.Rzi || beam2.releases.Rzi || false,
          Dxj: beam1.releases.Dxj || beam2.releases.Dxj || false,
          Dyj: beam1.releases.Dyj || beam2.releases.Dyj || false,
          Dzj: beam1.releases.Dzj || beam2.releases.Dzj || false,
          Rxj: beam1.releases.Rxj || beam2.releases.Rxj || false,
          Ryj: beam1.releases.Ryj || beam2.releases.Ryj || false,
          Rzj: beam1.releases.Rzj || beam2.releases.Rzj || false
        };

        // Create new merged beam
        let k = 1;
        while (window.FrameModel.members[`B${k}`]) k++;
        const newBeamId = `B${k}`;

        window.FrameModel.addMember(newBeamId, extNode1, extNode2, beam1.sectionName, beam1.materialName, beam1.beta || 0.0, mergedReleases);

        // Delete old beams
        window.FrameModel.deleteMember(beam1.id);
        window.FrameModel.deleteMember(beam2.id);

        // Check if commonNode has any other connections, if not delete it
        let hasOtherConnections = false;
        for (const mId in window.FrameModel.members) {
          const m = window.FrameModel.members[mId];
          if (m.startNode === commonNode || m.endNode === commonNode) {
            hasOtherConnections = true;
            break;
          }
        }
        if (!hasOtherConnections) {
          window.FrameModel.deleteNode(commonNode);
        }

        if (window.FrameCanvas.selectedMemberIds) {
          window.FrameCanvas.selectMember(null, false);
        }

        showToast(`Beams successfully merged into new element ${newBeamId}.`);
        window.initFrameAnalysisView();
      });
    }

    // Beam Apply: Extend
    const btnBeamExtend = document.getElementById('btn-apply-beam-extend');
    if (btnBeamExtend) {
      btnBeamExtend.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length !== 1) {
          showToast('Please select exactly one beam to extend.', 'error');
          return;
        }

        const extLen = parseFloat(document.getElementById('param-beam-extlen').value) || 1.0;
        const targetNodeEnd = document.getElementById('param-beam-extnode').value; // 'start' or 'end'

        const beam = window.FrameModel.members[selectedBeams[0]];
        if (!beam) return;

        const n1 = window.FrameModel.nodes[beam.startNode];
        const n2 = window.FrameModel.nodes[beam.endNode];
        if (!n1 || !n2) return;

        const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
        const length = Math.sqrt(dx**2 + dy**2 + dz**2);
        const ux = dx / length, uy = dy / length, uz = dz / length;

        if (targetNodeEnd === 'end') {
          n2.x += extLen * ux;
          n2.y += extLen * uy;
          n2.z += extLen * uz;
        } else {
          n1.x -= extLen * ux;
          n1.y -= extLen * uy;
          n1.z -= extLen * uz;
        }

        window.FrameModel.results = null;
        showToast(`Successfully extended beam ${beam.id}.`);
        window.initFrameAnalysisView();
      });
    }

    // Beam Apply: Trim
    const btnBeamTrim = document.getElementById('btn-apply-beam-trim');
    if (btnBeamTrim) {
      btnBeamTrim.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length !== 1) {
          showToast('Please select exactly one beam to trim.', 'error');
          return;
        }

        const trimLen = parseFloat(document.getElementById('param-beam-trimlen').value) || 1.0;
        const targetNodeEnd = document.getElementById('param-beam-trimnode').value; // 'start' or 'end'

        const beam = window.FrameModel.members[selectedBeams[0]];
        if (!beam) return;

        const n1 = window.FrameModel.nodes[beam.startNode];
        const n2 = window.FrameModel.nodes[beam.endNode];
        if (!n1 || !n2) return;

        const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
        const length = Math.sqrt(dx**2 + dy**2 + dz**2);

        if (trimLen >= length) {
          showToast(`Trim length cannot be greater than or equal to beam length (${length.toFixed(3)} m).`, 'error');
          return;
        }

        const ux = dx / length, uy = dy / length, uz = dz / length;

        if (targetNodeEnd === 'end') {
          n2.x -= trimLen * ux;
          n2.y -= trimLen * uy;
          n2.z -= trimLen * uz;
        } else {
          n1.x += trimLen * ux;
          n1.y += trimLen * uy;
          n1.z += trimLen * uz;
        }

        window.FrameModel.results = null;
        showToast(`Successfully trimmed beam ${beam.id}.`);
        window.initFrameAnalysisView();
      });
    }

    // Beam Apply: Reverse Orientation
    const btnBeamReverse = document.getElementById('btn-apply-beam-reverse');
    if (btnBeamReverse) {
      btnBeamReverse.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length === 0) {
          showToast('Please select at least one beam to reverse.', 'error');
          return;
        }

        selectedBeams.forEach(beamId => {
          const mem = window.FrameModel.members[beamId];
          if (!mem) return;

          // Swap connectivity
          const tmp = mem.startNode;
          mem.startNode = mem.endNode;
          mem.endNode = tmp;

          // Swap end releases
          const orig = mem.releases || {
            Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false, Rzi: false,
            Dxj: false, Dyj: false, Dzj: false, Rxj: false, Ryj: false, Rzj: false
          };

          mem.releases = {
            Dxi: orig.Dxj || false, Dyi: orig.Dyj || false, Dzi: orig.Dzj || false,
            Rxi: orig.Rxj || false, Ryi: orig.Ryj || false, Rzi: orig.Rzj || false,
            Dxj: orig.Dxi || false, Dyj: orig.Dyi || false, Dzj: orig.Dzi || false,
            Rxj: orig.Rxi || false, Ryj: orig.Ryi || false, Rzj: orig.Rzi || false
          };
        });

        window.FrameModel.results = null;
        showToast(`Reversed orientation for ${selectedBeams.length} beam(s).`);
        window.initFrameAnalysisView();
      });
    }

    // Beam Apply: Mirror
    const btnBeamMirror = document.getElementById('btn-apply-beam-mirror');
    if (btnBeamMirror) {
      btnBeamMirror.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length === 0) {
          showToast('Please select at least one beam to mirror.', 'error');
          return;
        }

        const plane = document.getElementById('param-beam-mplane').value;
        const mcoord = parseFloat(document.getElementById('param-beam-mcoord').value) || 0.0;
        const mode = document.getElementById('param-beam-mmode').value; // 'copy' or 'move'

        if (mode === 'move') {
          // Mirroring nodes connected to selected beams
          const nodesToMirror = new Set();
          selectedBeams.forEach(beamId => {
            const m = window.FrameModel.members[beamId];
            if (m) {
              nodesToMirror.add(m.startNode);
              nodesToMirror.add(m.endNode);
            }
          });

          nodesToMirror.forEach(nodeId => {
            const n = window.FrameModel.nodes[nodeId];
            if (!n) return;
            if (plane === 'YZ') n.x = 2 * mcoord - n.x;
            else if (plane === 'XZ') n.y = 2 * mcoord - n.y;
            else if (plane === 'XY') n.z = 2 * mcoord - n.z;
          });
          window.FrameModel.results = null;
          showToast(`Successfully mirrored ${selectedBeams.length} beam(s) by moving coordinates.`);
        } else {
          // Copy Mode: Mirror nodes (checking duplicates) and create mirrored members
          let createdCount = 0;
          selectedBeams.forEach(beamId => {
            const m = window.FrameModel.members[beamId];
            if (!m) return;

            const n1 = window.FrameModel.nodes[m.startNode];
            const n2 = window.FrameModel.nodes[m.endNode];
            if (!n1 || !n2) return;

            let tx1 = n1.x, ty1 = n1.y, tz1 = n1.z;
            let tx2 = n2.x, ty2 = n2.y, tz2 = n2.z;

            if (plane === 'YZ') { tx1 = 2 * mcoord - n1.x; tx2 = 2 * mcoord - n2.x; }
            else if (plane === 'XZ') { ty1 = 2 * mcoord - n1.y; ty2 = 2 * mcoord - n2.y; }
            else if (plane === 'XY') { tz1 = 2 * mcoord - n1.z; tz2 = 2 * mcoord - n2.z; }

            let mirNodeId1 = findExistingNodeAt(tx1, ty1, tz1);
            if (!mirNodeId1) {
              let k = 1;
              while (window.FrameModel.nodes[`N${k}`]) k++;
              mirNodeId1 = `N${k}`;
              window.FrameModel.addNode(mirNodeId1, tx1, ty1, tz1);
            }

            let mirNodeId2 = findExistingNodeAt(tx2, ty2, tz2);
            if (!mirNodeId2) {
              let k = 1;
              while (window.FrameModel.nodes[`N${k}`]) k++;
              mirNodeId2 = `N${k}`;
              window.FrameModel.addNode(mirNodeId2, tx2, ty2, tz2);
            }

            let k = 1;
            while (window.FrameModel.members[`B${k}`]) k++;
            const newBeamId = `B${k}`;

            window.FrameModel.addMember(newBeamId, mirNodeId1, mirNodeId2, m.sectionName, m.materialName, m.beta || 0.0, m.releases);
            createdCount++;
          });
          showToast(`Successfully mirrored and copied. Spawned ${createdCount} new beam(s).`);
        }
        window.initFrameAnalysisView();
      });
    }

    // Beam Apply: Delete
    const btnBeamDelete = document.getElementById('btn-apply-beam-delete');
    if (btnBeamDelete) {
      btnBeamDelete.addEventListener('click', () => {
        const selectedBeams = Array.from(window.FrameCanvas.selectedMemberIds || []);
        if (selectedBeams.length === 0) {
          showToast('Please select at least one beam to delete.', 'error');
          return;
        }

        const confirmCheck = document.getElementById('param-beam-delconfirm');
        if (!confirmCheck || !confirmCheck.checked) {
          showToast('Please check the confirmation box to delete selected beams.', 'error');
          return;
        }

        selectedBeams.forEach(beamId => {
          window.FrameModel.deleteMember(beamId);
        });

        if (confirmCheck) confirmCheck.checked = false;
        if (window.FrameCanvas.selectedMemberIds) {
          window.FrameCanvas.selectMember(null, false);
        }

        showToast(`Successfully deleted ${selectedBeams.length} beam(s).`);
        window.initFrameAnalysisView();
      });
    }

    // Operations Reset Handlers
    const registerResetHandler = (btnId, resetFn) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          resetFn();
          showToast('Parameters reset to default.');
        });
      }
    };

    registerResetHandler('btn-reset-node-translate', () => {
      const tx = document.getElementById('param-node-tx');
      const ty = document.getElementById('param-node-ty');
      const tz = document.getElementById('param-node-tz');
      const copies = document.getElementById('param-node-tcopies');
      const mode = document.getElementById('param-node-tmode');
      if (tx) tx.value = '1.0';
      if (ty) ty.value = '0.0';
      if (tz) tz.value = '0.0';
      if (copies) {
        copies.value = '1';
        copies.disabled = false;
      }
      if (mode) mode.value = 'copy';
    });

    registerResetHandler('btn-reset-node-rotate', () => {
      const axis = document.getElementById('param-node-raxis');
      const angle = document.getElementById('param-node-rangle');
      const cx = document.getElementById('param-node-rcx');
      const cy = document.getElementById('param-node-rcy');
      const cz = document.getElementById('param-node-rcz');
      const copies = document.getElementById('param-node-rcopies');
      const mode = document.getElementById('param-node-rmode');
      if (axis) axis.value = 'Z';
      if (angle) angle.value = '90';
      if (cx) cx.value = '0.0';
      if (cy) cy.value = '0.0';
      if (cz) cz.value = '0.0';
      if (copies) {
        copies.value = '1';
        copies.disabled = false;
      }
      if (mode) mode.value = 'copy';
    });

    registerResetHandler('btn-reset-node-mirror', () => {
      const plane = document.getElementById('param-node-mplane');
      const coord = document.getElementById('param-node-mcoord');
      const mode = document.getElementById('param-node-mmode');
      if (plane) plane.value = 'YZ';
      if (coord) coord.value = '0.0';
      if (mode) mode.value = 'copy';
    });

    registerResetHandler('btn-reset-node-merge', () => {
      const tol = document.getElementById('param-node-mergetol');
      const target = document.getElementById('param-node-mergetarget');
      if (tol) tol.value = '0.001';
      if (target) target.value = 'selected';
    });

    registerResetHandler('btn-reset-node-renumber', () => {
      const start = document.getElementById('param-node-renumstart');
      const sort = document.getElementById('param-node-renumsort');
      if (start) start.value = '1';
      if (sort) sort.value = 'X';
    });

    registerResetHandler('btn-reset-node-delete', () => {
      const check = document.getElementById('param-node-delconfirm');
      if (check) check.checked = false;
    });

    registerResetHandler('btn-reset-beam-split', () => {
      const method = document.getElementById('param-beam-splitmethod');
      const val = document.getElementById('param-beam-splitval');
      const valGroup = document.getElementById('param-beam-splitval-group');
      if (method) method.value = 'half';
      if (val) val.value = '0.5';
      if (valGroup) valGroup.style.display = 'none';
    });

    registerResetHandler('btn-reset-beam-merge', () => {
      // No input controls
    });

    registerResetHandler('btn-reset-beam-extend', () => {
      const len = document.getElementById('param-beam-extlen');
      const node = document.getElementById('param-beam-extnode');
      if (len) len.value = '1.0';
      if (node) node.value = 'end';
    });

    registerResetHandler('btn-reset-beam-trim', () => {
      const len = document.getElementById('param-beam-trimlen');
      const node = document.getElementById('param-beam-trimnode');
      if (len) len.value = '1.0';
      if (node) node.value = 'end';
    });

    registerResetHandler('btn-reset-beam-reverse', () => {
      // No input controls
    });

    registerResetHandler('btn-reset-beam-mirror', () => {
      const plane = document.getElementById('param-beam-mplane');
      const coord = document.getElementById('param-beam-mcoord');
      const mode = document.getElementById('param-beam-mmode');
      if (plane) plane.value = 'YZ';
      if (coord) coord.value = '0.0';
      if (mode) mode.value = 'copy';
    });

    registerResetHandler('btn-reset-beam-delete', () => {
      const check = document.getElementById('param-beam-delconfirm');
      if (check) check.checked = false;
    });
  }

  window.showToast = showToast;
  window.updateMatSecTabUI = updateMatSecTabUI;

  // Expose bindings for tests or init
  window.bindOperationsEvents = bindOperationsEvents;

})();
