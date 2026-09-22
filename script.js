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

// Retire the scroll cue as soon as the page moves; it is only there to say
// there is more below.
const scrollCue = document.querySelector(".scroll-cue");
if (scrollCue) {
  const update = () => {
    if (window.scrollY > 60) scrollCue.dataset.hidden = "";
    else delete scrollCue.dataset.hidden;
  };
  update();
  addEventListener("scroll", update, { passive: true });
}
