import { exchangeCode, redirectUri, fetchIdentity, isEligible } from "../_lib/hca.js";
import { readCookie, setCookie, setSession, safeEqual } from "../_lib/session.js";

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(req, "rcpt_state");

  setCookie(res, "rcpt_state", "", 0);

  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return fail(res, "bad_request");
  }

  try {
    const tokens = await exchangeCode({ code, redirectUri: redirectUri(req) });

    // Eligibility is read once here rather than on every page load. Everything
    // else the identity carries — name, email, address — is dropped on the
    // floor: the cookie travels to the browser, and that data has no reason to.
    const identity = await fetchIdentity(tokens.access_token);
    setSession(res, { at: tokens.access_token, elig: isEligible(identity) });
  } catch {
    // Never echo the upstream error: it can carry the code or the secret.
    return fail(res, "auth_failed");
  }

  res.writeHead(302, { Location: "/submit" });
  res.end();
}

function fail(res, reason) {
  res.writeHead(302, { Location: `/submit?error=${reason}` });
  res.end();
}
