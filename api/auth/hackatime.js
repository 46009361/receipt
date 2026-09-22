import { randomBytes } from "node:crypto";
import { authorizeUrl } from "../_lib/hackatime.js";
import { publicUrl } from "../_lib/config.js";
import { getSession, setCookie } from "../_lib/session.js";

export default async function handler(req, res) {
  // Hackatime is linked to an existing sign-in, never instead of one.
  if (!(await getSession(req))) {
    res.writeHead(302, { Location: "/submit?error=not_signed_in" });
    return res.end();
  }

  const state = randomBytes(16).toString("base64url");
  setCookie(res, "rcpt_ht_state", state, 600);
  res.writeHead(302, {
    Location: authorizeUrl({ state, redirectUri: publicUrl("/api/auth/hackatime-callback") }),
  });
  res.end();
}
