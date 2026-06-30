/**
 * Apex Structural Analysis Suite - 3D Frame Client-Side Data Model
 */
(function() {
  const FrameModel = {
    nodes: {},
    members: {},
    supports: {},
    loads: [],
    results: null, // solved displacements, reactions, and diagram points

    clear: function() {
      this.nodes = {};
      this.members = {};
      this.supports = {};
      this.loads = [];
      this.results = null;
    },

    // --- Nodes ---
    addNode: function(id, x, y, z) {
      this.nodes[id] = { id, x: float(x), y: float(y), z: float(z) };
      this.results = null; // Invalidate cache
      return this.nodes[id];
    },

    deleteNode: function(id) {
      if (this.nodes[id]) {
        delete this.nodes[id];
        // Clean up connected members
        for (const mId in this.members) {
          if (this.members[mId].startNode === id || this.members[mId].endNode === id) {
            this.deleteMember(mId);
          }
        }
        // Clean up supports
        if (this.supports[id]) {
          delete this.supports[id];
        }
        // Clean up nodal loads
        this.loads = this.loads.filter(l => !(l.type === 'NodalLoad' && l.nodeId === id));
        this.results = null;
        return true;
      }
      return false;
    },

    // --- Members ---
    addMember: function(id, startNode, endNode, sectionName, beta = 0.0, releases = null) {
      this.members[id] = {
        id,
        startNode,
        endNode,
        sectionName,
        beta: float(beta),
        releases: releases || {
          Dxi: false, Dyi: false, Dzi: false, Rxi: false, Ryi: false, Rzi: false,
          Dxj: false, Dyj: false, Dzj: false, Rxj: false, Ryj: false, Rzj: false
        }
      };
      this.results = null;
      return this.members[id];
    },

    deleteMember: function(id) {
      if (this.members[id]) {
        delete this.members[id];
        // Clean up member loads
        this.loads = this.loads.filter(l => !(l.memberId === id));
        this.results = null;
        return true;
      }
      return false;
    },

    // --- Supports ---
    addSupport: function(nodeId, restraints) {
      // restraints is an array of 6 values: [DX, DY, DZ, RX, RY, RZ] (booleans or floats)
      this.supports[nodeId] = {
        nodeId,
        restraints: restraints.map(r => typeof r === 'number' ? float(r) : !!r)
      };
      this.results = null;
      return this.supports[nodeId];
    },

    deleteSupport: function(nodeId) {
      if (this.supports[nodeId]) {
        delete this.supports[nodeId];
        this.results = null;
        return true;
      }
      return false;
    },

    // --- Loads ---
    addLoad: function(loadObj) {
      // loadObj has properties like type, targetId, direction, force, w1, w2, x1, x2
      this.loads.push(loadObj);
      this.results = null;
      return loadObj;
    },

    deleteLoad: function(index) {
      if (index >= 0 && index < this.loads.length) {
        this.loads.splice(index, 1);
        this.results = null;
        return true;
      }
      return false;
    },

    // Helpers
    getNodeList: function() {
      return Object.values(this.nodes);
    },

    getMemberList: function() {
      return Object.values(this.members);
    },

    getSupportList: function() {
      return Object.values(this.supports);
    }
  };

  // Helper utility to safely convert values to float
  function float(val) {
    const f = parseFloat(val);
    return isNaN(f) ? 0.0 : f;
  }

  // Export globally
  window.FrameModel = FrameModel;
})();
