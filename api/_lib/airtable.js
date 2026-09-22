/* Airtable write, mapped to the Unified YSWS Project Submission schema.

   Hours are deliberately NOT written to "Optional - Override Hours Spent". The
   unified pipeline computes them itself from the Hackatime project name and
   submitter id in the Justification fields; an override is for when that goes
   wrong, and filling it in unconditionally would defeat the check. */

import { createHash } from "node:crypto";

const API = "https://api.airtable.com/v0";
const CONTENT_API = "https://content.airtable.com/v0";
const ATTACHMENT_FIELD = "Screenshot";
// Coalesce concurrent requests in this process; Airtable holds persistent state.
const inFlight = new Set();

/* The exact record body a submission becomes. */
export function buildFields({
  identity,
  repoUrl,
  projectName,
  hours,
  description,
  hackatimeUserId,
  dateRange,
}) {
  const address = normalizeAddress(identity);

  const fields = {
    "First Name": pick(identity, "first_name", "given_name"),
    "Last Name": pick(identity, "last_name", "family_name"),
    Email: pick(identity, "primary_email", "email"),
    "Code URL": repoUrl,
    "Playable URL": repoUrl,
    Description: description,
    "GitHub Username": githubUsername(repoUrl),
    "Address (Line 1)": address.line1,
    "Address (Line 2)": address.line2,
    City: address.city,
    "State / Province": address.region,
    Country: address.country,
    "ZIP / Postal Code": address.postalCode,
    Birthday: pick(identity, "birthday", "birthdate", "date_of_birth"),
    "Slack Username": pick(identity, "slack_username", "slack_id"),
    "Justification - Hackatime Project Name(s) + Date Range(s)": `${projectName} (${dateRange})`,
    "Justification - Submitter Hackatime ID": String(hackatimeUserId ?? ""),
    "Justification - Additional Justification": `${hours}h tracked on "${projectName}" at submission time.`,
    "Automation - Submit to Unified YSWS": false,
  };

  // Airtable rejects the whole record over one empty value in some field types,
  // so drop the blanks rather than sending them.
  for (const [key, value] of Object.entries(fields)) {
    if (value === "" || value === null || value === undefined) delete fields[key];
  }
  return fields;
}

export function submissionKey(hackatimeUserId, projectName) {
  if (!hackatimeUserId) throw new Error("Hackatime ID required");
  return createHash("sha256").update(JSON.stringify([String(hackatimeUserId), projectName])).digest("hex");
}

export async function createSubmission(submission) {
  const key = submissionKey(submission.hackatimeUserId, submission.projectName);
  if (inFlight.has(key)) throw conflict("submission_pending");
  inFlight.add(key);
  try {
    const table = `${API}/${baseId()}/${tableName()}`;
    // Recover pending records, including creates whose response was lost.
    const params = new URLSearchParams({ filterByFormula: `{Submission Key} = '${key}'`, maxRecords: "2" });
    const found = await request(`${table}?${params}`, { method: "GET" });
    if (found.records.length > 1) throw conflict("already_submitted");
    let record = found.records[0];
    if (!record) {
      // Upsert only the key so retries cannot reset an existing record's
      // processing flag or overwrite its submitted fields.
      const result = await request(table, {
        method: "PATCH",
        body: JSON.stringify({
          performUpsert: { fieldsToMergeOn: ["Submission Key"] },
          records: [{ fields: { "Submission Key": key } }],
        }),
      });
      record = result.records[0];
    }
    if (record.fields?.["Automation - Submit to Unified YSWS"]) {
      throw conflict("already_submitted");
    }
    // Keep the first submission's fields and image together. If an upload
    // succeeded but its response was lost, reuse the existing attachment.
    if (!record.fields?.[ATTACHMENT_FIELD]?.length) {
      await request(`${table}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: buildFields(submission), typecast: true }),
      });
      await request(
        `${CONTENT_API}/${baseId()}/${record.id}/${encodeURIComponent(ATTACHMENT_FIELD)}/uploadAttachment`,
        {
          method: "POST",
          body: JSON.stringify({
            contentType: "image/png",
            filename: `receipt-${submission.projectName.replace(/[^a-z0-9-]/gi, "-")}.png`,
            file: submission.png.buf.toString("base64"),
          }),
        },
      );
    }
    await request(`${table}/${record.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { "Automation - Submit to Unified YSWS": true } }),
    });
    return record.id;
  } finally {
    inFlight.delete(key);
  }
}

function conflict(code) {
  return Object.assign(new Error(code), { code });
}

/* HCA returns either an OIDC `address` claim or an `addresses` array, and the
   two use different key names. Accept both rather than guessing wrong. */
function normalizeAddress(identity) {
  const a = identity?.address ?? identity?.addresses?.[0] ?? {};
  const street = pick(a, "street_address", "line_1", "line1", "address_line_1") || "";
  const [first, ...rest] = String(street).split("\n");

  return {
    line1: first || "",
    line2: pick(a, "line_2", "line2", "address_line_2") || rest.join(" ") || "",
    city: pick(a, "locality", "city") || "",
    region: pick(a, "region", "state", "state_province") || "",
    postalCode: pick(a, "postal_code", "zip_code", "zip") || "",
    country: pick(a, "country", "country_code") || "",
  };
}

function githubUsername(repoUrl) {
  try {
    return new URL(repoUrl).pathname.split("/").filter(Boolean)[0] || "";
  } catch {
    return "";
  }
}

function pick(object, ...keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

async function request(url, options) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${required("AIRTABLE_TOKEN")}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`airtable ${res.status}`);
  }
  return res.json();
}

const baseId = () => required("AIRTABLE_BASE_ID");
const tableName = () => encodeURIComponent(process.env.AIRTABLE_TABLE || "YSWS Project Submission");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
