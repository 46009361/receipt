// RECEIPT!
// This is the file to edit. p5.js reference: https://p5js.org/reference/
import JsBarcode from "jsbarcode";

export const receipt = {
  height: 2000, // 240–2000 px. Width is fixed by the printer.
  seed: 67,
};

// everything here is editable. play around or rm -rf and see what you come up with!
export function drawReceipt(p) {
  const { width: w, height: h } = p;
  const margin = 0, textSize = 10;

  const barcodeValue = "receipt.hackclub.com";
  drawBarcode(p, barcodeValue, w / 2, 1926);

  p.noStroke();
  p.fill(0);
  p.textFont("sans-serif");
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(48);
  p.text("Write anything! :D", w / 2, 0)
  p.textSize(textSize);
  p.text(barcodeValue, w / 2, h - textSize - margin);
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