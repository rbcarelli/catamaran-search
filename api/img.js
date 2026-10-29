import { fetchBoatPhoto } from "../lib/board.mjs";
import { cors } from "../lib/http.mjs";

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  const id = String(req.query?.id || new URL(req.url, "http://localhost").searchParams.get("id") || "").trim();
  if (!id) {
    res.status(400).end();
    return;
  }
  try {
    const photo = await fetchBoatPhoto(id);
    if (!photo) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", photo.type);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.status(200).send(photo.body);
  } catch (error) {
    res.status(502).json({ error: String(error.message || error) });
  }
}
