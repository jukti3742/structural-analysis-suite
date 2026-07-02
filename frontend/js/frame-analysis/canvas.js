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
  let selectedLoadIndex = null;
  let activeSelectionTool = 'node'; // 'node', 'member', 'support', 'load', 'pan'

  const CURSORS = {
    pan: 'grab',
    node: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'><circle cx='5' cy='5' r='4.5' fill='white' stroke='black' stroke-width='1'/><circle cx='5' cy='5' r='2' fill='%23f1c40f'/><path d='M5,5 L5,20 L9,16 L13,23 L15,22 L11,15 L15,15 Z' fill='white' stroke='black' stroke-width='1.5'/></svg>\") 5 5, crosshair",
    member: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'><path d='M1,1 L1,18 L6,13 L10,21 L13,19 L9,12 L14,12 Z' fill='white' stroke='black' stroke-width='1.5'/></svg>\") 1 1, default",
    support: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'><polygon points='7,1 1,13 13,13' fill='white' stroke='black' stroke-width='1'/><polygon points='7,4.5 3.5,11.5 10.5,11.5' fill='%23f1c40f'/><path d='M7,7 L7,22 L11,18 L15,25 L17,24 L13,17 L17,17 Z' fill='white' stroke='black' stroke-width='1.5'/></svg>\") 7 7, crosshair",
    load: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'><path d='M1,1 L1,18 L6,13 L10,21 L13,19 L9,12 L14,12 Z' fill='white' stroke='black' stroke-width='1.5'/><path d='M16,5 L16,18.5 M11.5,14 L16,19.5 L20.5,14' stroke='black' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/><path d='M16,5 L16,18.5 M11.5,14 L16,19.5 L20.5,14' stroke='%23f1c40f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\") 1 1, crosshair"
  };

  const FrameCanvas = {
    selectedNodeId: null,
    selectedNodeIds: selectedNodeIds,
    selectedMemberId: null,
    selectedMemberIds: selectedMemberIds,
    selectedSupportId: null,
    selectedLoadIndex: null,
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

    selectSupport: function(nodeId) {
      selectedSupportId = nodeId;
      this.selectedSupportId = nodeId;
      this.render();
      if (window.selectSupportFromCanvas) {
        window.selectSupportFromCanvas(nodeId);
      }
    },

    selectLoad: function(loadIndex) {
      selectedLoadIndex = loadIndex;
      this.selectedLoadIndex = loadIndex;
      this.render();
      if (window.selectLoadFromCanvas) {
        window.selectLoadFromCanvas(loadIndex);
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
      container.addEventListener('pointerdown', (e) => {
        this.pointerDownPos.x = e.clientX;
        this.pointerDownPos.y = e.clientY;
        const canvasEl = container.querySelector('canvas');
        if (canvasEl) {
          canvasEl.style.cursor = 'grabbing';
        }
      });
      container.addEventListener('pointerup', (e) => {
        const dx = Math.abs(e.clientX - this.pointerDownPos.x);
        const dy = Math.abs(e.clientY - this.pointerDownPos.y);
        
        // Restore cursor based on activeSelectionTool
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
          const isSelectInModel = startSel && startSel.value === 'select-in-model';
          const isMulti = e.ctrlKey || e.shiftKey || isSelectInModel;
          if (intersects.length > 0) {
            this.selectNode(intersects[0].object.userData.nodeId, isMulti);
          } else {
            if (!isSelectInModel) {
              this.selectNode(null, isMulti);
            }
          }
        } else if (activeSelectionTool === 'member') {
          // If in "Select in Model" mode (Members tab is active and dropdown value is "select-in-model"), click selects nodes!
          const isBeamsTabActive = document.getElementById('btn-tab-members')?.classList.contains('active');
          const isSelectInModel = document.getElementById('member-input-start')?.value === 'select-in-model';
          
          if (isBeamsTabActive && isSelectInModel) {
            const nodeMeshes = objectsGroup.children.filter(child => child.userData && child.userData.nodeId);
            const intersects = raycaster.intersectObjects(nodeMeshes);
            if (intersects.length > 0) {
              const nodeId = intersects[0].object.userData.nodeId;
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
          if (intersects.length > 0) {
            this.selectSupport(intersects[0].object.userData.supportNodeId);
          } else {
            this.selectSupport(null);
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
          this.selectLoad(foundLoadIndex);
        }
      });

      // Hover Tooltip listener
      container.addEventListener('pointermove', (e) => {
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
      const showLoads = document.getElementById('toggle-layer-loads') ? document.getElementById('toggle-layer-loads').checked : true;
      const showReactions = document.getElementById('toggle-layer-reactions') ? document.getElementById('toggle-layer-reactions').checked : true;
      const diagramLayer = document.getElementById('diagram-layer-selector') ? document.getElementById('diagram-layer-selector').value : 'none';

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
      supports.forEach(s => {
        const node = window.FrameModel.nodes[s.nodeId];
        if (!node) return;

        // Draw support shape based on restraints
        const restraints = s.restraints;
        const isFixed = restraints.every(r => r === true);
        const isPinned = restraints[0] === true && restraints[1] === true && restraints[2] === true && restraints.slice(3).every(r => r === false);
        const isRollerY = restraints[1] === true && restraints[0] === false && restraints[2] === false;

        let supportMesh;
        const isSelected = (s.nodeId === selectedSupportId);
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
              const isSelected = (index === selectedLoadIndex);
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

            const isSelected = (index === selectedLoadIndex);
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
    },

    drawMemberDiagram: function(p1, p2, points, type) {
      // 1. Calculate direction vector of member and length
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const L = dir.length();
      dir.normalize();

      // 2. Form perpendicular vector in plane (for drawing diagrams offset)
      // Usually, diagrams are drawn perpendicular to member.
      // If member is along X (e.g. beam), perp is along Y (up).
      // If member is along Y (e.g. column), perp is along X (left).
      let perp = new THREE.Vector3(0, 1, 0);
      if (Math.abs(dir.y) > 0.9) {
        perp.set(1, 0, 0);
      } else {
        perp.crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
      }

      // 3. Collect offset points along member length
      const diagramPoints = [];
      
      // Multipliers to scale diagrams visually on canvas
      let scale = 1.0;
      if (type === 'deflection') scale = 100.0; // Scale mm deflections up
      else if (type === 'moment_Z') scale = 0.00005; // Scale kNm moments down
      else if (type === 'shear_Y') scale = 0.00005;  // Scale kN shear down
      else if (type === 'axial') scale = 0.00005;

      points.forEach(pt => {
        // Find base point along member axis
        const basePt = p1.clone().add(dir.clone().multiplyScalar(pt.x));
        
        let val = 0.0;
        if (type === 'deflection') val = pt.deflection_Y;
        else if (type === 'moment_Z') val = pt.moment_Z;
        else if (type === 'shear_Y') val = pt.shear_Y;
        else if (type === 'axial') val = pt.axial;

        // Offset perp to axis
        const offsetPt = basePt.clone().add(perp.clone().multiplyScalar(val * scale));
        diagramPoints.push(offsetPt);
      });

      // 4. Draw diagram line
      const geometry = new THREE.BufferGeometry().setFromPoints(diagramPoints);
      
      let color = 0x00ff00; // green for deflection
      if (type === 'moment_Z') color = 0xff00ff; // magenta for moment
      else if (type === 'shear_Y') color = 0xffff00;  // yellow for shear
      else if (type === 'axial') color = 0x00ffff;   // cyan for axial

      const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      objectsGroup.add(line);

      // 5. Draw connecting lines from axis to diagram curve at start, end, and middle
      for (let i = 0; i < diagramPoints.length; i += 10) {
        const basePt = p1.clone().add(dir.clone().multiplyScalar(points[i].x));
        const geomConn = new THREE.BufferGeometry().setFromPoints([basePt, diagramPoints[i]]);
        const matConn = new THREE.LineDashedMaterial({ color: color, dashSize: 0.1, gapSize: 0.1 });
        const connLine = new THREE.Line(geomConn, matConn);
        connLine.computeLineDistances(); // Required for dashed lines
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

  // Export globally
  window.FrameCanvas = FrameCanvas;
})();
