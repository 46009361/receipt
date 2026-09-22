/* Which step the submit page should show, and nothing else.

   Deliberately returns no name, email or address. The page has no need to
   display them, and anything returned here is one XSS away from leaving. */

import { getSession } from "./_lib/session.js";
import { eligibilityBypassed } from "./_lib/hca.js";

export default async function handler(req, res) {
  const session = await getSession(req);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (!session) {
    return res.end(JSON.stringify({ signedIn: false, hackatimeLinked: false }));
  }

  res.end(
    JSON.stringify({
      signedIn: true,
      csrfToken: session.csrf,
      hackatimeLinked: Boolean(session.ht),
      // Also honoured here, so turning the bypass on doesn't require
      // signing out to shed a session sealed with elig: false.
      eligible: Boolean(session.elig) || eligibilityBypassed(),
    }),
  );
}
