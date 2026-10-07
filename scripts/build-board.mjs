import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Code/catamaran-search";
const FETCH = "C:/Users/rbcar/.grok/sessions/C%3A%5CCode/01a109b6-a111-7ba0-8de0-4dd8736176ac/web_fetch";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function ftToM(ft) {
  if (ft == null || Number.isNaN(ft)) return null;
  return Math.round(ft * 0.3048 * 100) / 100;
}

function parseNum(value) {
  if (value == null || value === "" || value === "NA") return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function usdLabel(amount) {
  if (amount == null) return "Price not listed";
  return "$" + Math.round(amount).toLocaleString("en-US");
}

function titleCase(value) {
  if (!value) return value;
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanParts(parts) {
  return [...new Set(parts.map((p) => String(p || "").replace(/,\s*$/, "").trim()).filter(Boolean))];
}

const keepName =
  /catamaran|lagoon|fountaine\s*pajot|leopard|bali\b|nautitech|catana|excess|\bseawind\b|gemini|privilege|outremer|prout|catalac|iroquois|heavenly twins|pdq|maine\s*cat|sunreef|knysna|aventura|broadblue|antares|island spirit|wharram|crowther|grainger|dean\s*cat|world\s*cat|glacier bay|twin\s*v[eé]e|power\s*cat|multi.?hull|endeavour\s*cat|americat|\bmc50|hobie|nacra|prindle|manta\b|freeman|sea\s*cat/i;

const skipName =
  /allied\s*(seawind|sea\s*wind)|bavaria.*lagoon|lagoon\s*eigner|jeanneau\s*(voyage|12\.5\s*voyage)|trident\s*voyager|virgo\s*voyager|beetle\s*cat|cat\s*ketch|catboat|catalina\b|hobie\s*33/i;

function isCatName(text) {
  const s = String(text || "");
  if (skipName.test(s)) return false;
  if (/endeavour/i.test(s) && !/catamaran|trawlercat/i.test(s)) return false;
  return keepName.test(s);
}

function splitMakeModel(name) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  const makers = [
    "Fountaine Pajot",
    "McConaghy Boats",
    "McConaghy",
    "Heavenly Twins",
    "Endeavour Catamaran",
    "World Cat",
    "Glacier Bay",
    "Twin Vee",
    "Sea Cat",
    "Maine Cat",
    "Hobie Cat",
    "Hobie",
    "Nacra",
    "Lagoon",
    "Leopard",
    "Gemini",
    "Prout",
    "Iroquois",
    "Aventura",
    "Crowther",
    "Grainger",
    "PDQ",
    "Nautitech",
    "Dufour",
    "Jeanneau",
    "Sunreef",
    "Bali",
    "Catana",
    "Privilege",
    "Outremer",
    "Seawind",
    "Manta",
    "Racing Catamaran",
  ];
  for (const maker of makers) {
    const re = new RegExp("^" + maker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (re.test(text)) {
      const model = text.slice(maker.length).trim();
      return { maker, model: model || null, title: text };
    }
  }
  return { maker: text || "Maker not listed", model: null, title: text || "Maker not listed" };
}

const sources = {
  "boat-sales": {
    id: "boat-sales",
    label: "Boat-Sales",
    market: "European used-boat listings",
    repo: "https://github.com/halinakryvanos/Boat-Sales",
    file: "02 Data/Original Data/boat_data.csv",
  },
  boattrader: {
    id: "boattrader",
    label: "BoatTrader",
    market: "US BoatTrader listings",
    repo: "https://github.com/adhokshaja/BoatTrader-Analysis",
    file: "Boats_Cleaned_dataset.csv",
  },
  yachtworld: {
    id: "yachtworld",
    label: "YachtWorld",
    market: "YachtWorld sail listings",
    repo: "https://github.com/nattaylor/yw",
    file: "yachts.json",
  },
  "yachtworld-au": {
    id: "yachtworld-au",
    label: "YachtWorld AU",
    market: "Australian YachtWorld scrape",
    repo: "https://github.com/sjurgis/yachtworld-puppeteer",
    file: "yachtworld-1582445668829.csv",
  },
};

const boats = [];

{
  const existing = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catamarans.json"), "utf8"));
  for (const boat of existing.boats.filter((row) => String(row.id).startsWith("cat-"))) {
    boats.push({
      ...boat,
      title: boat.maker,
      model: null,
      hull: null,
      listingUrl: null,
      sourceId: "boat-sales",
      sourceLabel: sources["boat-sales"].label,
    });
  }
}

{
  const text = fs.readFileSync(path.join(FETCH, "9.txt"), "utf8");
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""));
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const r of rows.slice(1)) {
    const boatClass = r[idx.boatClass] || "";
    let hull = null;
    if (boatClass === "sail-catamaran") hull = "sail";
    else if (boatClass === "power-pcatamaran") hull = "power";
    else continue;
    const make = (r[idx.make] || "").trim();
    const model = (r[idx.model] || "").trim();
    const title = [make, model].filter(Boolean).join(" ");
    const lengthFt = parseNum(r[idx.length_ft]);
    const beamFt = parseNum(r[idx.beam_ft]);
    const amount = parseNum(r[idx.price]);
    const city = (r[idx.city] || "").trim();
    const state = (r[idx.state] || "").trim();
    const condition = r[idx.condition] ? titleCase(r[idx.condition]) : null;
    const material = r[idx.hullMaterial] ? titleCase(r[idx.hullMaterial]) : null;
    const fuel = r[idx.fuelType] ? titleCase(r[idx.fuelType]) : null;
    boats.push({
      id: "bt-" + r[idx.id],
      title,
      maker: make || "Maker not listed",
      model: model || null,
      priceLabel: usdLabel(amount),
      priceAmount: amount,
      currency: "USD",
      year: parseNum(r[idx.year]),
      lengthM: ftToM(lengthFt),
      beamM: ftToM(beamFt),
      lengthFt,
      material,
      condition,
      fuel,
      location: cleanParts([city, state, "United States"]),
      views: null,
      hull,
      listingUrl: null,
      sourceId: "boattrader",
      sourceLabel: sources.boattrader.label,
    });
  }
}

{
  const raw = JSON.parse(fs.readFileSync(path.join(FETCH, "10.json"), "utf8"));
  let n = 0;
  for (const row of raw) {
    const name = Array.isArray(row.name) ? row.name.join(" ") : String(row.name || "");
    if (!isCatName(name)) continue;
    const { maker, model, title } = splitMakeModel(name);
    const priceText = String(row.price || "");
    const amount = parseNum(priceText);
    const lengthParts = Array.isArray(row.length) ? row.length : [];
    const lengthFt = parseNum(lengthParts[0]);
    const year = parseNum(lengthParts[2] || lengthParts[1]);
    const location = cleanParts(Array.isArray(row.location) ? row.location : [row.location]);
    n += 1;
    boats.push({
      id: "yw-" + n,
      title,
      maker,
      model,
      priceLabel: amount == null ? priceText.replace(/\s*\*$/, "").trim() || "Price not listed" : usdLabel(amount),
      priceAmount: amount,
      currency: "USD",
      year,
      lengthM: ftToM(lengthFt),
      beamM: null,
      lengthFt,
      material: null,
      condition: "Used",
      fuel: null,
      location,
      views: null,
      hull: "sail",
      listingUrl: null,
      sourceId: "yachtworld",
      sourceLabel: sources.yachtworld.label,
    });
  }
}

{
  const text = fs.readFileSync(path.join(FETCH, "7.txt"), "utf8");
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.replace(/^"|"$/g, ""));
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const r of rows.slice(1)) {
    const make = r[idx.make] || "";
    const model = r[idx.model] || "";
    const blob = make + " " + model;
    if (!isCatName(blob)) continue;
    const cleanedModel = model.replace(/^\d+\s*ft\s+\d{4}\s+/i, "").replace(/\s+/g, " ").trim();
    const combined = (cleanedModel.toLowerCase().includes(make.toLowerCase()) || keepName.test(cleanedModel))
      ? cleanedModel
      : [make, cleanedModel].filter(Boolean).join(" ");
    const { maker, model: modelName, title } = splitMakeModel(combined);
    const lengthFt = parseNum(r[idx.length]);
    const amount = parseNum(r[idx.price]);
    const url = r[idx.url] || null;
    boats.push({
      id: "ywau-" + (url ? url.replace(/\D+/g, "").slice(-7) : boats.length),
      title: title || [maker, modelName].filter(Boolean).join(" "),
      maker,
      model: modelName,
      priceLabel: usdLabel(amount),
      priceAmount: amount,
      currency: "USD",
      year: parseNum(r[idx.year]),
      lengthM: ftToM(lengthFt),
      beamM: null,
      lengthFt,
      material: null,
      condition: "Used",
      fuel: null,
      location: [],
      views: null,
      hull: "sail",
      listingUrl: url,
      sourceId: "yachtworld-au",
      sourceLabel: sources["yachtworld-au"].label,
    });
  }
}

const counts = {};
for (const boat of boats) {
  const key = boat.sourceId + ":" + (boat.hull || "unspecified");
  counts[key] = (counts[key] || 0) + 1;
}
console.log("counts", counts, "total", boats.length);
console.log("YW titles:");
for (const boat of boats.filter((b) => b.sourceId.startsWith("yachtworld"))) {
  console.log(" ", boat.sourceId, boat.title, boat.year, boat.priceLabel, boat.location.join(" / "));
}

const payload = {
  note: "Catamaran rows taken from public Git listing dumps. Rows that only matched a catamaran brand name inside a known monohull model (Bavaria Lagoon, Allied Seawind, Jeanneau Voyage, Trident Voyager, Beetle Cat, cat-ketch) were left out. Boat-Sales does not mark sail versus power. BoatTrader sail-catamaran and power-pcatamaran classes are kept. YachtWorld dumps are sail listings.",
  sources: Object.values(sources),
  boats,
};

fs.writeFileSync(path.join(ROOT, "data/catamarans.json"), JSON.stringify(payload, null, 2));
console.log("wrote data/catamarans.json");

const htmlPath = path.join(ROOT, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes("__BOATS_JSON__") && !html.includes('<script id="boats"')) {
  throw new Error("index.html is missing the boats script tag");
}
const injected = html.replace(
  /<script id="boats" type="application\/json">[\s\S]*?<\/script>/,
  "<script id=\"boats\" type=\"application/json\">" + JSON.stringify(boats) + "</script>",
);
fs.writeFileSync(htmlPath, injected);
console.log("wrote index.html embed", boats.length);
