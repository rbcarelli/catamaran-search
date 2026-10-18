const DATA_MARK = "const DATA=";

export function extractJsonObject(text, start) {
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  let quote = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("Could not find the end of the JSON object");
  return JSON.parse(text.slice(start, end));
}

export function parseDashboardPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Empty listings payload");
  if (raw.startsWith("{") || raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { boats: parsed, run: null, built: null, sourceKind: "json-array" };
    const boats = Array.isArray(parsed.boats) ? parsed.boats : [];
    return { ...parsed, boats, sourceKind: "json" };
  }
  const idx = raw.indexOf(DATA_MARK);
  if (idx < 0) throw new Error("No listings JSON or const DATA= block found");
  const data = extractJsonObject(raw, idx + DATA_MARK.length);
  const boats = Array.isArray(data.boats) ? data.boats : [];
  return { ...data, boats, sourceKind: "html" };
}

export function listingUrl(boat) {
  const hit = (boat.listings || []).find((row) => row && row.url);
  return hit ? String(hit.url) : "";
}

export function listingPosted(boat) {
  const posted = (boat.listings || [])
    .map((row) => row && row.posted)
    .filter(Boolean)
    .map((value) => String(value).slice(0, 10))
    .sort();
  return posted[0] || null;
}

export function isSold(boat) {
  return String(boat.status || "").toLowerCase() === "sold";
}

export function isActiveListing(boat) {
  const status = String(boat.status || "").toLowerCase();
  return status === "active" || status === "under contract" || status === "stale";
}

export function soldDate(boat) {
  const blob = [boat.details, boat.notes].filter(Boolean).join(" ");
  const published = blob.match(/page published (\d{4}-\d{2}-\d{2})/i);
  const explicit = blob.match(/sold(?:\s+date)?(?:\s+on)?[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (explicit) {
    const idx = blob.toLowerCase().indexOf("sold");
    const window = blob.slice(Math.max(0, idx - 20), idx + explicit[0].length + 8);
    if (!/not shown/i.test(window)) return explicit[1];
  }
  if (published) return published[1];
  return null;
}

export function daysOnMarket(boat) {
  const start = listingPosted(boat);
  const end = soldDate(boat);
  if (!start || !end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

export function guessPhotoUrl(boat) {
  const url = listingUrl(boat);
  const sbl = url.match(/sailboatlistings\.com\/view\/(\d+)/i);
  if (sbl) return "https://www.sailboatlistings.com/sailimg/m/" + sbl[1] + "/main.jpg";
  return null;
}

export function listedStart(boat) {
  const posted = (boat.listings || [])
    .map((row) => row && row.posted)
    .filter(Boolean)
    .map((value) => String(value).slice(0, 10))
    .sort();
  if (posted.length) return posted[0];
  if (boat.first) return String(boat.first).slice(0, 10);
  return null;
}

export function formatListedFor(start, now = Date.now()) {
  if (!start) return "Time listed unknown";
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return "Time listed unknown";
  const days = Math.max(0, Math.floor((now - t) / 86400000));
  if (days <= 0) return "Listed today";
  if (days === 1) return "Listed 1 day";
  if (days < 14) return `Listed ${days} days`;
  const weeks = Math.round(days / 7);
  if (days < 60) return `Listed ${weeks} week${weeks === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.437);
  if (days < 365) return `Listed ${months} month${months === 1 ? "" : "s"}`;
  const years = Math.max(1, Math.floor(days / 365.25));
  const remMonths = Math.round((days - years * 365.25) / 30.437);
  if (remMonths <= 0) return `Listed ${years} year${years === 1 ? "" : "s"}`;
  return `Listed ${years}y ${remMonths}mo`;
}

export function emptyFeedbackStore() {
  return { updatedAt: null, items: [], byId: {} };
}

export function readFeedbackStore(raw) {
  if (!raw || !String(raw).trim()) return emptyFeedbackStore();
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const byId = parsed.byId && typeof parsed.byId === "object" ? { ...parsed.byId } : {};
  for (const row of items) {
    if (row && row.boatId) byId[row.boatId] = row;
  }
  return {
    updatedAt: parsed.updatedAt || null,
    items,
    byId,
  };
}

export function addFeedback(store, payload) {
  const action = String(payload.action || "note").toLowerCase();
  const allowed = new Set(["keep", "skip", "watch", "note", "ack-sold"]);
  const row = {
    at: new Date().toISOString(),
    boatId: payload.boatId || payload.id || null,
    title: payload.title || null,
    builder: payload.builder || null,
    model: payload.model || null,
    year: payload.year ?? null,
    action: allowed.has(action) ? action : "note",
    note: String(payload.note || ""),
  };
  if (!row.boatId) throw new Error("Feedback needs a boatId");
  const next = {
    updatedAt: row.at,
    items: [...store.items, row],
    byId: { ...store.byId, [row.boatId]: row },
  };
  return { store: next, row };
}
