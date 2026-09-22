import { exchangeCode } from "../_lib/hackatime.js";
import { publicUrl } from "../_lib/config.js";
import { getSession, setSession, setCookie, readCookie, safeEqual } from "../_lib/session.js";

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(req, "rcpt_ht_state");

  setCookie(res, "rcpt_ht_state", "", 0);

  const session = await getSession(req);
  if (!session) return fail(res, "not_signed_in");
  if (!code || !state || !expected || !safeEqual(state, expected)) return fail(res, "bad_request");

  try {
    const tokens = await exchangeCode({
      code,
      redirectUri: publicUrl("/api/auth/hackatime-callback"),
    });
    // Both tokens ride in the same encrypted cookie.
    setSession(res, { ...session, ht: tokens.access_token });
  } catch {
    return fail(res, "hackatime_failed");
  }

  res.writeHead(302, { Location: "/submit" });
  res.end();
}

function fail(res, reason) {
  res.writeHead(302, { Location: `/submit?error=${reason}` });
  res.end();
}
