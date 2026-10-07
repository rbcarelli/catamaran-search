# Catamaran hunt

Tile dashboard for the listings JSON Bob publishes to
[rbcarelli/catamaran-dashboard](https://github.com/rbcarelli/catamaran-dashboard).

Active listings are tiles with a photo, make, model, year, price, price history,
location, and time listed. Sold boats are a table below. Keep / Skip / Watch /
note compiles into `feedback/feedback.json` in that same git repo.

## Local

```powershell
& "C:\Program Files\nodejs\node.exe" scripts\serve.mjs
```

Open http://127.0.0.1:8787

## Vercel

This repo is a static `public/` page plus `/api` serverless routes. No build step.

1. Import **this GitHub repo** in Vercel (Framework Preset: Other).
2. Add environment variable `GITHUB_TOKEN` — a GitHub personal access token with
   `repo` access to `rbcarelli/catamaran-dashboard`, so Keep/Skip/Watch can write
   `feedback/feedback.json`.
3. Deploy.

The app reads listings from GitHub on each request and falls back to
`data/listings.json` in this repo.
