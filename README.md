# Waypoint OPS

**Team Vortex IX** · Tech-Triathlon 2026 Hackathon · A delivery planning system for the fictional Waypoint Group: store manager, dispatcher, loader and driver connected end to end, with offline driving and a reefer-breakdown recovery flow.

> Status: scaffold. The application code is generated phase by phase (see `AGENTS.md`). This README is completed in Phase 8.

## Quick start
```bash
cp .env.example .env
docker compose up --build
# open http://localhost:3000
```

## Live deployment
- URL: _TBD_
- Hosting: Render (web) + Neon (Postgres). See `docs/DEPLOYMENT_FREE.md`.

## Seeded accounts
_Filled in by the seed (also written to `docs/SEEDED_ACCOUNTS.md`)._

## Judge walkthrough
_Numbered walkthrough across all four roles, generated in Phase 8._

## Significant departures from the Designathon design
See `docs/DEVIATIONS.md`.

## Docs
- `docs/architecture.md`, `docs/data-model.md` (Phase 8)
- `docs/DEMO_STORY.md` (reconciled demo data)
- `docs/AI_DISCLOSURE.md`
- `design/` (Figma exports and style tokens)

## Data confidentiality
`seed-data/` contains confidential competition datasets. This repository is private. The app exposes no dataset download endpoint.
