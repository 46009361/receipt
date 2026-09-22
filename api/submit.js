/* Receipt submission.

   The browser sends { repoUrl, png } and nothing else. The mailing address is
   fetched here, from HCA, with the server-held token, and handed to Airtable
   without ever appearing in a response body. */

import { getSession } from "./_lib/session.js";
import { fetchIdentity, isEligible } from "./_lib/hca.js";
import { fetchProjectSeconds, fetchUserId, START_DATE } from "./_lib/hackatime.js";
import { createSubmission } from "./_lib/airtable.js";
import { decodePng } from "./_lib/png.js";
import { checkMutation } from "./_lib/csrf.js";
import { isDev } from "./_lib/config.js";

const MAX_PNG_BYTES = 2 * 1024 * 1024;
const MIN_DESCRIPTION = 20;
const MAX_DESCRIPTION = 600;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  const session = await getSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const rejection = checkMutation(req, session);
  if (rejection) return json(res, rejection.status, { error: rejection.error });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "bad_json" });
  }

  const projectName = validateProjectName(body?.projectName);
  if (!projectName) return json(res, 400, { error: "bad_project_name" });

  const repoUrl = validateRepoUrl(body?.repoUrl);
  if (!repoUrl) return json(res, 400, { error: "bad_repo_url" });

  const description = validateDescription(body?.description);
  if (!description) return json(res, 400, { error: "bad_description" });

  let png;
  try {
    png = await decodePng(body?.png);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  // Authoritative eligibility check. The page gates on this too, but that is
  // only so nobody fills in a form they can't submit — this is the one that
  // counts, and it reads HCA fresh rather than trusting the cookie.
  let identity;
  try {
    identity = await fetchIdentity(session.at);
  } catch (error) {
    return fail(res, "identity", error);
  }
  if (!isEligible(identity)) {
    return json(res, 403, { error: "not_eligible" });
  }

  if (!session.ht) return json(res, 400, { error: "hackatime_failed" });

  // Hours come from Hackatime, not from the submitter.
  let seconds;
  try {
    seconds = await fetchProjectSeconds(session.ht, projectName);
  } catch (error) {
    console.error("[submit] hackatime:", error.message);
    return json(res, 502, { error: "hackatime_failed", ...(isDev() && { detail: error.message }) });
  }

  if (seconds === null) return json(res, 400, { error: "project_not_found" });

  // The stable account ID namespaces project uniqueness; no HCA ownership comparison.
  let hackatimeUserId = "";
  try {
    hackatimeUserId = await fetchUserId(session.ht);
  } catch (error) {
    return json(res, 502, { error: "hackatime_failed" });
  }

  if (!hackatimeUserId) return json(res, 502, { error: "hackatime_failed" });

  const hours = Math.round((seconds / 3600) * 10) / 10;

  try {
    // The address on `identity` lives only for this call and goes nowhere else.
    await createSubmission({
      identity,
      repoUrl,
      png,
      projectName,
      hours,
      description,
      hackatimeUserId,
      dateRange: `${START_DATE} to ${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (error) {
    if (error.code === "already_submitted" || error.code === "submission_pending") {
      return json(res, 409, { error: error.code });
    }
    return fail(res, "airtable", error);
  }

  return json(res, 200, { ok: true, hours });
}

function validateProjectName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 120 ? name : null;
}

function validateDescription(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length >= MIN_DESCRIPTION && text.length <= MAX_DESCRIPTION ? text : null;
}

function validateRepoUrl(value) {
  if (typeof value !== "string" || value.length > 300) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  if (url.pathname.split("/").filter(Boolean).length < 2) return null;
  return url.toString();
}

async function readJson(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_PNG_BYTES * 2) throw new Error("too_large");
    return JSON.parse(raw);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PNG_BYTES * 2) throw new Error("too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/* The response stays generic because upstream errors can quote the access token
   or the address. The reason still has to go somewhere, so it goes to the
   server log, and to the client only on a local dev server. */
function fail(res, stage, error) {
  console.error(`[submit] ${stage}:`, error.message);
  return json(res, 502, {
    error: "submit_failed",
    ...(isDev() && { detail: `${stage}: ${error.message}` }),
  });
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
