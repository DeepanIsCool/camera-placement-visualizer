# Pond Camera Auto Placement

Static customer-facing 3D prototype for planning CCTV coverage over an irregular fish pond.

## What It Does

- Uses customer-friendly pond presets, dimensions, and optional CSV/TXT boundary import instead of raw JSON editing.
- Renders a full 3D pond scene with orbit controls, animated water, sun/moon lighting, heatmap layers, poles, cameras, and FOV sectors.
- Supports scale, camera model, resolution, FOV, detection range, pan, tilt, mounting height, and physical arm-length controls.
- Supports a middle-pole camera array, defaulting to five 78-degree CCTV cameras.
- Adds solo perimeter cameras only for the remaining blind areas.
- Allows each recommended camera to be selected and tuned with paired sliders and editable numeric values.
- Includes contextual tooltips on planning controls.
- Computes coverage, blind spots, overlap, pixel density, bird detectability, tracking feasibility, YOLO detectability, distance-to-camera, utilization, redundancy, and coverage-vs-cost.
- Exports deployment configuration as JSON, CSV, and a Markdown report.

## How To Run

Open the folder with any static web server:

```bash
python3 -m http.server 4173
```

Then visit:

```text
http://localhost:4173
```

The current prototype is dependency-free and runs the optimizer in the browser.

## Algorithm

1. Rasterize the pond polygon into sample cells.
2. Resolve the middle pole position from user input or polygon centroid.
3. Evaluate rotations of the pole-mounted 78-degree camera array.
4. Compute visible cells per camera using FOV, range, pan, tilt, height, pixel-density, and line-of-sight checks.
5. Greedily add solo perimeter cameras for remaining uncovered cells.
6. Score results by coverage gain, overlap penalty, tracking feasibility, and detection confidence.

This is designed as a demonstrator. A production version should replace raster cells with exact polygon clipping for reporting-grade blind-spot polygons and add GPS projection support for field coordinates.
