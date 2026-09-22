import p5 from "p5";
import { receipt, drawReceipt } from "./sketch.js";

const PRINTER_WIDTH = 384;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 2000;
const DEFAULT_SEED = 67;

const seedInput = document.querySelector("#seed");
const shuffleButton = document.querySelector("#shuffle");
const exportButton = document.querySelector("#export");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const dimensions = document.querySelector("#dimensions");
const errorCard = document.querySelector("#error");
const receiptShell = document.querySelector("#receipt-shell");
const submitLink = document.querySelector("#submit");

let canvas;
let sketchInstance;
let rendererReady = false;
let currentSeed = integerOr(receipt.seed, DEFAULT_SEED);
let renderError = null;

seedInput.value = currentSeed;

new p5((p) => {
  sketchInstance = p;
  p.setup = () => {
    const height = validatedHeight();
    if (!height) return;

    canvas = p.createCanvas(PRINTER_WIDTH, height);
    // p5 2.x creates its renderer at display density. Reset it afterwards so
    // the backing bitmap (and therefore the PNG) is exactly printer-sized.
    p.pixelDensity(1);
    canvas.parent("canvas-host");
    // Initialize text metrics before the first seeded draw. Otherwise the first
    // rasterized text pass can differ by a few pixels from later redraws.
    p.textFont("monospace");
    p.noLoop();
  };

  p.draw = () => {
    render(p);
    if (!rendererReady) {
      // Prime p5's 2D renderer so the first visible seeded image uses the same
      // fully initialized state as every later variation.
      render(p);
      render(p);
      rendererReady = true;
    }
  };
});

function render(p) {
  const height = validatedHeight();
  if (!height || !canvas) return;

  clearError();
  try {
    if (p.height !== height) p.resizeCanvas(PRINTER_WIDTH, height);
    // Keep the value available to the sketch too (for labels, encoded data, etc.).
    receipt.seed = currentSeed;
    p.randomSeed(currentSeed);
    p.noiseSeed(currentSeed);
    p.background(255);
    p.push();
    try {
      drawReceipt(p);
    } finally {
      p.pop();
    }
    makeOneBit(p);
    renderError = null;
    setStatus("Ready to print", "ok");
  } catch (error) {
    renderError = error;
    showError(`Your sketch could not render: ${error.message}`);
    setStatus("Sketch error", "bad");
  }

  dimensions.textContent = `${PRINTER_WIDTH} × ${height} px · 1-bit PNG`;
  exportButton.disabled = Boolean(renderError);
}

// Thermal printers use black dots or no dots. This converts every pixel to
// pure black or pure white after the sketch is drawn, so preview === export.
function makeOneBit(p) {
  p.loadPixels();
  let artworkHash = 2166136261;
  for (let i = 0; i < p.pixels.length; i += 4) {
    const luminance =
      0.2126 * p.pixels[i] +
      0.7152 * p.pixels[i + 1] +
      0.0722 * p.pixels[i + 2];
    const value = luminance < 150 ? 0 : 255;
    p.pixels[i] = value;
    p.pixels[i + 1] = value;
    p.pixels[i + 2] = value;
    p.pixels[i + 3] = 255;
    artworkHash ^= value;
    artworkHash = Math.imul(artworkHash, 16777619);
  }
  p.updatePixels();
  p.canvas.dataset.seed = String(currentSeed);
  p.canvas.dataset.artworkHash = String(artworkHash >>> 0);
}

function validatedHeight() {
  const height = Number(receipt.height);
  const isWholeNumber = Number.isInteger(height);
  const isInRange = height >= MIN_HEIGHT && height <= MAX_HEIGHT;

  if (!isWholeNumber || !isInRange) {
    receiptShell.hidden = true;
    exportButton.disabled = true;
    dimensions.textContent = `Required: ${PRINTER_WIDTH} px wide · ${MIN_HEIGHT}–${MAX_HEIGHT} px tall`;
    showError(
      `receipt.height must be a whole number from ${MIN_HEIGHT} to ${MAX_HEIGHT}. ` +
      `It is currently ${JSON.stringify(receipt.height)}. Nothing can export until this is fixed.`
    );
    setStatus("Invalid dimensions", "bad");
    return null;
  }

  receiptShell.hidden = false;
  return height;
}

function showError(message) {
  errorCard.textContent = message;
  errorCard.hidden = false;
}

function clearError() {
  errorCard.hidden = true;
  errorCard.textContent = "";
}

function setStatus(message, state) {
  status.textContent = message;
  statusDot.className = `status-dot ${state}`;
}

function integerOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

seedInput.addEventListener("input", () => {
  currentSeed = integerOr(seedInput.value, receipt.seed);
  seedInput.value = currentSeed;
  if (canvas && sketchInstance) sketchInstance.redraw();
});

shuffleButton.addEventListener("click", () => {
  currentSeed = Math.floor(Math.random() * 1_000_000);
  seedInput.value = currentSeed;
  if (canvas && sketchInstance) sketchInstance.redraw();
});

exportButton.addEventListener("click", () => {
  const height = validatedHeight();
  if (!canvas || !height || renderError) return;

  canvas.elt.toBlob((blob) => {
    if (!blob) {
      showError("The browser could not create a PNG. Try reloading the page.");
      setStatus("Export failed", "bad");
      return;
    }

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.download = `receipt-seed-${currentSeed}.png`;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("PNG exported -- now submit it", "ok");
    submitLink.classList.add("ready");
  }, "image/png");
});
