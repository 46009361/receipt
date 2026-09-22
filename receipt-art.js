import { BARCODE_VALUE, drawBarcode } from "./barcode.js";

/* Receipt generative art — seeded 1-bit plotters used by the hero canvases
   and by the 3D terminal's paper texture. window.ReceiptArt.draw(ctx, w, h, opts) */
(function () {
  function rng(seed) {
    let v = (seed >>> 0) || 1;
    return function () {
      v = (v * 1664525 + 1013904223) >>> 0;
      return v / 4294967296;
    };
  }

  function makeNoise(rand) {
    const p = new Float32Array(512);
    for (let i = 0; i < 512; i++) p[i] = rand();
    const fade = (t) => t * t * (3 - 2 * t);
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const g = (a, b) => p[((a & 31) + ((b & 15) << 5)) & 511];
      const top = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * fade(xf);
      const bot = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * fade(xf);
      return top + (bot - top) * fade(yf);
    };
  }

  /* ---- plotters: each fills the box {x,y,w,h} with black ink ---- */

  function starburst(ctx, box, rand) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) * 0.46;
    ctx.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      const a = (Math.PI * 2 * i) / 34 + rand() * 0.08;
      const inner = R * (0.27 + rand() * 0.18);
      const outer = R * (0.72 + rand() * 0.35);
      ctx.lineWidth = 1.5 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    for (let ring = 0; ring < 4; ring++) {
      ctx.beginPath();
      const radius = R * (0.16 + ring * 0.13);
      for (let pt = 0; pt <= 64; pt++) {
        const a = (pt / 64) * Math.PI * 2;
        const wob = Math.sin(a * (3 + ring) + rand() * 0.02 + ring) * R * 0.035;
        const x = cx + Math.cos(a) * (radius + wob);
        const y = cy + Math.sin(a) * (radius + wob);
        pt === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  function ridges(ctx, box, rand) {
    const noise = makeNoise(rand);
    const m = box.x + box.w * 0.06;
    const right = box.x + box.w - box.w * 0.06;
    const layers = 6;
    const span = box.h * 0.62;
    for (let layer = 0; layer < layers; layer++) {
      ctx.fillStyle = layer % 2 === 0 ? "#000" : "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const base = box.y + box.h;
      const top = box.y + box.h * 0.12 + (layer * span) / layers;
      ctx.moveTo(m, base);
      for (let x = m; x <= right; x += 4) {
        const wave = noise(x * 0.012, layer * 4.2) * box.h * 0.16;
        ctx.lineTo(x, top - wave);
      }
      ctx.lineTo(right, base);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#000";
    for (let i = 0; i < 120; i++) {
      const x = m + rand() * (right - m);
      const y = box.y + rand() * box.h * 0.28;
      const s = rand() > 0.85 ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }
  }

  function weave(ctx, box, rand) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) * 0.5;
    const off = (rand() - 0.5) * R * 0.5;
    ctx.lineWidth = 1.6;
    for (let i = 1; i < 30; i++) {
      const r = (R / 30) * i;
      ctx.beginPath();
      ctx.arc(cx - off, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + off, cy + off * 0.4, r * 0.96, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.2 + rand() * 0.15), 0, Math.PI * 2);
    ctx.stroke();
  }

  function orbit(ctx, box, rand) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) * 0.46;
    const arms = 3 + Math.floor(rand() * 4);
    ctx.lineWidth = 1.4;
    for (let a = 0; a < arms; a++) {
      const rot = (Math.PI * a) / arms + rand() * 0.4;
      const ry = R * (0.18 + rand() * 0.55);
      for (let k = 0; k < 9; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot + (k * Math.PI) / 26);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * (0.35 + k * 0.07), ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  function route(ctx, box, rand) {
    const noise = makeNoise(rand);
    const m = box.x + box.w * 0.14;
    const right = box.x + box.w - box.w * 0.14;
    ctx.lineWidth = Math.max(3, box.w * 0.012);
    ctx.beginPath();
    const pts = [];
    const step = box.h / 12;
    for (let y = box.y + step; y < box.y + box.h; y += step) {
      const x = m + noise(y * 0.018, 20) * (right - m);
      pts.push({ x: x, y: y });
      pts.length === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    pts.forEach(function (pt, i) {
      if (i % 2) return;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.rect(pt.x - 7, pt.y - 7, 14, 14);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i % 4 === 0 ? box.x + 8 : box.x + box.w - 8, pt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    });
  }

  function halftone(ctx, box, rand) {
    const noise = makeNoise(rand);
    const cell = Math.max(6, box.w / 34);
    for (let y = box.y; y < box.y + box.h; y += cell) {
      for (let x = box.x; x < box.x + box.w; x += cell) {
        const n = noise(x * 0.02, y * 0.02);
        const r = (cell / 2) * Math.min(1, Math.max(0, n * 1.5));
        if (r < 0.4) continue;
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const styles = { starburst: starburst, ridges: ridges, weave: weave, orbit: orbit, route: route, halftone: halftone };
  const names = Object.keys(styles);

  function draw(ctx, w, h, opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 1 : opts.seed;
    const rand = rng(seed * 2654435761);
    const style = opts.style || names[Math.floor(rand() * names.length)];
    const paper = opts.paper || "#fffdf3";
    const ink = opts.ink || "#151515";
    const chrome = opts.chrome !== false;
    const label = opts.label || "RECEIPT!";
    const pad = Math.max(16, w * 0.06);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineJoin = "round";
    ctx.setLineDash([]);

    const headH = chrome ? Math.max(52, h * 0.09) : 0;
    const footH = chrome ? Math.max(76, h * 0.15) : 0;

    if (chrome) {
      const fs = Math.max(11, w * 0.045);
      ctx.font = "700 " + fs + "px ui-monospace, Consolas, monospace";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText(label, pad, headH * 0.62);
      ctx.textAlign = "right";
      ctx.fillText("NO. " + String(seed % 1000).padStart(3, "0"), w - pad, headH * 0.62);
      ctx.setLineDash([w * 0.02, w * 0.016]);
      ctx.lineWidth = Math.max(1.5, w * 0.005);
      ctx.beginPath();
      ctx.moveTo(pad, headH * 0.86);
      ctx.lineTo(w - pad, headH * 0.86);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    styles[style](ctx, { x: pad * 0.6, y: headH + h * 0.02, w: w - pad * 1.2, h: h - headH - footH - h * 0.04 }, rand);
    ctx.restore();

    if (chrome) {
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      const fs = Math.max(11, w * 0.044);
      ctx.font = "700 " + fs + "px ui-monospace, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(opts.footer || "HACK CLUB", w / 2, h - footH * 0.52);
      const barTop = h - footH * 0.36;
      const barH = footH * 0.26;
      drawBarcode(ctx, pad * 1.4, barTop, w - pad * 2.8, barH, BARCODE_VALUE);
    }
    return style;
  }

  window.ReceiptArt = { draw: draw, styles: names, rng: rng };
})();
