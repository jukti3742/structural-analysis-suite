/**
 * Apex Structural Analysis Suite - 3D Frame UI Controller
 */
(function() {
  
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
    // Tab switching for inputs panel
    document.querySelectorAll('.frame-tabs .btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.frame-tabs .btn').forEach(b => b.classList.remove('active-tab-btn'));
        btn.classList.add('active-tab-btn');
        
        document.querySelectorAll('.frame-tab-content').forEach(p => p.style.display = 'none');
        const tabName = btn.id.replace('btn-tab-', '');
        document.getElementById(`panel-tab-${tabName}`).style.display = 'block';
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

    // Active Model Lists Subtab switching
    document.querySelectorAll('.btn-subtab').forEach(subtab => {
      subtab.addEventListener('click', () => {
        document.querySelectorAll('.btn-subtab').forEach(s => {
          s.classList.remove('active');
        });
        subtab.classList.add('active');

        document.querySelectorAll('.list-tab-content').forEach(c => c.style.display = 'none');
        const listName = subtab.id.replace('subtab-', '');
        document.getElementById(`list-container-${listName}`).style.display = 'block';
      });
    });

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
      const id = document.getElementById('node-input-id').value.trim();
      const x = parseFloat(document.getElementById('node-input-x').value);
      const y = parseFloat(document.getElementById('node-input-y').value);
      const z = parseFloat(document.getElementById('node-input-z').value);

      if (!id) {
        showToast('Please specify a unique Node ID.');
        return;
      }

      window.FrameModel.addNode(id, x, y, z);
      showToast(`Node ${id} added successfully.`);
      
      refreshAllDropdowns();
      updateTablesDisplay();
      window.FrameCanvas.render();
      
      // Reset input id
      document.getElementById('node-input-id').value = '';
    });

    // Add Member
    document.getElementById('btn-add-member').addEventListener('click', () => {
      const id = document.getElementById('member-input-id').value.trim();
      const start = document.getElementById('member-input-start').value;
      const end = document.getElementById('member-input-end').value;
      const section = document.getElementById('member-input-section').value;
      const beta = parseFloat(document.getElementById('member-input-beta').value);

      if (!id || !start || !end) {
        showToast('Please verify Member ID, Start Node, and End Node.');
        return;
      }
      if (start === end) {
        showToast('Start Node and End Node cannot be identical.');
        return;
      }

      const releases = {
        Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false,
        Rzi: document.getElementById('member-release-start-mz').checked,
        Dxj: false, Dyj: false, Dzj: false, Rxj: false, Ryj: false,
        Rzj: document.getElementById('member-release-end-mz').checked
      };

      window.FrameModel.addMember(id, start, end, section, beta, releases);
      showToast(`Member ${id} added successfully.`);
      
      refreshAllDropdowns();
      updateTablesDisplay();
      window.FrameCanvas.render();

      // Reset ID
      document.getElementById('member-input-id').value = '';
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
    const nodeOptions = nodes.map(n => `<option value="${n.id}">${n.id}</option>`).join('');
    document.getElementById('member-input-start').innerHTML = nodeOptions;
    document.getElementById('member-input-end').innerHTML = nodeOptions;
    document.getElementById('support-input-node').innerHTML = nodeOptions;
    document.getElementById('load-input-node').innerHTML = nodeOptions;

    // 2. Populate Member drop-downs
    const memberOptions = members.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
    document.getElementById('load-input-member').innerHTML = memberOptions;

    // 3. Populate Section Profiles drop-down from Registry
    const sectionSel = document.getElementById('member-input-section');
    let sectionOptions = `<option value="Default">Default (A=100cm², I=10000cm⁴)</option>`;
    
    // Add active section if calculated
    if (window.getActiveSectionProperties && window.getActiveSectionProperties()) {
      sectionOptions += `<option value="Active">Active Calculator Section</option>`;
    }

    for (const name in window.SectionRegistry) {
      sectionOptions += `<option value="${name}">${name}</option>`;
    }
    sectionSel.innerHTML = sectionOptions;
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
          <td>${n.id}</td>
          <td>${n.x.toFixed(2)}</td>
          <td>${n.y.toFixed(2)}</td>
          <td>${n.z.toFixed(2)}</td>
          <td>
            <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteNode('${n.id}'); window.initFrameAnalysisView();">Delete</button>
          </td>
        </tr>
      `).join('');
    }

    // 2. Members Table
    const tbodyMembers = document.querySelector('#table-members tbody');
    const members = window.FrameModel.getMemberList();
    if (members.length === 0) {
      tbodyMembers.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No members defined.</td></tr>`;
    } else {
      tbodyMembers.innerHTML = members.map(m => `
        <tr>
          <td>${m.id}</td>
          <td>${m.startNode}</td>
          <td>${m.endNode}</td>
          <td>${m.sectionName}</td>
          <td>
            <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteMember('${m.id}'); window.initFrameAnalysisView();">Delete</button>
          </td>
        </tr>
      `).join('');
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
    }

    // 4. Loads Table
    const tbodyLoads = document.querySelector('#table-loads tbody');
    const loads = window.FrameModel.loads;
    if (loads.length === 0) {
      tbodyLoads.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No loads placed.</td></tr>`;
    } else {
      tbodyLoads.innerHTML = loads.map((l, index) => {
        const target = l.type === 'NodalLoad' ? `Node ${l.nodeId}` : `Member ${l.memberId}`;
        const val = l.type === 'NodalLoad' ? (l.force / 1000.0).toFixed(1) + ' kN' : (l.force / 1000.0).toFixed(1) + ' kN/m';
        return `
          <tr>
            <td>${target}</td>
            <td>${l.type.replace('Member', '').replace('Load', '')}</td>
            <td>${l.direction}</td>
            <td>${val}</td>
            <td>
              <button class="btn btn-secondary delete-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="window.FrameModel.deleteLoad(${index}); window.initFrameAnalysisView();">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
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
    window.FrameModel.addMember('Col1', 'N1', 'N2', 'Default');
    window.FrameModel.addMember('Beam', 'N2', 'N3', 'Default');
    window.FrameModel.addMember('Col2', 'N4', 'N3', 'Default');

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

  function showToast(message) {
    const toast = document.getElementById('toast-notify');
    const toastMsg = document.getElementById('toast-message');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
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

})();
