/* Runs one submitted sketch and hands back its PNG.

   This page only ever loads inside <iframe sandbox="allow-scripts">, and the
   server repeats that as a CSP `sandbox`, so its origin is opaque: a sketch
   can't read the site's cookies or call its API, and connect-src 'none' stops
   it phoning anywhere else. The render mirrors editor/app.js so the gallery
   matches what the author exported. */

import p5 from "p5";
import JsBarcode from "jsbarcode";

const PRINTER_WIDTH = 384;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 2000;
const DEFAULT_SEED = 67;
const SLOW_PASS = 1000;
const FONTS = ['16px "Courier Prime"', 'bold 16px "Courier Prime"', '16px "M PLUS Rounded 1c"', '16px "Unkempt"'];

// Sketches import these by bare name, which a blob module can't resolve, so
// each specifier is rewritten to a tiny module re-exporting the copy loaded here.
globalThis.__receipt = { p5, JsBarcode };
const SHIMS = {
  p5: moduleUrl("export default globalThis.__receipt.p5;"),
  jsbarcode: moduleUrl("export default globalThis.__receipt.JsBarcode;"),
};

const fontsReady = Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => {})));

// One sketch per frame: the parent throws the frame away afterwards, so a
// sketch that patches p5 or the page can't reach the next one.
let started = false;

addEventListener("message", async (event) => {
  if (started || event.source !== parent || typeof event.data?.source !== "string") return;
  started = true;
  try {
    parent.postMessage({ png: await render(event.data.source) }, "*");
  } catch (error) {
    parent.postMessage({ error: String(error?.message || error) }, "*");
  }
});

parent.postMessage({ ready: true }, "*");

async function render(source) {
  await fontsReady;
  const url = moduleUrl(rewriteImports(source));
  let sketch;
  try {
    sketch = await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const { receipt = {}, drawReceipt } = sketch;
  if (typeof drawReceipt !== "function") throw new Error("sketch.js doesn't export drawReceipt");
  const height = Number(receipt.height);
  if (!Number.isInteger(height) || height < MIN_HEIGHT || height > MAX_HEIGHT) {
    throw new Error(`receipt.height must be ${MIN_HEIGHT}–${MAX_HEIGHT}`);
  }
  const seed = Number.isFinite(Number(receipt.seed)) ? Math.trunc(Number(receipt.seed)) : DEFAULT_SEED;

  const host = document.createElement("div");
  document.body.append(host);

  let instance;
  try {
    const canvas = await new Promise((resolve, reject) => {
      instance = new p5((p) => {
        p.setup = () => {
          try {
            p.createCanvas(PRINTER_WIDTH, height);
            p.pixelDensity(1);
            p.textFont("monospace");
            p.noLoop();
          } catch (error) {
            reject(error);
          }
        };
        p.draw = () => {
          try {
            // Three passes, as the editor does, so p5's renderer is fully primed
            // and the image matches the one the author saw. Priming only nudges
            // text by a pixel or two, so a sketch that is slow to draw (these
            // frames can share the page's thread) gets one pass instead of three.
            const start = performance.now();
            drawOnce(p, receipt, drawReceipt, seed);
            if (performance.now() - start < SLOW_PASS) {
              drawOnce(p, receipt, drawReceipt, seed);
              drawOnce(p, receipt, drawReceipt, seed);
            }
            makeOneBit(p);
            resolve(p.canvas);
          } catch (error) {
            reject(error);
          }
        };
      }, host);
    });
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("couldn't encode PNG"))), "image/png"),
    );
  } finally {
    instance?.remove();
    host.remove();
  }
}

function drawOnce(p, receipt, drawReceipt, seed) {
  receipt.seed = seed;
  p.randomSeed(seed);
  p.noiseSeed(seed);
  p.background(255);
  p.push();
  try {
    drawReceipt(p);
  } finally {
    p.pop();
  }
}

function makeOneBit(p) {
  p.loadPixels();
  for (let i = 0; i < p.pixels.length; i += 4) {
    const luminance = 0.2126 * p.pixels[i] + 0.7152 * p.pixels[i + 1] + 0.0722 * p.pixels[i + 2];
    const value = luminance < 150 ? 0 : 255;
    p.pixels[i] = p.pixels[i + 1] = p.pixels[i + 2] = value;
    p.pixels[i + 3] = 255;
  }
  p.updatePixels();
}

function rewriteImports(source) {
  return source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2/g,
    (match, lead, quote, specifier) => {
      const shim = SHIMS[specifier];
      if (!shim) throw new Error(`the gallery can't load "${specifier}"`);
      return `${lead}${quote}${shim}${quote}`;
    },
  );
}

function moduleUrl(code) {
  return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}
