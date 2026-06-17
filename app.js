const cameraModels = [
  { name: "78 deg CCTV", resolutionW: 3840, resolutionH: 2160, fov: 78, range: 48, cost: 620 },
  { name: "4K wide angle", resolutionW: 3840, resolutionH: 2160, fov: 84, range: 48, cost: 620 },
  { name: "2MP standard", resolutionW: 1920, resolutionH: 1080, fov: 72, range: 36, cost: 310 },
  { name: "8MP telephoto", resolutionW: 3840, resolutionH: 2160, fov: 44, range: 72, cost: 780 },
  { name: "12MP survey", resolutionW: 4000, resolutionH: 3000, fov: 96, range: 55, cost: 980 }
];

const colors = [0x60a5fa, 0x2dd4bf, 0xf59e0b, 0xa78bfa, 0xfb7185, 0x34d399, 0xf97316, 0x22d3ee];
const baseSample = [[6, 12], [18, 7], [39, 8], [51, 15], [63, 10], [82, 13], [95, 27], [89, 45], [97, 62], [80, 76], [58, 72], [42, 82], [21, 75], [12, 57], [3, 43]];

const state = {
  polygon: [],
  importedPolygon: null,
  activeLayer: "coverage",
  result: null,
  scene: null,
  renderer: null,
  camera: null,
  controls: null,
  rootGroup: null,
  heatmapGroup: null,
  sunGroup: null,
  animationId: null,
  selectedCameraIndex: 0,
  waterUniforms: null,
  sunLight: null,
  moonLight: null,
  sunPointLight: null
};

const ids = [
  "canvas-container", "boundaryFile", "themeToggle", "runOptimizer", "importBoundary", "shapePreset",
  "pondLength", "pondWidth", "scaleInput", "candidateSpacing", "centerPoleEnabled", "centerPoleCount",
  "centerPoleFov", "centerPoleX", "centerPoleY", "centerPoleOffset", "centerPoleCost", "cameraModel",
  "resolutionW", "resolutionH", "fovInput", "rangeInput", "minHeight", "maxHeight", "minTilt",
  "maxTilt", "minPan", "maxPan", "birdLength", "birdWidth", "detectPixels", "trackPixels",
  "cameraCount", "budgetInput", "requiredCoverage", "confidenceInput", "statusTitle", "runState",
  "minimumCameras", "coverageMetric", "blindMetric", "overlapMetric", "pixelMetric", "utilizationMetric",
  "cameraSummary", "cameraList", "costSummary", "costList", "exportJson", "exportCsv", "downloadReport",
  "sceneCaption", "selectedCameraName", "manualHeight", "manualYaw", "manualTilt", "manualFov", "manualRange", "manualArmLength",
  "timeOfDay", "timeOfDayLabel", "sunAzimuth", "sunElevation", "moonIntensity"
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function init() {
  cameraModels.forEach((model, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${model.name} - ${model.fov} deg / ${model.range} m`;
    el.cameraModel.appendChild(option);
  });
  applyModel(0);
  attachTooltips();
  bindEvents();
  rebuildPolygon();
  init3D();
  runOptimizer();
  // Expose runOptimizer globally for settings modal
  window.runOptimizer = runOptimizer;
}

function bindEvents() {
  if (el.cameraModel) el.cameraModel.addEventListener("change", () => applyModel(Number(el.cameraModel.value)));
  if (el.importBoundary) el.importBoundary.addEventListener("click", () => el.boundaryFile.click());
  if (el.boundaryFile) el.boundaryFile.addEventListener("change", importBoundaryFile);
  if (el.themeToggle) el.themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light");
    const icon = document.getElementById("themeToggleIcon");
    if (icon) {
      icon.textContent = isLight ? "dark_mode" : "wb_sunny";
    }
    updateSceneEnvironment();
  });
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      state.activeLayer = button.dataset.layer;
      renderHeatmap();
    });
  });
  [el.exportJson, el.exportCsv, el.downloadReport].forEach((button) => { if (button) button.addEventListener("click", handleExport); });
  ["timeOfDay", "sunAzimuth", "sunElevation", "moonIntensity"].forEach((id) => {
    if (el[id]) el[id].addEventListener("input", () => {
      updateSceneEnvironment();
      updateTimeLabel();
    });
  });
  ["manualHeight", "manualYaw", "manualTilt", "manualFov", "manualRange", "manualArmLength"].forEach((id) => {
    if (el[id]) el[id].addEventListener("input", () => applyManualCameraEdit());
  });
  window.addEventListener("resize", resize3D);
}

function applyModel(index) {
  const model = cameraModels[index];
  setValue("resolutionW", model.resolutionW);
  setValue("resolutionH", model.resolutionH);
  setValue("fovInput", model.fov);
  setValue("rangeInput", model.range);
}

function rebuildPolygon() {
  const length = number("pondLength");
  const width = number("pondWidth");
  state.polygon = state.importedPolygon ? fitPolygon(state.importedPolygon, length, width) : presetPolygon(value("shapePreset"), length, width);
}

function init3D() {
  if (!window.THREE) {
    setStatus("Three.js failed to load", "bad");
    return;
  }
  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1200);
  state.camera.position.set(88, 82, 112);
  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1;
  el["canvas-container"].appendChild(state.renderer.domElement);
  state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
  state.controls.target.set(0, 0, 0);
  state.controls.enableDamping = true;
  state.controls.maxPolarAngle = Math.PI * 0.48;
  state.controls.minDistance = 35;
  state.controls.maxDistance = 260;

  state.rootGroup = new THREE.Group();
  state.heatmapGroup = new THREE.Group();
  state.sunGroup = new THREE.Group();
  state.scene.add(state.rootGroup);
  state.scene.add(state.heatmapGroup);
  state.scene.add(state.sunGroup);
  updateSceneEnvironment();
  animate();
}

function updateSceneEnvironment() {
  if (!state.scene) return;
  const lightMode = document.body.classList.contains("light");
  const time = number("timeOfDay");
  const nightFactor = time < 6 || time > 18 ? 1 : 0;
  state.scene.background = createSkyTexture(lightMode, nightFactor);
  state.scene.fog = new THREE.FogExp2(lightMode ? 0xc5dfe8 : nightFactor ? 0x07101f : 0x0b1d33, lightMode ? 0.004 : 0.005);
  state.scene.children.filter((child) => child.userData?.environment).forEach((child) => state.scene.remove(child));
  const ambient = new THREE.AmbientLight(lightMode ? 0xffffff : 0x8aa7c7, lightMode ? 0.78 : nightFactor ? 0.34 : 0.58);
  ambient.userData.environment = true;
  state.sunLight = new THREE.DirectionalLight(0xfff2cf, lightMode ? 1.05 : nightFactor ? 0.12 : 0.9);
  state.sunLight.userData.environment = true;
  state.moonLight = new THREE.DirectionalLight(0xbcd4ff, number("moonIntensity") / 100);
  state.moonLight.userData.environment = true;
  state.scene.add(ambient, state.sunLight, state.moonLight);
  if (!state.sunPointLight) {
    state.sunPointLight = new THREE.PointLight(0xffeecc, 0.55, 600);
    state.sunPointLight.userData.environment = true;
  }
  state.scene.add(state.sunPointLight);
  renderSunMoon();
}

function renderSunMoon() {
  if (!state.sunGroup || !state.sunLight || !state.moonLight) return;
  clearGroup(state.sunGroup);
  const az = degToRad(number("sunAzimuth"));
  const elv = degToRad(number("sunElevation"));
  const radius = 260;
  const sunPos = new THREE.Vector3(
    radius * Math.cos(elv) * Math.sin(az),
    radius * Math.sin(elv),
    radius * Math.cos(elv) * Math.cos(az)
  );
  const moonPos = sunPos.clone().multiplyScalar(-1);
  state.sunLight.position.copy(sunPos);
  state.moonLight.position.copy(moonPos);
  if (state.sunPointLight) state.sunPointLight.position.copy(sunPos);
  if (state.waterUniforms?.uSunDir) state.waterUniforms.uSunDir.value.copy(sunPos).normalize();

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(11, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 0.96, fog: false })
  );
  sun.position.copy(sunPos);
  state.sunGroup.add(sun);

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture("#fff4bd", "#f59e0b"),
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  }));
  sunGlow.position.copy(sunPos);
  sunGlow.scale.set(116, 116, 1);
  state.sunGroup.add(sunGlow);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: clamp(number("moonIntensity") / 85, 0.16, 0.8) })
  );
  moon.position.copy(moonPos);
  state.sunGroup.add(moon);
}

function createSkyTexture(lightMode, nightFactor) {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  if (lightMode) {
    gradient.addColorStop(0, "#dbeafe");
    gradient.addColorStop(0.45, "#bfdbfe");
    gradient.addColorStop(1, "#eff6ff");
  } else if (nightFactor) {
    gradient.addColorStop(0, "#020617");
    gradient.addColorStop(0.45, "#08111f");
    gradient.addColorStop(1, "#102238");
  } else {
    gradient.addColorStop(0, "#1a365d");
    gradient.addColorStop(0.3, "#2d5a87");
    gradient.addColorStop(0.68, "#4a7fb5");
    gradient.addColorStop(1, "#a8d4e6");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 512);
  return new THREE.CanvasTexture(canvas);
}

function radialTexture(inner, outer) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.38, outer);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function animate() {
  state.animationId = requestAnimationFrame(animate);
  if (state.waterUniforms?.uTime) state.waterUniforms.uTime.value += 0.012;
  if (state.controls) state.controls.update();
  if (state.renderer && state.scene && state.camera) state.renderer.render(state.scene, state.camera);
}

function resize3D() {
  if (!state.renderer || !state.camera) return;
  const container = el["canvas-container"];
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height);
}

function showLoading(msg) {
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (overlay) overlay.classList.remove('hidden');
  if (text && msg) text.textContent = msg;
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function runOptimizer() {
  try {
    showLoading('Optimizing camera placement...');
    setStatus("Optimizing...", "warn");
    rebuildPolygon();
    const inputs = getInputs();
    const result = optimizeCameraPlacement(state.polygon, inputs);
    state.result = result;
    renderOutputs(result);
    renderScene(result);
    setStatus(result.coveragePercent >= inputs.requiredCoverage ? "Coverage target met" : "Needs review", result.coveragePercent >= inputs.requiredCoverage ? "ok" : "warn");
    hideLoading();
  } catch (error) {
    console.error(error);
    setStatus(error.message, "bad");
    hideLoading();
  }
}

function getInputs() {
  const model = cameraModels[Number(value("cameraModel"))];
  const minHeight = number("minHeight");
  const maxHeight = number("maxHeight");
  const minTilt = number("minTilt");
  const maxTilt = number("maxTilt");
  const cameraCountRaw = value("cameraCount").trim();
  const budgetRaw = value("budgetInput").trim();
  return {
    modelName: model.name,
    cameraCost: model.cost,
    resolutionW: number("resolutionW"),
    resolutionH: number("resolutionH"),
    fov: number("fovInput"),
    range: number("rangeInput"),
    scale: number("scaleInput"),
    candidateSpacing: number("candidateSpacing"),
    minHeight: Math.min(minHeight, maxHeight),
    maxHeight: Math.max(minHeight, maxHeight),
    minTilt: Math.min(minTilt, maxTilt),
    maxTilt: Math.max(minTilt, maxTilt),
    minPan: normalizeAngle(number("minPan")),
    maxPan: normalizeAngle(number("maxPan")),
    birdLength: number("birdLength"),
    birdWidth: number("birdWidth"),
    detectPixels: number("detectPixels"),
    trackPixels: number("trackPixels"),
    cameraCount: cameraCountRaw ? Math.max(1, Number(cameraCountRaw)) : null,
    budget: budgetRaw ? Math.max(0, Number(budgetRaw)) : null,
    requiredCoverage: number("requiredCoverage"),
    confidenceThreshold: number("confidenceInput") / 100,
    centerPoleEnabled: el.centerPoleEnabled.checked,
    centerPoleX: optionalNumber("centerPoleX"),
    centerPoleY: optionalNumber("centerPoleY"),
    centerPoleCount: Math.max(1, Math.round(number("centerPoleCount"))),
    centerPoleFov: number("centerPoleFov"),
    centerPoleOffset: optionalNumber("centerPoleOffset"),
    centerPoleCost: number("centerPoleCost")
  };
}

function optimizeCameraPlacement(polygon, inputs) {
  const pondArea = Math.abs(polygonArea(polygon)) * inputs.scale * inputs.scale;
  const grid = buildGrid(polygon, inputs);
  if (!grid.cells.length) throw new Error("Pond shape is too small");
  const candidates = samplePerimeter(polygon, inputs.candidateSpacing / inputs.scale);
  const centerArray = buildCenterPoleArray(polygon, grid, inputs);
  const configs = buildCameraConfigs(candidates, polygon, grid, inputs);
  if (!configs.length && !centerArray.length) throw new Error("No visible camera configurations");
  const selected = greedySelect(configs, grid.cells.length, inputs, centerArray);
  const analysis = analyzeSelection(selected, grid, inputs);
  return {
    inputs,
    pondArea,
    polygon,
    grid,
    candidates,
    configsEvaluated: configs.length,
    selected,
    costCurve: buildCostCurve(selected, grid.cells.length, inputs),
    ...analysis
  };
}

function buildGrid(polygon, inputs) {
  const box = bounds(polygon);
  const longest = Math.max(box.maxX - box.minX, box.maxY - box.minY) * inputs.scale;
  const stepWorld = Math.max(1.2 / inputs.scale, longest / 58 / inputs.scale);
  const cells = [];
  for (let y = box.minY; y <= box.maxY; y += stepWorld) {
    for (let x = box.minX; x <= box.maxX; x += stepWorld) {
      const point = [x + stepWorld / 2, y + stepWorld / 2];
      if (pointInPolygon(point, polygon)) cells.push({ point, area: stepWorld * stepWorld * inputs.scale * inputs.scale });
    }
  }
  return { cells, stepWorld, box };
}

function buildCameraConfigs(candidates, polygon, grid, inputs) {
  const headings = headingSamples(inputs.minPan, inputs.maxPan, 15);
  const heights = uniqueNumbers([inputs.minHeight, (inputs.minHeight + inputs.maxHeight) / 2, inputs.maxHeight]);
  const pitches = rangeSamples(inputs.minTilt, inputs.maxTilt, 8);
  const configs = [];
  candidates.forEach((position, positionIndex) => {
    headings.forEach((heading) => {
      heights.forEach((height) => {
        pitches.forEach((pitch) => {
          const config = evaluateCameraConfig({
            id: configs.length + 1, position, positionIndex, heading, height, pitch,
            fov: inputs.fov, range: inputs.range, cost: inputs.cameraCost, source: "Solo",
            polygon, grid, inputs
          });
          if (config) configs.push(config);
        });
      });
    });
  });
  configs.sort((a, b) => b.scoreBase - a.scoreBase || b.avgPixels - a.avgPixels);
  return configs.slice(0, 9000);
}

function buildCenterPoleArray(polygon, grid, inputs) {
  if (!inputs.centerPoleEnabled) return [];
  const center = resolveCenterPolePosition(polygon, grid, inputs);
  if (!pointInPolygon(center, polygon)) throw new Error("Middle pole must sit inside the pond plan");
  const heights = uniqueNumbers([inputs.minHeight, (inputs.minHeight + inputs.maxHeight) / 2, inputs.maxHeight]);
  const pitches = rangeSamples(inputs.minTilt, inputs.maxTilt, 8);
  const spacing = 360 / inputs.centerPoleCount;
  const offsets = inputs.centerPoleOffset == null ? rangeSamples(0, Math.max(0, spacing - 1), 5) : [normalizeAngle(inputs.centerPoleOffset)];
  let bestArray = [];
  let bestScore = -Infinity;
  offsets.forEach((offset) => {
    heights.forEach((height) => {
      const array = [];
      for (let i = 0; i < inputs.centerPoleCount; i += 1) {
        const heading = normalizeAngle(offset + i * spacing);
        let bestForHeading = null;
        pitches.forEach((pitch) => {
          const config = evaluateCameraConfig({
            id: i + 1, position: center, positionIndex: `center-${i}`, heading, height, pitch,
            fov: inputs.centerPoleFov, range: inputs.range, cost: inputs.centerPoleCost, source: "Pole array",
            polygon, grid, inputs
          });
          if (config && (!bestForHeading || config.scoreBase > bestForHeading.scoreBase)) bestForHeading = config;
        });
        if (bestForHeading) array.push(bestForHeading);
      }
      const score = unionCount(array, grid.cells.length) + array.reduce((sum, camera) => sum + camera.avgPixels * 0.03, 0);
      if (array.length && score > bestScore) {
        bestScore = score;
        bestArray = array;
      }
    });
  });
  return bestArray;
}

function evaluateCameraConfig(options) {
  const { id, position, positionIndex, heading, height, pitch, fov, range, cost, source, polygon, grid, inputs } = options;
  const verticalFov = clamp(fov * 0.62, 24, 58);
  const covered = [];
  const pixels = [];
  const distances = [];
  let pixelSum = 0;
  let trackingCount = 0;
  let confidenceSum = 0;
  let geometricCount = 0;
  for (let i = 0; i < grid.cells.length; i += 1) {
    const cell = grid.cells[i];
    const groundDistance = dist(position, cell.point) * inputs.scale;
    if (groundDistance > range || groundDistance < 0.25) continue;
    if (angleDiff(angleDeg(position, cell.point), heading) > fov / 2) continue;
    if (!lineOfSight(position, cell.point, polygon)) continue;
    const pitchToCell = radToDeg(Math.atan2(height, Math.max(groundDistance, 0.25)));
    if (pitchToCell < inputs.minTilt || pitchToCell > inputs.maxTilt) continue;
    if (Math.abs(pitchToCell - pitch) > verticalFov / 2) continue;
    geometricCount += 1;
    const lineDistance = Math.hypot(groundDistance, height);
    const px = targetPixels(lineDistance, inputs, fov);
    const confidence = clamp(px / inputs.detectPixels, 0, 1);
    if (confidence >= inputs.confidenceThreshold) {
      covered.push(i);
      pixels.push(px);
      distances.push(lineDistance);
      pixelSum += px;
      confidenceSum += confidence;
      if (px >= inputs.trackPixels) trackingCount += 1;
    }
  }
  if (!covered.length) return null;
  return {
    id, position, positionIndex, heading, height, pitch, fov, range, cost, source,
    covered: Int32Array.from(covered),
    pixels,
    distances,
    scoreBase: covered.length,
    geometricCount,
    trackingRatio: trackingCount / covered.length,
    avgPixels: pixelSum / covered.length,
    avgConfidence: confidenceSum / covered.length
  };
}

function greedySelect(configs, cellCount, inputs, initialSelected = []) {
  const committedCost = initialSelected.reduce((sum, camera) => sum + camera.cost, 0);
  const maxByBudget = inputs.budget ? Math.max(0, Math.floor((inputs.budget - committedCost) / inputs.cameraCost)) : 12;
  const limit = inputs.cameraCount ? Math.max(0, inputs.cameraCount - initialSelected.length) : Math.min(12, maxByBudget);
  const coveredCounts = new Uint16Array(cellCount);
  const usedPositions = new Set();
  const selected = [];
  let coveredCells = 0;

  initialSelected.forEach((camera) => {
    let newCount = 0;
    let overlap = 0;
    for (const index of camera.covered) {
      if (coveredCounts[index] === 0) {
        coveredCells += 1;
        newCount += 1;
      } else {
        overlap += 1;
      }
      coveredCounts[index] += 1;
    }
    selected.push({ ...camera, newCellsAtSelection: newCount, overlapAtSelection: overlap });
  });

  for (let round = 0; round < limit; round += 1) {
    let best = null;
    let bestScore = -Infinity;
    let bestNewCount = 0;
    let bestOverlap = 0;
    for (const config of configs) {
      if (usedPositions.has(config.positionIndex)) continue;
      let newCount = 0;
      let overlap = 0;
      for (const index of config.covered) {
        if (coveredCounts[index] === 0) newCount += 1;
        else overlap += 1;
      }
      if (newCount === 0 && round > 0) continue;
      const score = newCount + config.trackingRatio * 18 + config.avgConfidence * 12 - overlap * 0.22;
      if (score > bestScore) {
        best = config;
        bestScore = score;
        bestNewCount = newCount;
        bestOverlap = overlap;
      }
    }
    if (!best) break;
    usedPositions.add(best.positionIndex);
    for (const index of best.covered) {
      if (coveredCounts[index] === 0) coveredCells += 1;
      coveredCounts[index] += 1;
    }
    selected.push({ ...best, newCellsAtSelection: bestNewCount, overlapAtSelection: bestOverlap });
    if (!inputs.cameraCount && coveredCells / cellCount >= inputs.requiredCoverage / 100) break;
  }
  return selected;
}

function analyzeSelection(selected, grid, inputs) {
  const cellCount = grid.cells.length;
  const coverageCounts = new Uint16Array(cellCount);
  const maxPixels = new Float32Array(cellCount);
  const minDistance = new Float32Array(cellCount);
  minDistance.fill(Number.POSITIVE_INFINITY);
  selected.forEach((camera) => {
    camera.covered.forEach((cellIndex, localIndex) => {
      coverageCounts[cellIndex] += 1;
      maxPixels[cellIndex] = Math.max(maxPixels[cellIndex], camera.pixels[localIndex]);
      minDistance[cellIndex] = Math.min(minDistance[cellIndex], camera.distances[localIndex]);
    });
  });
  let covered = 0, overlap = 0, pixelSum = 0, pixelCells = 0, tracking = 0, yolo = 0, detectability = 0, distanceSum = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if (coverageCounts[i] > 0) {
      covered += 1;
      pixelSum += maxPixels[i];
      pixelCells += 1;
      distanceSum += minDistance[i];
      if (coverageCounts[i] > 1) overlap += 1;
      if (maxPixels[i] >= inputs.trackPixels) tracking += 1;
      if (maxPixels[i] >= inputs.detectPixels * inputs.confidenceThreshold) yolo += 1;
      detectability += clamp(maxPixels[i] / inputs.detectPixels, 0, 1);
    }
  }
  const utilization = selected.length ? selected.reduce((sum, camera) => sum + camera.newCellsAtSelection / Math.max(camera.covered.length, 1), 0) / selected.length : 0;
  const redundant = selected.map((camera, index) => {
    const counts = new Uint16Array(coverageCounts);
    for (const cellIndex of camera.covered) counts[cellIndex] -= 1;
    let coveredWithout = 0;
    for (const count of counts) if (count > 0) coveredWithout += 1;
    return { cameraId: index + 1, redundant: (coveredWithout / cellCount) * 100 >= inputs.requiredCoverage };
  });
  const blindCells = [];
  const overlapCells = [];
  for (let i = 0; i < cellCount; i += 1) {
    if (coverageCounts[i] === 0) blindCells.push(i);
    if (coverageCounts[i] > 1) overlapCells.push(i);
  }
  selected.forEach((camera, index) => {
    camera.deploymentId = `CAM-${String(index + 1).padStart(2, "0")}`;
    camera.utilization = camera.newCellsAtSelection / Math.max(camera.covered.length, 1);
    camera.redundant = redundant[index].redundant;
  });
  return {
    coverageCounts, maxPixels, minDistance, blindCells, overlapCells,
    coveragePercent: (covered / cellCount) * 100,
    overlapPercent: (overlap / cellCount) * 100,
    blindPercent: ((cellCount - covered) / cellCount) * 100,
    avgPixels: pixelCells ? pixelSum / pixelCells : 0,
    avgDistance: pixelCells ? distanceSum / pixelCells : 0,
    trackingPercent: (tracking / cellCount) * 100,
    yoloPercent: (yolo / cellCount) * 100,
    detectabilityPercent: (detectability / cellCount) * 100,
    utilizationScore: utilization * 100,
    minimumCamerasRequired: selected.length,
    redundant
  };
}

function buildCostCurve(selected, cellCount, inputs) {
  const coverageCounts = new Uint16Array(cellCount);
  let covered = 0;
  let cost = 0;
  return selected.map((camera, index) => {
    cost += camera.cost || inputs.cameraCost;
    for (const cellIndex of camera.covered) {
      if (coverageCounts[cellIndex] === 0) covered += 1;
      coverageCounts[cellIndex] += 1;
    }
    return { cameras: index + 1, cost, coverage: (covered / cellCount) * 100, marginalCoverage: (camera.newCellsAtSelection / cellCount) * 100 };
  });
}

function renderScene(result) {
  if (!state.rootGroup) return;
  clearGroup(state.rootGroup);
  renderPond(result);
  renderHeatmap();
  renderCameras(result);
  el.sceneCaption.textContent = `${result.selected.length} cameras · ${pct(result.coveragePercent)} coverage · ${result.configsEvaluated.toLocaleString()} configurations`;
}

function renderPond(result) {
  const shape = new THREE.Shape();
  shape.moveTo(result.polygon[0][0], result.polygon[0][1]);
  for (let i = 1; i < result.polygon.length; i++) {
    shape.lineTo(result.polygon[i][0], result.polygon[i][1]);
  }
  shape.closePath();
  const pondGeo = new THREE.ShapeGeometry(shape);

  const pondMesh = new THREE.Mesh(pondGeo, createWaterMaterial());
  pondMesh.rotation.x = -Math.PI / 2;
  pondMesh.position.y = 0.01;
  state.rootGroup.add(pondMesh);

  const linePoints = result.polygon.concat([result.polygon[0]]).map((point) => new THREE.Vector3(point[0], 0.22, -point[1]));
  const boundary = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({ color: 0xbae6fd, linewidth: 2, transparent: true, opacity: 0.9 })
  );
  state.rootGroup.add(boundary);

  const box = bounds(result.polygon);
  const pad = 38;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry((box.maxX - box.minX) + pad * 2, (box.maxY - box.minY) + pad * 2, 40, 40),
    new THREE.MeshPhongMaterial({ color: document.body.classList.contains("light") ? 0xc8e6c9 : 0x1b3320, transparent: true, opacity: 0.65 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((box.minX + box.maxX) / 2, -0.035, -(box.minY + box.maxY) / 2);
  state.rootGroup.add(ground);

  const grid = new THREE.GridHelper(Math.max(box.maxX - box.minX, box.maxY - box.minY) + pad, 24, 0x3b82f6, 0x334155);
  grid.position.set((box.minX + box.maxX) / 2, 0, -(box.minY + box.maxY) / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  state.rootGroup.add(grid);
}

function createWaterMaterial() {
  state.waterUniforms = {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x0c4a6e) },
    uSurfaceColor: { value: new THREE.Color(0x2997c7) },
    uFoamColor: { value: new THREE.Color(0x7dd3fc) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() }
  };
  return new THREE.ShaderMaterial({
    uniforms: state.waterUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeepColor;
      uniform vec3 uSurfaceColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;

      float getElevation(vec2 pos, float t) {
        float w = 0.0;
        w += sin(pos.x * 0.14 + t * 0.6) * 0.4;
        w += sin(pos.y * 0.12 + t * 0.45) * 0.3;
        w += sin((pos.x + pos.y) * 0.08 + t * 0.8) * 0.25;
        w += sin((pos.x - pos.y * 0.7) * 0.22 + t * 1.1) * 0.2;
        w += sin(pos.x * 0.4 + pos.y * 0.25 + t * 1.4) * 0.12;
        w += sin(pos.y * 0.5 - pos.x * 0.15 + t * 0.35) * 0.15;
        return w * 0.6;
      }

      vec3 getWaterNormal(vec2 pos, float t) {
        float dfdx = 0.0;
        float dfdz = 0.0;

        // Wave 1
        float a1 = 0.4; vec2 k1 = vec2(0.14, 0.0); float s1 = 0.6;
        float angle1 = pos.x * k1.x + t * s1;
        dfdx += a1 * k1.x * cos(angle1);

        // Wave 2
        float a2 = 0.3; vec2 k2 = vec2(0.0, 0.12); float s2 = 0.45;
        float angle2 = pos.y * k2.y + t * s2;
        dfdz += a2 * k2.y * cos(angle2);

        // Wave 3
        float a3 = 0.25; vec2 k3 = vec2(0.08, 0.08); float s3 = 0.8;
        float angle3 = (pos.x + pos.y) * k3.x + t * s3;
        dfdx += a3 * k3.x * cos(angle3);
        dfdz += a3 * k3.y * cos(angle3);

        // Wave 4
        float a4 = 0.2; vec2 k4 = vec2(0.22, -0.154); float s4 = 1.1;
        float angle4 = (pos.x - pos.y * 0.7) * 0.22 + t * s4;
        dfdx += a4 * 0.22 * cos(angle4);
        dfdz += a4 * (-0.154) * cos(angle4);

        // Wave 5
        float a5 = 0.12; vec2 k5 = vec2(0.4, 0.25); float s5 = 1.4;
        float angle5 = pos.x * k5.x + pos.y * k5.y + t * s5;
        dfdx += a5 * k5.x * cos(angle5);
        dfdz += a5 * k5.y * cos(angle5);

        // Wave 6
        float a6 = 0.15; vec2 k6 = vec2(-0.15, 0.5); float s6 = 0.35;
        float angle6 = pos.y * k6.y - pos.x * 0.15 + t * s6;
        dfdx += a6 * (-0.15) * cos(angle6);
        dfdz += a6 * k6.y * cos(angle6);

        dfdx *= 0.6;
        dfdz *= 0.6;

        return normalize(vec3(-dfdx, 1.0, -dfdz));
      }

      void main() {
        vec2 uv = vWorldPos.xz;
        float elevation = getElevation(uv, uTime);

        vec3 N = getWaterNormal(uv, uTime);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(vViewDir);

        float depth = smoothstep(-0.4, 0.8, elevation);
        vec3 color = mix(uDeepColor, uSurfaceColor, depth);

        // Diffuse
        float diff = max(dot(N, L), 0.0);
        color *= 0.45 + 0.55 * diff;

        // Specular
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 120.0);
        color += vec3(1.0, 0.97, 0.9) * spec * 0.75;

        // Fresnel
        float fresnel = pow(1.0 - abs(dot(N, V)), 2.5);
        color += vec3(0.15, 0.35, 0.5) * fresnel * 0.3;

        // Foam
        float foam = smoothstep(0.3, 0.6, elevation);
        color = mix(color, uFoamColor, foam * 0.35);

        // Caustics
        float shimmer = sin(uv.x * 0.4 + uTime * 2.0) * sin(uv.y * 0.4 + uTime * 1.7);
        color += vec3(0.1, 0.22, 0.35) * shimmer * 0.05;

        // Grid
        float gridX = abs(fract(vWorldPos.x / 8.0 + 0.5) - 0.5);
        float gridZ = abs(fract(vWorldPos.z / 8.0 + 0.5) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, 0.025, min(gridX, gridZ));
        color = mix(color, vec3(0.5, 0.7, 0.85), gridLine * 0.1);

        gl_FragColor = vec4(color, 0.9);
      }
    `
  });
}

function renderHeatmap() {
  if (!state.heatmapGroup || !state.result) return;
  clearGroup(state.heatmapGroup);
  const result = state.result;
  const maxPixel = Math.max(1, ...Array.from(result.maxPixels));
  const finiteDistances = Array.from(result.minDistance).filter(Number.isFinite);
  const maxDistance = Math.max(1, ...finiteDistances);
  const size = result.grid.stepWorld * 0.52;
  result.grid.cells.forEach((cell, index) => {
    const material = new THREE.MeshBasicMaterial({ color: cellColor(result, index, maxPixel, maxDistance), transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(cell.point[0], 0.08, -cell.point[1]);
    state.heatmapGroup.add(tile);
  });
}

function renderCameras(result) {
  const polePositions = new Set();
  result.selected.forEach((camera, index) => {
    const color = colors[index % colors.length];
    const colorHex = new THREE.Color(color);
    const selected = index === state.selectedCameraIndex;
    const world = toWorld(camera.position, camera.height);
    const forward3D = cameraForward(camera.heading, camera.pitch);
    const headingDir = headingVector(camera.heading);
    const armLength = camera.armLength || 1.8;

    // ── POLE (with mounting plate) ──
    const poleKey = `${round(camera.position[0], 2)},${round(camera.position[1], 2)}`;
    if (!polePositions.has(poleKey)) {
      polePositions.add(poleKey);
      const poleGroup = new THREE.Group();
      
      // Main pole column
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.3, camera.height, 20),
        new THREE.MeshPhongMaterial({ color: 0x64748b, shininess: 40 })
      );
      pole.position.y = camera.height / 2;
      poleGroup.add(pole);
      
      // Base plate
      const basePlate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, 0.15, 24),
        new THREE.MeshPhongMaterial({ color: 0x475569, shininess: 50 })
      );
      basePlate.position.y = 0.08;
      poleGroup.add(basePlate);
      
      // Top mounting disc
      const topDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.28, 0.18, 24),
        new THREE.MeshPhongMaterial({ color: 0x475569, shininess: 60 })
      );
      topDisc.position.y = camera.height - 0.09;
      poleGroup.add(topDisc);
      
      poleGroup.position.set(camera.position[0], 0, -camera.position[1]);
      state.rootGroup.add(poleGroup);
    }

    // ── CAMERA GROUP ──
    const camGroup = new THREE.Group();
    camGroup.position.copy(world);
    camGroup.userData.cameraIndex = index;

    // Mounting base (sits on pole top)
    const mountBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 0.25, 20),
      new THREE.MeshPhongMaterial({ color: 0x334155, shininess: 55 })
    );
    mountBase.position.y = -0.05;
    camGroup.add(mountBase);

    // Arm (L-bracket from pole to housing)
    const armGeo = new THREE.BoxGeometry(0.2, 0.16, armLength);
    const armMesh = new THREE.Mesh(armGeo, new THREE.MeshPhongMaterial({ color: 0x64748b, shininess: 50 }));
    armMesh.position.z = -armLength * 0.4;
    armMesh.position.y = 0.1;
    camGroup.add(armMesh);

    // Vertical bracket connecting arm to housing
    const vertBracket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16),
      new THREE.MeshPhongMaterial({ color: 0x475569, shininess: 50 })
    );
    vertBracket.position.set(0, 0.35, -armLength * 0.75);
    camGroup.add(vertBracket);

    // ── CAMERA HOUSING (domed cylinder, like real CCTV) ──
    const housingGroup = new THREE.Group();
    housingGroup.position.set(0, 0.5, -armLength * 0.75);
    
    // Rotate camGroup horizontally (yaw/heading)
    camGroup.rotation.y = degToRad(camera.heading) - Math.PI / 2;
    // Rotate housingGroup vertically (pitch/tilt)
    housingGroup.rotation.x = degToRad(camera.pitch);
    
    // Main body (rounded cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.55, 1.6, 32);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, emissive: colorHex, emissiveIntensity: selected ? 0.15 : 0.04, shininess: 80 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    housingGroup.add(body);
    
    // Colored ring for identification
    const ringGeo = new THREE.TorusGeometry(0.52, 0.06, 16, 32);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshPhongMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.3, shininess: 90 }));
    ring.position.z = -0.4;
    housingGroup.add(ring);
    
    // Lens barrel
    const lensGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.5, 32);
    const lens = new THREE.Mesh(lensGeo, new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 140 }));
    lens.position.z = -1.0;
    lens.rotation.x = Math.PI / 2;
    housingGroup.add(lens);
    
    // Lens glass
    const glassGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 32);
    const glass = new THREE.Mesh(glassGeo, new THREE.MeshPhongMaterial({ color: 0x334155, emissive: 0x93c5fd, emissiveIntensity: 0.4, shininess: 200, transparent: true, opacity: 0.85 }));
    glass.position.z = -1.26;
    glass.rotation.x = Math.PI / 2;
    housingGroup.add(glass);
    
    // Sun shield / hood
    const hoodGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.35, 24, 1, true);
    const hood = new THREE.Mesh(hoodGeo, new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 60, side: THREE.DoubleSide }));
    hood.position.z = -0.6;
    hood.rotation.x = Math.PI / 2;
    housingGroup.add(hood);
    
    camGroup.add(housingGroup);

    // ── LABEL ──
    const label = makeLabel(String(index + 1), color);
    label.position.set(0, 2.2, 0);
    camGroup.add(label);
    
    state.rootGroup.add(camGroup);

    // ── FRUSTUM ──
    const sector = createSectorMesh(camera, color);
    state.rootGroup.add(sector);
  });
}

function createSectorMesh(camera, color) {
  const group = new THREE.Group();
  const colorObj = new THREE.Color(color);

  const origin = toWorld(camera.position, camera.height);
  const forward = cameraForward(camera.heading, camera.pitch);
  const right = cameraRight(camera.heading);
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const farCenter = origin.clone().add(forward.clone().multiplyScalar(camera.range));
  const hFovRad = degToRad(camera.fov);
  const vFovRad = degToRad(clamp(camera.fov * 0.62, 24, 58));
  const halfW = camera.range * Math.tan(hFovRad / 2);
  const halfH = camera.range * Math.tan(vFovRad / 2);
  const corners = [
    farCenter.clone().add(right.clone().multiplyScalar(halfW)).add(up.clone().multiplyScalar(halfH)),
    farCenter.clone().add(right.clone().multiplyScalar(-halfW)).add(up.clone().multiplyScalar(halfH)),
    farCenter.clone().add(right.clone().multiplyScalar(-halfW)).add(up.clone().multiplyScalar(-halfH)),
    farCenter.clone().add(right.clone().multiplyScalar(halfW)).add(up.clone().multiplyScalar(-halfH))
  ];

  // Wireframe edges
  const linePositions = [
    origin, corners[0], origin, corners[1], origin, corners[2], origin, corners[3],
    corners[0], corners[1], corners[1], corners[2], corners[2], corners[3], corners[3], corners[0]
  ];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePositions);
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
  );
  group.add(lines);

  // Semi-transparent walls
  const wallPositions = [
    origin, corners[0], corners[1],
    origin, corners[1], corners[2],
    origin, corners[2], corners[3],
    origin, corners[3], corners[0]
  ].flatMap((v) => [v.x, v.y, v.z]);
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3));
  wallGeo.computeVertexNormals();
  const walls = new THREE.Mesh(
    wallGeo,
    new THREE.MeshBasicMaterial({
      color: colorObj,
      transparent: true,
      opacity: camera.source === "Pole array" ? 0.08 : 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  group.add(walls);

  // Far plane (coverage zone at altitude)
  const farPlaneShape = new THREE.Shape();
  farPlaneShape.moveTo(-halfW, -halfH);
  farPlaneShape.lineTo(halfW, -halfH);
  farPlaneShape.lineTo(halfW, halfH);
  farPlaneShape.lineTo(-halfW, halfH);
  farPlaneShape.closePath();
  const farPlane = new THREE.Mesh(
    new THREE.ShapeGeometry(farPlaneShape),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
  );
  const planeGroup = new THREE.Group();
  planeGroup.position.copy(farCenter);
  planeGroup.lookAt(origin);
  planeGroup.add(farPlane);
  group.add(planeGroup);

  return group;
}

function makeLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(48, 48, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.stroke();
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 38px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 48, 50);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(4.2, 4.2, 1);
  return sprite;
}

function renderOutputs(result) {
  state.selectedCameraIndex = clamp(state.selectedCameraIndex, 0, Math.max(0, result.selected.length - 1));
  el.minimumCameras.textContent = String(result.minimumCamerasRequired);
  el.coverageMetric.textContent = pct(result.coveragePercent);
  el.blindMetric.textContent = pct(result.blindPercent);
  el.overlapMetric.textContent = pct(result.overlapPercent);
  el.pixelMetric.textContent = result.avgPixels.toFixed(1);
  el.utilizationMetric.textContent = pct(result.utilizationScore);
  el.cameraSummary.textContent = `${result.configsEvaluated.toLocaleString()} configs`;
  if (el.costSummary) el.costSummary.textContent = money(result.costCurve.at(-1)?.cost || 0);
  el.cameraList.innerHTML = result.selected.map((camera, index) => `
    <article class="camera-card ${index === state.selectedCameraIndex ? "active" : ""}" data-camera-index="${index}" title="Select this camera to tune its pole height, yaw, tilt, field of view, and range.">
      <i class="camera-dot" style="background:#${colors[index % colors.length].toString(16).padStart(6, "0")}"></i>
      <div>
        <strong>${camera.deploymentId} · ${camera.source}</strong>
        <span>${camera.position[0].toFixed(1)}, ${camera.position[1].toFixed(1)} · ${camera.height.toFixed(1)}m · yaw ${camera.heading.toFixed(0)} · tilt ${camera.pitch.toFixed(0)} · FOV ${camera.fov.toFixed(0)}</span>
      </div>
      <b class="pill ${camera.redundant ? "bad" : camera.utilization < 0.4 ? "warn" : ""}">${camera.redundant ? "Redundant" : pct(camera.utilization * 100)}</b>
    </article>
  `).join("");
  el.cameraList.querySelectorAll(".camera-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedCameraIndex = Number(card.dataset.cameraIndex);
      syncManualPanel();
      renderOutputs(state.result);
      renderScene(state.result);
    });
  });
  syncManualPanel();
  if (el.costList) el.costList.innerHTML = result.costCurve.map((row) => `
    <article class="cost-card">
      <strong>${row.cameras}</strong>
      <div><strong>${pct(row.coverage)}</strong><span>Marginal ${pct(row.marginalCoverage)}</span></div>
      <b class="pill">${money(row.cost)}</b>
    </article>
  `).join("");
}

function syncManualPanel() {
  const camera = state.result?.selected[state.selectedCameraIndex];
  if (!camera) return;
  el.selectedCameraName.textContent = `${camera.deploymentId} · ${camera.source}`;
  setSyncedValue("manualHeight", camera.height);
  setSyncedValue("manualYaw", camera.heading);
  setSyncedValue("manualTilt", camera.pitch);
  setSyncedValue("manualFov", camera.fov);
  setSyncedValue("manualRange", camera.range);
  setSyncedValue("manualArmLength", camera.armLength || 1.8);
}

function applyManualCameraEdit() {
  const camera = state.result?.selected[state.selectedCameraIndex];
  if (!camera) return;
  camera.height = number("manualHeight");
  camera.heading = normalizeAngle(number("manualYaw"));
  camera.pitch = number("manualTilt");
  camera.fov = number("manualFov");
  camera.range = number("manualRange");
  camera.armLength = number("manualArmLength");
  refreshManualCameraCoverage(camera);
  renderOutputs(state.result);
  renderScene(state.result);
}

function refreshManualCameraCoverage(camera) {
  const refreshed = evaluateCameraConfig({
    id: camera.id,
    position: camera.position,
    positionIndex: camera.positionIndex,
    heading: camera.heading,
    height: camera.height,
    pitch: camera.pitch,
    fov: camera.fov,
    range: camera.range,
    cost: camera.cost,
    source: camera.source,
    polygon: state.result.polygon,
    grid: state.result.grid,
    inputs: state.result.inputs
  });
  if (!refreshed) {
    camera.covered = Int32Array.from([]);
    camera.pixels = [];
    camera.distances = [];
  } else {
    camera.covered = refreshed.covered;
    camera.pixels = refreshed.pixels;
    camera.distances = refreshed.distances;
    camera.scoreBase = refreshed.scoreBase;
    camera.trackingRatio = refreshed.trackingRatio;
    camera.avgPixels = refreshed.avgPixels;
    camera.avgConfidence = refreshed.avgConfidence;
  }
  const analysis = analyzeSelection(state.result.selected, state.result.grid, state.result.inputs);
  Object.assign(state.result, analysis);
  state.result.costCurve = buildCostCurve(state.result.selected, state.result.grid.cells.length, state.result.inputs);
}

function setSyncedValue(id, nextValue) {
  el[id].value = round(nextValue, 2);
  const slider = document.querySelector(`[data-slider-for="${id}"]`);
  if (slider) slider.value = round(nextValue, 2);
}

function enhanceControls() {
  const numericIds = Object.keys(el).filter((id) => el[id]?.type === "number");
  numericIds.forEach((id) => {
    const numberInput = el[id];
    if (numberInput.dataset.enhanced) return;
    const min = numberInput.getAttribute("min");
    const max = numberInput.getAttribute("max");
    if (min == null || max == null) return;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = numberInput.step || "1";
    slider.value = numberInput.value || min;
    slider.dataset.sliderFor = id;
    const pair = document.createElement("div");
    pair.className = "range-pair";
    numberInput.parentNode.insertBefore(pair, numberInput);
    pair.appendChild(slider);
    pair.appendChild(numberInput);
    numberInput.style.display = "";
    numberInput.dataset.enhanced = "true";
    slider.addEventListener("input", () => {
      numberInput.value = slider.value;
      numberInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    numberInput.addEventListener("input", () => {
      if (numberInput.value !== "") slider.value = numberInput.value;
    });
  });
}

function attachTooltips() {
  const help = {
    shapePreset: "Choose a customer-friendly pond shape preset or import measured points from a CSV/TXT file.",
    pondLength: "Real pond length in meters. The 3D pond scales from this value.",
    pondWidth: "Real pond width in meters. Used for coverage, distance, and camera range calculations.",
    candidateSpacing: "Spacing between possible solo camera mounting candidates along the perimeter. Lower is more precise and slower.",
    centerPoleCount: "Number of CCTV cameras mounted around the central pole array.",
    centerPoleFov: "Horizontal field of view for each pole-mounted camera. Your current plan uses 78 degrees.",
    centerPoleOffset: "Rotates the whole pole camera array. Leave empty to let the optimizer choose.",
    fovInput: "Horizontal field of view for solo cameras used to cover the remaining blind areas.",
    rangeInput: "Maximum useful detection range for the selected camera model.",
    minHeight: "Minimum allowed mounting height.",
    maxHeight: "Maximum allowed mounting height.",
    minTilt: "Lowest allowed downward tilt angle.",
    maxTilt: "Highest allowed downward tilt angle.",
    detectPixels: "Minimum target pixels required for bird detection.",
    trackPixels: "Minimum target pixels required for reliable tracking.",
    requiredCoverage: "Target pond-surface coverage percentage before deployment is considered acceptable.",
    confidenceInput: "Minimum detection confidence threshold represented through pixel-density feasibility.",
    manualHeight: "Post-optimization pole height for the selected camera.",
    manualYaw: "Selected camera pan direction in degrees.",
    manualTilt: "Selected camera downward tilt angle in degrees.",
    manualFov: "Selected camera horizontal field of view.",
    manualRange: "Selected camera effective detection range.",
    manualArmLength: "Physical standoff arm length from pole to camera housing. This changes the 3D mount geometry.",
    timeOfDay: "Controls the sky and lighting balance for customer deployment review.",
    sunAzimuth: "Compass direction of sunlight around the pond.",
    sunElevation: "Sun height above the horizon.",
    moonIntensity: "Night lighting intensity used for low-light visual review."
  };
  Object.entries(help).forEach(([id, text]) => {
    const input = el[id];
    if (!input) return;
    input.title = text;
    const label = input.closest("label");
    if (!label || label.querySelector(".tooltip")) return;
    const labelText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!labelText) return;
    const line = document.createElement("span");
    line.className = "label-line";
    line.textContent = labelText.textContent.trim();
    const tip = document.createElement("span");
    tip.className = "tooltip";
    tip.textContent = "?";
    tip.title = text;
    line.appendChild(tip);
    label.replaceChild(line, labelText);
  });
}

function updateTimeLabel() {
  const time = number("timeOfDay");
  const phase = time < 5 || time > 20 ? "Night" : time < 8 ? "Sunrise" : time > 17 ? "Sunset" : "Day";
  el.timeOfDayLabel.textContent = phase;
}

function cellColor(result, i, maxPixel, maxDistance) {
  const coverage = result.coverageCounts[i];
  const pixel = result.maxPixels[i];
  const distance = result.minDistance[i];
  if (state.activeLayer === "blind") return coverage ? 0x256b7a : 0xf87171;
  if (state.activeLayer === "overlap") return coverage > 1 ? 0xf59e0b : coverage ? 0x2dd4bf : 0xf87171;
  if (state.activeLayer === "pixel") return mixColor(0x203040, 0x34d399, pixel / maxPixel);
  if (state.activeLayer === "detectability") return mixColor(0x7f1d1d, 0x2dd4bf, clamp(pixel / result.inputs.detectPixels, 0, 1));
  if (state.activeLayer === "tracking") return pixel >= result.inputs.trackPixels ? 0x34d399 : coverage ? 0xf59e0b : 0xf87171;
  if (state.activeLayer === "distance") return mixColor(0x1e3a8a, 0x93c5fd, 1 - clamp(distance / maxDistance, 0, 1));
  return coverage ? 0x2dd4bf : 0xf87171;
}

function mixColor(from, to, t) {
  const a = new THREE.Color(from);
  const b = new THREE.Color(to);
  return a.lerp(b, clamp(t, 0, 1));
}

function handleExport(event) {
  if (!state.result) return;
  if (event.currentTarget === el.exportJson) exportJson();
  if (event.currentTarget === el.exportCsv) exportCsv();
  if (event.currentTarget === el.downloadReport) downloadReport();
}

function exportJson() {
  const r = state.result;
  download("camera-deployment.json", JSON.stringify({
    inputs: r.inputs,
    pondArea: r.pondArea,
    coverage: r.coveragePercent,
    overlap: r.overlapPercent,
    blindSpot: r.blindPercent,
    cameras: r.selected.map(cameraExport),
    blindSpotCells: r.blindCells.map((index) => r.grid.cells[index].point),
    overlapCells: r.overlapCells.map((index) => r.grid.cells[index].point)
  }, null, 2), "application/json");
}

function exportCsv() {
  const headers = ["id", "type", "x", "y", "height_m", "arm_length_m", "yaw_deg", "tilt_deg", "fov_deg", "range_m", "cost", "utilization", "redundant"];
  const rows = state.result.selected.map((camera) => [
    camera.deploymentId, camera.source, camera.position[0].toFixed(2), camera.position[1].toFixed(2),
    camera.height.toFixed(2), (camera.armLength || 1.8).toFixed(2), camera.heading.toFixed(0), camera.pitch.toFixed(0), camera.fov.toFixed(0),
    camera.range.toFixed(1), camera.cost.toFixed(0), (camera.utilization * 100).toFixed(1), camera.redundant ? "yes" : "no"
  ]);
  download("camera-deployment.csv", [headers, ...rows].map((row) => row.join(",")).join("\n"), "text/csv");
}

function downloadReport() {
  const r = state.result;
  const lines = [
    "# Final Deployment Report", "",
    `Camera model: ${r.inputs.modelName}`,
    `Pond area: ${r.pondArea.toFixed(1)} sq m`,
    `Minimum cameras required: ${r.minimumCamerasRequired}`,
    `Coverage percentage: ${pct(r.coveragePercent)}`,
    `Blind spot percentage: ${pct(r.blindPercent)}`,
    `Overlap percentage: ${pct(r.overlapPercent)}`,
    `Pixel density average: ${r.avgPixels.toFixed(1)} px`,
    `Bird detectability: ${pct(r.detectabilityPercent)}`,
    `Tracking feasibility: ${pct(r.trackingPercent)}`,
    `YOLO detectability: ${pct(r.yoloPercent)}`,
    `Average distance to camera: ${r.avgDistance.toFixed(1)} m`,
    `Camera utilization score: ${pct(r.utilizationScore)}`, "",
    "## Camera Configuration",
    ...r.selected.map((camera) => `- ${camera.deploymentId} (${camera.source}): (${camera.position[0].toFixed(2)}, ${camera.position[1].toFixed(2)}), height ${camera.height.toFixed(1)} m, arm ${(camera.armLength || 1.8).toFixed(1)} m, yaw ${camera.heading.toFixed(0)} deg, tilt ${camera.pitch.toFixed(0)} deg, FOV ${camera.fov.toFixed(0)} deg, cost ${money(camera.cost)}, redundant ${camera.redundant ? "yes" : "no"}`),
    "", "## Coverage vs Cost",
    ...r.costCurve.map((row) => `- ${row.cameras} camera(s): ${pct(row.coverage)} coverage, ${money(row.cost)}`)
  ];
  download("camera-deployment-report.md", lines.join("\n"), "text/markdown");
}

function cameraExport(camera) {
  return {
    id: camera.deploymentId,
    type: camera.source,
    location: { x: camera.position[0], y: camera.position[1] },
    heightM: camera.height,
    yawDeg: camera.heading,
    tiltDeg: camera.pitch,
    fovDeg: camera.fov,
    rangeM: camera.range,
    armLengthM: camera.armLength || 1.8,
    cost: camera.cost,
    utilization: camera.utilization,
    redundant: camera.redundant
  };
}

async function importBoundaryFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const points = text.split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\s]+/).filter(Boolean).slice(0, 2).map(Number))
    .filter((point) => point.length === 2 && point.every(Number.isFinite));
  if (points.length < 3) {
    setStatus("Import needs at least 3 points", "bad");
    return;
  }
  state.importedPolygon = points;
  el.shapePreset.value = "field";
  rebuildPolygon();
  runOptimizer();
}

function presetPolygon(type, length, width) {
  if (type === "rectangle") return fitPolygon([[0, 0], [100, 0], [100, 70], [0, 70]], length, width);
  if (type === "notched") return fitPolygon([[0, 0], [100, 0], [100, 32], [72, 32], [72, 62], [100, 62], [100, 78], [0, 78], [0, 0]], length, width);
  if (type === "irregular") return fitPolygon([[3, 13], [20, 3], [46, 8], [61, 2], [95, 18], [86, 43], [97, 65], [70, 78], [48, 70], [28, 83], [5, 63]], length, width);
  return fitPolygon(baseSample, length, width);
}

function fitPolygon(points, length, width) {
  const box = bounds(points);
  const sourceW = Math.max(1, box.maxX - box.minX);
  const sourceH = Math.max(1, box.maxY - box.minY);
  return points.map(([x, y]) => [
    ((x - box.minX) / sourceW - 0.5) * length,
    ((y - box.minY) / sourceH - 0.5) * width
  ]);
}

function resolveCenterPolePosition(polygon, grid, inputs) {
  if (inputs.centerPoleX != null && inputs.centerPoleY != null) return [inputs.centerPoleX, inputs.centerPoleY];
  const centroid = polygonCentroid(polygon);
  if (pointInPolygon(centroid, polygon)) return centroid;
  let bestCell = grid.cells[0];
  let bestDistance = Infinity;
  for (const cell of grid.cells) {
    const d = dist(cell.point, centroid);
    if (d < bestDistance) {
      bestCell = cell;
      bestDistance = d;
    }
  }
  return [...bestCell.point];
}

function samplePerimeter(polygon, spacing) {
  const samples = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const length = dist(a, b);
    const count = Math.max(1, Math.floor(length / spacing));
    for (let j = 0; j < count; j += 1) {
      const t = j / count;
      samples.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  return samples;
}

function lineOfSight(a, b, polygon) {
  const steps = Math.max(5, Math.ceil(dist(a, b) / 3));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (!pointInPolygon([lerp(a[0], b[0], t), lerp(a[1], b[1], t)], polygon)) return false;
  }
  return true;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function polygonCentroid(polygon) {
  let areaFactor = 0, cx = 0, cy = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    areaFactor += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(areaFactor) < 0.0001) {
    const total = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
    return [total[0] / polygon.length, total[1] / polygon.length];
  }
  return [cx / (3 * areaFactor), cy / (3 * areaFactor)];
}

function bounds(points) {
  return points.reduce((box, [x, y]) => ({
    minX: Math.min(box.minX, x), minY: Math.min(box.minY, y), maxX: Math.max(box.maxX, x), maxY: Math.max(box.maxY, y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function targetPixels(distance, inputs, fov = inputs.fov) {
  const sceneWidth = 2 * distance * Math.tan(degToRad(fov / 2));
  return (Math.max(inputs.birdLength, inputs.birdWidth) / sceneWidth) * inputs.resolutionW;
}

function headingSamples(minPan, maxPan, step) {
  const values = [];
  if (minPan <= maxPan) {
    for (let a = minPan; a <= maxPan; a += step) values.push(normalizeAngle(a));
  } else {
    for (let a = minPan; a < 360; a += step) values.push(normalizeAngle(a));
    for (let a = 0; a <= maxPan; a += step) values.push(normalizeAngle(a));
  }
  if (!values.includes(maxPan)) values.push(maxPan);
  return uniqueNumbers(values.map((angle) => Math.round(angle)));
}

function rangeSamples(min, max, step) {
  const values = [];
  for (let value = min; value <= max; value += step) values.push(value);
  if (!values.includes(max)) values.push(max);
  return uniqueNumbers(values);
}

function unionCount(cameras, cellCount) {
  const counts = new Uint8Array(cellCount);
  let covered = 0;
  cameras.forEach((camera) => {
    for (const index of camera.covered) {
      if (counts[index] === 0) covered += 1;
      counts[index] = 1;
    }
  });
  return covered;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
      else child.material.dispose();
    }
    if (child.children?.length) clearGroup(child);
  }
}

function toWorld(point, height = 0) {
  return new THREE.Vector3(point[0], height, -point[1]);
}

function headingVector(heading) {
  return new THREE.Vector3(Math.cos(degToRad(heading)), 0, -Math.sin(degToRad(heading))).normalize();
}

function cameraForward(heading, pitch) {
  const h = degToRad(heading);
  const p = degToRad(pitch);
  return new THREE.Vector3(
    Math.cos(p) * Math.cos(h),
    Math.sin(p),
    -Math.cos(p) * Math.sin(h)
  ).normalize();
}

function cameraRight(heading) {
  const h = degToRad(heading);
  return new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).normalize();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function value(id) {
  return el[id].value;
}

function setValue(id, nextValue) {
  el[id].value = nextValue;
}

function number(id) {
  const next = Number(value(id));
  if (!Number.isFinite(next)) throw new Error(`${id} must be numeric`);
  return next;
}

function optionalNumber(id) {
  const raw = value(id).trim();
  if (!raw) return null;
  const next = Number(raw);
  if (!Number.isFinite(next)) throw new Error(`${id} must be numeric`);
  return next;
}

function setStatus(message, tone = "ok") {
  el.statusTitle.textContent = message;
  el.runState.textContent = tone === "ok" ? "Ready" : tone === "warn" ? "Working" : "Check";
  el.runState.className = `status-pill ${tone === "ok" ? "" : tone}`;
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function angleDeg(a, b) {
  return normalizeAngle(radToDeg(Math.atan2(b[1] - a[1], b[0] - a[0])));
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function angleDiff(a, b) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => round(value, 3)))];
}

function pct(value) {
  return `${value.toFixed(1)}%`;
}

function money(value) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function startApp(onboardPolygon) {
  if (onboardPolygon && onboardPolygon.length >= 3) {
    state.importedPolygon = onboardPolygon;
  }
  init();
}

window.__onboardDone = startApp;
window.runOptimizer = runOptimizer;

// If onboarding is already hidden (page reload, etc.), run directly
if (!document.getElementById('onboardingOverlay') || document.getElementById('onboardingOverlay').classList.contains('hidden')) {
  startApp(window.__onboardPolygon || null);
} else {
  // Will be called by onboarding "Continue" button
}

window.addEventListener("load", function() {
  // Fallback: if onboarding not shown for some reason
  setTimeout(function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (!state.scene && (!overlay || overlay.classList.contains('hidden'))) {
      startApp(window.__onboardPolygon || null);
    }
  }, 500);
});
