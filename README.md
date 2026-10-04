# Waypoint OPS

A complete, working, deployable web application for the fictional Sri Lankan retail group Waypoint Group (Pvt) Ltd.

> **Hackathon Submission Links**
> - **Deployed URL:** https://vortex-ix.vercel.app/login
> - **Demo Video:** https://youtu.be/AWGWzFtxJxo?si=vAGoJnn6nWOWgDkW
> - **Repository:** https://github.com/ItzNimantha/VortexIX_WaypointOPS.git

## Setup & Configuration

This project is fully containerized using Docker.

1. Ensure you have Docker and Docker Compose installed.
2. Copy the environment variables:
   ```bash
   cp .env.example .env
   ```
3. Start the application from a clean state (this will automatically run database migrations and seed the data):
   ```bash
   docker compose down -v && docker compose up --build
   ```
4. Access the application at `http://localhost:3000`.

## 🏆 Hackathon Judging Requirements Checklist

✅ **Functional completeness:** Complete delivery workflow implemented across all 4 roles (Store Manager, Dispatcher, Loader, Driver).
✅ **Planning and allocation engine:** Dispatcher Auto-Allocate engine dynamically accounts for volume, weight, and temperature constraints, and gracefully handles overcapacity by flagging deferred orders.
✅ **Responsive web application:** Loader and Driver interfaces are explicitly built mobile-first and optimized for phone-sized screens (390px).
✅ **Fidelity to Day 5 design:** The UI (especially the Driver and Loader screens) has been meticulously restyled to match the high-fidelity Figma components, complete with fixed footer navigation.
✅ **Fresh Installation & Seed Data:** The database seeds itself using the provided shared CSV datasets *and* generates a realistic delivery day for both Peliyagoda and Kandy so the walkthrough works immediately on boot.
✅ **Degradation & Offline:** Driver screen handles offline mode seamlessly with local caching.

## Seeded Accounts

| Role | Email | Password |
|---|---|---|
| Store Manager | `store@waypoint.com` | `password123` |
| Dispatcher | `dispatch@waypoint.com` | `password123` |
| Loader | `loader@waypoint.com` | `password123` |
| Driver | `driver@waypoint.com` | `password123` |

## Judge Walkthrough

Here is the 25-step walkthrough covering the entire lifecycle:

### Step 1: Store Manager (Order Creation)
1. Navigate to `http://localhost:3000/login` and log in as Store Manager.
2. Observe the "Today" dashboard and the 4 PM Cutoff countdown timer.
3. Navigate to **New Order**.
4. Add 2 `Carrots 1kg` (Chilled/Produce) and 3 `Rice 5kg` (Ambient/Dry).
5. Click **Review & Submit**. 
6. Observe that on the **Orders** tab, the system automatically split the cart into two distinct orders (one Chilled, one Ambient).

### Step 2: Dispatcher (Planning & Allocation)
7. Log out, then log in as Dispatcher (`dispatch@waypoint.com`).
8. View the **01 Order Queue** to see the new orders calculated against fleet capacity.
9. Navigate to **02 Plan & Allocate**.
10. Click **Auto-Allocate**. The rules engine processes all orders.
11. Observe the generated trips mapped to vehicles. 
12. Review the **Deferrals** panel to see any orders pushed to tomorrow (with reasons).
13. Click **Publish Plan**.

### Step 3: Loader (Execution & Shortfalls)
14. Log out, then log in as Loader (`loader@waypoint.com`).
15. View the **Loading Queue** and select the top vehicle.
16. Note the blue instruction banner enforcing **reverse loading sequence**.
17. Click **+1 Crate** to simulate loading.
18. Click **Flag Missing or Damaged**. Enter a mock reason. This immediately flags a shortfall.
19. Click **Load All** for the remaining items.
20. Proceed to **Driver Sign-off**. Click **Confirm & Mark Ready**.

### Step 4: Driver (Offline Delivery)
21. Log out, then log in as Driver (`driver@waypoint.com`).
22. Open Chrome DevTools > Network and toggle **Offline**. Notice the yellow warning banner appears.
23. Click **Start Route**, then **Start Stop**.
24. Click **Take Photo**, tap the signature box, and click **Complete Delivery**. The data is cached in IndexedDB.
25. Toggle Network back to **Online**. The app syncs the delivery silently in the background.

### Step 5: Degradation Scenarios
26. Log in as Dispatcher and navigate to **Demo Controls** in the sidebar.
27. Click **Trigger Breakdown**.
28. Review the Emergency Reefer Breakdown screen. Observe the feasibility constraints evaluated against replacement vehicles.
29. Click **Reassign to VEH012**. The undelivered route is successfully transferred.

## Significant Departures from Design
- To fit the constraints of the Next.js single-app monolith without websockets, Live Monitor syncing falls back to 5-second polling (or SSE where deployed) rather than pure WebSockets.
- The PWA manifest and service workers are simplified for local Docker testing without HTTPS.
