"""
Apex Structural Analysis Suite - Beam Analysis Solver Module
Encapsulates calculations using the indeterminatebeam library.
"""

from indeterminatebeam import Beam, Support, PointLoadV, PointLoadH, PointTorque, UDLV, UDLH, TrapezoidalLoadV, TrapezoidalLoadH

def get_analysis_points(beam, L, supports_json, loads_json):
    """
    Collects key coordinates of interest (supports, load start/ends, point loads)
    and generates a set of sorted, deduplicated evaluation points along the beam length.
    """
    key_coords = {0.0, L}
    for s in supports_json:
        if "x" in s:
            key_coords.add(float(s["x"]))
    for l in loads_json:
        if "x" in l:
            key_coords.add(float(l["x"]))
        if "start" in l:
            key_coords.add(float(l["start"]))
        if "end" in l:
            key_coords.add(float(l["end"]))
            
    # Remove out of bounds key coordinates
    key_coords = {x for x in key_coords if 0.0 <= x <= L}
    
    # Generate points
    x_set = set()
    # 200 regular points
    for i in range(201):
        x_set.add(i * L / 200.0)
        
    # Add key points and their neighbors
    delta = 1e-5
    for x in key_coords:
        x_set.add(x)
        if x - delta > 0.0:
            x_set.add(x - delta)
        if x + delta < L:
            x_set.add(x + delta)
            
    # Sort points
    sorted_x = sorted(list(x_set))
    
    # Remove extremely close duplicates
    filtered_x = []
    for x in sorted_x:
        if not filtered_x or (x - filtered_x[-1]) > 1e-8:
            filtered_x.append(x)
            
    return filtered_x

def analyze_beam(data):
    """
    Parses the beam payload data, executes the structural analysis using indeterminatebeam,
    and returns a structured dictionary containing the reactions and diagrams points.
    """
    L = float(data.get('length', 6.0))
    E = float(data.get('E', 200e9))
    I = float(data.get('I', 1e-4))
    A = float(data.get('A', 1e-2))
    
    beam = Beam(L, E=E, I=I, A=A)
    
    # Add supports
    supports_data = data.get('supports', [])
    for s in supports_data:
        x = float(s.get('x', 0.0))
        dof = s.get('dof', [0, 0, 0])
        
        fixed_tuple = (
            1 if dof[0] == 1 else 0,
            1 if dof[1] == 1 else 0,
            1 if dof[2] == 1 else 0
        )
        kx_val = float(dof[0]) if dof[0] > 1 else None
        ky_val = float(dof[1]) if dof[1] > 1 else None
        
        support_obj = Support(coord=x, fixed=fixed_tuple, kx=kx_val, ky=ky_val)
        beam.add_supports(support_obj)
        
    # Add loads
    loads_data = data.get('loads', [])
    for l in loads_data:
        l_type = l.get('type')
        if l_type == 'PointLoadV':
            force = float(l.get('force', 0.0))
            x = float(l.get('x', 0.0))
            beam.add_loads(PointLoadV(force, x))
        elif l_type == 'PointLoadH':
            force = float(l.get('force', 0.0))
            x = float(l.get('x', 0.0))
            beam.add_loads(PointLoadH(force, x))
        elif l_type == 'PointTorque':
            force = float(l.get('force', 0.0)) # moment
            x = float(l.get('x', 0.0))
            beam.add_loads(PointTorque(force, x))
        elif l_type == 'UDLV':
            force = float(l.get('force', 0.0))
            start = float(l.get('start', 0.0))
            end = float(l.get('end', 0.0))
            if abs(end - start) >= 1e-5:
                beam.add_loads(UDLV(force, (start, end)))
        elif l_type == 'UDLH':
            force = float(l.get('force', 0.0))
            start = float(l.get('start', 0.0))
            end = float(l.get('end', 0.0))
            if abs(end - start) >= 1e-5:
                beam.add_loads(UDLH(force, (start, end)))
        elif l_type == 'TrapezoidalLoadV':
            f1 = float(l.get('f1', 0.0))
            f2 = float(l.get('f2', 0.0))
            start = float(l.get('start', 0.0))
            end = float(l.get('end', 0.0))
            if abs(end - start) >= 1e-5:
                beam.add_loads(TrapezoidalLoadV((f1, f2), (start, end)))
        elif l_type == 'TrapezoidalLoadH':
            f1 = float(l.get('f1', 0.0))
            f2 = float(l.get('f2', 0.0))
            start = float(l.get('start', 0.0))
            end = float(l.get('end', 0.0))
            if abs(end - start) >= 1e-5:
                beam.add_loads(TrapezoidalLoadH((f1, f2), (start, end)))
    
    beam.analyse()
    
    # Gather output reactions
    reactions_res = []
    for s in beam._supports:
        x = float(s._position)
        rx_vals = beam.get_reaction(x)
        reactions_res.append({
            "x": x,
            "Rx": float(rx_vals[0]),
            "Ry": float(rx_vals[1]),
            "M": float(rx_vals[2])
        })
    
    # Sort reactions by coordinate
    reactions_res = sorted(reactions_res, key=lambda r: r["x"])
    
    # Gather diagram data points
    x_coords = get_analysis_points(beam, L, supports_data, loads_data)
    
    points_res = []
    for x in x_coords:
        points_res.append({
            "x": x,
            "shear": float(beam.get_shear_force(x)),
            "moment": float(beam.get_bending_moment(x)),
            "axial": float(beam.get_normal_force(x)),
            "deflection": float(beam.get_deflection(x))
        })
    
    return {
        "status": "success",
        "reactions": reactions_res,
        "points": points_res
    }
