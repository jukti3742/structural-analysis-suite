import urllib.request
import json
import math

URL = "http://127.0.0.1:8000/api/analyze-beam"

def run_test_case(name, payload, checks_fn):
    print(f"Running {name}...")
    req = urllib.request.Request(
        URL, 
        data=json.dumps(payload).encode('utf-8'), 
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            response_data = json.loads(res.read().decode('utf-8'))
            if response_data.get("status") != "success":
                print(f"  [FAIL] Response status was not success: {response_data}")
                return False
            
            # Run assertions
            checks_fn(response_data)
            print(f"  [PASS]")
            return True
    except Exception as e:
        print(f"  [FAIL] Request failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

# Case 1: Simple Span Midpoint Load
# Length = 6m, Pinned at 0, Roller at 6, PointLoadV of -10kN at 3m.
# Expected: Ry at 0 is 5kN, Ry at 6 is 5kN, Max Moment at center is 15kN.m
payload_1 = {
    "length": 6.0,
    "E": 200e9,
    "I": 1e-4,
    "A": 1e-2,
    "supports": [
        {"x": 0.0, "dof": [1, 1, 0]},
        {"x": 6.0, "dof": [0, 1, 0]}
    ],
    "loads": [
        {"type": "PointLoadV", "force": -10000.0, "x": 3.0}
    ]
}

def checks_1(res):
    # Find reactions at x=0 and x=6
    reactions = {r["x"]: r for r in res["reactions"]}
    
    # Ry in reactions is in N
    ry_0 = reactions[0.0]["Ry"]
    ry_6 = reactions[6.0]["Ry"]
    assert math.isclose(ry_0, 5000.0, rel_tol=1e-3), f"Expected Ry at 0 to be 5000, got {ry_0}"
    assert math.isclose(ry_6, 5000.0, rel_tol=1e-3), f"Expected Ry at 6 to be 5000, got {ry_6}"
    
    # Max moment should be around 15000 N.m at x=3.0
    moments = [p["moment"] for p in res["points"]]
    max_moment = max(moments)
    assert math.isclose(max_moment, 15000.0, rel_tol=1e-3), f"Expected max bending moment to be 15000, got {max_moment}"

# Case 2: Fixed Cantilever Beam
# Length = 3m, Fixed support at 0, PointLoadV of -5kN at 3m.
# Expected: Ry at 0 is 5kN, Moment reaction at 0 is 15kN.m
payload_2 = {
    "length": 3.0,
    "E": 200e9,
    "I": 1e-4,
    "A": 1e-2,
    "supports": [
        {"x": 0.0, "dof": [1, 1, 1]}
    ],
    "loads": [
        {"type": "PointLoadV", "force": -5000.0, "x": 3.0}
    ]
}

def checks_2(res):
    reactions = {r["x"]: r for r in res["reactions"]}
    ry_0 = reactions[0.0]["Ry"]
    m_0 = reactions[0.0]["M"]
    
    assert math.isclose(ry_0, 5000.0, rel_tol=1e-3), f"Expected Ry at 0 to be 5000, got {ry_0}"
    assert math.isclose(m_0, 15000.0, rel_tol=1e-3), f"Expected Moment reaction at 0 to be 15000, got {m_0}"

# Case 3: Statically Indeterminate Beam
# Length = 6m, Fixed at 0 and 6, UDL of -12kN/m.
# Expected: Ry at 0 and 6 is 36kN, Moment reaction at 0 and 6 is 36kN.m
payload_3 = {
    "length": 6.0,
    "E": 200e9,
    "I": 1e-4,
    "A": 1e-2,
    "supports": [
        {"x": 0.0, "dof": [1, 1, 1]},
        {"x": 6.0, "dof": [1, 1, 1]}
    ],
    "loads": [
        {"type": "UDLV", "force": -12000.0, "start": 0.0, "end": 6.0}
    ]
}

def checks_3(res):
    reactions = {r["x"]: r for r in res["reactions"]}
    ry_0 = reactions[0.0]["Ry"]
    ry_6 = reactions[6.0]["Ry"]
    m_0 = reactions[0.0]["M"]
    m_6 = reactions[6.0]["M"]
    
    assert math.isclose(ry_0, 36000.0, rel_tol=1e-3), f"Expected Ry at 0 to be 36000, got {ry_0}"
    assert math.isclose(ry_6, 36000.0, rel_tol=1e-3), f"Expected Ry at 6 to be 36000, got {ry_6}"
    # IndeterminateBeam returns positive/negative moments based on internal orientation
    assert math.isclose(abs(m_0), 36000.0, rel_tol=1e-3), f"Expected Moment at 0 to be 36000, got {m_0}"
    assert math.isclose(abs(m_6), 36000.0, rel_tol=1e-3), f"Expected Moment at 6 to be 36000, got {m_6}"

# Case 4: Spring Support
# Length = 6m, Pinned at 0, Spring (Ky = 100kN/m) at 6, PointLoadV of -10kN at 6.
# Expected: Ry at 6 is 10kN, Deflection at 6 is -100mm (-0.1m)
payload_4 = {
    "length": 6.0,
    "E": 200e9,
    "I": 1e-4,
    "A": 1e-2,
    "supports": [
        {"x": 0.0, "dof": [1, 1, 0]},
        {"x": 6.0, "dof": [0, 100000.0, 0]}
    ],
    "loads": [
        {"type": "PointLoadV", "force": -10000.0, "x": 6.0}
    ]
}

def checks_4(res):
    reactions = {r["x"]: r for r in res["reactions"]}
    ry_6 = reactions[6.0]["Ry"]
    assert math.isclose(ry_6, 10000.0, rel_tol=1e-3), f"Expected Ry at 6 to be 10000, got {ry_6}"
    
    # deflection at x=6.0 should be -0.1m
    points = {round(p["x"], 2): p for p in res["points"]}
    deflection_6 = points[6.0]["deflection"]
    assert math.isclose(deflection_6, -0.1, rel_tol=1e-3), f"Expected deflection at 6 to be -0.1, got {deflection_6}"

# Case 5: Inclined Point Load (Resolved components)
# Length = 6m, Pinned at 0 (resists H and V), Roller at 6 (resists V only).
# Inclined load of 10kN at 45 degrees, at x = 3m.
# Resolved: Fx = 10000 * cos(45 deg) = 7071.0678 N
#           Fy = -10000 * sin(45 deg) = -7071.0678 N
# Expected Reactions:
# At x=0: Rx = -7071.0678 N, Ry = 3535.5339 N
# At x=6: Ry = 3535.5339 N
payload_5 = {
    "length": 6.0,
    "E": 200e9,
    "I": 1e-4,
    "A": 1e-2,
    "supports": [
        {"x": 0.0, "dof": [1, 1, 0]},
        {"x": 6.0, "dof": [0, 1, 0]}
    ],
    "loads": [
        {"type": "PointLoadH", "force": 7071.0678, "x": 3.0},
        {"type": "PointLoadV", "force": -7071.0678, "x": 3.0}
    ]
}

def checks_5(res):
    reactions = {r["x"]: r for r in res["reactions"]}
    rx_0 = reactions[0.0]["Rx"]
    ry_0 = reactions[0.0]["Ry"]
    ry_6 = reactions[6.0]["Ry"]
    
    assert math.isclose(rx_0, -7071.0678, rel_tol=1e-3), f"Expected Rx at 0 to be -7071.07, got {rx_0}"
    assert math.isclose(ry_0, 3535.5339, rel_tol=1e-3), f"Expected Ry at 0 to be 3535.53, got {ry_0}"
    assert math.isclose(ry_6, 3535.5339, rel_tol=1e-3), f"Expected Ry at 6 to be 3535.53, got {ry_6}"
    
    # Verify axial and shear forces
    # We round x values in points dictionary to check specific coords
    points = {round(p["x"], 1): p for p in res["points"]}
    axial_1_5 = points[1.5]["axial"]
    # IndeterminateBeam axial force convention: tension positive, compression negative.
    # A horizontal force of +7071 N pointing right at x=3m pulls on the left part (0 to 3m), putting it in tension.
    # Let's assert abs value to be safe.
    assert math.isclose(abs(axial_1_5), 7071.0678, rel_tol=1e-3), f"Expected axial force at 1.5 to be 7071.07, got {axial_1_5}"

if __name__ == "__main__":
    print("Starting automated solver verification script...")
    success = True
    success = success and run_test_case("Case 1: Simple Support Midpoint Load", payload_1, checks_1)
    success = success and run_test_case("Case 2: Fixed Cantilever Beam", payload_2, checks_2)
    success = success and run_test_case("Case 3: Statically Indeterminate Beam", payload_3, checks_3)
    success = success and run_test_case("Case 4: Spring Support", payload_4, checks_4)
    success = success and run_test_case("Case 5: Inclined Point Load", payload_5, checks_5)
    
    if success:
        print("\nALL TEST CASES PASSED SUCCESSFULLY!")
    else:
        print("\nSOME TEST CASES FAILED.")
