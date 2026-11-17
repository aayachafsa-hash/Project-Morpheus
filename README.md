# Morpheus / Aquafish shadow puzzle

Plain HTML, CSS and Three.js ES modules. No build step. To run the prototype and gallery together, open PowerShell in the parent folder, `Projet-Morpheus`, and run:

```powershell
py -m http.server 8001 --bind 127.0.0.1
```

- Prototype at [http://localhost:8001/morpheus-prototype/](http://localhost:8001/morpheus-prototype/)
- Gallery at [http://localhost:8001/shadowmatic-gallery/gallery.html](http://localhost:8001/shadowmatic-gallery/gallery.html)

**Explore Shadowmatic meshes** opens the gallery in a new tab so the puzzle stays open. The gallery can also run on its own. From `shadowmatic-gallery`, run `py -m http.server 8002 --bind 127.0.0.1` and open [http://localhost:8002/gallery.html](http://localhost:8002/gallery.html). Both apps load Three.js from jsDelivr.

Move and rotate Aquafish until its shadow matches the target. Drag to move, scroll for depth, tap **R** to toggle rotation, or press **Z** and drag to change height. Shift-drag tilts, and Escape returns to move mode. Use **W A S D** to move, **Q / E** to rotate around the axis selected with **T**, and hold **R / F** to raise or lower the piece. **Check Shadow** refreshes the live match, **Show solution** demonstrates the target pose, and **Reset** starts a new attempt.

### Aquafish reference and scoring

The target card uses the Fish tile in Shadowmatic's `Textures/mapLevel/sil_atlas.pvr` from the supplied Android package. The original `02. aquaFish.trsc` scene uses `Meshes/aquafish.trmesh`, the source of the Aquafish GLB already used here. Morpheus fits the solution pose to the atlas profile within the projector's lit area. It renders that pose to generate the scoring mask and wall outline. The target card falls back to the rendered silhouette if the image is unavailable.

Shadowmatic's English help describes six proximity lights, a silhouette reveal, and a directional assistant. Its Android library exposes goal, percentage, finishing, and assistance routines. Morpheus implements corresponding feedback using fixed wall-space shadow masks. Intersection-over-union gives half credit to an unmatched pixel next to the other mask. A match of 85% reveals the outline and unlocks the assistant. A settled match of at least 92% for half a second completes the puzzle and lights the sixth dot. These values are Morpheus settings in `src/config.js`.

**Assist** is also available after 30 seconds of active play. Each press moves the piece partway toward the solution, with an angular step of up to 30 degrees and a small translation, subject to the plate bounds. Assisted completion is indicated in the result.

## Modules

- **Person 1** owns `src/scene/`, including rendering, lights, the environment, and model loading.
- **Person 2** owns `src/gameplay/`, including object controls, shadow capture, scoring, and the puzzle poses.
- **Person 3** owns `src/ui/`, including the action buttons, HUD, and styles.
- `src/main.js` starts and connects the three areas. `src/config.js` holds shared settings.
- `src/assets/models/` contains the existing GLB files. The current surface textures are generated in `src/scene/Environment.js`.

## Earlier house study notes

<details>
<summary>Original house study documentation</summary>

Plain HTML, CSS and Three.js ES modules. No build step. Run in this folder:

```powershell
python -m http.server 8001
```

Open http://localhost:8001. Internet is needed for the pinned Three.js CDN and optional Inter font.

## Goal

Combine the real shadows of Body, Roof and Chimney into a recognizable house. The pieces are solid tapered blocks and a triangular roof prism, built by inverse projection from wall-space house polygons. This compensates for the oblique spotlight: the solved arrangement produces straight house walls, a pitched roof and a chimney. MATCH still compares the actual wall-shadow buffer with an achievable target mask; the target appears only in the HUD.

Show house moves the pieces into the solution, using the same damped transforms as manual movement. Reset restores the scrambled starting arrangement.

## Controls

- 1 / 2 / 3, click a mesh, or select its HUD slot.
- Drag: move across the table plane, keeping the chosen height.
- Z: toggle vertical movement; drag upward to raise, downward to lower. Escape returns to normal movement.
- Height slider: independently raise/lower the selected piece above or below the other pieces. Height zero rests on the table. Pieces may overlap, allowing free shadow composition; there is no stacking physics or collision simulation.
- Scroll or Depth slider: move toward/away from the wall.
- R: toggle horizontal rotation. Shift-drag: tilt. X/Y/Z rotation sliders give precise orientation control.
- Pause freezes transforms and disables sliders. Reset resumes and re-enables controls.

Height is Three.js Y (its vertical axis). The user-facing controls call it Height to avoid confusion with depth (Three.js Z).

## Settings

All settings are in CONFIG at the top of main.js. CONFIG.light controls spotlight position, target, color, intensity, angle and penumbra. CONFIG.fill and CONFIG.rim control dim fill. CONFIG.shadow controls map resolution and bias; CONFIG.rendering.exposure controls overall exposure. PCFSoftShadowMap is retained; spotlight penumbra changes the beam edge, not physical shadow softness.

CONFIG.house.polygons defines the house outline in wall coordinates. The geometry and solution are derived from these polygons and the configured light position. Reload after changing these settings. CONFIG.movement.maxHeight sets the height-slider limit. CONFIG.initial defines the starting arrangement, including each piece's clearance above the table.

## Validation for this revision

JavaScript syntax check passed. Numerical checks confirmed that every generated solid vertex projects onto its intended house polygon (maximum error below 2e-15), the solution positions/heights are reachable, and static UI bindings exist. Browser rendering and interaction have not been verified for this revision because browser access was unavailable in the preceding attempt. Earlier prototype browser results do not validate this revision.

</details>
