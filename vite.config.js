import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

const root = import.meta.dirname;

/* Vite only serves static files, so in dev `/api/me` would resolve to the file
   api/me.js and get sent back as JavaScript source. This runs the handler
   instead, with the same (req, res) signature the serverless host gives it. */
function apiRoutes() {
  return {
    name: "receipt-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { pathname } = new URL(req.url, "http://localhost");

        // /submit and /gallery are rewrites in production (see server.js); match them here.
        if (pathname === "/submit" || pathname === "/gallery") {
          req.url = `${pathname}.html` + req.url.slice(pathname.length);
          return next();
        }

        if (!pathname.startsWith("/api/") || pathname.includes("_lib")) return next();

        const file = resolve(root, `${pathname.slice(1)}.js`);
        if (!file.startsWith(resolve(root, "api")) || !existsSync(file)) return next();

        try {
          const module = await server.ssrLoadModule(file);
          await module.default(req, res);
        } catch (error) {
          server.config.logger.error(`[api] ${pathname}: ${error.stack || error}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
          }
          res.end(JSON.stringify({ error: "dev_handler_failed" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Handlers read process.env, so load .env for the dev server too.
  Object.assign(process.env, loadEnv(mode, root, ""));

  return {
    plugins: [apiRoutes()],
    server: {
      // The gallery renders sketches in a sandboxed frame, whose origin is
      // opaque, so its module requests arrive as `Origin: null`. Vite's default
      // (localhost only) would refuse them.
      cors: { origin: [/^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/, "null"] },
    },
    build: {
      // Emit assets as files rather than inlining small ones as data URIs, so
      // the placeholder printer image stays a file you can swap out.
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          main: resolve(root, "index.html"),
          submit: resolve(root, "submit.html"),
          gallery: resolve(root, "gallery.html"),
          galleryFrame: resolve(root, "gallery-frame.html"),
        },
      },
    },
  };
});
