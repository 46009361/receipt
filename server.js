import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = import.meta.dirname;
const DIST = resolve(ROOT, "dist");
const API = resolve(ROOT, "api");
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
};

/* The gallery's sketch renderer runs other people's code. `sandbox` makes its
   origin opaque even if it's opened directly, and connect-src 'none' keeps a
   sketch from sending anything anywhere. Only this site may frame it. */
const FRAME_HEADERS = {
  ...SECURITY_HEADERS,
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": [
    "sandbox allow-scripts",
    "default-src 'none'",
    // 'self' is ambiguous for an opaque origin, so name the site as well.
    `script-src 'self' ${process.env.PUBLIC_ORIGIN || ""} blob:`.replace(/\s+/g, " "),
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src data: blob:",
    "connect-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
};

// Cache handler modules so each request isn't a fresh import.
const handlers = new Map();

async function loadHandler(pathname) {
  if (handlers.has(pathname)) return handlers.get(pathname);

  // Resolve inside api/ and confirm it stayed there, so a crafted path can't
  // reach arbitrary modules on disk.
  const file = resolve(API, `.${normalize(pathname).slice("/api".length)}.js`);
  if (file !== API && !file.startsWith(API + sep)) return null;
  if (file.includes(`${sep}_lib${sep}`)) return null;

  try {
    await stat(file);
  } catch {
    handlers.set(pathname, null);
    return null;
  }

  const module = await import(pathToFileURL(file).href);
  const handler = typeof module.default === "function" ? module.default : null;
  handlers.set(pathname, handler);
  return handler;
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = resolve(DIST, `.${normalize(requested)}`);

  if (file !== DIST && !file.startsWith(DIST + sep)) return notFound(res);

  try {
    const info = await stat(file);
    if (info.isDirectory()) return serveStatic(res, join(requested, "index.html"));

    const type = TYPES[extname(file)] || "application/octet-stream";
    const isAsset = file.includes(`${sep}assets${sep}`);
    // Hashed asset filenames are safe to cache hard; everything else is not.
    const cache = isAsset ? "public, max-age=31536000, immutable" : "no-cache";
    const headers = file === resolve(DIST, "gallery-frame.html") ? FRAME_HEADERS : SECURITY_HEADERS;

    res.writeHead(200, {
      ...headers,
      "Content-Type": type,
      "Cache-Control": cache,
      // The sandboxed renderer's opaque origin loads these as modules, which
      // needs CORS. They are public build output either way.
      ...(isAsset && { "Access-Control-Allow-Origin": "*" }),
    });
    res.end(await readFile(file));
  } catch {
    notFound(res);
  }
}

function notFound(res) {
  res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname.startsWith("/api/")) {
    // The identity debug endpoint prints real personal data. It refuses to run
    // outside dev on its own; this makes it unreachable as well.
    if (IS_PROD && pathname.startsWith("/api/debug")) return notFound(res);

    try {
      const handler = await loadHandler(pathname);
      if (!handler) return notFound(res);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
      await handler(req, res);
    } catch (error) {
      console.error(`[api] ${pathname}:`, error.stack || error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: "server_error" }));
    }
    return;
  }

  // /submit and /gallery are real pages, not directories.
  if (pathname === "/submit" || pathname === "/gallery") return serveStatic(res, `${pathname}.html`);

  return serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`receipt listening on :${PORT} (NODE_ENV=${process.env.NODE_ENV || "unset"})`);
});
