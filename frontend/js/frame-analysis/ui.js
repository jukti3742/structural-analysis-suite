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
    document.querySelectorAll('.frame-tabs .btn-subtab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.frame-tabs .btn-subtab').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Swap inputs display
        document.querySelectorAll('.frame-tab-content').forEach(p => p.style.display = 'none');
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

    // Diagram selector change
    document.getElementById('diagram-layer-selector').addEventListener('change', () => window.FrameCanvas.render());
    document.getElementById('toggle-layer-loads').addEventListener('change', () => window.FrameCanvas.render());
    document.getElementById('toggle-layer-reactions').addEventListener('change', () => window.FrameCanvas.render());

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
    document.getElementById('btn-tab-res-displacements').addEventListener('click', () => {
      document.getElementById('btn-tab-res-displacements').classList.add('active');
      document.getElementById('btn-tab-res-displacements').style.color = 'var(--text-primary)';
      document.getElementById('btn-tab-res-reactions').classList.remove('active');
      document.getElementById('btn-tab-res-reactions').style.color = 'var(--text-secondary)';
      
      document.getElementById('panel-res-displacements').style.display = 'block';
      document.getElementById('panel-res-reactions').style.display = 'none';
    });

    document.getElementById('btn-tab-res-reactions').addEventListener('click', () => {
      document.getElementById('btn-tab-res-reactions').classList.add('active');
      document.getElementById('btn-tab-res-reactions').style.color = 'var(--text-primary)';
      document.getElementById('btn-tab-res-displacements').classList.remove('active');
      document.getElementById('btn-tab-res-displacements').style.color = 'var(--text-secondary)';
      
      document.getElementById('panel-res-reactions').style.display = 'block';
      document.getElementById('panel-res-displacements').style.display = 'none';
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

    // --- Solve Trigger ---
    document.getElementById('btn-solve-frame').addEventListener('click', async () => {
      const nodesCount = Object.keys(window.FrameModel.nodes).length;
      if (nodesCount === 0) {
        showToast('Please add nodes first.');
        return;
      }

      const solveBtn = document.getElementById('btn-solve-frame');
      solveBtn.setAttribute('disabled', 'true');
      solveBtn.textContent = 'Solving...';

      try {
        const results = await window.FrameAPI.solve();
        showToast('Analysis completed successfully!');
        
        // Populate results tables
        populateResultsTables(results);
        
        // Enable report
        document.getElementById('btn-open-frame-report').removeAttribute('disabled');
        
        // Re-render
        window.FrameCanvas.render();
      } catch (err) {
        showToast(`Error: ${err.message}`);
        console.error(err);
      } finally {
        solveBtn.removeAttribute('disabled');
        solveBtn.innerHTML = `
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="margin-right: 4px;"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round"/></svg>
          Solve Frame Analysis
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
            
            // Disable report button
            document.getElementById('btn-open-frame-report').setAttribute('disabled', 'true');
            
            // Clear results tables
            const tbodyDisp = document.querySelector('#table-res-displacements tbody');
            const tbodyReact = document.querySelector('#table-res-reactions tbody');
            if (tbodyDisp) {
              tbodyDisp.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No displacements resolved. Click "Solve Frame Analysis".</td></tr>`;
            }
            if (tbodyReact) {
              tbodyReact.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No support reactions resolved. Click "Solve Frame Analysis".</td></tr>`;
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
          if (window.FrameCanvas && window.FrameCanvas.selectedSupportId === rowNodeId) {
            row.classList.add('selected-row');
          }
        }

        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn')) return;
          const firstCell = row.querySelector('td');
          if (firstCell && window.FrameCanvas) {
            const nodeId = firstCell.innerText.trim();
            window.FrameCanvas.selectedSupportId = nodeId;
            window.FrameCanvas.render();
            rows.forEach(r => r.classList.remove('selected-row'));
            row.classList.add('selected-row');
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
        if (window.FrameCanvas && window.FrameCanvas.selectedLoadIndex === idx) {
          row.classList.add('selected-row');
        }

        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn')) return;
          if (window.FrameCanvas) {
            window.FrameCanvas.selectedLoadIndex = idx;
            window.FrameCanvas.render();
            rows.forEach(r => r.classList.remove('selected-row'));
            row.classList.add('selected-row');
          }
        });
      });
    }
  }

  function populateResultsTables(results) {
    // 1. Displacements
    const tbodyDisp = document.querySelector('#table-res-displacements tbody');
    if (results.displacements) {
      tbodyDisp.innerHTML = results.displacements.map(d => `
        <tr>
          <td><strong>${d.nodeId}</strong></td>
          <td>${(d.DX * 1000.0).toFixed(3)}</td>
          <td>${(d.DY * 1000.0).toFixed(3)}</td>
          <td>${(d.DZ * 1000.0).toFixed(3)}</td>
          <td>${d.RX.toFixed(5)}</td>
          <td>${d.RY.toFixed(5)}</td>
          <td>${d.RZ.toFixed(5)}</td>
        </tr>
      `).join('');
    }

    // 2. Reactions
    const tbodyReact = document.querySelector('#table-res-reactions tbody');
    if (results.reactions && results.reactions.length > 0) {
      tbodyReact.innerHTML = results.reactions.map(r => `
        <tr>
          <td><strong>${r.nodeId}</strong></td>
          <td>${(r.FX / 1000.0).toFixed(2)}</td>
          <td>${(r.FY / 1000.0).toFixed(2)}</td>
          <td>${(r.FZ / 1000.0).toFixed(2)}</td>
          <td>${(r.MX / 1000.0).toFixed(2)}</td>
          <td>${(r.MY / 1000.0).toFixed(2)}</td>
          <td>${(r.MZ / 1000.0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else {
      tbodyReact.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No support node reactions.</td></tr>`;
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
    window.FrameModel.addMember('Col1', 'N1', 'N2', 'IPE 200', 'Steel – E250');
    window.FrameModel.addMember('Beam', 'N2', 'N3', 'IPE 200', 'Steel – E250');
    window.FrameModel.addMember('Col2', 'N4', 'N3', 'IPE 200', 'Steel – E250');

    // Supports
    window.FrameModel.addSupport('N1', [True, True, True, True, False, False]); // Stabilized
    window.FrameModel.addSupport('N4', [True, True, True, False, False, False]); // Pinned

    // Loads
    window.FrameModel.addLoad({
      type: 'NodalLoad',
      nodeId: 'N2',
      direction: 'FX',
      force: 15000.0 // 15 kN lateral force
    });
    
    window.FrameModel.addLoad({
      type: 'MemberDistributedLoad',
      memberId: 'Beam',
      direction: 'Fy',
      w1: -8000.0, // -8 kN/m vertical UDL
      w2: -8000.0,
      x1: null,
      x2: null
    });
  }

  // Helper values for default supports setup
  const True = true, False = false;

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
    if (!results) return;

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
    
    updateMatSecTabUI();
  };

  window.selectSupportFromCanvas = function(nodeId) {
    const tableRows = document.querySelectorAll('#table-supports tbody tr');
    let targetRow = null;

    tableRows.forEach(row => {
      const firstCell = row.querySelector('td');
      if (firstCell) {
        const rowNodeId = firstCell.innerText.trim();
        if (rowNodeId === nodeId) {
          row.classList.add('selected-row');
          targetRow = row;
        } else {
          row.classList.remove('selected-row');
        }
      }
    });

    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      tableRows.forEach(row => row.classList.remove('selected-row'));
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

  window.showToast = showToast;
  window.updateMatSecTabUI = updateMatSecTabUI;

})();
