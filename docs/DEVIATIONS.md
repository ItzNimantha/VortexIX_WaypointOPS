# Deviations from the Designathon (Day 5) design

Pre-declared before the build. Antigravity must append anything else it changes. Mirror the final list in the README ("Significant departures").

| # | Area | Designathon design | Build | Reason |
|---|---|---|---|---|
| 1 | Demo data | Kandy Supermarket; VEH031/VEH018/VEH023 on its routes | Gampaha Supermarket (OUT026), Peliyagoda vehicles | Home-depot rule: a vehicle serves only its own depot's outlets |
| 2 | Reefer breakdown | Replacement vehicle VEH018 | Replacement is a reefer (VEH006 / VEH003); VEH018 shown as a failed option | VEH018 is ambient and cannot carry chilled goods |
| 3 | Unavailable vehicles | VEH021 and VEH012 shown on routes | Shown as in workshop | They are `in_workshop` in the S1 fleet file |
| 4 | Loader layout | Designed at 1920x1080 | Mobile-first (390px) with the desktop layout at wide widths | Booklet: judges assess the loader on phone-sized screens |
| 5 | Sign-in | Separate sign-in frames per role | One shared `/login`; role detected from the account, then redirected | Team decision: one login for all users |
| 6 | Photos | n/a | Stored in Postgres, compressed client-side | Free hosting has an ephemeral filesystem |
| 7 | Messaging | SMS / WhatsApp notifications | Simulated: written to a Notification table and shown in an outbox | No real SMS/WhatsApp integration |

(add rows below)
