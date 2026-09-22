import "./pos-terminal.js";
import { BARCODE_VALUE, createBarcodeSvg } from "./barcode.js";

function paintReceipt(canvas) {
  window.ReceiptArt?.draw(
    canvas.getContext("2d"),
    canvas.width,
    canvas.height,
    {
      seed: Number(canvas.dataset.seed) || 1,
      style: canvas.dataset.style || undefined,
      chrome: canvas.dataset.chrome !== "false",
    },
  );
}

document.querySelectorAll("canvas[data-art]").forEach(paintReceipt);

document.querySelectorAll("[data-barcode]").forEach((barcode) => {
  barcode.innerHTML = createBarcodeSvg(barcode.dataset.barcode || BARCODE_VALUE);
});
