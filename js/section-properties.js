/**
 * Core Engineering Calculations for I-Sections
 * Supports doubly-symmetric, singly-symmetric, and cover-plate reinforced sections.
 * All base calculations are performed in millimeters (mm).
 */

// Unit conversion factors from mm
const UNIT_CONVERSIONS = {
  mm: {
    length: 1,
    area: 1,
    modulus: 1,
    inertia: 1,
    warping: 1,
    label: { length: 'mm', area: 'mm²', modulus: 'mm³', inertia: 'mm⁴', warping: 'mm⁶' }
  },
  cm: {
    length: 0.1,
    area: 0.01,
    modulus: 0.001,
    inertia: 0.0001,
    warping: 0.000001,
    label: { length: 'cm', area: 'cm²', modulus: 'cm³', inertia: 'cm⁴', warping: 'cm⁶' }
  },
  m: {
    length: 0.001,
    area: 0.000001,
    modulus: 0.000000001,
    inertia: 0.000000000001,
    warping: 1e-18,
    label: { length: 'm', area: 'm²', modulus: 'm³', inertia: 'm⁴', warping: 'm⁶' }
  },
  in: {
    length: 1 / 25.4,
    area: 1 / (25.4 * 25.4),
    modulus: 1 / Math.pow(25.4, 3),
    inertia: 1 / Math.pow(25.4, 4),
    warping: 1 / Math.pow(25.4, 6),
    label: { length: 'in', area: 'in²', modulus: 'in³', inertia: 'in⁴', warping: 'in⁶' }
  }
};

/**
 * Validates input parameters for an I-section with cover plates.
 * Returns null if valid, or a string error message if invalid.
 */
function validateISectionParams(params) {
  const { D, btf, ttf, bbf, tbf, tw } = params;
  
  // Critical Errors (which block calculations)
  if (D <= 0 || btf <= 0 || ttf <= 0 || bbf <= 0 || tbf <= 0 || tw <= 0) {
    return { error: "All I-section dimensions must be greater than zero.", warning: null };
  }
  
  if (ttf + tbf >= D) {
    return { error: "Flange thicknesses sum (ttf + tbf) must be less than the total depth (D).", warning: null };
  }

  // Cover plates validations
  if (params.hasTopPlate) {
    if (params.btp <= 0 || params.ttp <= 0) {
      return { error: "Top cover plate dimensions must be greater than zero.", warning: null };
    }
  }

  if (params.hasBottomPlate) {
    if (params.bbp <= 0 || params.tbp <= 0) {
      return { error: "Bottom cover plate dimensions must be greater than zero.", warning: null };
    }
  }

  // Warnings (do not block calculations)
  let warning = null;
  if (tw >= btf || tw >= bbf) {
    warning = "Warning: Web thickness (tw) is greater than or equal to one of the flange widths.";
  }
  
  return { error: null, warning: warning };
}

/**
 * Validates input parameters for a Box-section.
 * Returns null if valid, or a string error message if invalid.
 */
function validateBoxSectionParams(params) {
  const { D, btf, ttf, bbf, tbf, tw } = params;
  
  // Critical Errors (which block calculations)
  if (D <= 0 || btf <= 0 || ttf <= 0 || bbf <= 0 || tbf <= 0 || tw <= 0) {
    return { error: "All Box-section dimensions must be greater than zero.", warning: null };
  }
  
  if (ttf + tbf >= D) {
    return { error: "Wall thicknesses sum (ttf + tbf) must be less than the total depth (D).", warning: null };
  }

  const minWidth = Math.min(btf, bbf);
  if (2 * tw >= minWidth) {
    return { error: "Total web thickness (2 * tw) must be less than the width (b).", warning: null };
  }

  return { error: null, warning: null };
}

/**
 * Computes all section properties for an I-section (optionally reinforced).
 * Input params should be in the selected input unit.
 * Outputs are returned in raw base unit (mm).
 */
function calculateISectionProperties(params, inputUnit = 'mm') {
  // Convert inputs to base unit (mm)
  const toMm = 1 / UNIT_CONVERSIONS[inputUnit].length;
  
  const D = params.D * toMm;
  const btf = params.btf * toMm;
  const ttf = params.ttf * toMm;
  const bbf = params.bbf * toMm;
  const tbf = params.tbf * toMm;
  const tw = params.tw * toMm;
  
  const hasTopPlate = !!params.hasTopPlate;
  const btp = (params.btp || 0) * toMm;
  const ttp = (params.ttp || 0) * toMm;
  
  const hasBottomPlate = !!params.hasBottomPlate;
  const bbp = (params.bbp || 0) * toMm;
  const tbp = (params.tbp || 0) * toMm;

  // Web height in raw I-section
  const dw = D - ttf - tbf;
  
  // Set up vertical shifting (reference y = 0 at the bottom of the composite section)
  const yShift = hasBottomPlate ? tbp : 0;
  const D_total = D + (hasTopPlate ? ttp : 0) + (hasBottomPlate ? tbp : 0);

  // Build the list of active rectangular segments from bottom to top
  const segments = [];

  // 1. Bottom Cover Plate
  if (hasBottomPlate) {
    segments.push({
      y1: 0,
      y2: tbp,
      w: bbp,
      name: "bottom-plate"
    });
  }

  // 2. I-Section Bottom Flange
  segments.push({
    y1: yShift,
    y2: yShift + tbf,
    w: bbf,
    name: "bottom-flange"
  });

  // 3. I-Section Web
  segments.push({
    y1: yShift + tbf,
    y2: yShift + tbf + dw,
    w: tw,
    name: "web"
  });

  // 4. I-Section Top Flange
  segments.push({
    y1: yShift + D - ttf,
    y2: yShift + D,
    w: btf,
    name: "top-flange"
  });

  // 5. Top Cover Plate
  if (hasTopPlate) {
    segments.push({
      y1: yShift + D,
      y2: yShift + D + ttp,
      w: btp,
      name: "top-plate"
    });
  }

  // CALCULATE PROPERTIES using segments
  let A = 0;
  let M_bottom = 0; // First moment of area about y = 0
  let P = 0;        // Total perimeter

  segments.forEach(seg => {
    const h = seg.y2 - seg.y1;
    const segA = h * seg.w;
    const segY = (seg.y1 + seg.y2) / 2;
    
    A += segA;
    M_bottom += segA * segY;
  });

  // Centroid
  const yc = M_bottom / A;
  const yt = D_total - yc;

  // Perimeter
  // Calculate outer boundary length:
  // - Top flange top: btf (or btp if top plate exists)
  // - Top plate top: btp
  // - Bottom flange bottom: bbf (or bbp if bottom plate exists)
  // - Bottom plate bottom: bbp
  // For standard thin/thick sections, a clean way is to sum perimeter contributions of parts 
  // and subtract shared contacts:
  // Shared contacts: 
  // - top plate and top flange contact: 2 * min(btf, btp)
  // - top flange and web contact: 2 * tw
  // - bottom flange and web contact: 2 * tw
  // - bottom flange and bottom plate contact: 2 * min(bbf, bbp)
  // Perimeter = Sum(2*wi + 2*hi) - 2 * Sum(ContactWidth)
  let sumPerims = 0;
  segments.forEach(seg => {
    sumPerims += 2 * (seg.w + (seg.y2 - seg.y1));
  });

  let sumContacts = 0;
  if (hasTopPlate) {
    sumContacts += Math.min(btf, btp);
  }
  sumContacts += tw; // top flange & web
  sumContacts += tw; // bottom flange & web
  if (hasBottomPlate) {
    sumContacts += Math.min(bbf, bbp);
  }

  P = sumPerims - 2 * sumContacts;

  // Moment of Inertia Ixx & Iyy
  let Ixx = 0;
  let Iyy = 0;

  segments.forEach(seg => {
    const h = seg.y2 - seg.y1;
    const segA = h * seg.w;
    const segY = (seg.y1 + seg.y2) / 2;

    // Parallel Axis Theorem for Ixx
    Ixx += (seg.w * Math.pow(h, 3) / 12) + segA * Math.pow(segY - yc, 2);

    // Minor axis Iyy (all segments are centered on x=0)
    Iyy += (h * Math.pow(seg.w, 3) / 12);
  });

  // Elastic Section Moduli
  const Sxt = Ixx / yt;
  const Sxb = Ixx / yc;
  const Sy = Iyy / (Math.max(btf, bbf, btp, bbp) / 2);

  // Radii of Gyration
  const rxx = Math.sqrt(Ixx / A);
  const ryy = Math.sqrt(Iyy / A);

  // Plastic Section Modulus Zxx (Major Axis)
  // 1. Find Plastic Neutral Axis (PNA) where area is halved
  const A_half = A / 2;
  let yp = 0;
  let accumA = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segA = (seg.y2 - seg.y1) * seg.w;
    if (accumA + segA >= A_half) {
      const A_need = A_half - accumA;
      yp = seg.y1 + (A_need / seg.w);
      break;
    }
    accumA += segA;
  }

  // 2. Compute Zxx as the first moment of area about PNA
  let Zxx = 0;
  segments.forEach(seg => {
    // If PNA splits the segment
    if (yp > seg.y1 && yp < seg.y2) {
      const h1 = yp - seg.y1;
      Zxx += seg.w * h1 * (h1 / 2); // below PNA part

      const h2 = seg.y2 - yp;
      Zxx += seg.w * h2 * (h2 / 2); // above PNA part
    } else {
      const h = seg.y2 - seg.y1;
      const segY = (seg.y1 + seg.y2) / 2;
      Zxx += seg.w * h * Math.abs(segY - yp);
    }
  });

  // Plastic Section Modulus Zyy (Minor Axis)
  // Zyy = Sum (h_i * w_i^2 / 4)
  let Zyy = 0;
  segments.forEach(seg => {
    const h = seg.y2 - seg.y1;
    Zyy += (h * Math.pow(seg.w, 2) / 4);
  });

  // Torsional Constant J (open thin-walled approximation)
  // J = Sum (w_i * h_i^3 / 3)
  let J = 0;
  segments.forEach(seg => {
    const h = seg.y2 - seg.y1;
    J += (1 / 3) * seg.w * Math.pow(h, 3);
  });

  // Warping Constant Cw & Shear Center eb, et
  // We model the top flange (including top plate) and bottom flange (including bottom plate)
  // as composite top and bottom flanges.
  const I_flange_top = (ttf * Math.pow(btf, 3) / 12) + (hasTopPlate ? (ttp * Math.pow(btp, 3) / 12) : 0);
  const I_flange_bottom = (tbf * Math.pow(bbf, 3) / 12) + (hasBottomPlate ? (tbp * Math.pow(bbp, 3) / 12) : 0);

  // Compute composite top flange centroid
  const A_tf_comp = (btf * ttf) + (hasTopPlate ? (btp * ttp) : 0);
  const M_tf_comp = (btf * ttf * (yShift + D - ttf / 2)) + (hasTopPlate ? (btp * ttp * (yShift + D + ttp / 2)) : 0);
  const Y_tf_comp = M_tf_comp / A_tf_comp;

  // Compute composite bottom flange centroid
  const A_bf_comp = (bbf * tbf) + (hasBottomPlate ? (bbp * tbp) : 0);
  const M_bf_comp = (bbf * tbf * (yShift + tbf / 2)) + (hasBottomPlate ? (bbp * tbp * (tbp / 2)) : 0);
  const Y_bf_comp = M_bf_comp / A_bf_comp;

  const h0 = Y_tf_comp - Y_bf_comp; // Distance between composite flange centroids

  // Shear center from composite bottom flange centroid
  const eb = h0 * (I_flange_top / (I_flange_top + I_flange_bottom));
  const et = h0 - eb;

  // Warping constant
  const Cw = Math.pow(h0, 2) * (I_flange_top * I_flange_bottom) / (I_flange_top + I_flange_bottom);

  return {
    A,
    P,
    yc,
    yt,
    Ixx,
    Iyy,
    Sxt,
    Sxb,
    Sy,
    rxx,
    ryy,
    yp,
    Zxx,
    Zyy,
    J,
    Cw,
    eb,
    et,
    h0,
    D_total
  };
}

/**
 * Computes all section properties for a closed Box-Section (Rectangular Hollow Section).
 * Input params should be in the selected input unit.
 * Outputs are returned in raw base unit (mm).
 */
function calculateBoxSectionProperties(params, inputUnit = 'mm') {
  // Convert inputs to base unit (mm)
  const toMm = 1 / UNIT_CONVERSIONS[inputUnit].length;
  
  const D = params.D * toMm;
  const btf = params.btf * toMm;
  const ttf = params.ttf * toMm;
  const bbf = params.bbf * toMm;
  const tbf = params.tbf * toMm;
  const tw = params.tw * toMm;
  
  const hasTopPlate = !!params.hasTopPlate;
  const btp = (params.btp || 0) * toMm;
  const ttp = (params.ttp || 0) * toMm;
  
  const hasBottomPlate = !!params.hasBottomPlate;
  const bbp = (params.bbp || 0) * toMm;
  const tbp = (params.tbp || 0) * toMm;

  // Web height in raw Box-section
  const dw = D - ttf - tbf;
  
  // Set up vertical shifting (reference y = 0 at bottom of composite section)
  const yShift = hasBottomPlate ? tbp : 0;
  const D_total = D + (hasTopPlate ? ttp : 0) + (hasBottomPlate ? tbp : 0);

  // Build rectangular segments list (from bottom to top)
  const segments = [];

  // 1. Bottom Cover Plate
  if (hasBottomPlate) {
    segments.push({
      y1: 0,
      y2: tbp,
      w: bbp,
      name: "bottom-plate"
    });
  }

  // 2. Box-Section Bottom Flange
  segments.push({
    y1: yShift,
    y2: yShift + tbf,
    w: bbf,
    name: "bottom-flange"
  });

  // 3. Two side webs (total thickness = 2 * tw)
  segments.push({
    y1: yShift + tbf,
    y2: yShift + tbf + dw,
    w: 2 * tw,
    name: "web"
  });

  // 4. Box-Section Top Flange
  segments.push({
    y1: yShift + D - ttf,
    y2: yShift + D,
    w: btf,
    name: "top-flange"
  });

  // 5. Top Cover Plate
  if (hasTopPlate) {
    segments.push({
      y1: yShift + D,
      y2: yShift + D + ttp,
      w: btp,
      name: "top-plate"
    });
  }

  // AREA AND CENTROID Y (matches segment summation logic)
  let A = 0;
  let M_bottom = 0;

  segments.forEach(seg => {
    const h = seg.y2 - seg.y1;
    const segA = h * seg.w;
    const segY = (seg.y1 + seg.y2) / 2;
    
    A += segA;
    M_bottom += segA * segY;
  });

  const yc = M_bottom / A;
  const yt = D_total - yc;

  // PERIMETER
  // Outer perimeter + Inner perimeter
  let sumPerims = 0;
  if (hasBottomPlate) sumPerims += 2 * (bbp + tbp);
  sumPerims += 2 * (bbf + tbf);
  sumPerims += 2 * (tw + dw); // Left web
  sumPerims += 2 * (tw + dw); // Right web
  sumPerims += 2 * (btf + ttf);
  if (hasTopPlate) sumPerims += 2 * (btp + ttp);

  // Contact widths
  let sumContacts = 0;
  if (hasTopPlate) {
    sumContacts += Math.min(btf, btp);
  }
  sumContacts += 2 * tw; // Top flange & webs
  sumContacts += 2 * tw; // Bottom flange & webs
  if (hasBottomPlate) {
    sumContacts += Math.min(bbf, bbp);
  }

  const P = sumPerims - 2 * sumContacts;

  // MOMENT OF INERTIA Ixx & Iyy
  let Ixx = 0;
  let Iyy = 0;

  segments.forEach(seg => {
    const h = seg.y2 - seg.y1;
    const segA = h * seg.w;
    const segY = (seg.y1 + seg.y2) / 2;
    Ixx += (seg.w * Math.pow(h, 3) / 12) + segA * Math.pow(segY - yc, 2);
  });

  // For Iyy:
  const Iyy_tf = ttf * Math.pow(btf, 3) / 12;
  const Iyy_bf = tbf * Math.pow(bbf, 3) / 12;
  const Iyy_tp = hasTopPlate ? (ttp * Math.pow(btp, 3) / 12) : 0;
  const Iyy_bp = hasBottomPlate ? (tbp * Math.pow(bbp, 3) / 12) : 0;

  const b_w_center = (Math.min(btf, bbf) - tw) / 2;
  const Iyy_webs = 2 * (dw * Math.pow(tw, 3) / 12 + dw * tw * Math.pow(b_w_center, 2));

  Iyy = Iyy_tf + Iyy_bf + Iyy_tp + Iyy_bp + Iyy_webs;

  // Elastic Section Moduli
  const Sxt = Ixx / yt;
  const Sxb = Ixx / yc;
  const Sy = Iyy / (Math.max(btf, bbf, btp, bbp) / 2);

  // Radii of Gyration
  const rxx = Math.sqrt(Ixx / A);
  const ryy = Math.sqrt(Iyy / A);

  // Plastic Section Modulus Zxx (Major Axis)
  const A_half = A / 2;
  let yp = 0;
  let accumA = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segA = (seg.y2 - seg.y1) * seg.w;
    if (accumA + segA >= A_half) {
      const A_need = A_half - accumA;
      yp = seg.y1 + (A_need / seg.w);
      break;
    }
    accumA += segA;
  }

  let Zxx = 0;
  segments.forEach(seg => {
    if (yp > seg.y1 && yp < seg.y2) {
      const h1 = yp - seg.y1;
      Zxx += seg.w * h1 * (h1 / 2);
      const h2 = seg.y2 - yp;
      Zxx += seg.w * h2 * (h2 / 2);
    } else {
      const h = seg.y2 - seg.y1;
      const segY = (seg.y1 + seg.y2) / 2;
      Zxx += seg.w * h * Math.abs(segY - yp);
    }
  });

  // Plastic Section Modulus Zyy (Minor Axis)
  const Zyy_tf = ttf * Math.pow(btf, 2) / 4;
  const Zyy_bf = tbf * Math.pow(bbf, 2) / 4;
  const Zyy_tp = hasTopPlate ? (ttp * Math.pow(btp, 2) / 4) : 0;
  const Zyy_bp = hasBottomPlate ? (tbp * Math.pow(bbp, 2) / 4) : 0;
  const Zyy_webs = dw * tw * (Math.min(btf, bbf) - tw);

  const Zyy = Zyy_tf + Zyy_bf + Zyy_tp + Zyy_bp + Zyy_webs;

  // Torsional Constant J (Bredt's Formula for closed hollow thin-walled sections)
  const bm = Math.min(btf, bbf) - tw;
  const hm = D - (ttf + tbf) / 2;
  const Am = bm * hm;

  const ttf_eff = ttf + (hasTopPlate ? ttp : 0);
  const tbf_eff = tbf + (hasBottomPlate ? tbp : 0);

  const integral = (bm / ttf_eff) + (bm / tbf_eff) + (2 * hm / tw);
  const J = integral > 0 ? (4 * Math.pow(Am, 2) / integral) : 0;

  // Warping Constant Cw (negligible for closed hollow sections)
  const Cw = 0.0;
  const eb = 0.0;
  const et = 0.0;
  const h0 = hm;

  return {
    A,
    P,
    yc,
    yt,
    Ixx,
    Iyy,
    Sxt,
    Sxb,
    Sy,
    rxx,
    ryy,
    yp,
    Zxx,
    Zyy,
    J,
    Cw,
    eb,
    et,
    h0,
    D_total
  };
}

/**
 * Formats a calculated property dictionary into a specified output unit.
 */
function convertProperties(props, outputUnit) {
  const conv = UNIT_CONVERSIONS[outputUnit];
  
  return {
    A: props.A * conv.area,
    P: props.P * conv.length,
    yc: props.yc * conv.length,
    yt: props.yt * conv.length,
    Ixx: props.Ixx * conv.inertia,
    Iyy: props.Iyy * conv.inertia,
    Sxt: props.Sxt * conv.modulus,
    Sxb: props.Sxb * conv.modulus,
    Sy: props.Sy * conv.modulus,
    rxx: props.rxx * conv.length,
    ryy: props.ryy * conv.length,
    yp: props.yp * conv.length,
    Zxx: props.Zxx * conv.modulus,
    Zyy: props.Zyy * conv.modulus,
    J: props.J * conv.inertia,
    Cw: props.Cw * conv.warping,
    eb: props.eb * conv.length,
    et: props.et * conv.length,
    h0: props.h0 * conv.length,
    D_total: props.D_total * conv.length,
    unitLabels: conv.label
  };
}
