import fs from "node:fs";
import path from "node:path";
import { guessPhotoUrl, isActiveListing, listingUrl } from "./parse-dashboard.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const SKIP =
  /logo|favicon|facebook-and-twitter|icon|sprite|placeholder|avatar|banner|pixel|blank|wordpress|emoji|gravatar|badge|button|apple-touch|cropped-favicon/i;
const PLAYWRIGHT_HOSTS = /(^|\.)catamaransite\.com$/i;
const SKIP_HOSTS = /(yachtworld\.com|boats\.com|boattrader\.com|facebook\.com)$/i;
const PLAYWRIGHT_MOD = "file:///C:/Code/parcel-of-rogues/node_modules/playwright/index.mjs";
const serverless = Boolean(process.env.VERCEL);

export function extractPhotoUrl(html, pageUrl) {
  const og =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i) ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og && og[1] && !SKIP.test(og[1])) return absoluteUrl(og[1], pageUrl);
  const found = [
    ...html.matchAll(/https?:\/\/[^"'\\\s>]+\.(?:jpe?g|png|webp)(?:\?[^"'\\\s>]*)?/gi),
    ...html.matchAll(/(?:src|data-src|data-lazy-src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi),
  ].map((m) => absoluteUrl(m[1] || m[0], pageUrl));
  const unique = [...new Set(found.filter(Boolean))];
  const preferred = unique.find(
    (url) => !SKIP.test(url) && !/-\d{2,3}x\d{2,3}\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url),
  );
  return preferred || unique.find((url) => !SKIP.test(url)) || null;
}

function absoluteUrl(value, pageUrl) {
  try {
    return new URL(String(value || "").trim(), pageUrl).href;
  } catch {
    return "";
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function createPhotoStore(filePath, options = {}) {
  const persistToDisk = options.persist !== false && !serverless;
  const usePlaywright = options.playwright !== false && !serverless;
  const cache = loadCache(filePath);
  const inflight = new Map();
  let fetchActive = 0;
  const fetchQueue = [];
  const playQueue = [];
  let playActive = false;
  let chromium = null;
  let browser = null;
  let persistTimer = null;

  function loadCache(target) {
    try {
      return JSON.parse(fs.readFileSync(target, "utf8"));
    } catch {
      return {};
    }
  }

  function persist() {
    if (!persistToDisk) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(cache, null, 2) + "\n");
      } catch (error) {
        console.warn("photos cache:", error.message || error);
      }
    }, 400);
  }

  function remember(id, url) {
    cache[id] = { url: url || null, ok: Boolean(url), at: new Date().toISOString() };
    persist();
    return url || null;
  }

  function urlFor(id) {
    const row = cache[id];
    return row && row.ok ? row.url : null;
  }

  function map() {
    const out = {};
    for (const [id, row] of Object.entries(cache)) {
      if (row && row.ok && row.url) out[id] = row.url;
    }
    return out;
  }

  async function fetchHtml(url) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.text();
  }

  async function ensureBrowser() {
    if (browser) return browser;
    if (!chromium) {
      const mod = await import(PLAYWRIGHT_MOD);
      chromium = mod.chromium;
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    return browser;
  }

  async function fetchHtmlPlaywright(url) {
    const chrome = await ensureBrowser();
    const page = await chrome.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      if (resp && resp.status() >= 400) throw new Error("HTTP " + resp.status());
      await page.waitForTimeout(1200);
      return await page.content();
    } finally {
      await page.close();
    }
  }

  async function resolveOne(boat) {
    const id = boat.id;
    if (cache[id] && (cache[id].ok || cache[id].url === null)) return urlFor(id);
    const guessed = guessPhotoUrl(boat);
    if (guessed) return remember(id, guessed);
    const pageUrl = listingUrl(boat);
    if (!pageUrl) return remember(id, null);
    const host = hostOf(pageUrl);
    if (SKIP_HOSTS.test(host)) return remember(id, null);
    try {
      const html =
        usePlaywright && PLAYWRIGHT_HOSTS.test(host)
          ? await fetchHtmlPlaywright(pageUrl)
          : await fetchHtml(pageUrl);
      return remember(id, extractPhotoUrl(html, pageUrl));
    } catch (error) {
      console.warn("photo", id, error.message || error);
      return remember(id, null);
    }
  }

  function pumpFetch() {
    while (fetchActive < 3 && fetchQueue.length) {
      const boat = fetchQueue.shift();
      fetchActive += 1;
      resolveOne(boat)
        .catch((error) => console.warn("photo", boat.id, error.message || error))
        .finally(() => {
          fetchActive -= 1;
          pumpFetch();
        });
    }
  }

  function pumpPlay() {
    if (playActive || !playQueue.length) return;
    playActive = true;
    const boat = playQueue.shift();
    resolveOne(boat)
      .catch((error) => console.warn("photo", boat.id, error.message || error))
      .finally(() => {
        playActive = false;
        pumpPlay();
      });
  }

  function enqueue(boat) {
    if (!boat || !boat.id) return;
    if (cache[boat.id] && cache[boat.id].at) return;
    if (inflight.has(boat.id)) return;
    inflight.set(boat.id, true);
    const guessed = guessPhotoUrl(boat);
    if (guessed) {
      remember(boat.id, guessed);
      return;
    }
    const pageUrl = listingUrl(boat);
    const host = hostOf(pageUrl);
    if (!pageUrl || SKIP_HOSTS.test(host)) {
      remember(boat.id, null);
      return;
    }
    if (usePlaywright && PLAYWRIGHT_HOSTS.test(host)) {
      playQueue.push(boat);
      pumpPlay();
      return;
    }
    fetchQueue.push(boat);
    pumpFetch();
  }

  function warm(boats) {
    if (serverless) return;
    for (const boat of boats) {
      if (isActiveListing(boat)) enqueue(boat);
    }
  }

  return { urlFor, map, warm, enqueue };
}
