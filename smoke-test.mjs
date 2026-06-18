import fs from "node:fs";
import vm from "node:vm";

const values = {
  polygonInput: "",
  restrictedInput: "",
  cameraModel: "0",
  resolutionW: "3840",
  resolutionH: "2160",
  fovInput: "78",
  rangeInput: "48",
  scaleInput: "1",
  candidateSpacing: "7",
  minHeight: "3",
  maxHeight: "8",
  minTilt: "8",
  maxTilt: "55",
  minPan: "0",
  maxPan: "359",
  centerPoleEnabled: true,
  centerPoleX: "",
  centerPoleY: "",
  centerPoleCount: "5",
  centerPoleFov: "78",
  centerPoleOffset: "",
  centerPoleCost: "620",
  birdLength: "0.35",
  birdWidth: "0.18",
  detectPixels: "18",
  trackPixels: "32",
  cameraCount: "",
  budgetInput: "",
  requiredCoverage: "98",
  confidenceInput: "70"
};

class ElementStub {
  constructor(id) {
    this.id = id;
    this.value = values[id] ?? "";
    this.checked = values[id] === true;
    this.textContent = "";
    this.innerHTML = "";
    this.rows = 0;
    this.dataset = {};
    this.style = {};
    this.classList = { add() {}, remove() {} };
  }

  addEventListener() {}
  appendChild(child) {
    if (this.id === "cameraModel" && this.value === "") this.value = child.value;
  }
  setPointerCapture() {}
  click() {}
  getBoundingClientRect() {
    return { width: 1280, height: 820, left: 0, top: 0 };
  }
  getContext() {
    const noop = () => {};
    return {
      clearRect: noop,
      fillRect: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      fill: noop,
      stroke: noop,
      save: noop,
      restore: noop,
      arc: noop,
      roundRect: noop,
      setLineDash: noop,
      fillText: noop,
      measureText: (text) => ({ width: String(text).length * 7 })
    };
  }
}

const elements = new Map();
const getElement = (selector) => {
  const id = selector.startsWith("#") ? selector.slice(1) : selector;
  if (!elements.has(id)) elements.set(id, new ElementStub(id));
  return elements.get(id);
};

const tabStubs = ["coverage", "blind", "overlap", "pixel", "detectability", "tracking", "yolo", "distance"]
  .map((layer) => {
    const el = new ElementStub(`tab-${layer}`);
    el.dataset.layer = layer;
    return el;
  });

const context = {
  console,
  Blob: class Blob {},
  URL: { createObjectURL: () => "blob:mock", revokeObjectURL() {} },
  Int32Array,
  Uint8Array,
  Uint16Array,
  Float32Array,
  Math,
  Number,
  String,
  JSON,
  Array,
  Set,
  document: {
    querySelector(selector) {
      return getElement(selector);
    },
    querySelectorAll(selector) {
      return selector === ".tab" ? tabStubs : [];
    },
    getElementById(id) {
      return getElement(id);
    },
    createElement(tag) {
      return new ElementStub(tag);
    }
  },
  window: {
    devicePixelRatio: 1,
    addEventListener() {}
  }
};

vm.createContext(context);
const source = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
vm.runInContext(source, context, { filename: "app.js" });

const status = getElement("#statusBadge").textContent;
const coverage = getElement("#coverageMetric").textContent;
const cameraRows = getElement("#cameraTable").innerHTML;

if (!coverage || coverage === "-") {
  throw new Error(`Smoke test failed. Status: ${status}`);
}

if (!cameraRows.includes("Pole array")) {
  throw new Error("Smoke test failed. Middle pole array was not selected.");
}

console.log(`Smoke test passed: ${coverage} coverage. ${status}`);
