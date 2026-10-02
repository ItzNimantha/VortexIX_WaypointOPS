# Free deployment plan: Render (web) + Neon (Postgres)

Goal: a public HTTPS URL for the judges at $0, while `docker compose up` still works locally and for judges who clone the repo.
Free-tier terms below were checked on 2 Oct 2026. Re-check before relying on them.

## Why this combination
- **Render free web service** can run the Dockerfile directly from a private GitHub repo, gives HTTPS, no card needed. Caveats: it sleeps after 15 minutes without traffic (about 1 minute to wake), the filesystem is ephemeral, and free instance hours are capped per month.
- **Neon free Postgres** is permanent (does not expire). **Do not use Render's own free Postgres**: it is deleted 30 days after creation, and judging runs past that.
- Because the filesystem is ephemeral, photos live in Postgres (see AGENTS.md).

## Steps
1. Neon: create a project, copy the **pooled** connection string (-> `DATABASE_URL`) and the **direct** one (-> `DIRECT_URL`). Keep `?sslmode=require`.
2. Render: New > Web Service > connect the private GitHub repo > Runtime **Docker** > Instance **Free**.
3. Environment variables: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET` (generate a long random value), `SESSION_COOKIE_SECURE=true`, `NEXT_PUBLIC_APP_URL=https://<your-service>.onrender.com`, `SEED_ON_BOOT=true`, `DEMO_DATE`, `SEED_PASSWORD`, `TZ=Asia/Colombo`.
4. Health check path: `/api/health`.
5. First deploy runs migrations and the seed automatically. Open the URL, log in as each role.
6. Keep it awake for judging: create a free UptimeRobot (or similar) HTTP monitor on `/api/health`, every 5 minutes, from the day you submit until the Grand Finale. Without it the judge's first click can wait about a minute.
7. Add the Demo controls "Reset demo day" to the walkthrough so a judge can restore the seed state.

## Judge access to a private repo
The datasets must not be public. Keep the repo private and either add the organizers as collaborators or email tech-triathlon@rootcode.io to ask how they want access handled.

## Fallback if Render misbehaves
Oracle Cloud Always Free VM (needs a card for verification, capacity varies by region): install Docker, clone with a deploy key, `docker compose up -d --build`, put Caddy in front for automatic HTTPS. Most faithful to "docker compose up", more manual work.
