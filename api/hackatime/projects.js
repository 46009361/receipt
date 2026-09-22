/* The signed-in user's own Hackatime projects, for the picker.

   Their own project names and hours — nothing another party's data touches. */

import { getSession } from "../_lib/session.js";
import { fetchProjects } from "../_lib/hackatime.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  const session = await getSession(req);
  if (!session) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "not_signed_in" }));
  }
  if (!session.ht) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "hackatime_failed" }));
  }

  try {
    res.end(JSON.stringify({ projects: await fetchProjects(session.ht) }));
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "hackatime_failed" }));
  }
}
