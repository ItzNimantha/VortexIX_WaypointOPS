# Screen export manifest

Export every frame below from Figma (Prototypes page): select frame -> Export -> PNG -> 2x. Save into this folder with EXACTLY these filenames. Antigravity maps frames to routes using this table.

Before exporting, rename the duplicated/unnamed frames in Figma so each has a unique name (marked **rename**).

## Shared login (route `/login`)
| Figma frame | File |
|---|---|
| Login · Default | `login_default.png` |
| Login · Focused input | `login_focused.png` |
| Login · Loading | `login_loading.png` |
| Login · Error | `login_error.png` |
| Login · Role detected | `login_role-detected.png` |
| Login · Offline | `login_offline.png` |
| Dispatcher / 00 Sign-in (desktop layout) | `login_desktop-dispatcher.png` |
| 1 Login (loader desktop layout) | `login_desktop-loader.png` |

## Store manager (`/store/*`, 390x844)
| Figma frame | File | Route |
|---|---|---|
| home-today | `store_01-home-today.png` | `/store` |
| new-order | `store_02-new-order.png` | `/store/new-order` |
| review-order | `store_03-review-order.png` | `/store/review` |
| order-confirmed | `store_04-order-confirmed.png` | `/store/orders/[id]/confirmed` |
| orders-list | `store_05-orders-list.png` | `/store/orders` |
| order-tracking | `store_06-order-tracking.png` | `/store/orders/[id]` |
| order-deferred | `store_07-order-deferred.png` | `/store/orders/[id]` (deferred state) **degradation** |
| updates-tab | `store_08-updates.png` | `/store/updates` |
| confirm-receipt (1st) | `store_09a-confirm-receipt.png` | `/store/orders/[id]/receipt` **rename by state** |
| confirm-receipt (2nd) | `store_09b-confirm-receipt-state2.png` | **rename by state** |
| report-issue (x3) | `store_10a/10b/10c-report-issue-*.png` | `/store/orders/[id]/issue` **rename by state** (e.g. default, item selected, submitted) |

## Dispatcher (`/dispatcher/*`, 1920x1080, must hold at 1024)
| Figma frame | File | Route |
|---|---|---|
| Dispatcher / 01 Order Queue | `dispatcher_01-order-queue.png` | `/dispatcher/queue` |
| Dispatcher / 02 Plan & Allocate | `dispatcher_02-plan-allocate.png` | `/dispatcher/plan` |
| Dispatcher / 03 Deferrals | `dispatcher_03-deferrals.png` | `/dispatcher/deferrals` |
| Dispatcher / 04a Live Monitor | `dispatcher_04a-live-monitor.png` | `/dispatcher/monitor` |
| Dispatcher / 04b Departure Readiness | `dispatcher_04b-departure-readiness.png` | `/dispatcher/readiness` |
| Dispatcher / 05 Reefer Breakdown | `dispatcher_05-reefer-breakdown.png` | `/dispatcher/incident/[id]` **degradation (main)** |
| Frame 240 / Workspace | (shared sidebar + workspace shell) | layout component |

## Loader (`/loader/*`, Figma is 1920x1080 but BUILD MOBILE-FIRST)
| Figma frame | File | Route |
|---|---|---|
| 2 Shift Start | `loader_02-shift-start.png` | `/loader/shift` |
| 3 Home / Today's Queue | `loader_03-queue.png` | `/loader` |
| 4 Vehicle Overview | `loader_04-vehicle-overview.png` | `/loader/vehicles/[id]` |
| 5 Load Sequence | `loader_05-load-sequence.png` | `/loader/vehicles/[id]/load` |
| 5A Load Sequence, Plan Changed Mid-Load | `loader_05a-plan-changed.png` | same, banner state **degradation** |
| 6 Flag Issue | `loader_06-flag-issue.png` | `/loader/vehicles/[id]/flag` |
| 6A Flag Issue Confirmation | `loader_06a-flag-confirmation.png` | same, confirmation |
| 7 Load Summary / Review | `loader_07-load-summary.png` | `/loader/vehicles/[id]/review` |
| 8 Handoff / Sign-Off | `loader_08-handoff-signoff.png` | `/loader/vehicles/[id]/signoff` |
| 9 Handoff Confirmed | `loader_09-handoff-confirmed.png` | same, confirmed |
| 10 new Vehicles | `loader_10-vehicles.png` | `/loader/vehicles` |
| 11 Updates | `loader_11-updates.png` | `/loader/updates` |
| 12 Profile / End Shift | `loader_12-profile-end-shift.png` | `/loader/profile` |
| 13 Shift Summary | `loader_13-shift-summary.png` | `/loader/summary` |

## Driver (`/driver/*`, 390x844)
| Figma frame | File | Route |
|---|---|---|
| Driver route | `driver_01-route.png` | `/driver` |
| Proof of delivery | `driver_02a-proof-of-delivery.png` | `/driver/stops/[id]/pod` |
| Proof of delivery off | `driver_02b-proof-of-delivery-disabled.png` | same, "Add a photo and signature to continue" state |
| Report an issue | `driver_03a-report-issue.png` | `/driver/stops/[id]/issue` |
| Report an issue off | `driver_03b-report-issue-disabled.png` | same, disabled state |
| Dilivery Complete (sic, fix typo in Figma) | `driver_04-delivery-complete.png` | `/driver/stops/[id]/done` |
| Offline driver route | `driver_05-offline-route.png` | `/driver` offline state **degradation** |
| Frame 2, Frame 3, Frame 4 (unnamed) | **rename**, e.g. `driver_06-*.png` | check what they are (stop details? ordered stops?) |

## Not frames to export
Pages "User Personas", "User Flows", "AI Tool Disclosure", "Overview" are Designathon documents, not UI.
