# Plan: Citation Insights (MVP, Burbank; multi-city and Malibu in Phase 10)

## 1. Goal
Build a static, client-side TypeScript web app on GitHub Pages that imports or generates parking citation data and produces internal reports (R1–R6), a city PDF (R7) and an optional Samsara patrol heatmap (R8). All processing stays in the browser. Burbank is the first city, and adding another city must need only a new data folder. Phase 10 puts several cities in one dashboard (a city switcher) and adds Malibu, CA as the second city.

## 2. Scope
**In scope (PRD §13 MVP):** BT-1 `blocks.csv` build script; citation sample generator; CSV import with validation and reject reporting; block matching with an unmatched list; named locations; revenue model (Realized/Projected, adjustable rates); reports R1–R7 with local map and city PDF; patrol sample generator, Format A/B import and R8.
**Out of scope (PRD §4, §13 later):** backend, database, accounts, persistence; city login; external APIs, geocoding services, Samsara API; shift/schedule import; patrol effort metrics or patrol-to-citation/officer joins; per-officer ranking in city output; names or plates; address-point geocoding; combining or comparing two cities' data in one report (Phase 10 shows one city at a time); cities other than Burbank and Malibu.

## 3. Assumptions and Open Questions
Assumptions (conservative readings, each revisable):
- AS1. Parklas code and street data are available to the agent at a path the author provides (PRD gives none; see OQ1).
- AS2. City settings live in `data/<city>/city.json` (PRD §8.3 names no file for DR-11).
- AS3. Citation CSV headers are the §8.1 field names verbatim, dates ISO (A17, A24).
- AS4. Every numeric default marked [Proposed] in the PRD is used as written and kept configurable in one config module.
- AS5. Settled-citation threshold (FR-22) is a config value with placeholder 30 until OQ2 is answered.
- AS6. FR-27 is built as proposed: a pre-export preview with a confirmation that no officer data is included and assumptions are correct.
- AS7. Manager and supervisor share one unauthenticated UI (PRD §5).
- AS8. "Multiple cities in a single dashboard" means one app with a city switcher: the user picks one city at a time, and each city has its own data, rates, reports and PDF. No cross-city totals or comparisons (revisable; would be a new phase).
- AS9. Switching city discards all loaded data (citations, patrol, rate overrides), after a confirmation if any is loaded. Nothing is kept per city (NFR-1).
- AS10. The selected city may be kept in the URL hash (`#city=malibu`). It is a setting, not data, so it does not break NFR-1.
- AS12. Each city owns its fine schedule: `data/<city>/fine-schedule.csv` may hold any number of codes, written the city's own way ("CVC-22500(g)", "BMC 6-1-1101", "MMC 10.04.010"). Nothing outside that file names a code. The code source is the prefix before the first "-" or space. Adding or editing a row needs no code change; a schedule that fails validation gives an error naming the file and line.
- AS11. Malibu street segments come from OpenStreetMap (ODbL), as the Burbank ids (`burbank-<osm node>-<osm node>`) suggest Parklas did. Address points come from LA County CAMS, the same layer as BT-1. Malibu citation codes and amounts are `[Proposed]` placeholders until the author supplies the real schedule (OQ13 applies).

Open Questions:
- OQ1. Where is the Parklas repository, and which files (street segments, blocks report, map code) are reused? (blocks Phase 1)
- OQ2. Minimum settled-citation count for reliable rates (Q15).
- OQ3. Review/sign-off workflow before PDF export (Q17).
- OQ4. Distinct manager/supervisor permissions (Q18).
- OQ5. Accessibility target, browser support, response-time targets (Q19, NFR-9, NFR-10).
- OQ6. Retention/compliance rules for source data, PDFs and Samsara files (Q20, Q31, NFR-8).
- OQ7. Export formats beyond PDF (Q21, RPT-6).
- OQ8. Timeline, resources, rollout (Q22).
- OQ9. Client-side PDF library (Q24); needs approval as a dependency.
- OQ10. Actual Samsara export format, time zone and headers (Q28, Q29).
- OQ11. Depot/yard exclusion zones and other excluded areas (Q30).
- OQ12. Final grid size, gap threshold and sample patrol parameters (Q33).
- OQ13. DR-8 says estimated fines must be replaced before figures reach the city, but no mechanism is specified. Should PDF export be blocked or flagged while estimates remain? (Assumption: no enforcement in code; the author is responsible.)
- OQ14. LA County CAMS license terms and Burbank coverage (BT-1, verified in task 1.3).
- OQ15. Is "multiple cities in one dashboard" a switcher (AS8) or a combined view? (Assumed: switcher.)
- OQ16. Malibu fine schedule (codes, base and escalated amounts, payment window), named locations, depot/yard and any exclusion zones. (Phase 10 uses labelled placeholders until answered.)
- OQ17. Which Malibu streets are in scope for citation and patrol samples; Pacific Coast Highway is a Caltrans route.

## 4. Architecture and key decisions
- **Stack:** TypeScript, Vite, MapLibre GL JS, Vitest, GitHub Actions to Pages. Reason: inherited from Parklas (PRD §12).
- **No server, in-memory state only:** no localStorage/IndexedDB for data. Reason: NFR-1, NG1.
- **City data folder** `data/<city>/`: `city.json`, `segments.*` (from Parklas), `blocks.csv`, `fine-schedule.csv`, `named-locations.csv`, `named-locations.template.csv` (not read). Reason: FR-13, NFR-7.
- **Build-time script** `scripts/build-blocks.ts` (Node, never shipped). Reason: DR-9.
- **Web Workers** for citation parse, patrol parse and aggregation. Reason: NFR-6, FR-30, no UI freeze.
- **One import path:** generators emit CSV text that goes through the same importer as uploads. Reason: FR-4a, FR-41, FR-45.
- **Seeded PRNG** implemented locally (small function, no dependency). Reason: FR-4c, FR-43 reproducibility.
- **Time zones via `Intl.DateTimeFormat`.** Reason: DST-correct conversion with no dependency (FR-33).
- **CSV parser and PDF library:** chosen in their phases, added only after approval. Reason: dependency rule; Q24 open.
- **Data model** (`src/types.ts`):
  - `CitySettings {name, timeZone, paymentWindowDays, extent (bbox|polygon), exclusionZones[{lat,lon,radiusM}], depot, hotZoneWeights?}`
  - `FineEntry {code, name, base, escalated, startDate?, escalationDays?, sampleWeight?}`; code source = prefix before `-`.
  - `Block {id, street, blockNumber, geometry}`; `NamedLocation {id, name, addresses[], lat?, lon?, notes?}`
  - `Citation {id, date, time, code, officer, result, fineAmount, paidAmount?, paidDate?, address, blockId?, namedLocationId?, vehicleType?, vehicleColor?, flags[]}`
  - `RejectedRow {rowNumber, raw, reason}`
  - `PatrolAggregate`: sparse `Map<"cell|date|hour", value>` plus a per-vehicle key only for the R8 display filter; unit `minutes` (A) or `stops` (B). No raw points kept.
- **City registry (Phase 10):** `src/city/registry.ts` lists every `data/<city>/city.json` bundled at build time (`listCities()→{id,name}[]`). `main.ts` mounts the dashboard for one city id and remounts on switch. No module outside the registry and the switcher names a city. Segment ids are prefixed with the city id so ids never collide.
- **Interfaces:** `loadCity(id)`, `generateCitations(cfg)→csv`, `importCitations(csv, city)→{citations, rejected, unmatched, counts}`, `matchAddress(addr, city)`, `computeRates(citations, asOf, overrides)`, `project(...)→{avg, low, high}`, `applyFilters(citations, filter)`, `generatePatrol(cfg, format)→csv`, `importPatrol(stream, city, opts)→{aggregate, summary, rejected, excluded}`, `buildCityPdf(model)→Blob`.

## 5. Milestones

### Phase 1: Foundation and city data
1. Scaffold from Parklas stack; deploy workflow; `.gitignore` excluding real CSV/Samsara files (NFR-2). Files: `package.json`, `vite.config.ts`, `.github/workflows/deploy.yml`, `.gitignore`, `src/main.ts`. Done when: `npm run build` and `npm test` pass.
2. City types and loader (FR-13, DR-11, NFR-7). Files: `src/types.ts`, `src/city/loadCity.ts`, `data/burbank/city.json`. Done when: a test loads Burbank and a second fixture city folder with no code change.
3. BT-1 license/coverage check (DR-9). Files: `data/burbank/SOURCES.md`. Done when: license terms and coverage findings are recorded and the author approves.
4. Blocks build script (DR-9). Files: `scripts/build-blocks.ts`, `data/burbank/blocks.csv`. Done when: script produces `blocks.csv`, a hundred-block derivation test passes, and blocks lacking numbers are listed.
5. Fine schedule and named-location files plus loaders (DR-8, DR-10, FR-12, FR-14, FR-14c). Files: `data/burbank/fine-schedule.csv`, `named-locations.csv`, `named-locations.template.csv`, `src/city/schedule.ts`. Done when: tests reject two blank-start rows for one code and resolve the $55/$65 example correctly.
6. Address normalization and block/named-location matcher (FR-10, FR-11, FR-12a). Files: `src/geo/normalize.ts`, `src/geo/matcher.ts`. Done when: tests pass for case, street-type and direction abbreviations and a multi-address named location.

### Phase 2: Citation sample generator
1. Shared sample config (single duration variable, seed) and PRNG (FR-2, FR-3, FR-43). Files: `src/sample/config.ts`, `src/sample/rng.ts`. Done when: same seed gives byte-identical output.
2. Citation generator (FR-4, FR-4c, FR-4d). Files: `src/sample/citations.ts`. Done when: tests confirm all §8.1 fields, codes only from the schedule, ~200/day mean, outcome shares within configured ±variation, Pending only inside the window, escalated-paid share near 25%, and a schedule edit changes output.
3. Error-injection mode (FR-4b). Done when: each injected error type is rejected or flagged with the expected reason.

### Phase 3: Import and validation
1. Source selector, sample/upload (FR-1). Files: `src/ui/sourcePanel.ts`. Done when: both sources load data into the app.
2. Worker-based importer (FR-5, FR-6). Files: `src/import/citations.ts`, `src/workers/citationWorker.ts`. Done when: a test asserts no `fetch`/XHR during import.
3. Row validation (DR-1–DR-7, DR-12). Files: `src/import/validate.ts`. Done when: a table-driven test covers every rule with the expected reject/flag.
4. Reject, flag and unmatched reporting with download (FR-7, FR-8, FR-9, FR-11). Files: `src/ui/importSummary.ts`. Done when: downloaded rejects CSV holds each row and reason, and total = imported + rejected.
5. FR-4a acceptance test. Files: `tests/acceptance/citationRoundtrip.test.ts`. Done when: seeded 1-month and 3-year runs give 0 rejected and 0 unmatched.

### Phase 4: Revenue model
1. Schedule resolution and escalation status (FR-14a, FR-14b, FR-15, A19). Files: `src/revenue/schedule.ts`. Done when: tests cover start dates, per-entry window override and Burbank's 21 days.
2. As-of date (FR-16). Done when: default equals latest citation date and override changes results.
3. Rates (FR-19, FR-21, DR-4, DR-6, §10). Files: `src/revenue/rates.ts`. Done when: a hand-computed fixture matches collection, reversal and escalation rates, including Paid-date fallback.
4. Realized, projections, range and monthly trend (FR-17, FR-18, FR-22, FR-22a, FR-22b). Files: `src/revenue/projection.ts`. Done when: fixture gives expected Realized, avg/low/high; sub-threshold months excluded; range hidden with notice under 2 months; low-count warning shown.
5. Rate override UI (FR-20). Files: `src/ui/ratesPanel.ts`. Done when: override recomputes immediately and shows computed and applied values with "Computed"/"Manually set".

### Phase 5: Internal reports and map
1. Filter model (FR-23). Files: `src/reports/filters.ts`. Done when: tests cover date range, day, hour, code, code source, result, block, named location.
2. Local map (RPT-1, NFR-5). Files: `src/map/*`. Done when: a test asserts the style has no remote sources, and the map renders in `npm run preview`.
3. R1 Overview and R2 time heatmap. Files: `src/reports/r1.ts`, `r2.ts`. Done when: fixture totals and day×hour counts match.
4. R3 block hotspots with named-location pins (RPT-2). Done when: fixture top-5 blocks match and day/hour filters update the map.
5. R4 named locations (G2). Done when: any named location opens with its history and trend.
6. R5 coverage footprint and R6 officer activity, internal only, with notices (FR-24, FR-25, RPT-3). Done when: notices render on R3/R5 and R5 carries the proxy label.

### Phase 6: City PDF
1. Choose PDF library (OQ9); stop and ask before adding. Done when: author approves a library.
2. R7 builder (FR-26, RPT-4, RPT-5, FR-40). Files: `src/pdf/cityReport.ts`. Done when: extracted PDF text contains as-of date, rates with status labels and Realized/Projected labels, and contains no officer numbers or patrol content.
3. Pre-export preview and confirmation (FR-27, AS6). Done when: export is disabled until the confirmation is checked.

### Phase 7: Patrol data (Samsara)
1. Independent patrol source selector: none/sample/upload (FR-28). Done when: loading patrol data does not reload citations, and all citation reports work with none.
2. Format detection, header aliases and column mapper (FR-29, FR-35, §8.4). Files: `src/patrol/formats.ts`, `src/ui/columnMapper.ts`. Done when: tests detect A and B, and unknown headers open the mapper.
3. Streaming parse and validation in a worker; driver columns discarded (FR-30, FR-31, FR-39, DR-13–DR-15). Files: `src/patrol/importer.ts`, `src/workers/patrolWorker.ts`. Done when: rule tests pass, rejects download, and no driver field exists in output.
4. Time zone conversion (FR-33). Files: `src/patrol/time.ts`. Done when: tests pass for Z, offset, epoch s/ms and naive times across both DST changes.
5. Extent and exclusion zones (FR-32). Done when: outside/depot points are counted as excluded, not rejected.
6. Aggregation (FR-36, FR-37, FR-38). Files: `src/patrol/aggregate.ts`. Done when: dwell, gap threshold, last-point and Format B stop/block-match tests pass, and no raw points are retained.
7. Import summary (FR-34). Done when: summary shows all FR-34 fields for a fixture.
8. Patrol sample generator, Formats A/B, download, error injection (FR-41–FR-44, FR-46). Files: `src/sample/patrol.ts`. Done when: same seed is reproducible, routes use only street segments, and each injected error is rejected or excluded as expected.
9. R8 heatmap (RPT-8–RPT-11, FR-39, FR-40). Files: `src/reports/r8.ts`. Done when: filters work, the legend states unit and scale mode, the notice renders, a day×hour cell click filters the map, and R8 code imports no citation modules.
10. FR-45 acceptance test. Files: `tests/acceptance/patrolRoundtrip.test.ts`. Done when: seeded default runs give 0 rejected, 0 outside-extent, and depot points excluded.

### Phase 8: Performance and privacy hardening
1. Volume tests (NFR-6, K7, K15). Done when: 5-year citation (~365k rows) and 2M-row patrol imports complete in a browser with the progress indicator updating and a main-thread heartbeat timer never stalling over 1 s (placeholder until OQ5).
2. Privacy guards (NFR-1–NFR-4). Done when: a test finds no persistence APIs or external URLs in `src/`, and CI fails if CSVs exist outside `data/<city>/` or test fixtures.

### Phase 9: Web UI review and overhaul
Runs differently from earlier phases: it is a design pass, not a feature build. Use the `frontend-design` skill (`.claude/skills/frontend-design/SKILL.md`) for every task. No behavior, data or privacy changes; existing tests must keep passing. Constraints: no remote fonts, CDNs or images (NFR-1, NFR-5), no new dependency without approval, no persistence APIs.
1. UI audit and design direction. Files: `docs/ui-audit.md` (new). Done when: every panel and report (source, import summary, rates, R1–R6, R8, patrol, export, column mapper) is reviewed in the running app (`npm run preview`) at desktop and narrow widths, problems are listed (layout, hierarchy, typography, spacing, color, empty/loading/error states, chart and map legibility, accessibility), and a short design direction (tone, type, palette, density) is written and approved by the author before any restyling.
2. Design system foundation. Files: `src/ui/theme.css` (new), `index.html`, `src/main.ts`. Done when: CSS tokens (color, type scale, spacing, radius, elevation), base element styles and shared components (card, button, input, table, tag, notice, tab) exist, fonts are system or self-hosted, and no panel uses ad hoc inline styles for values the tokens cover.
3. App shell and navigation. Files: `src/main.ts`, `index.html`. Done when: layout has a clear header, source/as-of context, report navigation and content area; the first screen explains what to do; sections can be reached without scrolling past unrelated panels.
4. Data intake panels: source selector, import summary, patrol source and summary, column mapper (`src/ui/sourcePanel.ts`, `importSummary.ts`, `patrolSource.ts`, `patrolSummary.ts`, `columnMapper.ts`). Done when: progress, success, reject/flag/unmatched and error states are visually distinct and readable, and the existing panel tests pass.
5. Revenue and rates presentation (`src/ui/ratesPanel.ts`, R1 in `src/reports/r1.ts`). Done when: Realized vs Projected, avg/low/high range, and "Computed"/"Manually set" labels are clearly differentiated, the as-of date is prominent, and low-count warnings and notices keep their required wording (FR-22, K3).
6. Charts, tables and heatmaps (R2, R3, R4, R5, R6, R8: `src/reports/*`, `src/ui/r3Panel.ts`, `r4Panel.ts`, `r8Panel.ts`, `officerPanel.ts`). Done when: the `dataviz` skill palette and legend rules are applied, R8 legend still states unit and scale mode, the R5 proxy label and RPT-3 notices remain, and day×hour cell click still filters the map.
7. Map styling (`src/map/style.ts`, `hotspots.ts`, `streetMap.ts`). Done when: map matches the new theme, hotspot and named-location pins are legible, and `style.test.ts` still asserts no remote sources.
8. City PDF export panel and preview (`src/ui/exportPanel.ts`). Done when: the pre-export preview and confirmation checkbox are prominent and the export stays disabled until confirmed (FR-27).
9. Responsive, accessibility and polish. Done when: usable at 1280px and 900px widths, keyboard navigable with visible focus, color contrast meets WCAG AA in the theme, `prefers-reduced-motion` respected, and empty/loading states exist for every report.
10. Verification. Done when: `npm run build` and `npm test` pass, before/after screenshots of every report are reviewed with the author, and the manual G1 timed walkthrough (< 5 min) still holds.

### Phase 10: Multiple cities in one dashboard, then Malibu, CA
Runs in one chat. Do tasks in order, commit after each (`[10.N] ...`), and keep `npm run build` and `npm test` green throughout. Burbank behavior, the wording of required notices and the privacy rules must not change. Tasks 10.1–10.5 make the app multi-city using Burbank and the `testville` fixture only. Tasks 10.6–10.10 add Malibu as data plus one new script. Stop and ask the author only at the points marked **Ask**; elsewhere record a `[Proposed]` value, label it, and continue.
1. Audit and city registry. Files: `src/city/registry.ts` (new), `src/city/registry.test.ts` (new). First list every hard-coded `'burbank'` and Burbank-specific string in `src/` and `scripts/` (known: `loadCitySource('burbank')` and `loadSegments('burbank')` in `src/main.ts`). Done when: `listCities()` returns Burbank from the bundled folders and, given a fixture glob, the testville fixture too (sorted by name); a test fails if a non-test file in `src/` contains a quoted city id outside the registry; the audit list is in the commit message.
2. Per-city data loading by id. Files: `src/ui/sourcePanel.ts`, `src/city/loadCity.ts`. Files also: `docs/adding-a-city.md` (new, documents every city file and the fine-schedule columns). Done when: a test confirms every registry city has all five required files (`city.json`, `segments.geojson`, `blocks.csv`, `fine-schedule.csv`, `named-locations.csv`) and loads, a city missing one gets an error naming the file, and Burbank output is unchanged. Per-city fine schedule (AS12): for every registry city, the schedule is non-empty and passes `parseFineSchedule`; a fixture schedule with differently styled codes (dash, space and dotted) loads, resolves by date and gets the right code source; and a seeded sample for a city draws only codes from that city's own schedule (the testville fixture, with its own codes, shows none of Burbank's).
3. Dashboard mount and teardown. Files: `src/main.ts`, `src/dashboard.ts` (new). Done when: the body of `main.ts` moves into `mountDashboard(root, cityId): {destroy()}`; `destroy()` removes DOM, workers, map instances and listeners; a test mounts Burbank, destroys it, mounts testville, and finds no leftover nodes, workers or Burbank text.
4. City switcher and state reset. Files: `src/ui/citySwitcher.ts` (new), `src/ui/shell.ts`, `src/ui/shell.css`. Done when: the header shows a labelled, keyboard-operable city selector (hidden if only one city exists); changing city asks for confirmation when citations, patrol data or rate overrides are loaded (AS9), then remounts with the empty "No citation data loaded" state; the choice is read from and written to `#city=<id>` (AS10); an unknown id falls back to the first city with a visible notice. Tests cover switch with and without loaded data, cancel keeping data, and the hash round trip.
5. City-scoped outputs. Files: `src/pdf/cityReport.ts`, `src/ui/exportPanel.ts`, `src/ui/importSummary.ts`, `src/sample/citations.ts`. Done when: the PDF title and file name (`<city-id>-citation-report-<as-of>.pdf`), the import summary, and downloaded sample and rejects CSV names carry the active city; a test switches city and confirms the extracted PDF text names only the active city; the RPT-5 no-officer/no-patrol test still passes for both cities; the R1 code table and the code filter list only the active city's schedule codes.
6. Malibu license and coverage check (extends BT-1). Files: `data/malibu/SOURCES.md` (new). Done when: it records the CAMS `LegalComm='Malibu'` point count and source-field breakdown (same query pattern as `data/burbank/SOURCES.md`), OpenStreetMap ODbL attribution and share-alike notes for the segments, and the sources for the extent and time zone. **Ask:** the author approves the findings before any Malibu data is committed.
7. Malibu street segments. Files: `scripts/build-segments.ts` (new, Node, never shipped), `scripts/build-segments.test.ts` (new), `data/malibu/segments.geojson` (new). Done when: the script takes a city id, reads its `extent` from `city.json`, fetches named drivable streets from OpenStreetMap (Overpass), splits them at intersections and writes Burbank's feature shape (`segment_id` = `<city>-<osm node>-<osm node>`, `street`, `from_street`, `to_street`, `city_id`); unit tests cover splitting, naming and id prefixing on a small fixture; Malibu output contains Pacific Coast Highway, Malibu Canyon Road, Kanan Dume Road and Las Flores Canyon Road, and every feature lies inside the extent. Never overwrite `data/burbank/segments.geojson`.
8. Malibu settings and blocks. Files: `data/malibu/city.json` (new), `data/malibu/blocks.csv`, `data/malibu/blocks-report.md` (generated), `scripts/build-blocks.ts`, `src/geo/normalize.ts`, `src/geo/geo.test.ts`. Done when: `city.json` has `city_id` `malibu`, name `Malibu, CA`, `America/Los_Angeles`, a bbox extent covering the city limits, and a depot; guessed values (payment window, depot near City Hall, no exclusion zones) are listed in `SOURCES.md` for OQ16; `node scripts/build-blocks.ts malibu` produces `blocks.csv` and lists blocks lacking numbers; normalization tests cover Malibu forms (`Pacific Coast Hwy`, `PCH`, `Malibu Canyon Rd`, five-digit numbers such as `23250 Pacific Coast Hwy`, ZIP `90265`, trailing `Malibu CA`) and all Burbank normalization tests still pass.
9. Malibu fine schedule and named locations. Files: `data/malibu/fine-schedule.csv`, `data/malibu/named-locations.csv`, `data/malibu/named-locations.template.csv`. Done when: the files use Burbank's columns and Malibu's own code style; **Ask:** the author supplies the real codes and amounts, or approves placeholders, in which case each placeholder row is marked as an estimate in `SOURCES.md` (OQ13); the schedule may have as many rows as Malibu needs and uses its own codes, none copied from Burbank; `parseFineSchedule` accepts the file and the blank-start-date rule holds; at least five well-known named locations (for example Malibu Pier, Malibu Lagoon State Beach, Zuma Beach, Malibu Country Mart, City Hall) resolve through `matchAddress` against Malibu blocks, with addresses taken from CAMS.
10. Malibu end to end and acceptance across cities. Files: `tests/acceptance/citationRoundtrip.test.ts`, `tests/acceptance/patrolRoundtrip.test.ts`, `tests/acceptance/cities.test.ts` (new). Done when: the FR-4a and FR-45 acceptance tests run for every registry city (`describe.each(listCities())`) with 0 rejected, 0 unmatched and 0 outside-extent; Malibu's block match rate on real-format input is printed and any shortfall against Burbank is reported to the author; `npm run build` and `npm test` pass; in `npm run preview` the switcher moves between Burbank and Malibu, the Malibu map shows the coastline streets and hotspots, and the Malibu PDF exports behind the pre-export confirmation; screenshots of each city's R3 and R8 views are reviewed with the author.

## 6. Risks
- K1 Incomplete block matching: build `blocks.csv` first, normalize addresses, show unmatched list and match rate.
- K10 Samsara format differs: support A and B with aliases and column mapper; rework when a real export arrives (OQ10).
- K5 Real or officer data exposure: `.gitignore` and CI guard, RPT-5 PDF text test, pre-export preview.
- K7/K15 Browser performance: workers, streaming, aggregate-only patrol storage, Phase 8 volume tests.
- K3 Projections misread: mandatory labels, computed/manual status, as-of date, low/high range, estimate fines (OQ13).
- K17 Second city exposes Burbank assumptions (hard-coded ids, five-digit house numbers, a long coastal extent with ocean): registry-only city ids test (10.1), Malibu normalization tests (10.8), acceptance tests across cities (10.10).
- K18 Malibu data quality or license (OSM share-alike, CAMS terms, Caltrans-owned PCH, placeholder fines): SOURCES.md approval gate (10.6), placeholder rows labelled as estimates (10.9), no figures go to a city before the author replaces them.
- K20 A city's fine schedule is treated as fixed or Burbank-shaped (code style, row count, code-source parsing): AS12, schedule tests in 10.2, own-codes-only sample test, Malibu schedule in 10.9.
- K19 Stale state after a city switch leaks one city's data into another's report or PDF: full teardown (10.3), confirmation and empty state (10.4), PDF city-name test (10.5).
- K16 UI overhaul regresses required labels, notices or privacy rules: keep existing tests green, restyle without changing wording of FR-22/FR-24/RPT-3/RPT-5 text, review screenshots with the author (Phase 9).

## 7. Verification
| PRD criterion | Check |
|---|---|
| G1 top 5 blocks/time windows | R2/R3 fixture tests (5.3, 5.4); manual timed walkthrough < 5 min |
| G2 named location history/trend | Task 5.5 |
| G3 map filtered by day/hour | Task 5.4 |
| G4 PDF from one CSV, no officer data | Tasks 6.2, 6.3; manual: upload CSV, export in a few clicks |
| G5 revenue labeled with assumptions | Tasks 4.4, 4.5, 6.2 |
| G6 patrol heatmap from CSV/sample | Tasks 7.9, 7.10; manual load and filter |
| FR-1–FR-4d | Tasks 2.1–2.3, 3.1, 3.5 |
| FR-5–FR-13, DR-1–DR-12 | Tasks 1.2–1.6, 3.2–3.4 |
| FR-14–FR-22b, §10 | Phase 4 tests |
| FR-23–FR-27, RPT-1–RPT-7 | Phases 5–6 |
| FR-28–FR-46, DR-13–DR-15, RPT-8–RPT-11 | Phase 7 |
| NFR-1–NFR-7 | Tasks 1.1, 1.2, 5.2, 8.1, 8.2 |
| UI overhaul (no behavior change) | Phase 9 tasks 9.1–9.10; existing tests green; author screenshot review |
| FR-13 (new city = data folder), multi-city dashboard | Tasks 10.1–10.5; registry and teardown tests |
| Malibu, CA added | Tasks 10.6–10.10; acceptance tests run for every city |
| FR-4a / FR-45 acceptance | `tests/acceptance/*` in CI |
