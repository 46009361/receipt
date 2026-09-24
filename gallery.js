/* The gallery wall. Sketches are other people's code, so none of it runs on
   this page: each one renders in its own sandboxed frame (gallery-frame.js)
   and only the finished PNG comes back. Everything from the API is set with
   textContent or as a checked URL, never as HTML. */

// Some sketches shade every pixel with layered noise and take a while.
const RENDER_TIMEOUT = 60000;
const PARALLEL = 2;

const wall = document.querySelector("[data-wall]");
const status = document.querySelector("[data-status]");

load();

async function load() {
  let items;
  try {
    const res = await fetch("/api/gallery");
    if (!res.ok) throw new Error(res.status);
    ({ items } = await res.json());
  } catch {
    status.textContent = "Couldn't fetch the gallery. Try again in a minute.";
    return;
  }

  if (!items.length) {
    status.textContent = "Nothing on the wall yet. Be the first!";
    return;
  }
  status.hidden = true;

  const cards = items.map((item, index) => {
    const card = buildCard(item, index);
    wall.append(card.root);
    return { item, ...card };
  });

  // The cards are built after load, so the browser's own jump to the hash (and
  // :target) never finds them. Do it here instead.
  history.scrollRestoration = "manual";
  showLinked();
  addEventListener("hashchange", showLinked);

  // Print only what's about to be seen, nearest first, a couple at a time.
  const queue = [];
  let running = 0;
  const pump = () => {
    while (running < PARALLEL && queue.length) {
      const card = queue.shift();
      running += 1;
      renderSketch(card.item.source)
        .then(card.show, (error) => card.fail(error.message))
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        queue.push(cards.find((card) => card.root === entry.target));
      }
      pump();
    },
    { rootMargin: "600px 0px" },
  );
  for (const card of cards) observer.observe(card.root);
}

function showLinked() {
  const slug = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  for (const item of wall.children) item.classList.toggle("is-linked", item.id === slug);
  if (slug) document.getElementById(slug)?.scrollIntoView({ block: "center" });
}

function buildCard(item, index) {
  const root = el("li", "wall-item");
  root.id = item.slug;
  root.style.setProperty("--tilt", `${[-2.2, 1.4, -0.8, 2.4, -1.6, 0.9][index % 6]}deg`);

  const art = el("a", "wall-art");
  art.href = `#${item.slug}`;
  art.setAttribute("aria-label", `Receipt by @${item.author}`);
  art.append(el("span", "tape"));
  const paper = el("div", "wall-paper");
  paper.textContent = "printing…";
  if (item.height) paper.style.aspectRatio = `384 / ${item.height}`;
  art.append(paper);

  const caption = el("p", "wall-caption");
  caption.append("By ");
  const author = item.slackId ? el("a") : el("span");
  author.textContent = `@${item.author}`;
  if (item.slackId) {
    author.href = `https://hackclub.slack.com/team/${encodeURIComponent(item.slackId)}`;
    author.target = "_blank";
    author.rel = "noopener";
  }
  caption.append(author);

  const code = el("a", "wall-code");
  code.textContent = "sketch.js ↗";
  code.href = githubUrl(item.sketchUrl);
  code.target = "_blank";
  code.rel = "noopener";

  root.append(art, caption, code);

  return {
    root,
    show(blob) {
      const img = new Image(384);
      img.alt = `Receipt artwork by @${item.author}`;
      img.src = URL.createObjectURL(blob);
      paper.replaceWith(img);
    },
    fail(message) {
      paper.classList.add("wall-paper-error");
      paper.textContent = `this one jammed the printer: ${message}`;
    },
  };
}

/* One throwaway frame per sketch; see gallery-frame.js for why. */
function renderSketch(source) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.className = "render-frame";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.src = "/gallery-frame.html";

    const done = (fn, value) => {
      clearTimeout(timer);
      removeEventListener("message", onMessage);
      frame.remove();
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error("took too long")), RENDER_TIMEOUT);

    function onMessage(event) {
      if (event.source !== frame.contentWindow) return;
      const data = event.data || {};
      if (data.ready) frame.contentWindow.postMessage({ source }, "*");
      else if (data.png instanceof Blob) done(resolve, data.png);
      else done(reject, new Error(String(data.error || "unknown error").slice(0, 200)));
    }

    addEventListener("message", onMessage);
    document.body.append(frame);
  });
}

function githubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" ? url.href : "#";
  } catch {
    return "#";
  }
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
