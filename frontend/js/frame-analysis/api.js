/**
 * Apex Structural Analysis Suite - 3D Frame Solver API Connection
 */
(function() {
  // Global Registry for calculated cross-sections
  window.SectionRegistry = window.SectionRegistry || {};

  const FrameAPI = {
    solve: async function() {
      // 1. Build Payload
      const payload = {
        nodes: window.FrameModel.getNodeList(),
        supports: window.FrameModel.getSupportList(),
        loads: window.FrameModel.loads,
        members: []
      };

      // 2. Resolve Member Properties (A, Ixx, Iyy, J)
      const members = window.FrameModel.getMemberList();
      for (const m of members) {
        let A = 1e-2;      // 100 cm2 default
        let Ixx = 1e-4;    // 10000 cm4 default (major)
        let Iyy = 1e-5;    // 1000 cm4 default (minor)
        let J = 2e-5;      // 2000 cm4 default (torsion)
        let name = m.sectionName;

        if (m.sectionName === 'Active' && window.getActiveSectionProperties) {
          const activeProps = window.getActiveSectionProperties();
          if (activeProps) {
            A = activeProps.A || A;
            Ixx = activeProps.Ixx || Ixx;
            Iyy = activeProps.Iyy || Iyy;
            J = activeProps.J || J;
            name = activeProps.name || name;
          }
        } else if (window.SectionRegistry[m.sectionName]) {
          const regProps = window.SectionRegistry[m.sectionName];
          A = regProps.A || A;
          Ixx = regProps.Ixx || Ixx;
          Iyy = regProps.Iyy || Iyy;
          J = regProps.J || J;
        }

        payload.members.push({
          id: m.id,
          startNode: m.startNode,
          endNode: m.endNode,
          rotation: m.beta,
          releases: m.releases,
          properties: {
            name: name,
            A: A,
            Ixx: Ixx,
            Iyy: Iyy,
            J: J
          }
        });
      }

      // 3. Make POST request
      const response = await fetch('/api/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Solver server responded with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message || 'Unknown backend solver error');
      }

      // 4. Save results to model
      window.FrameModel.results = data;
      return data;
    }
  };

  // Export globally
  window.FrameAPI = FrameAPI;
})();
