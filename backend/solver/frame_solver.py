"""
Apex Structural Analysis Suite - 3D Frame Solver Module
Encapsulates structural analysis modeling using the PyNite FEA engine.
"""

import traceback
import numpy as np
from Pynite import FEModel3D

def analyze_frame(data):
    """
    Parses the 3D frame payload data, executes the structural solver using PyNite,
    and returns nodal displacements, support reactions, and member internal force diagrams.
    """
    try:
        model = FEModel3D()
        
        # Load Case and Combo Setup
        case_name = 'Case 1'
        combo_name = 'Combo 1'
        model.add_load_combo(combo_name, {case_name: 1.0})
        
        # 1. Add Nodes
        nodes_data = data.get('nodes', [])
        for n in nodes_data:
            node_id = str(n['id'])
            x = float(n['x'])
            y = float(n['y'])
            z = float(n.get('z', 0.0))
            model.add_node(node_id, x, y, z)
            
        # 2. Add Materials, Sections & Members
        members_data = data.get('members', [])
        for m in members_data:
            m_id = str(m['id'])
            props = m.get('properties', m)
            
            E = float(props.get('E', 200e9))
            poisson = float(props.get('poisson', 0.3))
            G = float(props.get('G', E / (2 * (1 + poisson))))
            density = float(props.get('density', 7850))
            A = float(props.get('A', 1e-2))
            
            # Iz = major bending inertia (matches Ixx in properties catalog)
            # Iy = minor bending inertia (matches Iyy in properties catalog)
            Iz = float(props.get('Iz', props.get('Ixx', 1e-4)))
            Iy = float(props.get('Iy', props.get('Iyy', 1e-5)))
            J = float(props.get('J', 2e-5))
            
            mat_name = f"Mat_{m_id}_{props.get('materialName', 'Steel-E250').replace(' ', '_')}"
            sec_name = f"Sec_{m_id}"
            
            model.add_material(mat_name, E, G, poisson, density)
            model.add_section(sec_name, A, Iy, Iz, J)
            
            start_node = str(m['startNode'])
            end_node = str(m['endNode'])
            rotation = float(m.get('rotation', 0.0))
            
            model.add_member(m_id, start_node, end_node, mat_name, sec_name, rotation=rotation)
            
            # End Releases (Moment/Translation releases)
            releases = m.get('releases')
            if releases:
                model.def_releases(
                    m_id,
                    Dxi=bool(releases.get('Dxi', False)),
                    Dyi=bool(releases.get('Dyi', False)),
                    Dzi=bool(releases.get('Dzi', False)),
                    Rxi=bool(releases.get('Rxi', False)),
                    Ryi=bool(releases.get('Ryi', False)),
                    Rzi=bool(releases.get('Rzi', False)),
                    Dxj=bool(releases.get('Dxj', False)),
                    Dyj=bool(releases.get('Dyj', False)),
                    Dzj=bool(releases.get('Dzj', False)),
                    Rxj=bool(releases.get('Rxj', False)),
                    Ryj=bool(releases.get('Ryj', False)),
                    Rzj=bool(releases.get('Rzj', False))
                )
                
        # 3. Add Supports (Rigid supports or springs)
        supports_data = data.get('supports', [])
        for s in supports_data:
            node_id = str(s['nodeId'])
            restraints = s.get('restraints', [True, True, True, False, False, False])
            
            rigid_restraints = []
            spring_restraints = []
            
            dof_names = ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ']
            for i, r in enumerate(restraints):
                dof_name = dof_names[i]
                if isinstance(r, bool):
                    rigid_restraints.append(r)
                elif isinstance(r, (int, float)) and r > 0.0:
                    # Float value denotes spring support stiffness
                    rigid_restraints.append(False)
                    spring_restraints.append((dof_name, float(r)))
                else:
                    rigid_restraints.append(False)
                    
            model.def_support(node_id, *rigid_restraints)
            
            for dof_name, stiffness in spring_restraints:
                model.def_support_spring(node_id, dof_name, stiffness)
                
        # 4. Add Loads (Nodal point, member point, member distributed)
        loads_data = data.get('loads', [])
        for l in loads_data:
            l_type = l.get('type')
            
            if l_type == 'NodalLoad':
                node_id = str(l['nodeId'])
                direction = str(l['direction'])  # 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'
                force = float(l['force'])
                model.add_node_load(node_id, direction, force, case=case_name)
                
            elif l_type == 'MemberPointLoad':
                member_id = str(l['memberId'])
                direction = str(l['direction'])  # 'Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'
                force = float(l['force'])
                offset = float(l['offset'])
                model.add_member_pt_load(member_id, direction, force, offset, case=case_name)
                
            elif l_type == 'MemberDistributedLoad':
                member_id = str(l['memberId'])
                direction = str(l['direction'])  # 'Fx', 'Fy', 'Fz', 'MX', 'MY', 'MZ'
                w1 = float(l['w1'])
                w2 = float(l['w2'])
                x1 = l.get('x1')
                x2 = l.get('x2')
                x1_val = float(x1) if x1 is not None else None
                x2_val = float(x2) if x2 is not None else None
                model.add_member_dist_load(member_id, direction, w1, w2, x1=x1_val, x2=x2_val, case=case_name)
                
        # 5. Solve FEModel3D
        model.analyze(log=False)
        
        # 6. Extract Nodal Displacements
        displacements_res = []
        for node_id, node in model.nodes.items():
            displacements_res.append({
                "nodeId": node_id,
                "DX": float(node.DX.get(combo_name, 0.0)),
                "DY": float(node.DY.get(combo_name, 0.0)),
                "DZ": float(node.DZ.get(combo_name, 0.0)),
                "RX": float(node.RX.get(combo_name, 0.0)),
                "RY": float(node.RY.get(combo_name, 0.0)),
                "RZ": float(node.RZ.get(combo_name, 0.0))
            })
            
        # 7. Extract Support Reactions
        reactions_res = []
        for node_id, node in model.nodes.items():
            is_supported = (
                node.support_DX or node.support_DY or node.support_DZ or
                node.support_RX or node.support_RY or node.support_RZ or
                node.spring_DX or node.spring_DY or node.spring_DZ or
                node.spring_RX or node.spring_RY or node.spring_RZ
            )
            if is_supported:
                reactions_res.append({
                    "nodeId": node_id,
                    "FX": float(node.RxnFX.get(combo_name, 0.0)),
                    "FY": float(node.RxnFY.get(combo_name, 0.0)),
                    "FZ": float(node.RxnFZ.get(combo_name, 0.0)),
                    "MX": float(node.RxnMX.get(combo_name, 0.0)),
                    "MY": float(node.RxnMY.get(combo_name, 0.0)),
                    "MZ": float(node.RxnMZ.get(combo_name, 0.0))
                })
                
        # 8. Discretize Member Internal Forces for SFD/BMD/AFD/Deflection curves
        member_diagrams_res = []
        for m_id, member in model.members.items():
            L = member.L()
            x_coords = np.linspace(0.0, L, 50)
            
            points = []
            for x in x_coords:
                try:
                    shear_y = float(member.shear('Fy', x, combo_name) or 0.0)
                except Exception:
                    shear_y = 0.0
                    
                try:
                    shear_z = float(member.shear('Fz', x, combo_name) or 0.0)
                except Exception:
                    shear_z = 0.0
                    
                try:
                    moment_y = float(member.moment('My', x, combo_name) or 0.0)
                except Exception:
                    moment_y = 0.0
                    
                try:
                    moment_z = float(member.moment('Mz', x, combo_name) or 0.0)
                except Exception:
                    moment_z = 0.0
                    
                try:
                    defl_y = float(member.deflection('dy', x, combo_name) or 0.0)
                except Exception:
                    defl_y = 0.0
                    
                try:
                    defl_z = float(member.deflection('dz', x, combo_name) or 0.0)
                except Exception:
                    defl_z = 0.0
                    
                try:
                    axial = float(member.axial(x, combo_name) or 0.0)
                except Exception:
                    axial = 0.0
                    
                try:
                    torque = float(member.torque(x, combo_name) or 0.0)
                except Exception:
                    torque = 0.0
                    
                points.append({
                    "x": float(x),
                    "shear_Y": shear_y,
                    "shear_Z": shear_z,
                    "moment_Y": moment_y,
                    "moment_Z": moment_z,
                    "deflection_Y": defl_y,
                    "deflection_Z": defl_z,
                    "axial": axial,
                    "torque": torque
                })
                
            member_diagrams_res.append({
                "memberId": m_id,
                "length": L,
                "points": points
            })
            
        return {
            "status": "success",
            "displacements": displacements_res,
            "reactions": reactions_res,
            "memberForces": member_diagrams_res
        }
        
    except Exception as e:
        traceback.print_exc()
        return {
            "status": "error",
            "message": str(e)
        }
