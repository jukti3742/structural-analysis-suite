/**
 * Apex Structural Analysis Suite - Centralized Material Database Registry
 */
(function() {
  window.MaterialDatabase = {
    "Steel – E250": {
      name: "Steel – E250",
      E: 2.0e11,      // N/m² (Elastic Modulus)
      poisson: 0.3,   // Poisson's Ratio
      G: 7.69e10,     // N/m² (Shear Modulus)
      density: 7850,  // kg/m³
      alpha: 1.2e-5,  // 1/°C (Thermal Expansion Coefficient)
      Fy: 2.5e8,      // N/m² (Yield Strength)
      Fu: 4.1e8       // N/m² (Ultimate Strength)
    },
    "Steel – E350": {
      name: "Steel – E350",
      E: 2.0e11,
      poisson: 0.3,
      G: 7.69e10,
      density: 7850,
      alpha: 1.2e-5,
      Fy: 3.5e8,
      Fu: 4.9e8
    },
    "Concrete – M25": {
      name: "Concrete – M25",
      E: 2.5e10,      // N/m² (based on 5000 * sqrt(f_ck))
      poisson: 0.2,
      G: 1.04e10,
      density: 2500,
      alpha: 1.0e-5,
      Fy: 2.5e7,
      Fu: 2.5e7
    },
    "Concrete – M30": {
      name: "Concrete – M30",
      E: 2.7386e10,
      poisson: 0.2,
      G: 1.141e10,
      density: 2500,
      alpha: 1.0e-5,
      Fy: 3.0e7,
      Fu: 3.0e7
    },
    "Concrete – M40": {
      name: "Concrete – M40",
      E: 3.1623e10,
      poisson: 0.2,
      G: 1.3176e10,
      density: 2500,
      alpha: 1.0e-5,
      Fy: 4.0e7,
      Fu: 4.0e7
    },
    "Aluminum – 6061-T6": {
      name: "Aluminum – 6061-T6",
      E: 6.89e10,
      poisson: 0.33,
      G: 2.6e10,
      density: 2700,
      alpha: 2.3e-5,
      Fy: 2.76e8,
      Fu: 3.1e8
    }
  };
})();
