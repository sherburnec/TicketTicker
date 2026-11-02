# Malibu data sources

Checked 2026-11-02 for Phase 10 task 10.6 (extends BT-1, OQ14, OQ16, OQ17). Nothing else in `data/malibu/` is committed until the author approves this file.

## BT-1: LA County CAMS Address Points

Layer: CAMS Address Points, `https://rpgis.isd.lacounty.gov/arcgis/rest/services/GISNET_Public/MapServer/402` (the same layer as `data/burbank/SOURCES.md`).

### License
Same position as Burbank, and still open:
- The layer is "for informational purposes", may not suit legal or engineering use, and the county may change or discontinue access at any time.
- Use and derivation fall under the Terms of Use on the County of LA eGIS Hub. **The full Terms text was not read in this check** (the county site's firewall blocked the metadata page from this machine), so redistribution rights for derived data are unconfirmed.
- What would be committed is derived: `blocks.csv` holds segment ids, hundred-block numbers and address ranges, not address points. Raw address points are never committed. Named-location addresses (10.9) are single street addresses of public places.

### Malibu coverage
Query `LegalComm='Malibu'` returned **6,275** address points (29% as many as Burbank's 27,881, over a far longer and thinner city).

| Source field | Points |
| --- | --- |
| Office of Assessor | 4,722 |
| City of Malibu | 1,213 |
| Assessor | 328 |
| LACO DPW Add | 8 |
| Malibu | 4 |

Extent of the points (WGS84): longitude -118.9229 to -118.5844, latitude 34.0014 to 34.0630.

Findings:
- Unlike Burbank, about 19% of points come from the City of Malibu itself, and 81% from the Assessor. The Assessor-source caveat applies: multi-address parcels (Malibu Country Mart, Malibu Lagoon area, Pepperdine) may show only one primary address.
- House numbers are five digits on Pacific Coast Highway (for example 22637 and 23733, ZIP 90265). The hundred-block logic works on them, but normalization must accept them (task 10.8).
- Far fewer addresses per street than Burbank, and many canyon roads have few or none, so many segments will have no block number (expected; they appear in the "needs hand entry" list). The real match rate is only known after task 10.8, and is reported in 10.10.
- The county's address-point count by street name was not available (the server refused the query), so the "Pacific Coast Highway has N points" figure is unchecked.
- Points are in the layer's native projection and must be requested as WGS84, as in the Burbank script.

## OpenStreetMap (street segments)

Source: OpenStreetMap via the Overpass API, `way[highway]` with a name, inside the city extent. Reachable from this machine with Node `fetch` and a descriptive `User-Agent` (the public servers reject requests without one; `curl` on this Windows machine fails the TLS handshake). A trial query inside the proposed extent found the required streets:

| Street (OSM name) | OSM ways in extent |
| --- | --- |
| Pacific Coast Highway | 251 (`trunk`) plus 1 `trunk_link` |
| Kanan Dume Road | 18 `primary` plus 1 `residential` |
| Malibu Canyon Road | 6 `primary` |
| Las Flores Canyon Road | 6 `tertiary` |

### License and obligations
- OSM data is licensed under the Open Database License (ODbL) 1.0, © OpenStreetMap contributors.
- **Attribution:** any use must credit "© OpenStreetMap contributors" and link to the license. The map currently has its attribution control switched off (`attributionControl: false` in `src/map/streetMap.ts`). Showing OSM-derived streets, Burbank's included if they came from OSM, needs a visible credit. **[Proposed]** add a one-line credit under each map legend (a UI-only change, no wording of required notices touched). Not done yet; needs the author's go-ahead.
- **Share-alike:** `data/malibu/segments.geojson` is a derived database of OSM data. If the repository is public or the file is distributed, that file must be made available under ODbL too. The rest of the code is not affected (a "produced work", the rendered map, only needs the credit). **[Proposed]** put a short `data/malibu/LICENSE-ODbL.md` note beside the file when it is added.
- Overpass is a shared public service; the script runs once at build time, sends one request, and identifies itself in the `User-Agent`. It is never called from the browser (NFR-1, NFR-5).

## Extent and time zone
- **Extent: [Proposed]** bbox `[-118.95, 33.99, -118.55, 34.09]` (west, south, east, north). Derived from the CAMS point extent above plus a margin of about 0.03 degrees so the full coastline, Leo Carrillo to Topanga, and Kanan Dume and Malibu Canyon roads are inside. It is **not** the official city boundary and it includes open ocean to the south (K17). The official boundary would come from the City of Malibu or the county boundary layer; not fetched. Effect if wrong: a few points outside the city limits would count as in-extent for patrol data (FR-32).
- **Time zone:** `America/Los_Angeles` (California; IANA tz database, applies to all of Los Angeles County, the same as Burbank).
- **Payment window: [Proposed]** 21 days, copied from Burbank until the real Malibu rule is known (OQ16).
- **Depot: [Proposed]** near Malibu City Hall, 23825 Stuart Ranch Road, about 34.0378 N, 118.6844 W. Placeholder; the real parking enforcement yard is unknown (OQ16).
- **Exclusion zones:** none (OQ16).

## Notes
- Pacific Coast Highway is a Caltrans route (State Route 1). Whether the city enforces on it is open (OQ17). Until answered, PCH is in scope in the segments and the sample.
- Fine schedule and named locations are written in task 10.9; their status (real or estimate) will be recorded here.

## Applied in task 10.8 (author approved the proposals above on 2026-11-02)
`city.json` (committed with 10.9) uses the proposed values: extent bbox `[-118.95, 33.99, -118.55, 34.09]`, `America/Los_Angeles`, `payment_window_days` 21, depot 34.0378, -118.6844 (near City Hall), no exclusion zones. All of these are `[Proposed]` and answer OQ16 only provisionally.

### Blocks (`node scripts/build-blocks.ts malibu`)
- 6,275 CAMS points read; 3,136 lie within 40 m of a same-named street segment, 1,852 are 40 to 100 m away and 1,038 are farther or on streets with no segment. Many Malibu parcels sit well back from Pacific Coast Highway, so a wider match distance would capture more (not applied; Burbank's 40 m is unchanged).
- **Blocks numbered: 164 of 1,378 (12%)**, against Burbank's 1,182 of 2,582 (46%). The list of blocks needing hand entry is `blocks-report.md`.
- Why it is low: a block is numbered only when at least two addresses fall in one hundred. OSM segments here are long (Pacific Coast Highway has 85 segments over about 20 miles) and cover many hundreds, and canyon roads have few addresses. This is the K17 risk (a long coastal extent). Citations on unnumbered blocks will show as unmatched.
- **[Proposed]** follow-up, not part of Phase 10: split long segments into block-length pieces, or match by address range instead of hundred. Needs the author's decision.
- Street names missing from OSM (CAMS streets with no segment), most frequent: Las Olas Way (31 points), Seastar Dr (26), Via Escondido (21), Filaree Heights Ave (19), Broadbeach Rd (18).

## Applied in task 10.9: fine schedule and named locations

### Fine schedule: ALL ROWS ARE ESTIMATES (OQ13, OQ16)
The author asked for the recommended approach to open questions, so `fine-schedule.csv` holds placeholders. **Replace every row with the real Malibu schedule before any figure goes to the city (DR-8).** Codes and amounts are invented; the `MMC EST-n` codes are not real municipal code sections, and each name ends in "(estimate)" so reports show it. Edit the file only; no code change is needed (AS12).

| Code | Name | Base | Escalated | Sample weight | Status |
| --- | --- | --- | --- | --- | --- |
| MMC EST-1 | Expired meter / time limit (estimate) | 50 | 75 | 40 | estimate |
| MMC EST-2 | Street sweeping (estimate) | 70 | 100 | 25 | estimate |
| MMC EST-3 | Red curb / no-parking zone (estimate) | 75 | 110 | 15 | estimate |
| MMC EST-4 | Beach parking without permit (estimate) | 60 | 90 | 12 | estimate |
| MMC EST-5 | Overnight parking prohibited (estimate) | 65 | 95 | 8 | estimate |

The payment window (21 days) and sample weights are also estimates. No code is shared with Burbank.

### Named locations (`named-locations.csv`)
Six places, addresses taken from the CAMS layer (so they match what citations will use):

| Id | Name | Address | Note |
| --- | --- | --- | --- |
| MAL-1 | Malibu Pier | 23000 Pacific Coast Hwy | CAMS |
| MAL-2 | Malibu Lagoon State Beach | 23200 Pacific Coast Hwy | CAMS |
| MAL-3 | Zuma Beach | 30050 Pacific Coast Hwy | nearest CAMS address to the beach lot; **confirm** |
| MAL-4 | Malibu Country Mart | 3835 Cross Creek Rd | CAMS |
| MAL-5 | Malibu City Hall | 23825 Stuart Ranch Rd | CAMS |
| MAL-6 | Westward Beach | 6800 Westward Beach Rd | CAMS |

All six resolve to their location id through `matchAddress`. None resolves to a street block yet, because their hundred blocks on Pacific Coast Highway, Cross Creek Road, Stuart Ranch Road and Westward Beach Road are among the unnumbered blocks (see the block finding above). Named-location counts do not depend on blocks. The real parking enforcement yard and any extra named locations (OQ16) are still open.

## Task 10.10: match rate against Burbank (checked 2026-11-02)
Every CAMS address point of each city, written "<number> <street>", run through `matchAddress` against that city's committed blocks:

| City | Blocks numbered | CAMS addresses matching a block |
| --- | --- | --- |
| Burbank | 1,182 of 2,582 (45.8%) | 13,481 of 27,881 (48.4%) |
| Malibu | 164 of 1,378 (11.9%) | 1,774 of 6,275 (28.3%) |

Malibu is below Burbank on both measures. Real Malibu citations will show more unmatched addresses than Burbank's, concentrated on Pacific Coast Highway and the canyon roads. Sample data is unaffected (generated only from numbered blocks, 0 unmatched). Options for the author, not done: split long OSM segments into block-length pieces, widen the 40 m match distance, or hand-enter block numbers (`blocks-report.md`).
