import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

function find(name: string): string {
    const root = path.join(process.cwd(), 'seed-data');
    return path.join(root, name);
}

const TRIP_BUDGET_PREDAWN = 270;
const TRIP_BUDGET_DAYTIME = 480;
const MAX_TRIPS_PER_VEHICLE = 2;
const REQUIRED_COLS = ["scenario", "order_ref", "decision", "vehicle_id", "trip_id"];

function readCsv(filePath: string) {
    const file = fs.readFileSync(filePath, 'utf8');
    return parse(file, { columns: true, skip_empty_lines: true });
}

function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error("Usage: tsx tools/validateCsv.ts <path-to-submission.csv>");
        process.exit(2);
    }
    const subPath = args[0];

    const scn = readCsv(find("task2b_peak_day_scenarios.csv"));
    const fleet = readCsv(find("task2b_peak_day_fleet.csv"));
    const veh = readCsv(find("vehicles.csv"));
    const dtravel = readCsv(find("district_travel.csv"));
    const allowance = readCsv(find("service_allowance.csv"));

    const vehMap = new Map();
    for (const v of veh) vehMap.set(v.vehicle_id, v);

    const dtravelMap = new Map();
    for (const d of dtravel) dtravelMap.set(d.district, d);

    const allowanceMap = new Map();
    for (const a of allowance) allowanceMap.set(`${a.brand}|${a.dock_type}`, parseFloat(a.service_allowance_min));

    let sub;
    try {
        sub = readCsv(subPath);
    } catch (e) {
        console.error(`FAIL: could not read ${subPath}: ${e}`);
        process.exit(1);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (sub.length > 0) {
        const columns = Object.keys(sub[0]);
        const missing = REQUIRED_COLS.filter(c => !columns.includes(c));
        if (missing.length > 0) {
            console.error(`FAIL: missing column(s): ${missing.join(', ')}`);
            process.exit(1);
        }
    }

    const expectedOrders = new Set(scn.map((r: any) => `${r.scenario}|${r.order_ref}`));
    const subSet = new Set();
    const dupes = new Set();
    
    for (const row of sub) {
        const key = `${row.scenario}|${row.order_ref}`;
        if (subSet.has(key)) dupes.add(key);
        subSet.add(key);
    }

    if (dupes.size > 0) {
        errors.push(`${dupes.size} duplicated (scenario, order_ref) row(s)`);
    }

    let badRefs = 0;
    for (const s of subSet) {
        if (!expectedOrders.has(s as string)) badRefs++;
    }
    if (badRefs > 0) {
        errors.push(`${badRefs} row(s) refer to an order_ref that does not exist`);
    }

    let missingRefs = 0;
    for (const e of expectedOrders) {
        if (!subSet.has(e)) missingRefs++;
    }
    if (missingRefs > 0) {
        errors.push(`${missingRefs} order(s) have no row`);
    }

    const badDecisions = new Set();
    let blankDecisions = 0;
    for (const r of sub) {
        if (!r.decision) blankDecisions++;
        else if (r.decision !== 'served' && r.decision !== 'deferred') badDecisions.add(r.decision);
    }

    if (blankDecisions > 0) errors.push(`${blankDecisions} order(s) have a blank decision`);
    if (badDecisions.size > 0) errors.push(`decision must be 'served' or 'deferred', found ${Array.from(badDecisions)}`);

    if (errors.length > 0) {
        for (const e of errors) console.error(`FAIL: ${e}`);
        process.exit(1);
    }

    const scnMap = new Map();
    for (const r of scn) {
        scnMap.set(`${r.scenario}|${r.order_ref}`, r);
    }

    const served = [];
    for (const r of sub) {
        const key = `${r.scenario}|${r.order_ref}`;
        if (r.decision === 'deferred') {
            if (r.vehicle_id || r.trip_id) {
                warnings.push(`Deferred row ${key} has vehicle_id or trip_id; ignoring`);
            }
        } else if (r.decision === 'served') {
            if (!r.vehicle_id || !r.trip_id) {
                errors.push(`Served order ${key} has no vehicle_id or trip_id`);
            } else {
                served.push({ ...scnMap.get(key), ...r });
            }
        }
    }

    if (errors.length > 0) {
        for (const e of errors) console.error(`FAIL: ${e}`);
        process.exit(1);
    }

    const unknownVehicles = new Set();
    for (const r of served) {
        if (!vehMap.has(r.vehicle_id)) unknownVehicles.add(r.vehicle_id);
    }
    if (unknownVehicles.size > 0) errors.push(`unknown vehicle_id(s): ${Array.from(unknownVehicles).slice(0,5)}`);

    const badTrips = new Set();
    for (const r of served) {
        if (r.trip_id !== '1' && r.trip_id !== '2') badTrips.add(r.trip_id);
    }
    if (badTrips.size > 0) errors.push("trip_id must be 1 or 2");

    if (errors.length > 0) {
        for (const e of errors) console.error(`FAIL: ${e}`);
        process.exit(1);
    }

    const avail = new Set(fleet.filter((r: any) => r.status === 'available').map((r: any) => `${r.scenario}|${r.vehicle_id}`));

    const groups = new Map();
    for (const r of served) {
        const key = `${r.scenario}|${r.vehicle_id}|${r.trip_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }

    for (const [key, g] of groups.entries()) {
        const [sc, vid, tid] = key.split('|');
        const v = vehMap.get(vid);
        const tag = `[${sc} ${vid} trip ${tid}]`;

        if (!avail.has(`${sc}|${vid}`)) {
            errors.push(`${tag} vehicle is in the workshop that day`);
            continue;
        }

        const depots = new Set(g.map((x: any) => x.depot));
        if (depots.size > 1 || !depots.has(v.depot)) {
            errors.push(`${tag} vehicle is based at ${v.depot} but carries orders for ${Array.from(depots)}`);
        }

        const brands = new Set(g.map((x: any) => x.brand));
        if (brands.size > 1) errors.push(`${tag} mixes brands: ${Array.from(brands)}`);

        const districts = new Set(g.map((x: any) => x.district));
        if (districts.size > 1) errors.push(`${tag} mixes districts: ${Array.from(districts)}`);

        if (g.some((x: any) => x.temp_requirement === 'chilled') && v.temp !== 'reefer') {
            errors.push(`${tag} carries chilled orders on non-refrigerated vehicle`);
        }

        if (g.some((x: any) => x.parking_constraint === 'van_only') && v.type !== 'van') {
            errors.push(`${tag} sends a ${v.type} to a van_only outlet`);
        }

        let vol = 0, wt = 0;
        for (const x of g) {
            vol += parseFloat(x.order_volume_m3);
            wt += parseFloat(x.order_weight_kg);
        }

        if (vol > parseFloat(v.volume_cap_m3) + 1e-6) errors.push(`${tag} volume ${vol.toFixed(1)} m3 exceeds capacity ${v.volume_cap_m3} m3`);
        if (wt > parseFloat(v.weight_cap_kg) + 1e-6) errors.push(`${tag} weight ${wt.toFixed(0)} kg exceeds capacity ${v.weight_cap_kg} kg`);
    }

    const vehGroups = new Map();
    for (const r of served) {
        const key = `${r.scenario}|${r.vehicle_id}`;
        if (!vehGroups.has(key)) vehGroups.set(key, []);
        vehGroups.get(key).push(r);
    }

    for (const [key, g] of vehGroups.entries()) {
        const trips = new Set(g.map((x: any) => x.trip_id));
        if (trips.size > MAX_TRIPS_PER_VEHICLE) {
            errors.push(`[${key}] ${trips.size} trips; max is ${MAX_TRIPS_PER_VEHICLE}`);
        }

        let fresh_t = 0, other_t = 0;
        for (const tid of trips) {
            const t = g.filter((x: any) => x.trip_id === tid);
            const brands = new Set(t.map((x: any) => x.brand));
            const districts = new Set(t.map((x: any) => x.district));
            if (brands.size > 1 || districts.size > 1) continue;

            const brand = Array.from(brands)[0] as string;
            const district = Array.from(districts)[0] as string;
            const d = dtravelMap.get(district);
            let tt = 0;
            if (t.length > 0) {
                tt += parseFloat(d.depot_to_district_freeflow_min);
                tt += (t.length - 1) * parseFloat(d.inter_stop_freeflow_min);
                for (const row of t) {
                    tt += allowanceMap.get(`${brand}|${row.dock_type}`) || 0;
                }
            }
            if (brand === 'Fresh') fresh_t += tt;
            else other_t += tt;
        }

        if (fresh_t > TRIP_BUDGET_PREDAWN + 1e-6) {
            errors.push(`[${key}] Fresh trips total ${fresh_t.toFixed(0)} min; pre-dawn window is ${TRIP_BUDGET_PREDAWN}`);
        }
        if (other_t > TRIP_BUDGET_DAYTIME + 1e-6) {
            errors.push(`[${key}] daytime trips total ${other_t.toFixed(0)} min; daytime window is ${TRIP_BUDGET_DAYTIME}`);
        }
    }

    if (errors.length > 0) {
        console.error(`FEASIBILITY: FAILED  (${errors.length} problem(s))\n`);
        for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
        if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
        process.exit(1);
    } else {
        console.log("FEASIBILITY: PASSED - every rule satisfied.");
    }

    for (const w of warnings) console.log(`  note: ${w}`);
    process.exit(0);
}

main();
