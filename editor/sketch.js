// RECEIPT!
// This is the file to edit. p5.js reference: https://p5js.org/reference/
import JsBarcode from "jsbarcode";

export const receipt = {
  height: 1080, // 240–2000 px. Width is fixed by the printer.
  seed: 67,
};

// everything here is editable. play around or rm -rf and see what you come up with!
export function drawReceipt(p) {
  const { width: w, height: h } = p;
  const margin = 24;

  // Header
  p.noStroke();
  p.fill(0);
    p.textFont("monospace");
    p.textAlign(p.CENTER, p.TOP);
    p.textStyle(p.BOLD);
    p.textSize(28);
    p.text("NIGHT SIGNALS", w / 2, 30);

  dashedLine(p, margin, 94, w - margin, 94, 6, 5);

  // A seeded field of tiny stars and radio noise.
  for (let i = 0; i < 150; i += 1) {
    const x = p.random(margin, w - margin);
    const y = p.random(118, 350);
    const size = p.random([1, 1, 1, 2, 2, 3]);
    if (p.random() > 0.82) {
      p.rect(x - 3, y, 7, 1);
      p.rect(x, y - 3, 1, 7);
    } else {
      p.rect(x, y, size, size);
    }
  }

  // Layered mountain signals. p.noise() and p.random() are both seeded.
  const ridgeTop = 300;
  for (let layer = 0; layer < 5; layer += 1) {
    p.fill(layer % 2 === 0 ? 0 : 255);
    p.stroke(0);
    p.strokeWeight(2);
    p.beginShape();
    p.vertex(margin, 500 + layer * 48);
    for (let x = margin; x <= w - margin; x += 5) {
      const wave = p.noise(x * 0.012, layer * 4.2) * 90;
      const y = ridgeTop + layer * 50 - wave;
      p.vertex(x, y);
    }
    p.vertex(w - margin, 500 + layer * 48);
    p.endShape(p.CLOSE);
  }

  // The transmission: a winding route with little station markers.
  p.noFill();
  p.stroke(0);
  p.strokeWeight(5);
  p.beginShape();
  const route = [];
  for (let y = 585; y < 915; y += 34) {
    const x = p.map(p.noise(y * 0.018, 20), 0, 1, 68, w - 68);
    route.push({ x, y });
    p.vertex(x, y);
  }
  p.endShape();

  p.strokeWeight(2);
  p.fill(255);
  route.forEach(({ x, y }, index) => {
    if (index % 2 === 0) {
      p.square(x - 6, y - 6, 12);
      p.line(index % 4 === 0 ? margin : w - margin, y, x, y);
    }
  });

  dashedLine(p, margin, 930, w - margin, 930, 6, 5);

  const barcodeValue = "receipt.hackclub.com";
  drawBarcode(p, barcodeValue, w / 2, 960);

  p.noStroke();
  p.fill(0);
  p.textFont("monospace");
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(10);
  p.text(barcodeValue, w / 2, 1024);
}

function drawBarcode(p, value, centerX, y) {
  const barcodeCanvas = document.createElement("canvas");
  JsBarcode(barcodeCanvas, value, {
    format: "CODE128",
    width: 1,
    height: 52,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  // Draw directly on p5's canvas: p.image expects a p5 image wrapper, while
  // JsBarcode returns a regular browser canvas.
  p.drawingContext.drawImage(barcodeCanvas, Math.floor(centerX - barcodeCanvas.width / 2), y);
}

function dashedLine(p, x1, y1, x2, y2, dash, gap) {
  p.stroke(0);
  p.strokeWeight(2);
  for (let x = x1; x < x2; x += dash + gap) {
    p.line(x, y1, Math.min(x + dash, x2), y2);
  }
}