/**
 * Apex Structural Analysis Suite - WebGL 3D Viewport Renderer (Three.js)
 */
(function() {
  let scene, camera, renderer, controls, container;
  let objectsGroup; // Group containing all structural objects (nodes, members, supports, loads)

  const FrameCanvas = {
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

      // 6. Add Grid and Axes Helpers
      // Ground grid in XZ plane
      const gridHelper = new THREE.GridHelper(30, 30, 0x555555, 0x2d303e);
      gridHelper.position.y = 0;
      scene.add(gridHelper);

      // Red (X), Green (Y), Blue (Z) Axes
      const axesHelper = new THREE.AxesHelper(3);
      axesHelper.position.set(-0.01, 0.01, -0.01); // Slightly offset to prevent z-fighting
      scene.add(axesHelper);

      // 7. Group for model objects
      objectsGroup = new THREE.Group();
      scene.add(objectsGroup);

      // 8. Handle Resizing
      window.addEventListener('resize', this.onResize.bind(this));

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
        const material = new THREE.LineBasicMaterial({ color: 0x4682b4, linewidth: 2 }); // Steel Blue
        const line = new THREE.Line(geometry, material);
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
        const material = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(n.x, n.y, n.z);
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
        if (isFixed) {
          // Fixed support: Box base shape
          const geometry = new THREE.BoxGeometry(0.3, 0.15, 0.3);
          const material = new THREE.MeshLambertMaterial({ color: 0xd9534f }); // Crimson red
          supportMesh = new THREE.Mesh(geometry, material);
          supportMesh.position.set(node.x, node.y - 0.075, node.z);
        } else if (isPinned) {
          // Pinned support: Cone shape pointing up to node
          const geometry = new THREE.ConeGeometry(0.2, 0.3, 4);
          const material = new THREE.MeshLambertMaterial({ color: 0xf0ad4e }); // Amber
          supportMesh = new THREE.Mesh(geometry, material);
          supportMesh.position.set(node.x, node.y - 0.15, node.z);
        } else {
          // Roller or Custom support: Cylinder shape
          const geometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8);
          const material = new THREE.MeshLambertMaterial({ color: 0x5bc0de }); // Teal
          supportMesh = new THREE.Mesh(geometry, material);
          supportMesh.position.set(node.x, node.y - 0.05, node.z);
        }
        objectsGroup.add(supportMesh);
      });

      // 4. Draw Loads
      if (showLoads) {
        loads.forEach(l => {
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
              const color = l.direction.startsWith('M') ? 0xcc55ff : 0xff3333; // Purple for moment, Red for force
              // Arrow points *towards* node if magnitude is negative, or away if positive
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

            const arrowHelper = new THREE.ArrowHelper(
              arrowDir,
              mid.clone().add(new THREE.Vector3(0, 0.8, 0)),
              0.8,
              0x00cc44, // Green for member loads
              0.15,
              0.1
            );
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

  // Export globally
  window.FrameCanvas = FrameCanvas;
})();
