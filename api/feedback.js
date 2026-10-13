import { recordFeedback } from "../lib/board.mjs";
import { cors, readJsonBody } from "../lib/http.mjs";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method === "GET") {
    const { loadBoard } = await import("../lib/board.mjs");
    const data = await loadBoard();
    res.status(200).json({ updatedAt: data.feedbackUpdatedAt || null });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const payload = await readJsonBody(req);
    const result = await recordFeedback(payload);
    res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || error) });
  }
}
