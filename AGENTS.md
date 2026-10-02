# Rules for every task in this repo (Waypoint OPS, by Vortex IX)

Product name is **Waypoint OPS**. Repo name is `VortexIX_WaypointOPS`. Never call it "Waypoint Dispatch".

## Fixed stack (do not swap)
Next.js 14 (App Router, TypeScript strict), PostgreSQL 16, Prisma, Tailwind CSS, Zod, Dexie (IndexedDB outbox), Vitest, Playwright, Docker Compose.

## Hosting constraints (public deployment is FREE-tier: Render web service + Neon Postgres)
- The container filesystem is ephemeral. **Never write uploads to disk.** Store proof-of-delivery photos and signatures in Postgres (bytea or base64 text), compressed client-side to <= `PHOTO_MAX_KB`.
- Prisma uses `DATABASE_URL` (may be pooled) and `DIRECT_URL` (for migrations). Both go in `schema.prisma`.
- Build Next.js with `output: "standalone"`. The server must listen on `$PORT` and `0.0.0.0`.
- The container may sleep and cold-start. Startup must retry the DB connection, run `prisma migrate deploy`, run the idempotent seed, then serve. `/api/health` works without auth.
- Prefer 5-second polling over long-lived SSE for live views. SSE only if polling remains as a fallback.
- Cookies: `httpOnly`, `sameSite=lax`, `secure` when `SESSION_COOKIE_SECURE=true`.

## Design is the specification
- Read `design/STYLE.md` and every image in `design/screens/` before building UI. `design/screens/MANIFEST.md` maps frames to routes.
- Match layout, copy, states and colors. All four roles share ONE navy + royal-blue theme (tokens in STYLE.md). Font is Inter everywhere.
- If you must deviate from a frame, append it to `docs/DEVIATIONS.md` (it already has pre-declared deviations; keep it accurate).
- There is ONE shared `/login` screen for everyone. The email/username determines the role and redirects to `/store`, `/dispatcher`, `/loader` or `/driver`. Implement the Figma Login states (default, focused, loading, error, role detected, offline) once, responsively.
- The Loader Figma frames are 1920x1080 (shared terminal), but judges test the Loader on a phone. Build the Loader mobile-first (390px) with the desktop layout as the wide breakpoint.
- Driver, Loader, Store Manager: primary target 360-430px. Dispatcher: desktop-first 1440-1920px, must not break at 1024px.

## Data rules
- `seed-data/*.csv` are the source of truth for outlets, vehicles, calendar, district travel, service allowances and the S1 peak day. **If a Figma label disagrees with a CSV, the CSV wins** and the copy changes. Read `docs/DEMO_STORY.md` for the reconciled demo story and real IDs.
- Datasets are confidential: no CSV download endpoints, no public sample links, repo stays private. The only export allowed is the dispatcher-only Task 2B export.
- The seed must be idempotent and must fail loudly if a CSV header does not match.

## Business rules (implement ONCE in `src/domain`, pure TypeScript, no DB/HTTP imports, unit-tested)
1. One vehicle+trip serves a single brand AND a single district.
2. `chilled` needs `temp = reefer`. Reefers may carry ambient. Ambient vehicles never carry chilled.
3. `parking_constraint = van_only` needs `type = van`.
4. A vehicle only serves outlets of its own depot.
5. Orders are whole: one order, one vehicle, one trip.
6. Per trip: sum(volume) <= `volume_cap_m3` AND sum(weight) <= `weight_cap_kg`.
7. Max 2 trips per vehicle per day. Time budgets: Fresh trips total <= 270 min (03:30-08:00); Style + Tech trips combined <= 480 min. Budgets are checked separately; still 2 trips total.
- `trip_minutes = depot_to_district_freeflow_min + inter_stop_freeflow_min * (orders - 1) + sum(service_allowance_min by trip brand + outlet dock_type)`. No return leg.
- Worked examples that MUST be unit tests: Gampaha Fresh trip, 2 rear_dock + 1 street = 37 + 18 + 15 + 15 + 16 = **101**; second trip, Colombo Fresh, 4 street stops = 24 + 24 + 64 = **112**; 101 + 112 = 213 of 270; a third trip is rejected.
- Vehicles with status `in_workshop` are never allocated. An order larger than the largest available vehicle is a FORCED deferral (orders cannot be split).
- Priority must protect outlets with `deferred_yesterday = 1` and high `days_since_last_served`.
- Fuel: weekly quota per vehicle per ISO week (km / km_per_l), checked at planning.
- Orders close at 16:00. Later orders wait for the next operating day (Mon-Sat, `calendar.is_operating`).

## Process
- After every phase: lint, typecheck, unit tests, and `docker compose up --build` from a clean state. Fix before reporting done.
- Small commits: `feat(loader): vehicle loading checklist`.
- Every API route: Zod validation, role check, error shape `{ error: { code, message } }`.
- Every screen: loading, empty and error states. 44px minimum touch targets on phone. Color is never the only status signal.
