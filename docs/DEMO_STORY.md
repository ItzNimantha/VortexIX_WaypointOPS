# Reconciled demo story (real IDs from the CSVs)

The Figma story and the CSVs disagree in places. **The CSVs win.** Seed the demo with the facts below. Display names are cosmetic; IDs are real.

## Why the Figma story had to change
| Figma says | CSV says | Fix |
|---|---|---|
| Outlet "Kandy Supermarket" served by VEH031/VEH018/VEH023 | Those vehicles belong to **Peliyagoda**; a vehicle may only serve its own depot's outlets (rule 4) | Whole walkthrough runs at **Peliyagoda**. Rename the store "Gampaha Supermarket" (OUT026) |
| Reefer breakdown on VEH007, replaced by **VEH018** | VEH018 is an **ambient** truck; it cannot carry chilled goods (rule 2) | Replacement must be a reefer (VEH006 or VEH003). VEH018 stays in the options list as a visible FAIL |
| Vehicles VEH021 and VEH012 on routes | Both are `in_workshop` on the S1 peak day | Do not route them; show them as unavailable in the Vehicles screen |
| Route/order labels like `#KD-0248`, `R-312` | No such IDs exist in data | Generate display refs in the same style (e.g. `#GM-0248`); keep `R-312` as a display route label |

## Four seeded accounts (all linked to real records)
| Role | Linked to | Why |
|---|---|---|
| Store manager | **OUT026** (Fresh, Gampaha, rear_dock, normal, window 03:00-08:00) | Has both an ambient order (S1-027, 2.3 m3) and a chilled order (S1-028, 6.4 m3) in S1: shows the automatic dry/chilled split |
| Dispatcher | Peliyagoda depot | S1 is a Peliyagoda day |
| Loader | Peliyagoda depot | Loads the published plan |
| Driver ("Nuwan") | **VEH007** (reefer truck, 3,610 kg, 19.4 m3, Peliyagoda) | Drives the Gampaha chilled route that breaks down |

## S1 peak day facts the demo should surface
- 85 orders, 409.9 m3, 68,139 kg. 75 Fresh, 5 Style, 5 Tech. 26 chilled.
- Fleet: 28 vehicles available, 10 in workshop.
- **Refrigeration is the real bottleneck:** only 4 reefers are available (VEH003, VEH006, VEH007 trucks and VEH036 van) for 26 chilled orders. Total volume capacity is not the limit; reefers and the 270-minute Fresh budget are.
- **Forced deferral:** S1-078 (Tech, OUT070, 40.66 m3, 2,561.6 kg) is larger than the biggest available vehicle (38.0 m3), and orders cannot be split. It cannot be served.
- Orders skipped yesterday (`deferred_yesterday = 1`), which the priority score must protect: S1-020, S1-023, S1-025, S1-038, S1-041, S1-045, S1-050, S1-068, S1-079, S1-083. Of these, S1-023, S1-025, S1-068, S1-079 and S1-083 have waited 5 days.
- Mall outlets: S1-023 and S1-060 have `mall_dock` access with a 12:00 close; they must fall inside the mall window.
- Van-only outlets: 6 orders (3 chilled). Available vans: VEH036 (reefer, 7.0 m3), VEH037 and VEH038 (ambient).

## Reefer breakdown scenario (Dispatcher 05)
Trigger: Nuwan reports "Refrigeration failure" on VEH007 mid-run, or the dispatcher uses Demo controls.
Expected replacement options (the engine decides; these are the cases the demo should show):
| Option | Expected result | Reason shown |
|---|---|---|
| VEH006 (reefer truck, 6,840 kg, 33.4 m3) | PASS | Reefer, same depot, capacity ok, window margin ok |
| VEH003 (reefer truck, 5,510 kg, 26.4 m3) | PASS or FAIL depending on remaining load and time | Capacity / arrival before window close |
| VEH036 (reefer van, 7.0 m3) | FAIL | Volume exceeds 7.0 m3 |
| VEH018 (ambient truck) | FAIL | Ambient vehicle cannot carry chilled goods |
"Reassign and notify everyone" writes three notifications: SMS to driver, terminal push to loader, WhatsApp-style message to the store manager (simulated in the Notification table and the dispatcher Messages outbox).

## Offline story (Driver)
Nuwan completes two stops with no connection (pending-sync chips), reconnects, both sync exactly once, and the proof of delivery appears on the store manager's Confirm Receipt screen.
