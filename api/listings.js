import { loadBoard } from "../lib/board.mjs";
import { cors } from "../lib/http.mjs";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    res.status(200).json(await loadBoard());
  } catch (error) {
    res.status(500).json({ error: String(error.message || error), boats: [] });
  }
}
