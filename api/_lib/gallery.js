/* Public gallery data.

   Airtable holds only the repo link, so each sketch is read from GitHub. The
   records also hold addresses, so the Airtable request names the few fields
   it needs and nothing else is ever fetched. */

import { isDev } from "./config.js";

const API = "https://api.airtable.com/v0";
const FIELDS = ["Code URL", "Slack Username", "Screenshot", "Rejected"];
// Where the starter keeps it, then the repo root for anyone who flattened it.
const SKETCH_PATHS = ["editor/sketch.js", "sketch.js"];
const MAX_SKETCH_BYTES = 256 * 1024;
const TTL = 10 * 60 * 1000;
const NAME_TTL = 24 * 60 * 60 * 1000;
const RETRY = 60 * 1000;

let cached = null;
let pending = null;
const names = new Map();

/* Serve the last build while a fresh one is fetched, so only the very first
   visitor after boot waits on GitHub. */
export function getGallery() {
  if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.items);
  pending ??= buildGallery()
    .then((items) => {
      cached = { at: Date.now(), items };
      return items;
    })
    .catch((error) => {
      // Keep the stale wall up and back off a minute, rather than send every
      // visitor to Airtable while it's down.
      if (cached) cached.at = Date.now() - TTL + RETRY;
      throw error;
    })
    .finally(() => { pending = null; });
  if (!cached) return pending;
  // Nobody awaits a background refresh, and an unhandled rejection would take
  // the whole server down.
  pending.catch((error) => console.error("[gallery] refresh:", error.message));
  return Promise.resolve(cached.items);
}

async function buildGallery() {
  const records = await listRecords();
  // Only finished submissions (a record without its PNG never completed) that
  // a reviewer hasn't rejected.
  const done = records
    .filter((r) => r.fields["Code URL"] && r.fields.Screenshot?.length && !r.fields.Rejected)
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime));

  const items = await mapLimit(done, 6, async (record) => {
    const repo = parseRepo(record.fields["Code URL"]);
    if (!repo) return null;
    const sketch = await fetchSketch(repo);
    if (!sketch) return null;
    const slackId = String(record.fields["Slack Username"] || "");
    return {
      slug: `${repo.owner}/${repo.name}`.toLowerCase(),
      author: (await slackName(slackId)) || repo.owner,
      slackId: /^[UW][A-Z0-9]+$/.test(slackId) ? slackId : null,
      repoUrl: `https://github.com/${repo.owner}/${repo.name}`,
      sketchUrl: `https://github.com/${repo.owner}/${repo.name}/blob/${sketch.ref}/${sketch.path}`,
      height: declaredHeight(sketch.source),
      source: sketch.source,
    };
  });
  // Permalinks are the repo, which reads better than an Airtable ID. The same
  // repo submitted twice keeps both, newest first as the plain slug.
  const seen = new Map();
  return items.filter(Boolean).map((item) => {
    const count = (seen.get(item.slug) || 0) + 1;
    seen.set(item.slug, count);
    return count === 1 ? item : { ...item, slug: `${item.slug}-${count}` };
  });
}

async function listRecords() {
  const table = encodeURIComponent(process.env.AIRTABLE_TABLE || "YSWS Project Submission");
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const field of FIELDS) params.append("fields[]", field);
    if (offset) params.set("offset", offset);
    const res = await fetch(`${API}/${required("AIRTABLE_BASE_ID")}/${table}?${params}`, {
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${required("AIRTABLE_TOKEN")}` },
    });
    if (!res.ok) {
      const body = isDev() ? ` ${(await res.text()).slice(0, 400)}` : "";
      throw new Error(`airtable ${res.status}${body}`);
    }
    const page = await res.json();
    records.push(...page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

/* Accepts the shapes people actually paste: the bare repo, a trailing slash,
   `.git`, or a /tree/ or /blob/ link into a branch. */
export function parseRepo(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname)) return null;
  const [owner, rawName, kind, ref] = url.pathname.split("/").filter(Boolean);
  const name = rawName?.replace(/\.git$/, "");
  const safe = /^[A-Za-z0-9_.-]+$/;
  if (!safe.test(owner || "") || !safe.test(name || "")) return null;
  const branch = (kind === "tree" || kind === "blob") && ref && safe.test(ref) ? ref : "HEAD";
  return { owner, name, ref: branch };
}

/* A guess at receipt.height, only so the page can hold the right space while
   the sketch renders. The render itself reads the real value. */
function declaredHeight(source) {
  const match = /export\s+const\s+receipt\s*=\s*\{[^}]*?\bheight\s*:\s*(\d+)/.exec(source);
  const height = Number(match?.[1]);
  return height >= 240 && height <= 2000 ? height : null;
}

async function fetchSketch({ owner, name, ref }) {
  for (const path of SKETCH_PATHS) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${name}/${ref}/${path}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const source = await res.text();
      if (source.length > MAX_SKETCH_BYTES || !source.includes("drawReceipt")) return null;
      return { source, path, ref };
    } catch {
      // A slow repo shouldn't sink the whole gallery; it just isn't shown.
    }
  }
  return null;
}

/* The Airtable field is named "Slack Username" but holds the member ID.
   Cachet is Hack Club's public Slack profile cache, so no bot token is needed. */
async function slackName(id) {
  if (!/^[UW][A-Z0-9]+$/.test(id)) return null;
  const hit = names.get(id);
  if (hit && Date.now() < hit.until) return hit.name;
  let name = null;
  try {
    const res = await fetch(`https://cachet.dunkirk.sh/users/${id}`, { signal: AbortSignal.timeout(5000) });
    // 202 is Cachet still looking the user up; its body says "Unknown".
    if (res.status === 200) {
      const user = await res.json();
      name = String(user.displayName || user.realName || "").trim().slice(0, 80) || null;
    }
  } catch {
    // Falls back to the GitHub username.
  }
  // A miss is retried on the next rebuild rather than held for a day.
  names.set(id, { until: Date.now() + (name ? NAME_TTL : TTL), name });
  return name;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
