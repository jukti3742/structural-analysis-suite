/**
 * Apex Structural Analysis Suite - WebGL 3D Viewport Renderer (Three.js)
 */
(function() {
  let scene, camera, renderer, controls, container;
  let objectsGroup; // Group containing all structural objects (nodes, members, supports, loads)
  let selectedNodeId = null;
  let selectedMemberId = null;
  let selectedMemberIds = new Set();
  let selectedNodeIds = new Set();
  let selectedSupportId = null;
  let selectedSupportIds = new Set();
  let selectedLoadIndex = null;
  let selectedLoadIndexes = new Set();
  let activeSelectionTool = 'node'; // 'node', 'member', 'support', 'load', 'pan'

  const CURSORS = {
    pan: 'grab',
    node: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'><circle cx='5' cy='5' r='4.5' fill='white' stroke='black' stroke-width='1'/><circle cx='5' cy='5' r='2' fill='%23f1c40f'/><path d='M5,5 L5,20 L9,16 L13,23 L15,22 L11,15 L15,15 Z' fill='white' stroke='black' stroke-width='1.5'/></svg>\") 5 5, crosshair",
    member: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'><path d='M1,1 L1,18 L6,13 L10,21 L13,19 L9,12 L14,12 Z' fill='white' stroke='black' stroke-width='1.5'/></svg>\") 1 1, default",
    support: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'><polygon points='7,1 1,13 13,13' fill='white' stroke='black' stroke-width='1'/><polygon points='7,4.5 3.5,11.5 10.5,11.5' fill='%23f1c40f'/><path d='M7,7 L7,22 L11,18 L15,25 L17,24 L13,17 L17,17 Z' fill='white' stroke='black' stroke-width='1.5'/></svg>\") 7 7, crosshair",
    load: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'><path d='M1,1 L1,18 L6,13 L10,21 L13,19 L9,12 L14,12 Z' fill='white' stroke='black' stroke-width='1.5'/><path d='M16,5 L16,18.5 M11.5,14 L16,19.5 L20.5,14' stroke='black' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/><path d='M16,5 L16,18.5 M11.5,14 L16,19.5 L20.5,14' stroke='%23f1c40f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\") 1 1, crosshair"
  };

  function draw2DOverlays(nodes, members, supports, results) {
    if (!window.FrameModel) return;
    nodes = nodes || Object.values(window.FrameModel.nodes);
    members = members || Object.values(window.FrameModel.members);
    supports = supports || window.FrameModel.getSupportList();
    results = results || window.FrameModel.results;

    const overlayCanvas = document.getElementById('frame-labels-overlay');
    if (!overlayCanvas || !container || !camera) return;
    
    const rect = container.getBoundingClientRect();
    if (overlayCanvas.width !== rect.width || overlayCanvas.height !== rect.height) {
      overlayCanvas.width = rect.width;
      overlayCanvas.height = rect.height;
    }
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Project function
    const project = (x, y, z) => {
      const vec = new THREE.Vector3(x, y, z);
      vec.project(camera);
      return {
        x: ((vec.x + 1) * rect.width) / 2,
        y: (-(vec.y - 1) * rect.height) / 2,
        z: vec.z
      };
    };
    
    const showNodes = document.getElementById('toggle-show-nodes')?.checked;
    const showBeams = document.getElementById('toggle-show-beams')?.checked;
    const showLoads = document.getElementById('toggle-show-loads')?.checked;
    const showMemberSections = document.getElementById('toggle-show-member-sections')?.checked;
    const showLoadConcentrated = document.getElementById('toggle-show-load-concentrated')?.checked;
    const showLoadUdl = document.getElementById('toggle-show-load-udl')?.checked;
    const showLoadMoment = document.getElementById('toggle-show-load-moment')?.checked;
    const showAxes = document.getElementById('toggle-show-axes')?.checked;
    const showDimensions = document.getElementById('toggle-show-dimensions')?.checked;
    const showReactions = document.getElementById('toggle-show-reactions')?.checked;
    
    // 1. Node Numbers
    if (showNodes) {
      nodes.forEach(n => {
        const pt = project(n.x, n.y, n.z);
        if (pt.z > 1) return; // behind camera
        
        ctx.font = 'bold 9px sans-serif';
        const label = `${n.id}`;
        
        const px = pt.x;
        const py = pt.y - 12;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Subtle outline for universal light/dark theme contrast
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(label, px, py);
        
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(label, px, py);
      });
    }
    
    // 2. Beam Numbers
    if (showBeams) {
      members.forEach(m => {
        const nStart = window.FrameModel.nodes[m.startNode];
        const nEnd = window.FrameModel.nodes[m.endNode];
        if (!nStart || !nEnd) return;
        
        const midX = (nStart.x + nEnd.x) / 2;
        const midY = (nStart.y + nEnd.y) / 2;
        const midZ = (nStart.z + nEnd.z) / 2;
        
        const pt = project(midX, midY, midZ);
        if (pt.z > 1) return;
        
        // Compute 2D perpendicular offset vector from beam line
        const ptStart = project(nStart.x, nStart.y, nStart.z);
        const ptEnd = project(nEnd.x, nEnd.y, nEnd.z);
        const dx = ptEnd.x - ptStart.x;
        const dy = ptEnd.y - ptStart.y;
        const len = Math.hypot(dx, dy);
        
        let offsetX = 0;
        let offsetY = -10;
        if (len > 1e-3) {
          const nx = -dy / len;
          const ny = dx / len;
          offsetX = nx * 10;
          offsetY = ny * 10;
        }
        
        const px = pt.x + offsetX;
        const py = pt.y + offsetY;
        
        ctx.font = 'bold 9px sans-serif';
        const label = `${m.id}`;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Subtle outline for universal light/dark theme contrast
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(label, px, py);
        
        ctx.fillStyle = '#0ea5e9';
        ctx.fillText(label, px, py);
      });
    }
    
    // 2b. Member Sections
    if (showMemberSections) {
      members.forEach(m => {
        const nStart = window.FrameModel.nodes[m.startNode];
        const nEnd = window.FrameModel.nodes[m.endNode];
        if (!nStart || !nEnd) return;
        
        const midX = (nStart.x + nEnd.x) / 2;
        const midY = (nStart.y + nEnd.y) / 2;
        const midZ = (nStart.z + nEnd.z) / 2;
        
        const pt = project(midX, midY, midZ);
        if (pt.z > 1) return;
        
        // Compute 2D perpendicular offset vector from beam line (opposite side of Beam ID)
        const ptStart = project(nStart.x, nStart.y, nStart.z);
        const ptEnd = project(nEnd.x, nEnd.y, nEnd.z);
        const dx = ptEnd.x - ptStart.x;
        const dy = ptEnd.y - ptStart.y;
        const len = Math.hypot(dx, dy);
        
        let offsetX = 0;
        let offsetY = 10;
        if (len > 1e-3) {
          const nx = -dy / len;
          const ny = dx / len;
          offsetX = -nx * 10;
          offsetY = -ny * 10;
        }
        
        const px = pt.x + offsetX;
        const py = pt.y + offsetY;
        
        ctx.font = 'bold 9px sans-serif';
        const label = m.sectionName || 'Default';
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Subtle outline for universal light/dark theme contrast
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(label, px, py);
        
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(label, px, py);
      });
    }
    
    // 3. Local Axes
    if (showAxes) {
      members.forEach(m => {
        const nStart = window.FrameModel.nodes[m.startNode];
        const nEnd = window.FrameModel.nodes[m.endNode];
        if (!nStart || !nEnd) return;
        
        const midX = (nStart.x + nEnd.x) / 2;
        const midY = (nStart.y + nEnd.y) / 2;
        const midZ = (nStart.z + nEnd.z) / 2;
        
        const startPt = project(midX, midY, midZ);
        if (startPt.z > 1) return;
        
        const dx = nEnd.x - nStart.x;
        const dy = nEnd.y - nStart.y;
        const dz = nEnd.z - nStart.z;
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const ux = dx/len;
        const uy = dy/len;
        const uz = dz/len;
        
        let py_x = -uy;
        let py_y = ux;
        let py_z = 0;
        if (Math.abs(ux) < 0.01 && Math.abs(uy) < 0.01) {
          py_x = 1;
          py_y = 0;
          py_z = 0;
        } else {
          const py_len = Math.sqrt(py_x*py_x + py_y*py_y);
          py_x /= py_len;
          py_y /= py_len;
        }
        
        const pz_x = uy*py_z - uz*py_y;
        const pz_y = uz*py_x - ux*py_z;
        const pz_z = ux*py_y - uy*py_x;
        
        const scaleVal = 0.35;
        const ptX = project(midX + ux*scaleVal, midY + uy*scaleVal, midZ + uz*scaleVal);
        const ptY = project(midX + py_x*scaleVal, midY + py_y*scaleVal, midZ + py_z*scaleVal);
        const ptZ = project(midX + pz_x*scaleVal, midY + pz_y*scaleVal, midZ + pz_z*scaleVal);
        
        const drawArrow = (from, to, color) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          
          const headlen = 5;
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
          ctx.fill();
        };
        
        drawArrow(startPt, ptX, '#ef4444');
        drawArrow(startPt, ptY, '#22c55e');
        drawArrow(startPt, ptZ, '#3b82f6');
      });
    }
    
    // 4. Dimensions
    if (showDimensions) {
      members.forEach(m => {
        const nStart = window.FrameModel.nodes[m.startNode];
        const nEnd = window.FrameModel.nodes[m.endNode];
        if (!nStart || !nEnd) return;
        
        const midX = (nStart.x + nEnd.x) / 2;
        const midY = (nStart.y + nEnd.y) / 2;
        const midZ = (nStart.z + nEnd.z) / 2;
        
        const p1 = project(nStart.x, nStart.y, nStart.z);
        const p2 = project(nEnd.x, nEnd.y, nEnd.z);
        const pm = project(midX, midY, midZ);
        if (p1.z > 1 || p2.z > 1) return;
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len < 5) return;
        const nx = -dy/len;
        const ny = dx/len;
        
        const offset = 20;
        const d1x = p1.x + nx * offset;
        const d1y = p1.y + ny * offset;
        const d2x = p2.x + nx * offset;
        const d2y = p2.y + ny * offset;
        
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d1x, d1y);
        ctx.lineTo(d2x, d2y);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(d1x, d1y);
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(d2x, d2y);
        ctx.stroke();
        
        const tickSize = 4;
        ctx.beginPath();
        ctx.moveTo(d1x - ny*tickSize - nx*tickSize, d1y + nx*tickSize - ny*tickSize);
        ctx.lineTo(d1x + ny*tickSize + nx*tickSize, d1y - nx*tickSize + ny*tickSize);
        ctx.moveTo(d2x - ny*tickSize - nx*tickSize, d2y + nx*tickSize - ny*tickSize);
        ctx.lineTo(d2x + ny*tickSize + nx*tickSize, d2y - nx*tickSize + ny*tickSize);
        ctx.stroke();
        
        const length3D = Math.sqrt(
          (nEnd.x - nStart.x)**2 + 
          (nEnd.y - nStart.y)**2 + 
          (nEnd.z - nStart.z)**2
        );
        const label = `${length3D.toFixed(2)} m`;
        ctx.font = '9px sans-serif';
        const tw = ctx.measureText(label).width;
        
        const tx = pm.x + nx * offset;
        const ty = pm.y + ny * offset;
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(tx - tw/2 - 2, ty - 6, tw + 4, 12);
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tx, ty);
      });
    }
    
    // 5. Support Reactions
    if (showReactions && results && results.reactions) {
      results.reactions.forEach(r => {
        const node = window.FrameModel.nodes[r.nodeId];
        if (!node) return;
        
        const pt = project(node.x, node.y, node.z);
        if (pt.z > 1) return;
        
        let labels = [];
        if (Math.abs(r.FX) > 1) labels.push(`Fx: ${(r.FX/1000.0).toFixed(1)} kN`);
        if (Math.abs(r.FY) > 1) labels.push(`Fy: ${(r.FY/1000.0).toFixed(1)} kN`);
        if (Math.abs(r.FZ) > 1) labels.push(`Fz: ${(r.FZ/1000.0).toFixed(1)} kN`);
        if (Math.abs(r.MZ) > 1) labels.push(`Mz: ${(r.MZ/1000.0).toFixed(1)} kNm`);
        
        if (labels.length === 0) return;
        
        ctx.font = 'bold 9px sans-serif';
        labels.forEach((lbl, idx) => {
          const tw = ctx.measureText(lbl).width;
          const px = pt.x + 20;
          const py = pt.y + 12 + idx * 12;
          
          ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
          ctx.fillRect(px - 4, py - 6, tw + 8, 12);
          
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(lbl, px, py);
        });
      });
    }

    // 6. Load Values
    if (showLoads && (showLoadConcentrated || showLoadUdl || showLoadMoment)) {
      const loads = window.FrameModel.loads || [];
      loads.forEach((l) => {
        let shouldShow = false;
        if (l.type === 'NodeLoad' || l.type === 'NodalLoad') {
          const isMoment = l.direction.startsWith('M');
          if (isMoment) {
            shouldShow = showLoadMoment;
          } else {
            shouldShow = showLoadConcentrated;
          }
        } else if (l.type === 'MemberPointLoad') {
          shouldShow = showLoadConcentrated;
        } else if (l.type === 'MemberDistributedLoad') {
          shouldShow = showLoadUdl;
        }
        if (!shouldShow) return;

        let ptTail = null;
        let ptBase = null;

        if (l.type === 'NodeLoad' || l.type === 'NodalLoad') {
          const node = window.FrameModel.nodes[l.nodeId];
          if (!node) return;
          const magnitude = parseFloat(l.force);
          if (magnitude === 0) return;

          const dirMap = {
            'FX': new THREE.Vector3(1, 0, 0),
            'FY': new THREE.Vector3(0, 1, 0),
            'FZ': new THREE.Vector3(0, 0, 1),
            'MX': new THREE.Vector3(1, 0, 0),
            'MY': new THREE.Vector3(0, 1, 0),
            'MZ': new THREE.Vector3(0, 0, 1)
          };
          const dir = dirMap[l.direction].clone();
          const arrowDir = dir.clone().multiplyScalar(magnitude > 0 ? 1 : -1);
          const startPos = new THREE.Vector3(node.x, node.y, node.z).sub(arrowDir.clone().multiplyScalar(1.2));
          
          ptTail = project(startPos.x, startPos.y, startPos.z);
          ptBase = project(node.x, node.y, node.z);
        } else if (l.type === 'MemberDistributedLoad' || l.type === 'MemberPointLoad') {
          const member = window.FrameModel.members[l.memberId];
          if (!member) return;
          const nStart = window.FrameModel.nodes[member.startNode];
          const nEnd = window.FrameModel.nodes[member.endNode];
          if (!nStart || !nEnd) return;

          const mid = new THREE.Vector3(
            (nStart.x + nEnd.x) / 2,
            (nStart.y + nEnd.y) / 2,
            (nStart.z + nEnd.z) / 2
          );

          let arrowDir = new THREE.Vector3(0, -1, 0);
          if (l.direction === 'Fx') {
            arrowDir = new THREE.Vector3(nEnd.x - nStart.x, nEnd.y - nStart.y, nEnd.z - nStart.z).normalize();
          }
          const startPos = mid.clone().sub(arrowDir.clone().multiplyScalar(0.8));
          
          ptTail = project(startPos.x, startPos.y, startPos.z);
          ptBase = project(mid.x, mid.y, mid.z);
        }

        if (ptTail && ptBase && ptTail.z <= 1) {
          const dx = ptTail.x - ptBase.x;
          const dy = ptTail.y - ptBase.y;
          const len = Math.hypot(dx, dy);

          let px = ptTail.x;
          let py = ptTail.y;
          if (len > 1e-3) {
            px += (dx / len) * 12;
            py += (dy / len) * 12;
          } else {
            py -= 12;
          }

          const fUnit = window.ResultUnits.force || 'kN';
          const dUnit = (fUnit === 'lbf' || fUnit === 'kip') ? 'ft' : 'm';
          let displayValStr = '';
          const rawVal = parseFloat(l.force);

          if (l.type === 'NodeLoad' || l.type === 'NodalLoad') {
            const isMoment = l.direction.startsWith('M');
            if (isMoment) {
              const factor = window.getForceFactor(fUnit) * window.getDistFactor(dUnit);
              displayValStr = `${(rawVal / factor).toFixed(1)} ${fUnit}·${dUnit}`;
            } else {
              const factor = window.getForceFactor(fUnit);
              displayValStr = `${(rawVal / factor).toFixed(1)} ${fUnit}`;
            }
          } else if (l.type === 'MemberPointLoad') {
            const factor = window.getForceFactor(fUnit);
            displayValStr = `${(rawVal / factor).toFixed(1)} ${fUnit}`;
          } else if (l.type === 'MemberDistributedLoad') {
            const factor = window.getForceFactor(fUnit) / window.getDistFactor(dUnit);
            displayValStr = `${(rawVal / factor).toFixed(1)} ${fUnit}/${dUnit}`;
          }

          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Outline shadow for readability against Light and Dark themes
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.strokeText(displayValStr, px, py);

          ctx.fillStyle = '#10b981'; // Vibrant emerald green for load values
          ctx.fillText(displayValStr, px, py);
        }
      });
    }
  }

  const FrameCanvas = {
    selectedNodeId: null,
    selectedNodeIds: selectedNodeIds,
    selectedMemberId: null,
    selectedMemberIds: selectedMemberIds,
    selectedSupportId: null,
    selectedSupportIds: selectedSupportIds,
    selectedLoadIndex: null,
    selectedLoadIndexes: selectedLoadIndexes,
    activeSelectionTool: 'node',

    setSelectionTool: function(toolName) {
      activeSelectionTool = toolName;
      this.activeSelectionTool = toolName;
      
      // Update OrbitControls mouse bindings for Left click pan vs rotate
      if (controls) {
        if (toolName === 'pan') {
          controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
          };
        } else {
          controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          };
        }
      }

      // Update viewport cursor style immediately
      const cardEl = document.getElementById('frame-viewport-card');
      if (cardEl) {
        cardEl.classList.remove('cursor-select-node', 'cursor-select-member', 'cursor-select-support', 'cursor-select-load', 'cursor-select-pan');
        cardEl.classList.add(`cursor-select-${toolName}`);
      }
      const canvasEl = container ? container.querySelector('canvas') : null;
      if (canvasEl) {
        canvasEl.style.cursor = CURSORS[toolName] || 'grab';
      }
      
      // Clear tooltips on switch
      const tooltip = document.getElementById('frame-viewport-tooltip');
      if (tooltip) tooltip.style.display = 'none';
      
      // Clear selections
      selectedNodeId = null;
      selectedMemberId = null;
      selectedSupportId = null;
      selectedLoadIndex = null;
      this.selectedNodeId = null;
      this.selectedMemberId = null;
      this.selectedSupportId = null;
      this.selectedLoadIndex = null;
      selectedSupportIds.clear();
      selectedLoadIndexes.clear();
      this.render();
    },

    selectNode: function(nodeId, isMulti = false) {
      if (nodeId === null) {
        if (!isMulti) {
          selectedNodeIds.clear();
          selectedNodeId = null;
          this.selectedNodeId = null;
        }
      } else {
        if (isMulti) {
          if (selectedNodeIds.has(nodeId)) {
            selectedNodeIds.delete(nodeId);
          } else {
            selectedNodeIds.add(nodeId);
          }
          selectedNodeId = selectedNodeIds.has(nodeId) ? nodeId : null;
          this.selectedNodeId = selectedNodeId;
        } else {
          selectedNodeIds.clear();
          selectedNodeIds.add(nodeId);
          selectedNodeId = nodeId;
          this.selectedNodeId = nodeId;
        }
      }
      this.render();
      if (window.selectNodeFromCanvas) {
        window.selectNodeFromCanvas(nodeId, isMulti);
      }
    },

    selectMember: function(memberId, isMulti = false) {
      if (memberId === null) {
        if (!isMulti) {
          selectedMemberIds.clear();
          selectedMemberId = null;
          this.selectedMemberId = null;
        }
      } else {
        if (isMulti) {
          if (selectedMemberIds.has(memberId)) {
            selectedMemberIds.delete(memberId);
          } else {
            selectedMemberIds.add(memberId);
          }
          selectedMemberId = selectedMemberIds.has(memberId) ? memberId : null;
          this.selectedMemberId = selectedMemberId;
        } else {
          selectedMemberIds.clear();
          selectedMemberIds.add(memberId);
          selectedMemberId = memberId;
          this.selectedMemberId = memberId;
        }
      }
      this.render();
      if (window.selectMemberFromCanvas) {
        window.selectMemberFromCanvas(memberId, isMulti);
      }
    },

    selectSupport: function(nodeId, isMulti = false) {
      if (nodeId === null) {
        if (!isMulti) {
          selectedSupportIds.clear();
          selectedSupportId = null;
          this.selectedSupportId = null;
        }
      } else {
        if (isMulti) {
          if (selectedSupportIds.has(nodeId)) {
            selectedSupportIds.delete(nodeId);
          } else {
            selectedSupportIds.add(nodeId);
          }
          selectedSupportId = selectedSupportIds.has(nodeId) ? nodeId : null;
          this.selectedSupportId = selectedSupportId;
        } else {
          selectedSupportIds.clear();
          selectedSupportIds.add(nodeId);
          selectedSupportId = nodeId;
          this.selectedSupportId = nodeId;
        }
      }
      this.render();
      if (window.selectSupportFromCanvas) {
        window.selectSupportFromCanvas(nodeId);
      }
    },

    selectLoad: function(loadIndex, isMulti = false) {
      if (loadIndex === null) {
        if (!isMulti) {
          selectedLoadIndexes.clear();
          selectedLoadIndex = null;
          this.selectedLoadIndex = null;
        }
      } else {
        if (isMulti) {
          if (selectedLoadIndexes.has(loadIndex)) {
            selectedLoadIndexes.delete(loadIndex);
          } else {
            selectedLoadIndexes.add(loadIndex);
          }
          selectedLoadIndex = selectedLoadIndexes.has(loadIndex) ? loadIndex : null;
          this.selectedLoadIndex = selectedLoadIndex;
        } else {
          selectedLoadIndexes.clear();
          selectedLoadIndexes.add(loadIndex);
          selectedLoadIndex = loadIndex;
          this.selectedLoadIndex = loadIndex;
        }
      }
      this.render();
      if (window.selectLoadFromCanvas) {
        window.selectLoadFromCanvas(loadIndex);
      }
    },

    selectNodes: function(nodeIds, isMulti = false) {
      if (!isMulti) {
        selectedNodeIds.clear();
      }
      nodeIds.forEach(id => selectedNodeIds.add(id));
      selectedNodeId = nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null;
      this.selectedNodeId = selectedNodeId;
      this.render();
      if (window.selectNodeFromCanvas) {
        window.selectNodeFromCanvas(selectedNodeId, true);
      }
    },

    selectMembers: function(memberIds, isMulti = false) {
      if (!isMulti) {
        selectedMemberIds.clear();
      }
      memberIds.forEach(id => selectedMemberIds.add(id));
      selectedMemberId = memberIds.length > 0 ? memberIds[memberIds.length - 1] : null;
      this.selectedMemberId = selectedMemberId;
      this.render();
      if (window.selectMemberFromCanvas) {
        window.selectMemberFromCanvas(selectedMemberId, true);
      }
    },

    selectSupports: function(nodeIds, isMulti = false) {
      if (!isMulti) {
        selectedSupportIds.clear();
      }
      nodeIds.forEach(id => selectedSupportIds.add(id));
      selectedSupportId = nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null;
      this.selectedSupportId = selectedSupportId;
      this.render();
      if (window.selectSupportFromCanvas) {
        window.selectSupportFromCanvas(selectedSupportId);
      }
    },

    selectLoads: function(indexes, isMulti = false) {
      if (!isMulti) {
        selectedLoadIndexes.clear();
      }
      indexes.forEach(idx => selectedLoadIndexes.add(idx));
      selectedLoadIndex = indexes.length > 0 ? indexes[indexes.length - 1] : null;
      this.selectedLoadIndex = selectedLoadIndex;
      this.render();
      if (window.selectLoadFromCanvas) {
        window.selectLoadFromCanvas(selectedLoadIndex);
      }
    },

    init: function(containerId) {
      container = document.getElementById(containerId);
      if (!container) return;

      // 1. Setup Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(
        getComputedStyle(document.body).getPropertyValue('--bg-body').trim() || '#0f1015'
      );

      // 2. Setup Camera
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(8, 6, 10);

      // 3. Setup Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);

      // 4. Setup Orbit Controls
      if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(2, 1, 0);
        controls.update();
      }

      // 5. Add Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight1.position.set(10, 20, 10);
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
      dirLight2.position.set(-10, -10, -10);
      scene.add(dirLight2);

      // 6. Add Grid Helper
      // Ground grid in XZ plane
      const gridHelper = new THREE.GridHelper(30, 30, 0x555555, 0x2d303e);
      gridHelper.position.y = 0;
      scene.add(gridHelper);

      // 7. Group for model objects
      objectsGroup = new THREE.Group();
      scene.add(objectsGroup);

      // 8. Handle Resizing & Pointer Selection clicks
      window.addEventListener('resize', this.onResize.bind(this));

      this.pointerDownPos = { x: 0, y: 0 };
      let isMarqueeActive = false;
      let marqueeStart = { x: 0, y: 0 };

      container.addEventListener('pointerdown', (e) => {
        if (e.shiftKey) {
          isMarqueeActive = true;
          const rect = container.getBoundingClientRect();
          marqueeStart.x = e.clientX - rect.left;
          marqueeStart.y = e.clientY - rect.top;
          if (controls) {
            controls.enabled = false;
          }
          const marquee = document.getElementById('frame-selection-marquee');
          if (marquee) {
            marquee.style.left = `${marqueeStart.x}px`;
            marquee.style.top = `${marqueeStart.y}px`;
            marquee.style.width = '0px';
            marquee.style.height = '0px';
            marquee.style.display = 'block';
          }
          this.pointerDownPos.x = e.clientX;
          this.pointerDownPos.y = e.clientY;
          return;
        }

        this.pointerDownPos.x = e.clientX;
        this.pointerDownPos.y = e.clientY;
        const canvasEl = container.querySelector('canvas');
        if (canvasEl) {
          canvasEl.style.cursor = 'grabbing';
        }
      });

      container.addEventListener('pointerup', (e) => {
        if (isMarqueeActive) {
          isMarqueeActive = false;
          const marquee = document.getElementById('frame-selection-marquee');
          if (marquee) {
            marquee.style.display = 'none';
          }
          if (controls) {
            controls.enabled = true;
          }
          
          const rect = container.getBoundingClientRect();
          const currentX = e.clientX - rect.left;
          const currentY = e.clientY - rect.top;
          const left = Math.min(marqueeStart.x, currentX);
          const top = Math.min(marqueeStart.y, currentY);
          const width = Math.abs(marqueeStart.x - currentX);
          const height = Math.abs(marqueeStart.y - currentY);

          if (width > 3 || height > 3) {
            const selectedEntities = [];
            const isMulti = e.ctrlKey || e.shiftKey;
            
            if (activeSelectionTool === 'node') {
              const nodes = window.FrameModel.getNodeList();
              nodes.forEach(n => {
                const vec = new THREE.Vector3(n.x, n.y, n.z);
                vec.project(camera);
                const sx = ((vec.x + 1) * rect.width) / 2;
                const sy = (-(vec.y - 1) * rect.height) / 2;
                if (sx >= left && sx <= left + width && sy >= top && sy <= top + height) {
                  selectedEntities.push(n.id);
                }
              });
              if (selectedEntities.length > 0) {
                this.selectNodes(selectedEntities, isMulti);
              }
            } else if (activeSelectionTool === 'member') {
              const members = window.FrameModel.getMemberList();
              members.forEach(m => {
                const nStart = window.FrameModel.nodes[m.startNode];
                const nEnd = window.FrameModel.nodes[m.endNode];
                if (nStart && nEnd) {
                  const checkPoints = [
                    new THREE.Vector3(nStart.x, nStart.y, nStart.z),
                    new THREE.Vector3(nEnd.x, nEnd.y, nEnd.z),
                    new THREE.Vector3((nStart.x + nEnd.x)/2, (nStart.y + nEnd.y)/2, (nStart.z + nEnd.z)/2)
                  ];
                  const isAnyInside = checkPoints.some(pt => {
                    pt.project(camera);
                    const sx = ((pt.x + 1) * rect.width) / 2;
                    const sy = (-(pt.y - 1) * rect.height) / 2;
                    return sx >= left && sx <= left + width && sy >= top && sy <= top + height;
                  });
                  if (isAnyInside) {
                    selectedEntities.push(m.id);
                  }
                }
              });
              if (selectedEntities.length > 0) {
                this.selectMembers(selectedEntities, isMulti);
              }
            } else if (activeSelectionTool === 'support') {
              const supports = window.FrameModel.getSupportList();
              supports.forEach(s => {
                const node = window.FrameModel.nodes[s.nodeId];
                if (node) {
                  const vec = new THREE.Vector3(node.x, node.y, node.z);
                  vec.project(camera);
                  const sx = ((vec.x + 1) * rect.width) / 2;
                  const sy = (-(vec.y - 1) * rect.height) / 2;
                  if (sx >= left && sx <= left + width && sy >= top && sy <= top + height) {
                    selectedEntities.push(s.nodeId);
                  }
                }
              });
              if (selectedEntities.length > 0) {
                this.selectSupports(selectedEntities, isMulti);
              }
            } else if (activeSelectionTool === 'load') {
              const loads = window.FrameModel.loads;
              loads.forEach((l, idx) => {
                let vec = null;
                if (l.type === 'NodalLoad') {
                  const node = window.FrameModel.nodes[l.nodeId];
                  if (node) vec = new THREE.Vector3(node.x, node.y, node.z);
                } else {
                  const member = window.FrameModel.members[l.memberId];
                  if (member) {
                    const nStart = window.FrameModel.nodes[member.startNode];
                    const nEnd = window.FrameModel.nodes[member.endNode];
                    if (nStart && nEnd) {
                      vec = new THREE.Vector3((nStart.x + nEnd.x)/2, (nStart.y + nEnd.y)/2, (nStart.z + nEnd.z)/2);
                    }
                  }
                }
                if (vec) {
                  vec.project(camera);
                  const sx = ((vec.x + 1) * rect.width) / 2;
                  const sy = (-(vec.y - 1) * rect.height) / 2;
                  if (sx >= left && sx <= left + width && sy >= top && sy <= top + height) {
                    selectedEntities.push(idx);
                  }
                }
              });
              if (selectedEntities.length > 0) {
                this.selectLoads(selectedEntities, isMulti);
              }
            }
            return;
          }
        }

        const dx = Math.abs(e.clientX - this.pointerDownPos.x);
        const dy = Math.abs(e.clientY - this.pointerDownPos.y);
        
        const canvasEl = container.querySelector('canvas');
        if (canvasEl) {
          canvasEl.style.cursor = CURSORS[activeSelectionTool] || 'grab';
        }

        if (dx > 3 || dy > 3) return; // Dragged camera
        
        const rect = container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        if (activeSelectionTool === 'node') {
          const nodeMeshes = objectsGroup.children.filter(child => child.userData && child.userData.nodeId);
          const intersects = raycaster.intersectObjects(nodeMeshes);
          const startSel = document.getElementById('member-input-start');
          const endSel = document.getElementById('member-input-end');
          const isBeamsTabActive = document.getElementById('btn-tab-members')?.classList.contains('active');
          const isSelectInModel = isBeamsTabActive && startSel && (startSel.value === 'select-in-model' || endSel.value === 'select-in-model');
          const isMulti = e.ctrlKey || e.shiftKey || isSelectInModel;
          if (intersects.length > 0) {
            const nodeId = intersects[0].object.userData.nodeId;
            const hasOneSelected = selectedNodeIds.size === 1;
            const clickedSelected = selectedNodeIds.has(nodeId);
            const isClickingSecondWithoutCtrl = isBeamsTabActive && hasOneSelected && !clickedSelected && !(e.ctrlKey || e.shiftKey);
            if (isClickingSecondWithoutCtrl) {
              if (window.showToast) {
                window.showToast('Please hold the Ctrl key while selecting the second node, or press Esc to cancel the current selection.');
              }
              return;
            }
            this.selectNode(intersects[0].object.userData.nodeId, isMulti);
          } else {
            if (!isSelectInModel) {
              this.selectNode(null, isMulti);
            }
          }
        } else if (activeSelectionTool === 'member') {
          const isBeamsTabActive = document.getElementById('btn-tab-members')?.classList.contains('active');
          const isSelectInModel = document.getElementById('member-input-start')?.value === 'select-in-model';
          
          if (isBeamsTabActive && isSelectInModel) {
            const nodeMeshes = objectsGroup.children.filter(child => child.userData && child.userData.nodeId);
            const intersects = raycaster.intersectObjects(nodeMeshes);
            if (intersects.length > 0) {
              const nodeId = intersects[0].object.userData.nodeId;
              const hasOneSelected = selectedNodeIds.size === 1;
              const clickedSelected = selectedNodeIds.has(nodeId);
              const isClickingSecondWithoutCtrl = hasOneSelected && !clickedSelected && !(e.ctrlKey || e.shiftKey);
              if (isClickingSecondWithoutCtrl) {
                if (window.showToast) {
                  window.showToast('Please hold the Ctrl key while selecting the second node, or press Esc to cancel the current selection.');
                }
                return;
              }
              this.selectNode(nodeId, true);
              return;
            }
          }

          raycaster.params.Line.threshold = 0.15;
          const memberMeshes = objectsGroup.children.filter(child => child.userData && child.userData.memberId);
          const intersects = raycaster.intersectObjects(memberMeshes);
          const isMatSecTab = document.getElementById('btn-tab-matsec')?.classList.contains('active');
          const isMulti = e.ctrlKey || e.shiftKey || isMatSecTab;
          if (intersects.length > 0) {
            this.selectMember(intersects[0].object.userData.memberId, isMulti);
          } else {
            this.selectMember(null, isMulti);
          }
        } else if (activeSelectionTool === 'support') {
          const supportMeshes = objectsGroup.children.filter(child => child.userData && child.userData.supportNodeId);
          const intersects = raycaster.intersectObjects(supportMeshes);
          const isMulti = e.ctrlKey || e.shiftKey;
          if (intersects.length > 0) {
            this.selectSupport(intersects[0].object.userData.supportNodeId, isMulti);
          } else {
            this.selectSupport(null, isMulti);
          }
        } else if (activeSelectionTool === 'load') {
          const loadIndexable = objectsGroup.children.filter(child => {
            let hasLoadIdx = child.userData && child.userData.loadIndex !== undefined;
            if (!hasLoadIdx && child.children) {
              hasLoadIdx = child.children.some(c => c.userData && c.userData.loadIndex !== undefined);
            }
            return hasLoadIdx;
          });
          const intersects = raycaster.intersectObjects(loadIndexable, true);
          let foundLoadIndex = null;
          for (const hit of intersects) {
            let obj = hit.object;
            while (obj) {
              if (obj.userData && obj.userData.loadIndex !== undefined) {
                foundLoadIndex = obj.userData.loadIndex;
                break;
              }
              obj = obj.parent;
            }
            if (foundLoadIndex !== null) break;
          }
          const isMulti = e.ctrlKey || e.shiftKey;
          this.selectLoad(foundLoadIndex, isMulti);
        }
      });

      // Hover Tooltip listener
      container.addEventListener('pointermove', (e) => {
        if (isMarqueeActive) {
          const rect = container.getBoundingClientRect();
          const currentX = e.clientX - rect.left;
          const currentY = e.clientY - rect.top;
          
          const left = Math.min(marqueeStart.x, currentX);
          const top = Math.min(marqueeStart.y, currentY);
          const width = Math.abs(marqueeStart.x - currentX);
          const height = Math.abs(marqueeStart.y - currentY);
          
          const marquee = document.getElementById('frame-selection-marquee');
          if (marquee) {
            marquee.style.left = `${left}px`;
            marquee.style.top = `${top}px`;
            marquee.style.width = `${width}px`;
            marquee.style.height = `${height}px`;
          }
          return;
        }

        const rect = container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

        const tooltip = document.getElementById('frame-viewport-tooltip');
        if (!tooltip) return;

        let hoverContent = '';
        let hasHitSelectable = false;

        if (activeSelectionTool === 'node') {
          const nodeMeshes = objectsGroup.children.filter(child => child.userData && child.userData.nodeId);
          const intersects = raycaster.intersectObjects(nodeMeshes);
          if (intersects.length > 0) {
            const nodeId = intersects[0].object.userData.nodeId;
            const node = window.FrameModel.nodes[nodeId];
            if (node) {
              hoverContent = `
                <div style="font-weight:700; color:var(--accent-secondary); margin-bottom:4px;">Node ID: ${nodeId}</div>
                <div>X: ${node.x.toFixed(3)} m</div>
                <div>Y: ${node.y.toFixed(3)} m</div>
                <div>Z: ${node.z.toFixed(3)} m</div>
              `;
              hasHitSelectable = true;
            }
          }
        } else if (activeSelectionTool === 'member') {
          raycaster.params.Line.threshold = 0.15;
          const memberMeshes = objectsGroup.children.filter(child => child.userData && child.userData.memberId);
          const intersects = raycaster.intersectObjects(memberMeshes);
          if (intersects.length > 0) {
            const memberId = intersects[0].object.userData.memberId;
            const member = window.FrameModel.members[memberId];
            if (member) {
              hoverContent = `
                <div style="font-weight:700; color:var(--accent-secondary); margin-bottom:4px;">Beam ID: ${memberId}</div>
                <div>Start Node: ${member.startNode}</div>
                <div>End Node: ${member.endNode}</div>
                <div>Section: ${member.sectionName}</div>
              `;
              hasHitSelectable = true;
            }
          }
        } else if (activeSelectionTool === 'support') {
          const supportMeshes = objectsGroup.children.filter(child => child.userData && child.userData.supportNodeId);
          const intersects = raycaster.intersectObjects(supportMeshes);
          if (intersects.length > 0) {
            hasHitSelectable = true;
          }
        } else if (activeSelectionTool === 'load') {
          const loadIndexable = objectsGroup.children.filter(child => {
            let hasLoadIdx = child.userData && child.userData.loadIndex !== undefined;
            if (!hasLoadIdx && child.children) {
              hasLoadIdx = child.children.some(c => c.userData && c.userData.loadIndex !== undefined);
            }
            return hasLoadIdx;
          });
          const intersects = raycaster.intersectObjects(loadIndexable, true);
          let foundLoadIndex = null;
          for (const hit of intersects) {
            let obj = hit.object;
            while (obj) {
              if (obj.userData && obj.userData.loadIndex !== undefined) {
                foundLoadIndex = obj.userData.loadIndex;
                break;
              }
              obj = obj.parent;
            }
            if (foundLoadIndex !== null) break;
          }
          if (foundLoadIndex !== null) {
            hasHitSelectable = true;
          }
        }

        // Set cursor style based on hits and active tool
        const canvasEl = container.querySelector('canvas');
        if (canvasEl) {
          canvasEl.style.cursor = CURSORS[activeSelectionTool] || 'default';
        }

        if (hoverContent) {
          tooltip.innerHTML = hoverContent;
          tooltip.style.display = 'block';
          
          const tooltipWidth = tooltip.clientWidth || 120;
          const tooltipHeight = tooltip.clientHeight || 80;
          
          let leftPos = e.clientX - rect.left + 15;
          let topPos = e.clientY - rect.top + 15;
          
          if (leftPos + tooltipWidth > rect.width) {
            leftPos = e.clientX - rect.left - tooltipWidth - 10;
          }
          if (topPos + tooltipHeight > rect.height) {
            topPos = e.clientY - rect.top - tooltipHeight - 10;
          }

          tooltip.style.left = `${leftPos}px`;
          tooltip.style.top = `${topPos}px`;
        } else {
          tooltip.style.display = 'none';
        }
      });

      container.addEventListener('pointerleave', () => {
        const tooltip = document.getElementById('frame-viewport-tooltip');
        if (tooltip) tooltip.style.display = 'none';
      });

      // 9. Start Animation Loop
      this.animate();

      // Render initial empty state
      this.render();
    },

    onResize: function() {
      if (!container || !camera || !renderer) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    },

    animate: function() {
      requestAnimationFrame(FrameCanvas.animate);
      if (controls) controls.update();
      if (renderer && scene && camera) {
        // Sync background color with theme dynamically
        const themeBg = getComputedStyle(document.body).getPropertyValue('--bg-body').trim();
        if (themeBg) {
          scene.background.set(themeBg);
        }
        renderer.render(scene, camera);
        updateAxesIndicator();
        draw2DOverlays();
      }
    },

    setViewDirection: function(plane) {
      if (!camera || !controls) return;
      
      // Calculate active boundary or target center
      const center = new THREE.Vector3(2, 1, 0);
      controls.target.copy(center);

      if (plane === '3d') {
        camera.position.set(8, 6, 10);
      } else if (plane === 'xy') {
        camera.position.set(2, 1, 10); // Front view
      } else if (plane === 'xz') {
        camera.position.set(2, 10, 0); // Top view
      }
      controls.update();
    },

    render: function() {
      if (!objectsGroup) return;

      // Clear previous objects
      while(objectsGroup.children.length > 0) {
        const obj = objectsGroup.children[0];
        objectsGroup.remove(obj);
      }

      const nodes = window.FrameModel.getNodeList();
      const members = window.FrameModel.getMemberList();
      const supports = window.FrameModel.getSupportList();
      const loads = window.FrameModel.loads;
      const results = window.FrameModel.results;

      // Toggle checkboxes
      const showLoads = document.getElementById('toggle-show-loads') ? document.getElementById('toggle-show-loads').checked : true;
      const showSupports = document.getElementById('toggle-show-supports') ? document.getElementById('toggle-show-supports').checked : true;
      const showReactions = document.getElementById('toggle-show-reactions') ? document.getElementById('toggle-show-reactions').checked : true;
      
      let diagramLayer = 'none';
      if (document.getElementById('toggle-show-displ-x')?.checked) diagramLayer = 'axial';
      else if (document.getElementById('toggle-show-displ-y')?.checked) diagramLayer = 'deflection_Y';
      else if (document.getElementById('toggle-show-displ-z')?.checked) diagramLayer = 'deflection_Z';
      else if (document.getElementById('toggle-show-axial')?.checked) diagramLayer = 'axial';
      else if (document.getElementById('toggle-show-shear')?.checked) diagramLayer = 'shear_Y';
      else if (document.getElementById('toggle-show-torsion')?.checked) diagramLayer = 'torque';
      else if (document.getElementById('toggle-show-moment-x')?.checked) diagramLayer = 'torque';
      else if (document.getElementById('toggle-show-moment-y')?.checked) diagramLayer = 'moment_Y';
      else if (document.getElementById('toggle-show-moment-z')?.checked) diagramLayer = 'moment_Z';

      // 1. Draw Members
      members.forEach(m => {
        const nStart = window.FrameModel.nodes[m.startNode];
        const nEnd = window.FrameModel.nodes[m.endNode];
        if (!nStart || !nEnd) return;

        const p1 = new THREE.Vector3(nStart.x, nStart.y, nStart.z);
        const p2 = new THREE.Vector3(nEnd.x, nEnd.y, nEnd.z);

        // Render member line
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const isSelected = (m.id === selectedMemberId || selectedMemberIds.has(m.id));
        const colorVal = isSelected ? 0xf1c40f : 0x4682b4; // Gold if selected, Steel Blue otherwise
        const material = new THREE.LineBasicMaterial({ color: colorVal, linewidth: isSelected ? 4 : 2 });
        const line = new THREE.Line(geometry, material);
        line.userData = { memberId: m.id };
        objectsGroup.add(line);

        // If results exist and we want diagrams/deflections
        if (results && results.memberForces && diagramLayer !== 'none') {
          const mForces = results.memberForces.find(f => f.memberId === m.id);
          if (mForces) {
            this.drawMemberDiagram(p1, p2, mForces.points, diagramLayer);
          }
        }
      });

      // 2. Draw Nodes
      nodes.forEach(n => {
        const geometry = new THREE.SphereGeometry(0.12, 16, 16);
        const isSelected = (n.id === selectedNodeId || selectedNodeIds.has(n.id));
        const colorVal = isSelected ? 0xf1c40f : 0xe0e0e0;
        const material = new THREE.MeshLambertMaterial({ 
          color: colorVal,
          emissive: isSelected ? 0xd4ac0d : 0x000000,
          emissiveIntensity: isSelected ? 0.35 : 0.0
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(n.x, n.y, n.z);
        sphere.userData = { nodeId: n.id };
        objectsGroup.add(sphere);
      });

      // 3. Draw Supports
      if (showSupports) {
        supports.forEach(s => {
          const node = window.FrameModel.nodes[s.nodeId];
          if (!node) return;

          // Draw support shape based on restraints
          const restraints = s.restraints;
          const isFixed = restraints.every(r => r === true);
          const isPinned = restraints[0] === true && restraints[1] === true && restraints[2] === true && restraints.slice(3).every(r => r === false);
          const isRollerY = restraints[1] === true && restraints[0] === false && restraints[2] === false;

          let supportMesh;
          const isSelected = (s.nodeId === selectedSupportId || selectedSupportIds.has(s.nodeId));
          const supportColor = isSelected ? 0xf1c40f : (isFixed ? 0xd9534f : (isPinned ? 0xf0ad4e : 0x5bc0de));

          if (isFixed) {
            // Fixed support: Box base shape
            const geometry = new THREE.BoxGeometry(0.3, 0.15, 0.3);
            const material = new THREE.MeshLambertMaterial({ color: supportColor });
            supportMesh = new THREE.Mesh(geometry, material);
            supportMesh.position.set(node.x, node.y - 0.075, node.z);
          } else if (isPinned) {
            // Pinned support: Cone shape pointing up to node
            const geometry = new THREE.ConeGeometry(0.2, 0.3, 4);
            const material = new THREE.MeshLambertMaterial({ color: supportColor });
            supportMesh = new THREE.Mesh(geometry, material);
            supportMesh.position.set(node.x, node.y - 0.15, node.z);
          } else {
            // Roller or Custom support: Cylinder shape
            const geometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8);
            const material = new THREE.MeshLambertMaterial({ color: supportColor });
            supportMesh = new THREE.Mesh(geometry, material);
            supportMesh.position.set(node.x, node.y - 0.05, node.z);
          }
          supportMesh.userData = { supportNodeId: s.nodeId };
          objectsGroup.add(supportMesh);
        });
      }

      // 4. Draw Loads
      if (showLoads) {
        loads.forEach((l, index) => {
          if (l.type === 'NodalLoad') {
            const node = window.FrameModel.nodes[l.nodeId];
            if (!node) return;

            const dirMap = {
              'FX': new THREE.Vector3(1, 0, 0),
              'FY': new THREE.Vector3(0, 1, 0),
              'FZ': new THREE.Vector3(0, 0, 1),
              'MX': new THREE.Vector3(1, 0, 0),
              'MY': new THREE.Vector3(0, 1, 0),
              'MZ': new THREE.Vector3(0, 0, 1)
            };

            const dir = dirMap[l.direction].clone();
            const magnitude = parseFloat(l.force);
            
            // Draw force arrow
            if (magnitude !== 0) {
               const isSelected = (index === selectedLoadIndex || selectedLoadIndexes.has(index));
              const color = isSelected ? 0xf1c40f : (l.direction.startsWith('M') ? 0xcc55ff : 0xff3333);
              const arrowDir = dir.clone().multiplyScalar(magnitude > 0 ? 1 : -1);
              const startPos = new THREE.Vector3(node.x, node.y, node.z).sub(arrowDir.clone().multiplyScalar(1.2));
              
              const arrowHelper = new THREE.ArrowHelper(
                arrowDir.normalize(),
                startPos,
                1.0,
                color,
                0.2,
                0.15
              );
              // Attach raycast index metadata
              arrowHelper.line.userData = { loadIndex: index };
              arrowHelper.cone.userData = { loadIndex: index };
              arrowHelper.userData = { loadIndex: index };
              objectsGroup.add(arrowHelper);
            }
          } else if (l.type === 'MemberDistributedLoad' || l.type === 'MemberPointLoad') {
            const member = window.FrameModel.members[l.memberId];
            if (!member) return;
            const nStart = window.FrameModel.nodes[member.startNode];
            const nEnd = window.FrameModel.nodes[member.endNode];
            if (!nStart || !nEnd) return;

            // Draw load arrow on member mid-point for visualization
            const mid = new THREE.Vector3(
              (nStart.x + nEnd.x) / 2,
              (nStart.y + nEnd.y) / 2,
              (nStart.z + nEnd.z) / 2
            );

            let arrowDir = new THREE.Vector3(0, -1, 0); // Default down (vertical UDL)
            if (l.direction === 'Fx') {
              arrowDir = new THREE.Vector3(nEnd.x - nStart.x, nEnd.y - nStart.y, nEnd.z - nStart.z).normalize();
            }

            const isSelected = (index === selectedLoadIndex || selectedLoadIndexes.has(index));
            const color = isSelected ? 0xf1c40f : 0xffaa00; // Gold if selected, Orange otherwise
            
            const arrowHelper = new THREE.ArrowHelper(
              arrowDir,
              mid.clone().sub(arrowDir.clone().multiplyScalar(0.8)),
              0.8,
              color,
              0.16,
              0.12
            );
            arrowHelper.line.userData = { loadIndex: index };
            arrowHelper.cone.userData = { loadIndex: index };
            arrowHelper.userData = { loadIndex: index };
            objectsGroup.add(arrowHelper);
          }
        });
      }

      // 5. Draw Support Reactions (Forces/Moments as high-contrast orange arrows)
      if (showReactions && results && results.reactions) {
        results.reactions.forEach(r => {
          const node = window.FrameModel.nodes[r.nodeId];
          if (!node) return;

          // Draw vertical reaction arrow (FY)
          if (Math.abs(r.FY) > 0.01) {
            const arrowDir = new THREE.Vector3(0, r.FY > 0 ? 1 : -1, 0);
            const startPos = new THREE.Vector3(node.x, node.y, node.z).sub(arrowDir.clone().multiplyScalar(1.0));
            const arrowHelper = new THREE.ArrowHelper(
              arrowDir.normalize(),
              startPos,
              0.9,
              0xffa500, // Gold/Orange for reactions
              0.2,
              0.15
            );
            objectsGroup.add(arrowHelper);
          }

          // Draw horizontal reaction arrow (FX)
          if (Math.abs(r.FX) > 0.01) {
            const arrowDir = new THREE.Vector3(r.FX > 0 ? 1 : -1, 0, 0);
            const startPos = new THREE.Vector3(node.x, node.y, node.z).sub(arrowDir.clone().multiplyScalar(1.0));
            const arrowHelper = new THREE.ArrowHelper(
              arrowDir.normalize(),
              startPos,
              0.9,
              0xffa500,
              0.2,
              0.15
            );
            objectsGroup.add(arrowHelper);
          }
        });
      }

      // 5. Render 2D overlays (labels, dimensions, reactions)
      draw2DOverlays(nodes, members, supports, results);
    },

    drawMemberDiagram: function(p1, p2, points, type) {
      // 1. Calculate direction vector of member and length
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const L = dir.length();
      dir.normalize();

      // 2. Form perpendicular vectors for drawing diagrams offset
      let perp = new THREE.Vector3(0, 1, 0);
      if (Math.abs(dir.y) > 0.9) {
        perp.set(1, 0, 0);
      } else {
        perp.crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
      }
      
      let perpZ = new THREE.Vector3().crossVectors(dir, perp).normalize();

      // 3. Collect offset points along member length
      const diagramPoints = [];
      let scale = 1.0;
      
      if (type.startsWith('deflection')) {
        scale = 100.0; // Scale mm deflections up
      } else {
        scale = 0.00005; // Scale kNm/kN forces/moments down
      }

      points.forEach(pt => {
        const basePt = p1.clone().add(dir.clone().multiplyScalar(pt.x));
        
        let val = 0.0;
        let usePerp = perp;
        
        if (type === 'deflection_Y') {
          val = pt.deflection_Y;
          usePerp = perp;
        } else if (type === 'deflection_Z') {
          val = pt.deflection_Z;
          usePerp = perpZ;
        } else if (type === 'axial') {
          val = pt.axial;
          usePerp = perp;
        } else if (type === 'shear_Y') {
          val = pt.shear_Y;
          usePerp = perp;
        } else if (type === 'shear_Z') {
          val = pt.shear_Z;
          usePerp = perpZ;
        } else if (type === 'moment_Y') {
          val = pt.moment_Y;
          usePerp = perpZ;
        } else if (type === 'moment_Z') {
          val = pt.moment_Z;
          usePerp = perp;
        } else if (type === 'torque') {
          val = pt.torque;
          usePerp = perp;
        }

        const offsetPt = basePt.clone().add(usePerp.clone().multiplyScalar(val * scale));
        diagramPoints.push(offsetPt);
      });

      // 4. Draw diagram line
      const geometry = new THREE.BufferGeometry().setFromPoints(diagramPoints);
      
      let color = 0x00ff00; // green for deflection
      if (type.startsWith('moment')) color = 0xff00ff; // magenta for moment
      else if (type.startsWith('shear')) color = 0xffff00;  // yellow for shear
      else if (type === 'axial') color = 0x00ffff;   // cyan for axial
      else if (type === 'torque') color = 0xffa500;  // orange for torsion

      const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      objectsGroup.add(line);

      // 5. Draw connecting lines
      for (let i = 0; i < diagramPoints.length; i += 10) {
        const basePt = p1.clone().add(dir.clone().multiplyScalar(points[i].x));
        const geomConn = new THREE.BufferGeometry().setFromPoints([basePt, diagramPoints[i]]);
        const matConn = new THREE.LineDashedMaterial({ color: color, dashSize: 0.1, gapSize: 0.1 });
        const connLine = new THREE.Line(geomConn, matConn);
        connLine.computeLineDistances();
        objectsGroup.add(connLine);
      }
    }
  };

  // Screen-space axes indicator helper in top-right corner
  function updateAxesIndicator() {
    const canvas = document.getElementById('axes-indicator-canvas');
    if (!canvas || !camera) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const len = 16; // reduced size to fit in 65x65 container neatly

    const invQ = camera.quaternion.clone().invert();
    
    const axes = [
      { dir: new THREE.Vector3(1, 0, 0), label: '+X', color: '#ff4d4d' },
      { dir: new THREE.Vector3(0, 1, 0), label: '+Y', color: '#2ecc71' },
      { dir: new THREE.Vector3(0, 0, 1), label: '+Z', color: '#3498db' }
    ];

    const projected = axes.map(a => {
      const proj = a.dir.clone().applyQuaternion(invQ);
      return {
        dx: proj.x,
        dy: proj.y,
        dz: proj.z,
        label: a.label,
        color: a.color
      };
    });

    // Sort by depth
    projected.sort((a, b) => a.dz - b.dz);

    projected.forEach(a => {
      const tx = cx + a.dx * len;
      const ty = cy - a.dy * len;

      // Draw axis line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw axis positive arrow dot
      ctx.beginPath();
      ctx.arc(tx, ty, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = a.color;
      ctx.fill();

      // Draw text offset
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const offsetLen = len + 9;
      const lx = cx + a.dx * offsetLen;
      const ly = cy - a.dy * offsetLen;
      ctx.fillText(a.label, lx, ly);
    });

    // Draw center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Global Esc keydown listener to clear selections
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      FrameCanvas.selectNode(null, false);
      FrameCanvas.selectMember(null, false);
      FrameCanvas.selectSupport(null, false);
      FrameCanvas.selectLoad(null, false);
      // Ensure all Sets are cleared
      selectedNodeIds.clear();
      selectedMemberIds.clear();
      selectedSupportIds.clear();
      selectedLoadIndexes.clear();
      FrameCanvas.render();
      
      // Update UI row highlights
      document.querySelectorAll('.selected-row').forEach(row => {
        row.classList.remove('selected-row');
      });
      
      if (window.showToast) {
        window.showToast('Selection cleared.');
      }
    }
  });

  // Export globally
  window.FrameCanvas = FrameCanvas;
})();
