import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addFeedback,
  daysOnMarket,
  guessPhotoUrl,
  parseDashboardPayload,
  readFeedbackStore,
  soldDate,
} from "./parse-dashboard.mjs";
import { createPhotoStore } from "./photos.mjs";
import { hasGithubToken, readGithubFile, writeGithubFile } from "./github.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverless = Boolean(process.env.VERCEL);
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const CACHE_PATH = path.join(ROOT, "data", "listings.json");
const FEEDBACK_PATH = path.join(ROOT, "data", "feedback.json");
const PHOTOS_PATH = path.join(ROOT, "data", "photos.json");

const photos = createPhotoStore(PHOTOS_PATH, {
  persist: !serverless,
  playwright: !serverless,
});

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function loadConfig() {
  return readJson(CONFIG_PATH, {});
}

function loadLocalFeedback() {
  try {
    return readFeedbackStore(fs.readFileSync(FEEDBACK_PATH, "utf8"));
  } catch {
    return readFeedbackStore("");
  }
}

function saveLocalFeedback(store) {
  if (serverless) return;
  fs.mkdirSync(path.dirname(FEEDBACK_PATH), { recursive: true });
  fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(store, null, 2) + "\n");
}

function overlayBoats(boats, store) {
  const trackedIds = new Set();
  for (const item of store.items || []) {
    if (item && (item.action === "watch" || item.action === "ack-sold")) trackedIds.add(item.boatId);
  }
  return boats.map((boat) => {
    const row = store.byId[boat.id];
    const extra = {
      photoUrl: photos.urlFor(boat.id) || guessPhotoUrl(boat) || null,
      soldDate: soldDate(boat),
      daysOnMarket: daysOnMarket(boat),
      wasWatched: trackedIds.has(boat.id) || row?.action === "watch" || row?.action === "ack-sold",
    };
    if (!row) return { ...boat, ...extra };
    return {
      ...boat,
      ...extra,
      feedback: row.action,
      feedbackNote: row.note || "",
      feedbackAt: row.at,
      watch: row.action === "watch",
    };
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/html, application/json;q=0.9, */*;q=0.8" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " from " + url);
  return response.text();
}

async function loadFeedbackStore(config) {
  if (hasGithubToken()) {
    try {
      const file = await readGithubFile({
        repo: config.repo,
        path: config.feedbackGitPath || "feedback/feedback.json",
        branch: config.branch || "main",
      });
      if (file.text) return { store: readFeedbackStore(file.text), sha: file.sha, from: "github" };
    } catch (error) {
      console.warn("feedback github:", error.message || error);
    }
  }
  return { store: loadLocalFeedback(), sha: null, from: "local" };
}

export async function loadBoard() {
  const config = loadConfig();
  const feedback = await loadFeedbackStore(config);
  const errors = [];
  let payload = null;
  let from = "cache";

  const urls = [config.dashboardUrl, config.listingsJsonUrl].filter(Boolean);
  for (const url of urls) {
    try {
      payload = parseDashboardPayload(await fetchText(url));
      from = url.includes("listings.json") ? "github-json" : "github-html";
      break;
    } catch (error) {
      errors.push(String(error.message || error));
    }
  }

  if (!payload) {
    if (!fs.existsSync(CACHE_PATH)) {
      return {
        boats: [],
        photos: photos.map(),
        from: "none",
        repo: config.repo || null,
        pagesUrl: config.pagesUrl || null,
        run: null,
        built: null,
        updatedAt: null,
        fetchError: errors.join(" · ") || "No listings cache yet",
        feedbackUpdatedAt: feedback.store.updatedAt,
        feedbackWritable: hasGithubToken() || !serverless,
      };
    }
    payload = parseDashboardPayload(fs.readFileSync(CACHE_PATH, "utf8"));
    from = "cache";
  } else if (!serverless) {
    const snapshot = JSON.stringify({ run: payload.run || null, built: payload.built || null, boats: payload.boats }, null, 2) + "\n";
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, snapshot);
  }

  const boats = overlayBoats(payload.boats || [], feedback.store);
  photos.warm(boats);

  return {
    repo: config.repo || null,
    pagesUrl: config.pagesUrl || null,
    run: payload.run || null,
    built: payload.built || null,
    updatedAt: payload.built || payload.run || null,
    boats,
    photos: photos.map(),
    from,
    fetchError: errors.length ? errors.join(" · ") : null,
    feedbackUpdatedAt: feedback.store.updatedAt,
    feedbackWritable: hasGithubToken() || !serverless,
    count: (payload.boats || []).length,
  };
}

export function photoMap() {
  return photos.map();
}

async function publishLocalGit(config, contents, row) {
  const { ensureClone, writeAndCommit } = await import("../scripts/git-sync.mjs");
  const cloneDir = path.join(ROOT, "data", "github-sync");
  const repoUrl = config.repoUrl || (config.repo ? "https://github.com/" + config.repo + ".git" : null);
  if (!repoUrl) throw new Error("No repoUrl in data/config.json");
  ensureClone({ cloneDir, repoUrl, branch: config.branch || "main" });
  const git = writeAndCommit({
    cloneDir,
    relPath: config.feedbackGitPath || "feedback/feedback.json",
    contents,
    message: "Feedback " + row.action + " " + row.boatId,
    branch: config.branch || "main",
  });
  if (git.pushed) {
    console.log("published feedback/feedback.json to git");
    return;
  }
  throw new Error(git.pushError || "git push failed");
}

export async function recordFeedback(payload) {
  const config = loadConfig();
  if (serverless && !hasGithubToken()) {
    return {
      ok: false,
      stored: false,
      published: false,
      publishing: false,
      error: "Feedback is not saving. Add GITHUB_TOKEN in the Vercel project env vars (repo access to rbcarelli/catamaran-dashboard).",
    };
  }
  const current = await loadFeedbackStore(config);
  const next = addFeedback(current.store, payload);
  saveLocalFeedback(next.store);
  const contents = JSON.stringify(next.store, null, 2) + "\n";
  let published = false;
  let publishError = null;
  if (hasGithubToken()) {
    try {
      await writeGithubFile({
        repo: config.repo,
        path: config.feedbackGitPath || "feedback/feedback.json",
        branch: config.branch || "main",
        contents,
        message: "Feedback " + next.row.action + " " + next.row.boatId,
        sha: current.sha,
      });
      published = true;
    } catch (error) {
      publishError = String(error.message || error);
    }
  } else {
    try {
      await publishLocalGit(config, contents, next.row);
      published = true;
    } catch (error) {
      publishError = String(error.message || error);
    }
  }
  const stored = !serverless;
  const ok = published || stored;
  return {
    ok,
    row: next.row,
    stored,
    published,
    publishing: false,
    publishError,
    error: ok ? null : publishError || "Feedback was not saved.",
  };
}
