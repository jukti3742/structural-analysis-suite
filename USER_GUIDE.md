# Apex Structural Analysis Suite - User Guide & Workflows

Welcome to the **Apex Structural Analysis Suite User Guide**. This document provides detailed, step-by-step instructions for all modeling workflows, solvers, post-processing tools, and user interface features. It serves as the official reference manual for the application.

---

## Table of Contents
1. [Interactive Viewport Controls & Selection Tools](#1-interactive-viewport-controls--selection-tools)
2. [Unit Conversion System](#2-unit-conversion-system)
3. [Node Management](#3-node-management)
4. [Beam Creation - Select in Model Mode](#4-beam-creation---select-in-model-mode)
5. [Beam Creation - Dropdown Selection Mode](#5-beam-creation---dropdown-selection-mode)
6. [Material and Section Assignment](#6-material-and-section-assignment)
7. [Boundary Conditions & Supports](#7-boundary-conditions--supports)
8. [Loading Conditions](#8-loading-conditions)
9. [Running Analysis & Solver Operations](#9-running-analysis--solver-operations)
10. [Result Graphs, Tooltips, & Graph Markers](#10-result-graphs-tooltips--graph-markers)
11. [Report Generation & Export](#11-report-generation--export)
12. [Keyboard Shortcuts Quick Reference](#12-keyboard-shortcuts-quick-reference)
13. [Errors, Warnings, & Validations Index](#13-errors-warnings--validations-index)
14. [Operations & CAD Workflows](#14-operations--cad-workflows)

---

## 1. Interactive Viewport Controls & Selection Tools

### Purpose
To navigate the 3D modeling workspace, select structural elements, and switch modeling context.

### Step-by-Step Procedure
1. **Rotate View**: Hold down the **Left Mouse Button** and drag in the 3D canvas viewport.
2. **Pan View**: Hold down the **Right Mouse Button** (or press and hold the **Scroll Wheel**) and drag.
3. **Zoom View**: Scroll the **Mouse Wheel** up to zoom in, scroll down to zoom out.
4. **Active Cursor Selection**: Click any of the cursor buttons in the top-left toolbar:
   - **Node Select Cursor** (Node icon): Highlights and selects nodes in the viewport.
   - **Beam Select Cursor** (Beam icon): Highlights and selects beam elements.
   - **Support Select Cursor** (Support icon): Highlights nodes with boundary conditions.
   - **Load Select Cursor** (Load icon): Highlights nodal or member load meshes.
5. **Multi-Selection**: Press and hold the **Ctrl** key while clicking multiple elements.
6. **Cancel / Clear Selection**: Press the **Escape (Esc)** key to clear all active selections and return to the default state.

### Expected Outcome
The viewport updates smoothly with zoom, pan, and rotation. Selected elements are highlighted in gold, and their detailed properties populate the corresponding panels on the right side.

### Common Mistakes and Warnings
* *Drag vs Click*: Clicking on empty space while drawing or selecting in the model may clear active selections. Press **Esc** to intentionally cancel selections instead.
* *Wrong Active Tool*: Trying to select a beam while the Node Select tool is active will click on the nearest node instead. Confirm the active cursor tool in the top-left toolbar.

### Related Features
* [Select in Model Mode](#4-beam-creation---select-in-model-mode)
* [Escape Key Cancellation](#12-keyboard-shortcuts-quick-reference)

---

## 2. Unit Conversion System

### Purpose
To view and edit the model in different physical units (Metric / Imperial) with automatic conversion and scaling.

### Step-by-Step Procedure
1. Locate the unit selectors in the table column headers within the **Properties / Informations** panel on the right.
2. Select your desired unit from the dropdown:
   - **Lengths / Coordinates**: Choose `m`, `cm`, `mm`, `in`, or `ft`.
   - **Forces / Magnitudes**: Choose `kN`, `N`, `lbf`, `kip`, `kg`, or `MTon`.
3. Select units for result values in the **Result Graph** controls:
   - SFD (Shear Force), AFD (Axial Force), BMD (Bending Moment), and Deflection scales automatically.

### Expected Outcome
The numbers in the tables and viewport labels dynamically update to the new unit scale. Coordinate rounding is kept numerically precise, and calculations remain equivalent regardless of the active unit system.

### Common Mistakes and Warnings
* *Mixed Input Expectations*: Changing units changes the display values of all existing nodes and loads. Verify coordinates in the table after changing units to ensure proper scale.

### Related Features
* [Node Management](#3-node-management)
* [Report Generation](#11-report-generation--export)

---

## 3. Node Management

### Purpose
To add, edit, or delete structural nodes (joints) in the model.

### Prerequisites
* You must be on the **Node** tab of the **Add Input** panel.

### Step-by-Step Procedure
#### Adding a Node
1. Navigate to the **Node** tab.
2. Enter the X, Y, and Z coordinates in the input fields.
3. Click the **Add Node** button (or press **Enter**).
4. The node appears in the 3D viewport and is added to the **Nodes Table** below.

#### Editing a Node
1. Select the node in the 3D viewport, or find its row in the **Nodes Table**.
2. Click directly on any coordinate cell (X, Y, or Z) inside the table.
3. Type the new coordinate value.
4. Press **Enter** or click outside the cell to save.

#### Deleting a Node
1. Find the node row in the **Nodes Table**.
2. Click the red **Delete** button in that row.
3. The node and all connected beams/supports/loads are removed.

### Expected Outcome
Nodes are added/updated instantly in the 3D canvas. All coordinate units scale automatically based on the active unit system.

### Common Mistakes and Warnings
* *Orphan Node deletion*: Deleting a node automatically deletes all beams connected to that node.
* *Invalid coords*: Entering text or non-numeric values in the coordinate table cells displays a red warning and reverts to the original coordinate value.

### Related Features
* [Unit Conversion System](#2-unit-conversion-system)

---

## 4. Beam Creation - Select in Model Mode

### Purpose
To quickly connect nodes in the 3D viewport to create beams using mouse clicks.

### Prerequisites
* At least two distinct nodes must exist in the model.
* The **Beam** tab in the **Add Input** panel must be active.

### Step-by-Step Procedure
1. Set the **Node 1 (N1)** and **Node 2 (N2)** dropdowns to **"Select in Model"** (default).
2. Activate the **Node Select Cursor** from the toolbar.
3. Click the first node in the 3D viewport. The Node 1 field will update with the node ID.
4. Press and hold the **Ctrl** key, then click the second node in the 3D viewport. The Node 2 field will update with the second node ID.
5. Review the assigned Node IDs and releases in the panel, then click the **Add Member** button.
6. The beam is created, dropdowns automatically reset to "Select in Model", and viewport selections clear.

### Expected Outcome
The beam is added connecting the two selected nodes. The viewport node selections revert to the default state.

### Common Mistakes and Warnings
* *Forgetting Ctrl*: Clicking the second node without holding the **Ctrl** key will not clear the current selection. Instead, it displays the warning: `"Please hold the Ctrl key while selecting the second node, or press Esc to cancel the current selection."`
* *Double Click cancellation*: Press **Esc** at any time to abort selection and reset both dropdowns back to `"Select in Model"`.

### Related Features
* [Collinear Overlap Checks](#13-errors-warnings--validations-index)
* [Duplicate Beam Checks](#13-errors-warnings--validations-index)

---

## 5. Beam Creation - Dropdown Selection Mode

### Purpose
To create beams manually by selecting start and end nodes from the dropdown lists.

### Prerequisites
* At least two distinct nodes must exist in the model.

### Step-by-Step Procedure
1. Navigate to the **Beam** tab.
2. Click the **Node 1 (N1)** dropdown and select a node ID (e.g. `N1`).
3. Click the **Node 2 (N2)** dropdown and select a distinct node ID (e.g. `N2`).
4. (Optional) Check the checkboxes for end releases (e.g., `Mx`, `My`, `Mz` to release moments).
5. Click **Add Member**.

### Expected Outcome
A beam is created between the two selected nodes.

### Common Mistakes and Warnings
* *Identical Nodes*: Selecting the same node in both Node 1 and Node 2 fields displays a warning: `"Start Node and End Node cannot be identical."` and aborts creation.

### Related Features
* [Beam Tab - Properties](#13-errors-warnings--validations-index)

---

## 6. Material and Section Assignment

### Purpose
To assign material properties and cross-section profiles to structural beam elements.

### Prerequisites
* At least one beam element must exist in the model.

### Step-by-Step Procedure
1. Navigate to the **Material / Section** tab on the right panel.
2. Select one or more beams:
   - Click them in the 3D viewport (hold **Ctrl** to select multiple).
   - Or click their rows in the properties tables.
3. The selection badge displays the active selection count (e.g. `1 Beam` or `3 Beams`).
4. Select the desired **Material** (e.g. `Steel - E250`) and **Section** (e.g. `IPE 200`) from the dropdown panels.
5. Click the **Assign Properties** button.
6. Alternatively, edit properties directly inside the **Material / Section Table** by clicking and changing the cell dropdowns for any beam.

### Expected Outcome
The selected beams are updated with the new material and section properties. 

### Related Features
* [Material Database](#13-errors-warnings--validations-index)
* [Section Database](#13-errors-warnings--validations-index)

---

## 7. Boundary Conditions & Supports

### Purpose
To apply displacement restraints (supports) to nodes in the structure.

### Prerequisites
* At least one node must exist in the model.

### Step-by-Step Procedure
1. Navigate to the **Support** tab.
2. Click a node in the viewport or select a Node ID from the **Support Node** dropdown.
3. Select a support type preset:
   - **Pinned**: Restrained in translation (Dx, Dy, Dz), free in rotation.
   - **Fixed**: Fully restrained (Dx, Dy, Dz, Rx, Ry, Rz).
   - **Roller-Y**: Restrained in vertical translation (Dy) only.
   - **Custom**: Check individual checkboxes to manually set restraints.
4. Click **Apply Support**.

### Expected Outcome
The support icon (e.g. green pyramid for pinned, green box for fixed) is rendered at the target node in the 3D viewport.

### Related Features
* [Node Management](#3-node-management)

---

## 8. Loading Conditions

### Purpose
To apply structural forces, moments, or distributed loads to the model.

### Prerequisites
* Nodes (for Nodal Loads) or Beams (for Member Loads) must exist in the model.

### Step-by-Step Procedure
1. Navigate to the **Load** tab.
2. Choose the **Load Target**:
   - **Node**: To apply a point force or moment at a joint.
   - **Beam**: To apply point loads, distributed loads (UDL/trapezoidal), or moments along a member length.
3. Configure load parameters:
   - **Direction**: Choose axis (`Fx`, `Fy`, `Fz` for forces; `Mx`, `My`, `Mz` for moments).
   - **Magnitude**: Input load value (negative values act in the opposite axis direction).
   - **Type (for Beams)**: Choose `PointLoad`, `DistributedLoad` (UDL), or `Moment`.
   - **Offsets**: Define starting position (`x1`) and ending position (`x2`) from the start of the beam (in active length units).
4. Click **Apply Load**.

### Expected Outcome
The load is rendered as colored arrow vectors (e.g. red for forces, purple for moments) on the 3D model.

### Related Features
* [Solving Model](#9-running-analysis--solver-operations)

---

## 9. Running Analysis & Solver Operations

### Purpose
To calculate displacements, support reactions, shear force, bending moment, and axial force distributions.

### Prerequisites
* The structure must be statically stable and have at least one restraint and one load applied.

### Step-by-Step Procedure
1. Click the green **Run Analysis** button in the bottom right toolbar.
2. The solver processes the model payload.
3. Upon completion, a success toast appears: `"Analysis completed successfully!"` and results tabs become active.

### Expected Outcome
Displacement and support reaction tables are populated on the right. 2D result diagrams are enabled in the bottom viewport.

### Common Mistakes and Warnings
* *Unstable Structure*: If the structure lacks adequate constraints, the solver will fail and alert: `"Error: Solver encountered an unstable system. Check restraints."`

---

## 10. Result Graphs, Tooltips, & Graph Markers

### Purpose
To visualize shear force, bending moment, axial force, and deflection diagrams.

### Step-by-Step Procedure
1. Click the result toggle buttons below the 3D viewport to change active diagrams:
   - **SFD**: Shear Force Diagram.
   - **BMD**: Bending Moment Diagram.
   - **AFD**: Axial Force Diagram.
   - **Deflection**: Elastic curve deflection diagram.
2. **Hover Tooltips**: Hover your mouse cursor over any diagram line. A tooltip displays the exact value at that coordinate location.
3. **Graph Markers**: Click and drag any of the highlighted peak/critical value markers along the graph to inspect exact values at specific points.

### Expected Outcome
Diagram colors, scales, and markers update automatically. Tooltips follow the mouse pointer and report precise coordinates and result values.

---

## 11. Report Generation & Export

### Purpose
To generate a comprehensive structural calculation report and export it to PDF or print.

### Prerequisites
* A successful analysis run must have been completed.

### Step-by-Step Procedure
1. Click the **Generate Report** button in the bottom-right toolbar.
2. A new browser window opens containing the formatted report sheet.
3. Review tables of inputs, boundary conditions, loading inputs, node displacements, reactions, and diagrams.
4. Press **Ctrl + P** (or click **Print**) to export the report to PDF or send it to a printer.

---

## 12. Keyboard Shortcuts Quick Reference

The following shortcuts are active globally or in target panels:

| Key | Context | Action |
| --- | --- | --- |
| **Escape (Esc)** | 3D Viewport | Aborts current "Select in Model" draw action, clears selected items, and resets dropdowns back to "Select in Model". |
| **Ctrl + Click** | 3D Viewport | Toggle selects multiple nodes or beams. |
| **Enter** | Coord Input fields | Submits coordinates and adds node. |
| **Ctrl + P** | Report Window | Triggers print/PDF export dialog. |

---

## 13. Warnings & Validations Index

Here is a reference list of warning alerts and their resolution steps:

* **"A beam already exists between the selected nodes."**
  - *Meaning*: You are attempting to add a beam where another beam already exists.
  - *Resolution*: Select a different pair of nodes.
* **"The new beam overlaps with an existing beam."**
  - *Meaning*: The proposed beam is collinear with an existing beam and overlaps either partially or fully.
  - *Resolution*: Redraw the beam using nodes that do not cause overlapping member spans.
* **"Please hold the Ctrl key while selecting the second node, or press Esc to cancel."**
  - *Meaning*: You clicked a second node without holding the Ctrl modifier key in drawing mode.
  - *Resolution*: Hold Ctrl and click the second node, or press Esc to start over.
* **"Start Node and End Node cannot be identical."**
  - *Meaning*: A member cannot start and end at the same node.
  - *Resolution*: Choose two distinct node IDs.

---

## 14. Operations & CAD Workflows

### Purpose
To perform advanced geometric transformations on nodes and modify beam topology inside the modeling workspace using a unified, scalable two-window interface.

### The Two-Window Layout
* **Top Window (Fixed Selection)**: Fixed menu showing the list of available CAD operations for the active tab (e.g. Node Operations or Beam Operations). Selecting an operation immediately configures the bottom window.
* **Bottom Window (Operation Parameters)**: Dynamically replaces the Properties/Informations panel. Displays the parameters and inputs specific to the active operation, alongside the **Apply** action button.

### Node Operations
#### 1. Translate
1. Select node(s) in the 3D viewport.
2. In the top window, select **Translate**.
3. In the bottom parameters panel, input the translation offset vector **dx (m)**, **dy (m)**, and **dz (m)**.
4. Set the **Number of Copies** and choose the **Mode**:
   - **Copy Elements**: Spawns translated clones (duplicate coordinates are skipped).
   - **Move Elements**: Relocates original node coordinates.
5. Click **Apply**.

#### 2. Rotate
1. Select node(s) in the 3D viewport.
2. Select **Rotate** in the top window.
3. Input the **Rotation Axis** (X, Y, or Z), rotation **Angle (deg)**, and rotation center coordinates **cx, cy, cz**.
4. Set the copies and select the mode (Copy vs Move).
5. Click **Apply**.

#### 3. Mirror
1. Select node(s) in the 3D viewport.
2. Select **Mirror** in the top window.
3. Choose the **Mirror Plane** (YZ plane, XZ plane, or XY plane) and specify the plane offset coordinate.
4. Set the mode (Copy vs Move) and click **Apply**.

#### 4. Merge
1. Select **Merge** in the top window.
2. Specify the **Merge Tolerance (m)**.
3. Select the target (merge only **Selected Nodes** or **All Nodes**).
4. Click **Apply**. Nodes closer than the tolerance are merged, and member connectivity is updated.

#### 5. Renumber
1. Select **Renumber** in the top window.
2. Specify the **Start Index** and sorting direction (X, Y, or Z).
3. Click **Apply** to sequentially rename all nodes (e.g. `N1`, `N2`...).

#### 6. Delete
1. Select node(s) in the 3D viewport.
2. Select **Delete** in the top window.
3. Check the **Confirm node deletion** box and click the action button to remove the nodes and all connected beams.

---

### Beam Operations
#### 1. Split
1. Select exactly one beam element.
2. Select **Split** in the top window.
3. Choose the split method (Half, Ratio, or Distance) and value.
4. Click **Apply**.

#### 2. Merge
1. Select exactly two adjacent collinear beam elements.
2. Select **Merge** in the top window and click **Merge Beams**. The intermediate connection node is automatically removed if it has no other connectivity.

#### 3. Extend
1. Select exactly one beam element.
2. Select **Extend** in the top window, specify the **Extend Length (m)** and choose which end to extend (Start or End node).
3. Click **Apply**.

#### 4. Trim
1. Select exactly one beam element.
2. Select **Trim** in the top window, specify the trim length, and choose which node end to trim.
3. Click **Apply** (length must be less than member length).

#### 5. Reverse Orientation
1. Select one or more beam elements.
2. Select **Reverse Orientation** in the top window.
3. Click the action button to swap start/end node assignments and reverse active releases.

#### 6. Mirror
1. Select beam element(s).
2. Select **Mirror** in the top window.
3. Select mirror plane, coordinate offset, and mode (Copy vs Move).
4. Click **Apply**.

#### 7. Delete
1. Select beam element(s).
2. Select **Delete** in the top window.
3. Check the confirmation checkbox and click the action button to delete selected members.

