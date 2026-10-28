# Plan: Citation Insights (MVP, Burbank)

## 1. Goal
Build a static, client-side TypeScript web app on GitHub Pages that imports or generates parking citation data and produces internal reports (R1–R6), a city PDF (R7) and an optional Samsara patrol heatmap (R8). All processing stays in the browser. Burbank is the first city, and adding another city must need only a new data folder.

## 2. Scope
**In scope (PRD §13 MVP):** BT-1 `blocks.csv` build script; citation sample generator; CSV import with validation and reject reporting; block matching with an unmatched list; named locations; revenue model (Realized/Projected, adjustable rates); reports R1–R7 with local map and city PDF; patrol sample generator, Format A/B import and R8.
**Out of scope (PRD §4, §13 later):** backend, database, accounts, persistence; city login; external APIs, geocoding services, Samsara API; shift/schedule import; patrol effort metrics or patrol-to-citation/officer joins; per-officer ranking in city output; names or plates; address-point geocoding; additional cities beyond the data-folder mechanism.

## 3. Assumptions and Open Questions
Assumptions (conservative readings, each revisable):
- AS1. Parklas code and street data are available to the agent at a path the author provides (PRD gives none; see OQ1).
- AS2. City settings live in `data/<city>/city.json` (PRD §8.3 names no file for DR-11).
- AS3. Citation CSV headers are the §8.1 field names verbatim, dates ISO (A17, A24).
- AS4. Every numeric default marked [Proposed] in the PRD is used as written and kept configurable in one config module.
- AS5. Settled-citation threshold (FR-22) is a config value with placeholder 30 until OQ2 is answered.
- AS6. FR-27 is built as proposed: a pre-export preview with a confirmation that no officer data is included and assumptions are correct.
- AS7. Manager and supervisor share one unauthenticated UI (PRD §5).

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

## 6. Risks
- K1 Incomplete block matching: build `blocks.csv` first, normalize addresses, show unmatched list and match rate.
- K10 Samsara format differs: support A and B with aliases and column mapper; rework when a real export arrives (OQ10).
- K5 Real or officer data exposure: `.gitignore` and CI guard, RPT-5 PDF text test, pre-export preview.
- K7/K15 Browser performance: workers, streaming, aggregate-only patrol storage, Phase 8 volume tests.
- K3 Projections misread: mandatory labels, computed/manual status, as-of date, low/high range, estimate fines (OQ13).

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
| FR-4a / FR-45 acceptance | `tests/acceptance/*` in CI |
