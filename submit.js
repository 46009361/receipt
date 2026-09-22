let csrfToken = "";
const card = document.querySelector(".submit-card");
const views = {
  trouble: document.querySelector('[data-view="trouble"]'),
  needsHackatime: document.querySelector('[data-view="needs-hackatime"]'),
  signedIn: document.querySelector('[data-view="signed-in"]'),
  done: document.querySelector('[data-view="done"]'),
};
const statusEl = document.querySelector("[data-status]");
const select = card.projectName;
const description = card.description;

const ERRORS = {
  bad_repo_url: "That needs to be a public GitHub repo link.",
  bad_project_name: "Pick the project you built this under.",
  bad_description: "Tell us what you made, at least 20 characters.",
  not_eligible: "Your Hack Club account isn't YSWS eligible, so you can't submit.",
  missing_png: "Add the PNG the editor exported.",
  not_a_png: "That file isn't a PNG.",
  png_too_large: "That PNG is over 2MB. Export it again from the editor.",
  bad_width: "The PNG has to be exactly 384px wide. Re-export it from the editor.",
  bad_height: "The PNG has to be 240–2000px tall. Adjust the height in sketch.js.",
  project_not_found: "Hackatime doesn't have that project any more. Reload and pick again.",
  already_submitted: "This Hackatime project has already been submitted.",
  submission_pending: "This project is still being processed. Try again shortly; contact us if it stays pending.",
  csrf_failed: "Reload the page and try again.",
  hackatime_failed: "Couldn't reach Hackatime. Try connecting again.",
  not_signed_in: "Your session expired. Sign in again.",
  submit_failed: "Something broke on our end. Try again in a minute.",
  auth_failed: "Sign-in didn't go through. Give it another go.",
  bad_request: "Sign-in didn't go through. Give it another go.",
  dev_handler_failed: "The API isn't running. Check the dev server logs.",
};

function show(view) {
  Object.values(views).forEach((el) => el && (el.hidden = true));
  if (view) view.hidden = false;
  card.hidden = false; // kept hidden until now so nothing flashes before the redirect
}

function setStatus(message, tone) {
  statusEl.hidden = !message;
  statusEl.textContent = message || "";
  statusEl.dataset.tone = tone || "";
}

function describe(result, fallback) {
  // Present only on a local dev server, where the real reason is worth showing.
  if (result?.detail) return `${ERRORS[result.error] || fallback} (${result.detail})`;
  return ERRORS[result?.error] || fallback;
}

/* ---------- description ---------- */

const countEl = document.querySelector("[data-count]");
description.addEventListener("input", () => {
  countEl.textContent = description.value.trim().length;
});

/* ---------- artwork ---------- */

const dropzone = document.querySelector("[data-dropzone]");
const dropfile = document.querySelector("[data-dropfile]");
const fileInput = document.querySelector("[data-fileinput]");
const preview = document.querySelector("[data-preview]");
const filenameEl = document.querySelector("[data-filename]");
const filemetaEl = document.querySelector("[data-filemeta]");

let previewUrl = null;

function acceptFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    dropzone.dataset.state = "bad";
    return setStatus("That's not an image. The editor exports a PNG.", "bad");
  }
  if (file.type !== "image/png") {
    dropzone.dataset.state = "bad";
    return setStatus("It has to be a PNG, that's what the printer takes.", "bad");
  }

  // Put it on the real input so the form sees it on submit.
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);

  const kb = Math.max(1, Math.round(file.size / 1024));
  preview.src = previewUrl;
  filenameEl.textContent = file.name;
  filemetaEl.textContent = `${kb} KB`;

  // Check the printer's dimensions here too, so a bad export is caught before
  // it's uploaded. The server still has the final say.
  const probe = new Image();
  probe.onload = () => {
    filemetaEl.textContent = `${probe.width}×${probe.height} · ${kb} KB`;
    if (probe.width !== 384 || probe.height < 240 || probe.height > 2000) {
      setStatus(
        `That's ${probe.width}×${probe.height}. It needs to be 384px wide and 240–2000 tall, so re-export it.`,
        "bad",
      );
    }
  };
  probe.src = previewUrl;

  dropzone.hidden = true;
  dropfile.hidden = false;
  delete dropzone.dataset.state;
  setStatus("");
}

dropzone.addEventListener("click", () => fileInput.click());
document.querySelector("[data-replace]").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => acceptFile(fileInput.files[0]));

// Without preventDefault on dragover the browser just opens the dropped file.
["dragenter", "dragover"].forEach((type) =>
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.dataset.state = "over";
  }),
);

dropzone.addEventListener("dragleave", (event) => {
  if (!dropzone.contains(event.relatedTarget)) delete dropzone.dataset.state;
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  delete dropzone.dataset.state;
  acceptFile(event.dataTransfer?.files?.[0]);
});

// The page as a whole is a drop target as far as the browser is concerned; stop
// it navigating away when someone misses the box.
["dragover", "drop"].forEach((type) =>
  window.addEventListener(type, (event) => {
    if (!dropzone.contains(event.target)) event.preventDefault();
  }),
);

/* ---------- projects ---------- */

async function loadProjects() {
  select.innerHTML = '<option value="">Loading your projects…</option>';
  select.disabled = true;

  try {
    const response = await fetch("/api/hackatime/projects");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || response.status);

    if (!result.projects.length) {
      select.innerHTML = '<option value="">No projects found on Hackatime</option>';
      setStatus("Hackatime has no projects for you yet. Code for a bit, then reload.", "bad");
      return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">Choose a project…</option>';
    for (const project of result.projects) {
      const option = document.createElement("option");
      option.value = project.name;
      option.textContent = `${project.name} (${project.hours}h)`;
      select.append(option);
    }
  } catch (error) {
    console.error(error);
    select.innerHTML = '<option value="">Couldn\'t load projects</option>';
    setStatus(ERRORS.hackatime_failed, "bad");
  }
}

/* ---------- boot ---------- */

const initialError = new URL(location.href).searchParams.get("error");
if (initialError) {
  setStatus(ERRORS[initialError] || "Something went wrong.", "bad");
  history.replaceState(null, "", location.pathname);
}

try {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error(`/api/me returned ${response.status}`);
  const state = await response.json();
  const { signedIn, hackatimeLinked, eligible } = state;
  csrfToken = state.csrfToken || "";

  // Nothing to read while signed out, so don't make them click through a page
  // that only says "sign in" — go to HCA. Unless we arrived here *from* a
  // failed callback, which would otherwise bounce straight back and loop.
  if (!signedIn && !initialError) {
    location.replace("/api/auth/login");
  } else if (!signedIn) {
    show(views.trouble);
  } else if (!eligible) {
    // No flow to offer someone who isn't eligible — just say so.
    show(null);
    setStatus(ERRORS.not_eligible, "bad");
  } else if (!hackatimeLinked) {
    show(views.needsHackatime);
  } else {
    show(views.signedIn);
    loadProjects();
  }
} catch (error) {
  console.error(error);
  show(views.trouble);
}

card.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = card.querySelector('button[type="submit"]');
  const file = fileInput.files[0];

  if (!select.value) return setStatus(ERRORS.bad_project_name, "bad");
  if (!card.repoUrl.value.trim()) return setStatus(ERRORS.bad_repo_url, "bad");
  if (description.value.trim().length < 20) return setStatus(ERRORS.bad_description, "bad");
  if (!file) return setStatus(ERRORS.missing_png, "bad");

  button.disabled = true;
  setStatus("Sending…", "");

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        projectName: select.value,
        repoUrl: card.repoUrl.value.trim(),
        description: description.value.trim(),
        png: await toBase64(file),
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (response.ok) {
      setStatus("");
      show(views.done);
      return;
    }
    if (result.error === "not_signed_in") return location.replace("/api/auth/login");
    if (result.error === "hackatime_failed") show(views.needsHackatime);
    setStatus(describe(result, "Something went wrong."), "bad");
  } catch (error) {
    console.error(error);
    setStatus("Couldn't reach the server. Check your connection.", "bad");
  } finally {
    button.disabled = false;
  }
});

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

for (const link of document.querySelectorAll('[href="/api/auth/logout"]')) {
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: "{}",
      });
      if (!response.ok) throw new Error("logout failed");
      location.assign("/");
    } catch { setStatus("Couldn't sign out. Reload and try again.", "bad"); }
  });
}
