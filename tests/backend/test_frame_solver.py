"""
Unit Tests for 3D Frame Solver Module
Validates calculations against analytical mechanical expectations.
"""

import json
from backend.solver.frame_solver import analyze_frame

def test_portal_frame_lateral():
    """
    Portal Frame test: 2D portal with rigid joints and pinned bases under a lateral point load.
    Width: 4m, Height: 3m
    Columns are fixed in global DZ, but pinned in rotation.
    Lateral load of 10kN at top left node.
    """
    payload = {
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "z": 0.0},  # Left base
            {"id": "N2", "x": 0.0, "y": 3.0, "z": 0.0},  # Left top joint
            {"id": "N3", "x": 4.0, "y": 3.0, "z": 0.0},  # Right top joint
            {"id": "N4", "x": 4.0, "y": 0.0, "z": 0.0}   # Right base
        ],
        "members": [
            {
                "id": "Col_Left",
                "startNode": "N1",
                "endNode": "N2",
                "properties": {"E": 200e9, "G": 77e9, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
            },
            {
                "id": "Beam_Top",
                "startNode": "N2",
                "endNode": "N3",
                "properties": {"E": 200e9, "G": 77e9, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
            },
            {
                "id": "Col_Right",
                "startNode": "N4",
                "endNode": "N3",
                "properties": {"E": 200e9, "G": 77e9, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
            }
        ],
        "supports": [
            # Pinned bases (rigid translation, free rotation)
            {"nodeId": "N1", "restraints": [True, True, True, False, False, False]},
            {"nodeId": "N4", "restraints": [True, True, True, False, False, False]}
        ],
        "loads": [
            # 10kN lateral force at N2 in FX
            {"type": "NodalLoad", "nodeId": "N2", "direction": "FX", "force": 10000.0}
        ]
    }
    
    res = analyze_frame(payload)
    assert res["status"] == "success"
    
    # 1. Total horizontal reactions should sum to -10,000 N (opposite of load)
    reactions = {r["nodeId"]: r for r in res["reactions"]}
    r1_fx = reactions["N1"]["FX"]
    r4_fx = reactions["N4"]["FX"]
    
    assert abs(r1_fx + r4_fx + 10000.0) < 1.0
    
    # 2. For symmetric columns under lateral load, horizontal shear is split equally
    assert abs(r1_fx - r4_fx) < 10.0
    
    # 3. Vertical reactions must form a couple to resist the overturning moment (M = 10kN * 3m = 30kNm)
    # R_vertical * width = 30kNm -> R = 30000 / 4 = 7500 N.
    r1_fy = reactions["N1"]["FY"]
    r4_fy = reactions["N4"]["FY"]
    
    assert abs(r1_fy + 7500.0) < 50.0  # (accounting for minor member axial deformations)
    assert abs(r4_fy - 7500.0) < 50.0
    assert abs(r1_fy + r4_fy) < 1.0  # Sum of vertical forces must be zero

def test_continuous_beam():
    """
    Continuous Beam: 2-span beam (length 8m total, middle support at x=4m).
    Uniformly distributed load of 12 kN/m on the entire span.
    Verify three-moment reactions distribution:
    End reactions R1 = R3 = 3/8 wL = 3/8 * 12 * 4 = 18 kN.
    Middle reaction R2 = 1.25 wL = 1.25 * 12 * 4 = 60 kN.
    """
    payload = {
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "z": 0.0},
            {"id": "N2", "x": 4.0, "y": 0.0, "z": 0.0},
            {"id": "N3", "x": 8.0, "y": 0.0, "z": 0.0}
        ],
        "members": [
            {
                "id": "Span1",
                "startNode": "N1",
                "endNode": "N2",
                "properties": {"E": 200e9, "G": 77e9, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
            },
            {
                "id": "Span2",
                "startNode": "N2",
                "endNode": "N3",
                "properties": {"E": 200e9, "G": 77e9, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
            }
        ],
        "supports": [
            # Pinned ends and middle roller, stabilized torsionally and laterally
            {"nodeId": "N1", "restraints": [True, True, True, True, False, False]},
            {"nodeId": "N2", "restraints": [False, True, True, False, False, False]},
            {"nodeId": "N3", "restraints": [False, True, True, False, False, False]}
        ],
        "loads": [
            # w = -12kN/m on both members
            {"type": "MemberDistributedLoad", "memberId": "Span1", "direction": "Fy", "w1": -12000.0, "w2": -12000.0},
            {"type": "MemberDistributedLoad", "memberId": "Span2", "direction": "Fy", "w1": -12000.0, "w2": -12000.0}
        ]
    }
    
    res = analyze_frame(payload)
    assert res["status"] == "success"
    
    reactions = {r["nodeId"]: r for r in res["reactions"]}
    r1_fy = reactions["N1"]["FY"]
    r2_fy = reactions["N2"]["FY"]
    r3_fy = reactions["N3"]["FY"]
    
    # Total load: 12000 * 8 = 96000 N
    # End reactions: 18000 N
    # Mid reaction: 60000 N
    assert abs(r1_fy - 18000.0) < 50.0
    assert abs(r2_fy - 60000.0) < 50.0
    assert abs(r3_fy - 18000.0) < 50.0
    assert abs(r1_fy + r2_fy + r3_fy - 96000.0) < 1.0

def test_material_influence():
    """
    Test that varying material elastic properties affects the frame solver outputs.
    A cantilever beam under point load at tip.
    We compare Steel (E=200GPa) with Concrete (E=25GPa).
    Concrete deflection should be exactly 8.0 times larger than steel deflection.
    """
    payload_base = {
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "z": 0.0},
            {"id": "N2", "x": 0.0, "y": 3.0, "z": 0.0}
        ],
        "supports": [
            {"nodeId": "N1", "restraints": [True, True, True, True, True, True]}
        ],
        "loads": [
            {"type": "NodalLoad", "nodeId": "N2", "direction": "FX", "force": 10000.0}
        ]
    }

    # Steel payload
    payload_steel = dict(payload_base)
    payload_steel["members"] = [{
        "id": "M1",
        "startNode": "N1",
        "endNode": "N2",
        "properties": {"E": 2.0e11, "poisson": 0.3, "density": 7850, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
    }]

    # Concrete payload
    payload_concrete = dict(payload_base)
    payload_concrete["members"] = [{
        "id": "M1",
        "startNode": "N1",
        "endNode": "N2",
        "properties": {"E": 2.5e10, "poisson": 0.2, "density": 2500, "A": 1e-2, "Ixx": 1e-4, "Iyy": 1e-5, "J": 2e-5}
    }]

    res_steel = analyze_frame(payload_steel)
    res_concrete = analyze_frame(payload_concrete)

    assert res_steel["status"] == "success"
    assert res_concrete["status"] == "success"

    disp_steel = {d["nodeId"]: d for d in res_steel["displacements"]}
    disp_concrete = {d["nodeId"]: d for d in res_concrete["displacements"]}

    dx_steel = disp_steel["N2"]["DX"]
    dx_concrete = disp_concrete["N2"]["DX"]

    # Verify that Concrete deflection is exactly 8 times larger (ratio 8.0)
    ratio = dx_concrete / dx_steel
    assert abs(ratio - 8.0) < 1e-2

if __name__ == "__main__":
    test_portal_frame_lateral()
    test_continuous_beam()
    test_material_influence()
    print("All backend frame solver unit tests passed successfully!")
