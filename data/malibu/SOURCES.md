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
