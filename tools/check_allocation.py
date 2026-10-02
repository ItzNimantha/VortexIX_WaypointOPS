"""
check_allocation.py - Task 2B feasibility checker.
"""

import sys
import os
import pandas as pd

def _find(name):
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    for dirpath, _, files in os.walk(root):
        if name in files:
            return os.path.join(dirpath, name)
    raise SystemExit(f"cannot find {name} under {root} - keep the data folder as shipped")

# The pre-dawn window (03:30-08:00) and the daytime window, in minutes.
TRIP_BUDGET_PREDAWN = 270
TRIP_BUDGET_DAYTIME = 480
MAX_TRIPS_PER_VEHICLE = 2

REQUIRED_COLS = ["scenario", "order_ref", "decision", "vehicle_id", "trip_id"]


def trip_time(district, brand, docks, dtravel, allowance):
    """
    Planned trip duration, using the PUBLISHED planning standard.
    """
    d = dtravel[district]
    n = len(docks)
    if n == 0:
        return 0.0
    return (d["depot_to_district_freeflow_min"]
            + (n - 1) * d["inter_stop_freeflow_min"]
            + sum(allowance[(brand, dk)] for dk in docks))


def load_reference(example=False):
    scn = pd.read_csv(_find("task2b_peak_day_scenarios.csv"))
    fleet = pd.read_csv(_find("task2b_peak_day_fleet.csv"))
    veh = pd.read_csv(_find("vehicles.csv")).set_index("vehicle_id")
    dtravel = pd.read_csv(_find("district_travel.csv")).set_index(
        "district").to_dict("index")
    al = pd.read_csv(_find("service_allowance.csv"))
    allowance = {(r.brand, r.dock_type): r.service_allowance_min
                 for r in al.itertuples()}
    return scn, fleet, veh, dtravel, allowance


def check(path, example=False):
    scn, fleet, veh, dtravel, allowance = load_reference(example)
    errors, warnings = [], []

    try:
        sub = pd.read_csv(path)
    except Exception as e:
        print(f"FAIL: could not read {path}: {e}")
        return 1

    missing = [c for c in REQUIRED_COLS if c not in sub.columns]
    if missing:
        print(f"FAIL: missing column(s): {', '.join(missing)}")
        print(f"      required: {', '.join(REQUIRED_COLS)}")
        return 1

    expected = set(zip(scn.scenario, scn.order_ref))
    got = list(zip(sub.scenario, sub.order_ref))
    if len(got) != len(set(got)):
        dupes = pd.Series(got).value_counts()
        dupes = dupes[dupes > 1]
        errors.append(f"{len(dupes)} duplicated (scenario, order_ref) row(s), "
                      f"e.g. {list(dupes.index[:3])}")
    if set(got) - expected:
        errors.append(f"{len(set(got) - expected)} row(s) refer to an "
                      f"order_ref that does not exist, e.g. "
                      f"{list(set(got) - expected)[:3]}")
    if expected - set(got):
        errors.append(f"{len(expected - set(got))} order(s) have no row. "
                      f"Every order needs a decision, e.g. "
                      f"{list(expected - set(got))[:3]}")

    if sub.decision.isna().any():
        errors.append(f"{int(sub.decision.isna().sum())} order(s) have a blank decision")

    bad = set(sub.decision.dropna().unique()) - {"served", "deferred"}
    if bad:
        errors.append(f"decision must be 'served' or 'deferred', found {bad}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return 1

    m = scn.merge(sub, on=["scenario", "order_ref"], how="left",
                  suffixes=("", "_sub"))
    served = m[m.decision == "served"].copy()

    d = m[m.decision == "deferred"]
    if d.vehicle_id.notna().any() or d.trip_id.notna().any():
        n = int((d.vehicle_id.notna() | d.trip_id.notna()).sum())
        warnings.append(f"{n} deferred row(s) name a vehicle or trip; "
                        f"these fields are ignored for deferred orders")

    if served.vehicle_id.isna().any() or served.trip_id.isna().any():
        n = int((served.vehicle_id.isna() | served.trip_id.isna()).sum())
        errors.append(f"{n} served order(s) have no vehicle_id or trip_id")
        for e in errors:
            print(f"FAIL: {e}")
        return 1

    unknown = set(served.vehicle_id) - set(veh.index)
    if unknown:
        errors.append(f"unknown vehicle_id(s): {sorted(unknown)[:5]}")

    served["trip_id"] = pd.to_numeric(served.trip_id, errors="coerce")
    if served.trip_id.isna().any() or not served.trip_id.isin([1, 2]).all():
        errors.append("trip_id must be 1 or 2")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return 1

    avail = {(r.scenario, r.vehicle_id) for r in fleet.itertuples()
             if r.status == "available"}

    for (sc, vid, tid), g in served.groupby(["scenario", "vehicle_id", "trip_id"]):
        v = veh.loc[vid]
        tag = f"[{sc} {vid} trip {int(tid)}]"

        if (sc, vid) not in avail:
            errors.append(f"{tag} vehicle is in the workshop that day")
            continue
        if g.depot.nunique() > 1 or g.depot.iloc[0] != v.depot:
            errors.append(f"{tag} vehicle is based at {v.depot} but carries "
                          f"orders for {sorted(set(g.depot))}")
        if g.brand.nunique() > 1:
            errors.append(f"{tag} mixes brands: {sorted(set(g.brand))} "
                          f"(one brand per trip)")
        if g.district.nunique() > 1:
            errors.append(f"{tag} mixes districts: {sorted(set(g.district))} "
                          f"(one district per trip)")
        if (g.temp_requirement == "chilled").any() and v.temp != "reefer":
            errors.append(f"{tag} carries chilled orders on a "
                          f"non-refrigerated vehicle")
        if (g.parking_constraint == "van_only").any() and v.type != "van":
            errors.append(f"{tag} sends a {v.type} to a van_only outlet")

        vol, wt = g.order_volume_m3.sum(), g.order_weight_kg.sum()
        if vol > v.volume_cap_m3 + 1e-6:
            errors.append(f"{tag} volume {vol:.1f} m3 exceeds capacity "
                          f"{v.volume_cap_m3} m3")
        if wt > v.weight_cap_kg + 1e-6:
            errors.append(f"{tag} weight {wt:.0f} kg exceeds capacity "
                          f"{v.weight_cap_kg} kg")

    for (sc, vid), g in served.groupby(["scenario", "vehicle_id"]):
        n_trips = g.trip_id.nunique()
        if n_trips > MAX_TRIPS_PER_VEHICLE:
            errors.append(f"[{sc} {vid}] {n_trips} trips; a vehicle runs at "
                          f"most {MAX_TRIPS_PER_VEHICLE} a day")
        fresh_t = other_t = 0.0
        for tid, t in g.groupby("trip_id"):
            brand = t.brand.iloc[0]
            if t.district.nunique() > 1 or t.brand.nunique() > 1:
                continue      # already reported above
            tt = trip_time(t.district.iloc[0], brand,
                           list(t.dock_type), dtravel, allowance)
            if brand == "Fresh":
                fresh_t += tt
            else:
                other_t += tt
        if fresh_t > TRIP_BUDGET_PREDAWN + 1e-6:
            errors.append(f"[{sc} {vid}] Fresh trips total {fresh_t:.0f} min; "
                          f"the pre-dawn window is {TRIP_BUDGET_PREDAWN} min")
        if other_t > TRIP_BUDGET_DAYTIME + 1e-6:
            errors.append(f"[{sc} {vid}] daytime trips total {other_t:.0f} "
                          f"min; the daytime window is {TRIP_BUDGET_DAYTIME}")

    if errors:
        print(f"FEASIBILITY: FAILED  ({len(errors)} problem(s))\n")
        for e in errors[:40]:
            print(f"  - {e}")
        if len(errors) > 40:
            print(f"  ... and {len(errors) - 40} more")
    else:
        print("FEASIBILITY: PASSED - every rule satisfied.")
    for w in warnings:
        print(f"  note: {w}")

    return 1 if errors else 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    example = "--example" in sys.argv
    if len(args) != 1:
        print(__doc__)
        sys.exit(2)
    sys.exit(check(args[0], example))
