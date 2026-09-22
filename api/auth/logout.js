import { clearSession, getSession, revokeSession } from "../_lib/session.js";
import { checkMutation } from "../_lib/csrf.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }
  try {
    const session = await getSession(req);
    if (session) {
      const rejection = checkMutation(req, session);
      if (rejection) {
        res.statusCode = rejection.status;
        return res.end(JSON.stringify({ error: rejection.error }));
      }
      await revokeSession(session);
    }
    clearSession(res);
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "logout_failed" }));
  }
}
