import { photoMap } from "../lib/board.mjs";
import { cors } from "../lib/http.mjs";

export default function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  res.status(200).json(photoMap());
}
