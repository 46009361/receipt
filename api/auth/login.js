import { randomBytes } from "node:crypto";
import { authorizeUrl, redirectUri } from "../_lib/hca.js";
import { setCookie } from "../_lib/session.js";

export default function handler(req, res) {
  // CSRF: a random state echoed back by HCA and checked in the callback.
  const state = randomBytes(16).toString("base64url");
  setCookie(res, "rcpt_state", state, 600);
  res.writeHead(302, { Location: authorizeUrl({ state, redirectUri: redirectUri(req) }) });
  res.end();
}
