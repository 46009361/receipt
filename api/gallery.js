/* Every finished submission's sketch source, for the gallery to run. */

import { getGallery } from "./_lib/gallery.js";
import { isDev } from "./_lib/config.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });

  try {
    const items = await getGallery();
    res.setHeader("Cache-Control", "public, max-age=60");
    return json(res, 200, { items });
  } catch (error) {
    console.error("[gallery]", error.message);
    res.setHeader("Cache-Control", "no-store");
    return json(res, 502, { error: "gallery_failed", ...(isDev() && { detail: error.message }) });
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
