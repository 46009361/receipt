/* <pos-terminal> — three.js point-of-sale that prints a generative receipt.
   Ported from the receipt! codebase (script.js). Self-registering module. */
import "./receipt-art.js";
import { playPrinterSound, primeAudio } from "./printer-sound.js";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import * as gif from "gifuct-js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

class PosTerminal extends HTMLElement {
  connectedCallback() {
    if (this._observed) return;
    this._observed = true;
    this.style.display = "block";
    this.style.position = "relative";
    this.style.width = "100%";
    this.style.height = "100%";
    PosTerminal.live = PosTerminal.live || [];
    this.addEventListener("pointerenter", () => this.wake());
    this.addEventListener("click", () => { primeAudio(); this.wake(); });
    if (PosTerminal.live.length < 4) this.wake();
    else this.showHint();
  }

  disconnectedCallback() {
    this.sleep();
  }

  showHint() {
    if (this._hint) return;
    const hint = document.createElement("button");
    hint.type = "button";
    hint.textContent = "tap to start the printer";
    hint.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:grid;place-items:center;background:transparent;border:0;cursor:pointer;font:600 15px/1.3 system-ui,sans-serif;color:rgba(46,37,32,.55)";
    hint.addEventListener("click", () => this.wake());
    this.appendChild(hint);
    this._hint = hint;
  }

  wake() {
    if (this._booted) return;
    const live = (PosTerminal.live = PosTerminal.live || []);
    while (live.length >= 4) {
      const oldest = live.shift();
      if (oldest && oldest !== this) oldest.sleep();
    }
    live.push(this);
    if (this._hint) { this._hint.remove(); this._hint = null; }
    this.boot();
  }

  sleep() {
    if (!this._booted) return;
    this._booted = false;
    this._asleep = true;
    const live = PosTerminal.live || [];
    const i = live.indexOf(this);
    if (i > -1) live.splice(i, 1);
    try {
      const shot = this.canvas.toDataURL("image/png");
      if (!this._poster) {
        this._poster = document.createElement("img");
        this._poster.alt = "";
        this._poster.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none";
        this.appendChild(this._poster);
      }
      this._poster.src = shot;
    } catch (e) {}
    if (this.renderer) {
      this.renderer.dispose();
      const ctx = this.renderer.getContext();
      const lose = ctx && ctx.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      this.renderer = null;
    }
    if (this.canvas) this.canvas.remove();
    this.canvas = null;
  }

  boot() {
    if (this._booted) return;
    this._booted = true;
    this.style.display = "block";
    this.style.position = this.style.position || "relative";
    this.style.width = "100%";
    this.style.height = "100%";

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;cursor:pointer;outline:none";
    canvas.setAttribute("role", "button");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Print another receipt from the 3D terminal");
    this.appendChild(canvas);
    this.canvas = canvas;

    this.receiptCanvas = Object.assign(document.createElement("canvas"), { width: 512, height: 720 });
    this.screenCanvas = Object.assign(document.createElement("canvas"), { width: 600, height: 900 });
    this.bongoCanvas = document.createElement("canvas");
    this.bongoCtx = this.bongoCanvas.getContext("2d");
    this.patchCanvas = document.createElement("canvas");
    this.patchCtx = this.patchCanvas.getContext("2d");
    this.bongoFrames = [];
    this.bongoIndex = 0;
    this.bongoNextAt = 0;
    this.prevFrame = null;

    this.designNumber = 41;
    this.printing = false;
    this.paperProgress = reduceMotion ? 1 : 0.025;
    this.printStartedAt = 0;
    this.screenState = "preview";
    this.lastCatFrame = 0;

    this.loadBongo();
    this.drawReceipt(this.designNumber);
    this.drawScreen();
    this.buildScene();

    canvas.addEventListener("pointerdown", () => primeAudio());
    canvas.addEventListener("click", () => this.print());
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); primeAudio(); this.print(); }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (reduceMotion) return;
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.targetRotationY = -0.18 + x * 0.1;
      this.targetRotationX = -0.04 - y * 0.05;
    });
    canvas.addEventListener("pointerleave", () => {
      this.targetRotationX = -0.04;
      this.targetRotationY = -0.18;
    });

    if (this._poster) { this._poster.remove(); this._poster = null; }
    requestAnimationFrame((t) => this.animate(t));
    if (!reduceMotion && !this._asleep) setTimeout(() => this.print(), 600);
    else if (this._asleep) { this.paperProgress = 1; this.updatePaper(1); this.screenState = "printed"; }
  }

  loadBongo() {
    if (!gif) return;
    fetch(new URL("./assets/bongo-cat.gif", import.meta.url))
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const parsed = gif.parseGIF(buf);
        this.bongoFrames = gif.decompressFrames(parsed, true);
        this.bongoCanvas.width = parsed.lsd.width;
        this.bongoCanvas.height = parsed.lsd.height;
        this.bongoCtx.clearRect(0, 0, this.bongoCanvas.width, this.bongoCanvas.height);
        this.renderBongoFrame(this.bongoFrames[0]);
        this.bongoNextAt = 0;
      })
      .catch(() => { this.bongoFrames = []; });
  }

  renderBongoFrame(frame) {
    if (!frame) return;
    if (this.prevFrame && this.prevFrame.disposalType === 2) {
      const d = this.prevFrame.dims;
      this.bongoCtx.clearRect(d.left, d.top, d.width, d.height);
    }
    const { left, top, width, height } = frame.dims;
    this.patchCanvas.width = width;
    this.patchCanvas.height = height;
    const img = this.patchCtx.createImageData(width, height);
    img.data.set(frame.patch);
    this.patchCtx.putImageData(img, 0, 0);
    this.bongoCtx.drawImage(this.patchCanvas, left, top);
    this.prevFrame = frame;
  }

  advanceBongo(time) {
    if (!this.bongoFrames.length) return;
    if (!this.bongoNextAt) {
      this.bongoIndex = 0;
      this.bongoCtx.clearRect(0, 0, this.bongoCanvas.width, this.bongoCanvas.height);
      this.renderBongoFrame(this.bongoFrames[0]);
      this.bongoNextAt = time + Math.max(20, this.bongoFrames[0].delay);
      return;
    }
    while (time >= this.bongoNextAt) {
      this.bongoIndex = (this.bongoIndex + 1) % this.bongoFrames.length;
      if (this.bongoIndex === 0) {
        this.bongoCtx.clearRect(0, 0, this.bongoCanvas.width, this.bongoCanvas.height);
        this.prevFrame = null;
      }
      const frame = this.bongoFrames[this.bongoIndex];
      this.renderBongoFrame(frame);
      this.bongoNextAt += Math.max(20, frame.delay);
    }
  }

  drawReceipt(seed) {
    const ctx = this.receiptCanvas.getContext("2d");
    const w = this.receiptCanvas.width, h = this.receiptCanvas.height;
    if (window.ReceiptArt) {
      window.ReceiptArt.draw(ctx, w, h, { seed: seed, style: this.getAttribute("style-name") || undefined });
      return;
    }
    ctx.fillStyle = "#fffdf3";
    ctx.fillRect(0, 0, w, h);
  }

  drawScreen(status = "click me uwu", transfer = 0, mode = "preview") {
    const ctx = this.screenCanvas.getContext("2d");
    const w = this.screenCanvas.width, h = this.screenCanvas.height;
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ec3750";
    ctx.fillRect(0, 0, w, 82);
    ctx.fillStyle = "white";
    ctx.font = "700 26px ui-monospace, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("RECEIPT!", 30, 52);

    ctx.save();
    ctx.beginPath();
    ctx.rect(28, 112, w - 56, 650);
    ctx.clip();
    ctx.fillStyle = "#252932";
    ctx.fillRect(28, 112, w - 56, 650);
    if (mode === "printed" && this.bongoFrames.length) {
      this.drawDiscoLights(ctx, 28, 112, w - 56, 650);
      ctx.drawImage(this.bongoCanvas, 74, 176, 452, 456);
    } else if (mode === "printed") {
      ctx.drawImage(this.receiptCanvas, 86, 128, 428, 602);
    } else {
      ctx.drawImage(this.receiptCanvas, 86, 128 - transfer * 690, 428, 602);
    }
    ctx.restore();

    ctx.fillStyle = "#ec3750";
    ctx.fillRect(72, 792, w - 144, 70);
    ctx.fillStyle = "white";
    ctx.font = "700 22px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(status, w / 2, 836);
  }

  drawDiscoLights(ctx, x, y, width, height) {
    const time = performance.now() / 1000;
    ctx.fillStyle = "#130d25";
    ctx.fillRect(x, y, width, height);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const lights = [
      ["#ff3b89", 0.22, 0.26, 0.34],
      ["#38dfff", 0.76, 0.19, 0.3],
      ["#a855f7", 0.72, 0.75, 0.36],
      ["#ffda3d", 0.2, 0.8, 0.28],
    ];
    for (let index = 0; index < lights.length; index++) {
      const [color, baseX, baseY, size] = lights[index];
      const phase = time * (0.85 + index * 0.1) + index * 1.7;
      const cx = x + width * (baseX + Math.sin(phase) * 0.18);
      const cy = y + height * (baseY + Math.cos(phase * 0.82) * 0.16);
      const radius = width * size;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, color);
      glow.addColorStop(0.26, `${color}b8`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, width, height);
    }
    ctx.restore();
  }

  buildScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0.5, 18);
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f665c, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 4.5);
    key.position.set(-4, 7, 8);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8c78, 2.2);
    rim.position.set(6, 1, 3);
    scene.add(rim);

    const terminal = new THREE.Group();
    terminal.position.y = -0.65;
    terminal.rotation.set(-0.04, -0.18, -0.035);
    scene.add(terminal);

    const cream = new THREE.MeshPhysicalMaterial({ color: 0xf3eee3, roughness: 0.5, clearcoat: 0.16 });
    const red = new THREE.MeshPhysicalMaterial({ color: 0xec4e3d, roughness: 0.42, clearcoat: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.35 });

    const roundedBox = (w, h, d, r, mat, y, z = 0) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 8, r), mat);
      mesh.position.set(0, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      terminal.add(mesh);
      return mesh;
    };

    roundedBox(4.2, 6.2, 1.15, 0.34, cream, -0.4);
    roundedBox(4.24, 1.72, 1.28, 0.38, red, 2.55, 0.02);
    roundedBox(3.58, 4.45, 0.16, 0.18, dark, -0.58, 0.64);

    const screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.18, 4.05),
      new THREE.MeshBasicMaterial({ map: screenTexture })
    );
    screen.position.set(0, -0.58, 0.735);
    terminal.add(screen);

    const slot = roundedBox(3.35, 0.13, 0.16, 0.04, dark, 1.76, 0.7);
    slot.castShadow = false;
    const sideButton = roundedBox(0.22, 0.82, 0.24, 0.1, red, 0.25, 0.25);
    sideButton.position.x = 2.12;

    const logoTexture = new THREE.TextureLoader().load(
      new URL("./assets/image.png", import.meta.url).href,
    );
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 1.04),
      new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false })
    );
    logo.position.set(0, 2.68, 0.69);
    terminal.add(logo);

    const paperTexture = new THREE.CanvasTexture(this.receiptCanvas);
    paperTexture.colorSpace = THREE.SRGBColorSpace;
    paperTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const segments = 28;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const uvs = new Float32Array((segments + 1) * 2 * 2);
    const indices = [];
    for (let row = 0; row <= segments; row++) {
      const t = row / segments;
      const v = row * 2;
      uvs[v * 2] = 0; uvs[v * 2 + 1] = t;
      uvs[(v + 1) * 2] = 1; uvs[(v + 1) * 2 + 1] = t;
      if (row < segments) {
        const next = v + 2;
        indices.push(v, v + 1, next + 1, v, next + 1, next);
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const paper = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture, roughness: 0.92, side: THREE.DoubleSide }));
    paper.castShadow = true;
    terminal.add(paper);

    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.terminal = terminal; this.paperGeo = geo;
    this.screenTexture = screenTexture; this.paperTexture = paperTexture;
    this.targetRotationX = -0.04;
    this.targetRotationY = -0.18;
    this.updatePaper(this.paperProgress);
  }

  updatePaper(progress) {
    const length = 4.65 * progress;
    const pos = this.paperGeo.attributes.position;
    const uv = this.paperGeo.attributes.uv;
    const segments = 28;
    for (let row = 0; row <= segments; row++) {
      const t = row / segments;
      const y = 1.82 + t * length;
      const z = 0.79 + Math.sin(t * Math.PI * 0.55) * 0.28 * progress;
      const v = row * 2;
      pos.setXYZ(v, -1.48, y, z);
      pos.setXYZ(v + 1, 1.48, y, z);
      uv.setY(v, 1 - progress + t * progress);
      uv.setY(v + 1, 1 - progress + t * progress);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    this.paperGeo.computeVertexNormals();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const fitZ = (9.4 / (2 * Math.tan((Math.PI / 180) * 20))) / Math.min(1, (w / h) / 0.82);
    this.camera.position.z = Math.max(13, fitZ);
    const ratio = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.floor(w * ratio) || this.canvas.height !== Math.floor(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  animate(time) {
    if (!this.isConnected || !this._booted || !this.renderer) return;
    this.resize();
    this.terminal.rotation.x += (this.targetRotationX - this.terminal.rotation.x) * 0.06;
    this.terminal.rotation.y += (this.targetRotationY - this.terminal.rotation.y) * 0.06;

    if (this.screenState === "printed" && !this.printStartedAt && time - this.lastCatFrame > 60) {
      if (!reduceMotion) this.advanceBongo(time);
      this.drawScreen("click me uwu", 1, "printed");
      this.screenTexture.needsUpdate = true;
      this.lastCatFrame = time;
    }

    if (this.printStartedAt) {
      const elapsed = time - this.printStartedAt;
      const transfer = Math.min(1, elapsed / 750);
      const paperElapsed = Math.max(0, elapsed - 480);
      const eased = 1 - Math.pow(1 - Math.min(1, paperElapsed / 1450), 3);
      this.paperProgress = Math.min(1, 0.025 + eased * 0.975);
      this.drawScreen("PRINTING…", transfer);
      this.screenTexture.needsUpdate = true;
      this.updatePaper(this.paperProgress);
      if (this.paperProgress >= 1) {
        this.printStartedAt = 0;
        this.printing = false;
        this.screenState = "printed";
        this.drawScreen("click me uwu", 1, "printed");
        this.screenTexture.needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.animate(t));
  }

  print() {
    if (this.printing) return;
    this.printing = true;
    this.screenState = "preview";
    this.designNumber = Math.floor(1 + Math.random() * 998);
    this.paperProgress = 0.025;
    this.updatePaper(this.paperProgress);
    this.drawReceipt(this.designNumber);
    this.drawScreen();
    this.paperTexture.needsUpdate = true;
    this.screenTexture.needsUpdate = true;
    this.dispatchEvent(new CustomEvent("print", { detail: { seed: this.designNumber }, bubbles: true }));

    if (reduceMotion) {
      this.paperProgress = 1;
      this.updatePaper(1);
      this.screenState = "printed";
      this.drawScreen("click me uwu", 1, "printed");
      this.screenTexture.needsUpdate = true;
      this.printing = false;
      return;
    }
    playPrinterSound({ delay: 0.45, duration: 1.93 });
    setTimeout(() => { this.printStartedAt = performance.now(); }, 450);
  }
}

if (!customElements.get("pos-terminal")) customElements.define("pos-terminal", PosTerminal);
