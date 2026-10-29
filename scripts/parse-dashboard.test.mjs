import assert from "node:assert/strict";
import { addFeedback, daysOnMarket, extractJsonObject, formatListedFor, guessPhotoUrl, parseDashboardPayload, pickPhotoUrl, readFeedbackStore, soldDate } from "../lib/parse-dashboard.mjs";

const html = `<!doctype html><script>const DATA={"run":"2026-10-06","boats":[{"id":"lagoon-42","builder":"Lagoon","model":"42","year":2018,"price":450000,"first":"2026-10-04","listings":[{"posted":"2025-01-15","url":"https://example.com/a"}]}]};</script>`;
const fromHtml = parseDashboardPayload(html);
assert.equal(fromHtml.sourceKind, "html");
assert.equal(fromHtml.boats[0].id, "lagoon-42");
assert.equal(fromHtml.run, "2026-10-06");

const fromJson = parseDashboardPayload(JSON.stringify({ boats: [{ id: "x" }] }));
assert.equal(fromJson.sourceKind, "json");
assert.equal(fromJson.boats[0].id, "x");

const obj = extractJsonObject('{"a":{"b":1}}', 0);
assert.equal(obj.a.b, 1);

const now = Date.parse("2026-10-06T12:00:00Z");
assert.equal(formatListedFor("2026-10-06", now), "Listed today");
assert.equal(formatListedFor("2026-10-05", now), "Listed 1 day");
assert.equal(formatListedFor("2026-09-01", now), "Listed 5 weeks");
assert.equal(formatListedFor("2025-10-06", now), "Listed 1 year");
assert.equal(formatListedFor(null, now), "Time listed unknown");

const store = addFeedback(readFeedbackStore(""), {
  boatId: "lagoon-42",
  action: "keep",
  note: "survey next",
  title: "Lagoon 42",
});
assert.equal(store.row.action, "keep");
assert.equal(store.store.byId["lagoon-42"].note, "survey next");
assert.equal(store.store.items.length, 1);
const acked = addFeedback(store.store, { boatId: "lagoon-42", action: "ack-sold", note: "sold, done" });
assert.equal(acked.row.action, "ack-sold");

assert.equal(
  soldDate({ details: "sold; last asking price shown on JC; sold date not shown; JC page published 2019-06-08" }),
  "2019-06-08",
);
assert.equal(soldDate({ details: "sold on 2024-04-24" }), "2024-04-24");
assert.equal(
  daysOnMarket({
    listings: [{ posted: "2018-01-01" }],
    details: "JC page published 2019-06-08",
  }),
  523,
);
assert.equal(
  daysOnMarket({
    listings: [{ posted: "" }],
    first: "2026-10-06",
    details: "JC page published 2019-06-08",
  }),
  null,
);
assert.equal(
  guessPhotoUrl({ listings: [{ url: "https://www.sailboatlistings.com/view/93860" }] }),
  "https://www.sailboatlistings.com/sailimg/m/93860/main.jpg",
);
assert.equal(
  pickPhotoUrl({ img: "https://images.boatsgroup.com/resize/1/a.jpg" }, "https://fallback.example/x.jpg"),
  "https://images.boatsgroup.com/resize/1/a.jpg",
);
assert.equal(
  pickPhotoUrl({ img: "" }, "https://fallback.example/x.jpg"),
  "https://fallback.example/x.jpg",
);

console.log("parse-dashboard tests ok");
