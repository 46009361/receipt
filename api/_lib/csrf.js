import { configuredOrigin } from "./config.js";
import { safeEqual } from "./session.js";

export function checkMutation(req, session) {
  if (req.headers.origin !== configuredOrigin()) return { status: 403, error: "csrf_failed" };
  const type = req.headers["content-type"];
  if (typeof type !== "string" || type.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { status: 415, error: "json_required" };
  }
  const token = req.headers["x-csrf-token"];
  if (!session?.csrf || typeof token !== "string" || !safeEqual(token, session.csrf)) {
    return { status: 403, error: "csrf_failed" };
  }
  return null;
}
