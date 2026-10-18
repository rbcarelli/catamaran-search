# Catamaran hunt

Tile dashboard for the listings JSON Bob publishes to
[rbcarelli/catamaran-dashboard](https://github.com/rbcarelli/catamaran-dashboard).

New listings, Watched, and Rejected are the three boards. New listings and
Watched use photo tiles. Skip or a note containing “remove” sends a boat to
`/rejected`. Watch sends a boat to `/watched`. A watched boat that sells stays
on Watched until you Acknowledge sold; it also appears highlighted in the sold
table. Feedback compiles into `feedback/feedback.json` in the listings repo.
Tiles default to newest listed first.

## Local

```powershell
& "C:\Program Files\nodejs\node.exe" scripts\serve.mjs
```

Open http://127.0.0.1:8787

## Vercel

This repo is a static `public/` page plus `/api` serverless routes. No build step.

1. Import **this GitHub repo** in Vercel (Framework Preset: Other).
2. Add environment variable `GITHUB_TOKEN` (required). Use a GitHub personal
   access token with `repo` access to `rbcarelli/catamaran-dashboard`. Without
   this, Watch / Skip / notes appear to click but are not written to git.
3. Redeploy.

The app reads listings from GitHub on each request and falls back to
`data/listings.json` in this repo.
