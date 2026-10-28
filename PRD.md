# Product Requirements Document: Citation Insights

**Status:** Draft v0.3 (adds Samsara patrol location heatmaps)
**Date:** 2026-10-28
**Test city:** Burbank, CA (design must extend to other cities)

Items marked **[Proposed]** were suggested during discovery but not yet explicitly confirmed. Items marked **[Open]** are unresolved and listed in the Open Questions section.

---

## 1. Overview

Citation Insights is a static, client-side web application, hosted on GitHub Pages, that ingests parking and traffic citation data and produces reports for review. It answers where, when, and what kind of citations occur, so a private parking enforcement company can set staffing, monitor key locations, and design patrol beats. It also produces a PDF report for the city, focused on revenue and citation types, to support requests for added capacity or materials.

Data comes from one of two sources: a generated sample data set (default one month, duration configurable) or an uploaded CSV. All processing happens in the user's browser. There is no backend or database in the MVP.

A second, independent and optional dataset provides patrol location data: vehicle location history exported from Samsara as CSV (or generated as sample patrol data until real exports are available). It is used only to draw patrol heatmaps showing where and when enforcement vehicles were present. It is not linked to citations, officer numbers or drivers (see Section 7.6).

The project builds on the author's existing Parklas project (a Burbank street and curb-rules map built with TypeScript, Vite and MapLibre GL JS), reusing its street data, per-city data folder structure, and code.

## 2. Problem Statement

Citation analysis today is ad hoc. Management reviews it occasionally and tracks little beyond numerical totals. As a result:

- There is no view of where, when, or what type of citations occur.
- Staffing coverage, hotspot monitoring, and rover officer beats are set without data.
- Locations with large businesses that receive specific monitoring cannot be isolated.
- The city has no evidence-based summary of revenue and citation types to inform decisions about capacity, materials, or enforcement priorities.
- Where and when enforcement vehicles actually patrol is not visible. Citation-based coverage (R5) can only infer it, so quiet areas cannot be told apart from unpatrolled ones.

Important caveat: citation data measures enforcement activity, not violations. Areas with few citations may be clean or may be unpatrolled.

## 3. Goals and Success Metrics

| ID | Goal | Proposed metric **[Proposed]** |
|----|------|--------------------------------|
| G1 | Show where staffing is thin and where more coverage may be warranted | A manager can identify the top 5 blocks and top 5 time windows by citation volume in under 5 minutes |
| G2 | Isolate and monitor specific high-interest addresses (named locations) | Any named location can be opened with its own history and trend |
| G3 | Support beat design for rover officers with a hotspot map | A supervisor can view a map filtered by day and hour |
| G4 | Produce a city-facing PDF focused on revenue, citation types, highlighted blocks and named locations, with no officer data | PDF generated from one CSV in a few clicks |
| G5 | Make revenue figures honest and traceable | Every revenue figure is labeled Realized or Projected, with its assumptions shown |
| G6 | Show where and when patrol vehicles actually operate, from Samsara location data | A supervisor can load a Samsara CSV (or sample patrol data) and view a heatmap filtered by day and hour in a few clicks |

## 4. Non-Goals (MVP)

- NG1. No backend, database, or user accounts.
- NG2. No live or login access for the city. The city receives PDF exports only.
- NG3. No external APIs, including geocoding APIs. No data leaves the browser.
- NG4. No true patrol-effort or shift tracking. Citation-based coverage (R5) remains a proxy. Samsara location data (R8) shows vehicle presence only, not officer effort; schedule import is a later phase.
- NG5. No personal data handling (names, plate numbers) and no per-officer performance ranking in city-facing output.
- NG6. No determination of whether violations occurred where no citations were written.
- NG7. Patrol location data is not joined to citations, officer numbers, drivers or vehicles-to-officers. There is no vehicle-to-officer mapping file, no citations-per-patrol-hour metric, and no per-driver or per-vehicle performance output. It is used only for patrol heatmaps.
- NG8. No Samsara API calls or credentials. Samsara data enters only as an exported CSV file (see NG1, NG3).

## 5. Users and Personas

| Role | Description | Needs |
|------|-------------|-------|
| Company Manager | Loads citation data and optional patrol location data (sample or CSV), views all reports, configures assumptions, exports the city PDF | Full access, including officer-level data and city export |
| Supervisor | Views reports, including officer-level, map and patrol heatmap views, to plan beats and coverage | Read access to internal reports, map and patrol heatmap |
| City recipient | Receives the PDF report only; does not use the tool | Revenue, citation type mix, highlighted blocks, named-location summary; no officer data |

The MVP has no authentication. Access control is limited to which report views are internal and which are city-facing. **[Open]** Whether manager and supervisor need distinct in-app permissions.

## 6. User Stories

- US-1. As a manager, I want to generate sample data for a chosen duration so that I can demo the tool and test reports.
- US-2. As a manager, I want to upload a CSV so that I can analyze real citation data.
- US-3. As a manager, I want rejected rows listed with reasons so that I can fix my source data.
- US-4. As a supervisor, I want a heatmap of citations by day and hour so that I can see when enforcement demand peaks.
- US-5. As a supervisor, I want a block-level hotspot map filterable by day and hour so that I can design rover beats.
- US-6. As a manager, I want to view history and trend for a named location so that I can monitor specific businesses.
- US-7. As a supervisor, I want to see where each officer number was recorded by hour so that I can identify coverage gaps.
- US-8. As a manager, I want revenue shown as Realized and Projected, with the rates behind the projection, so that I can trust the figures.
- US-9. As a manager, I want to adjust the collection and escalation rates so that I can see how projections change.
- US-10. As a manager, I want to export a PDF for the city with no officer data so that I can support requests for resources.
- US-11. As a supervisor, I want to import a Samsara location CSV so that I can see where patrol vehicles actually went.
- US-12. As a supervisor, I want a patrol heatmap filterable by day, hour and date range so that I can see when and where patrol coverage is thin and design beats around it.
- US-13. As a manager, I want to generate sample patrol data so that I can demo and test the patrol heatmap before real Samsara data is available.
- US-14. As a manager, I want rows rejected or excluded from a Samsara import listed with reasons so that I can fix the export or settings.

Acceptance criteria are given within the requirements below.

## 7. Functional Requirements

### 7.1 Data source selection
- FR-1. The system shall let the user choose between generated sample data and a CSV upload.
- FR-2. The system shall generate sample data for a duration set by a single configurable variable, defaulting to one month.
- FR-3. The system shall support sample durations of multiple years without code changes.
- FR-4. The sample generator shall produce all required and optional fields, including a mix of all four fine results. It shall draw addresses only from the city's `blocks.csv` and named-locations file, so every generated citation matches a block by construction. **[Proposed]**
- FR-4a. Acceptance test: sample data of any supported duration, run back through the importer and address matcher, shall produce zero unmatched addresses and zero rejected rows. Any failure indicates a defect rather than a data gap.
- FR-4b. The sample generator shall offer an optional error-injection mode that adds deliberately invalid rows (duplicate IDs, bad dates, unknown types, unmatched addresses) so reject and flag paths can be tested. The FR-4a test applies to the default mode only. **[Proposed]**
- FR-4c. The sample generator shall read citation types, amounts, start dates and sample weights from the city's fine schedule file (DR-8) at generation time, with no hard-coded citation types. After the schedule is edited, regenerating shall reflect the changes. An optional random seed shall make a run reproducible. **[Proposed]**
- FR-4d. The sample generator shall default to an average of 200 citations per day with day-to-day variation. Default outcomes: about 70% Paid, 20% Reversed and 10% Unpaid, varying month to month (default variation plus or minus 5 percentage points) so the collection rate can be tracked. Pending applies only to citations still within the payment window as of the as-of date (default 3% of them). Paid citations are paid at the base amount, or at the escalated amount for a configurable share (default 25%). All values shall be configurable. **[Proposed]**

### 7.2 Import and validation
- FR-5. The system shall process all imported data locally in the browser and shall not transmit it.
- FR-6. The system shall validate each row against the rules in Section 8.
- FR-7. The system shall import valid rows and reject invalid rows, displaying a warning that lists each rejected row and the reason.
- FR-8. The system shall let the user download rejected rows with their reasons as a CSV.
- FR-9. The system shall display counts of total, imported, and rejected rows after import.

### 7.3 Location matching
- FR-10. The system shall parse each address into street and block number and match it to a street block using bundled per-city street data, without external services.
- FR-11. The system shall list addresses that cannot be matched to a block, with counts.
- FR-12. The system shall support a per-city named-locations file (name, address, coordinates) so that key businesses are isolated and shown as pins.
- FR-12a. The system shall assign a citation to a named location when its normalized address matches any address listed for that location (a location may list several addresses). **[Proposed]** Addresses are normalized on both sides before matching (DR-10).
- FR-13. Each city shall be defined by its own data folder (street segments, blocks, named locations, fine schedule, city settings) so a new city requires no code change.

### 7.4 Revenue model
- FR-14. The system shall load a per-city fine schedule (DR-8) giving, for each citation code (with a readable name), the base amount, the escalated amount, and an optional start date, so that new fines and fine increases are added as new entries without code changes.
- FR-14a. The system shall apply, to each citation, the schedule entry for its citation code with the latest start date on or before the citation date.
- FR-14b. The payment window (days until escalation) shall be a per-city configuration value, with an optional per-entry override. Burbank uses 21 days.
- FR-14c. Citation types shall be identified by their citation code (for example a CVC or BMC section), with a readable name used for display. The code source (the prefix, such as CVC or BMC) shall be usable for grouping and filtering; a city may use other prefixes. **[Proposed]**
- FR-15. The system shall determine escalation status from the citation date, the applicable payment window (city configuration or entry override), and a report as-of date.
- FR-16. The report as-of date shall default to the latest citation date in the loaded data and be user-overridable. **[Proposed]**
- FR-17. The system shall label every revenue figure as Realized or Projected.
- FR-18. Realized revenue shall be the sum of Paid amount on Paid citations (using the Fine amount where Paid amount is missing, DR-4).
- FR-19. The system shall compute a collection rate, a reversal rate and an escalation rate from the loaded data (formulas in Section 10) and display them beside every projection with the label "Computed" or "Manually set".
- FR-20. The system shall let the user override the collection rate or the escalation rate and recompute all projections immediately, showing both computed and applied values.
- FR-21. The system shall exclude Pending and Reversed citations from projected revenue. Pending citations shall be shown separately as a count and amount at stake.
- FR-22. The system shall warn when rates are based on fewer settled citations than a set threshold. **[Open]** threshold value.
- FR-22a. The system shall show the collection rate by month as a trend, defined as Paid / (Paid + Unpaid + Reversed) over citations past the payment window, excluding Pending. **[Proposed]**
- FR-22b. The system shall show every projection as an average, a low case and a high case, using the pooled average, lowest and highest monthly collection rates in the data period. Months with fewer settled citations than the FR-22 threshold shall be excluded from the low and high, and the range shall be hidden with a notice if fewer than two months qualify. **[Proposed]**

### 7.5 Reports and review
- FR-23. The system shall provide the reports in Section 9, with filters by date range, day of week, hour, citation code or code source (CVC, BMC), fine result, block, and named location.
- FR-24. Officer-level data shall be available only in internal views and shall be excluded from the city PDF.
- FR-25. Location and staffing reports shall display a notice that citations reflect enforcement activity, not violation rates.
- FR-26. The system shall export the city report as a PDF.
- FR-27. Review and sign-off workflow before the PDF is exported. **[Open]** Proposal: a pre-export preview with a confirmation that no officer data is included and that assumptions shown are correct.

### 7.6 Patrol location data (Samsara)

Patrol data is a separate, optional dataset used only for the patrol heatmap (R8). It is never joined to citations, officer numbers or drivers (NG7).

**Import**
- FR-28. The system shall let the user choose the patrol data source independently of the citation data source: none, generated sample patrol data, or a Samsara CSV upload. All citation reports shall work without patrol data, and loading one dataset shall not reload the other.
- FR-29. The system shall support two Samsara CSV formats, defined in Section 8.4: Format A (GPS location history, point-level) and Format B (Trip History report export, trip start and end). It shall detect the format from the header row, tell the user which was detected, and accept one format per load.
- FR-30. The system shall parse patrol files locally in the browser (FR-5 applies), reading in chunks with a progress indicator so large files do not freeze the interface.
- FR-31. The system shall validate rows against Section 8.4, import valid rows, list rejected rows with reasons, and let the user download them as a CSV, as in FR-7 to FR-9.
- FR-32. The system shall exclude, but not reject, points outside the city extent or inside a configured exclusion zone such as a depot or yard (DR-11), and report them as a separate "excluded" count with the reason.
- FR-33. The system shall convert timestamps to the city time zone (DR-11) before assigning day of week and hour, handling daylight saving time. Timestamps with a UTC marker or offset are converted. Timestamps without one are read in a user-selectable zone that defaults to the city time zone. The import summary shall state the zone applied.
- FR-34. The system shall show an import summary: rows read, imported, rejected and excluded; date range covered; number of vehicles (a count only); median ping interval (Format A); and day-by-hour cells with no data, so data gaps are visible before the heatmap is read.
- FR-35. If column headers are not recognized, the system shall let the user map the file's columns to the required fields instead of failing. **[Proposed]**

**Processing**
- FR-36. For Format A, each point shall be weighted by dwell time: the time until the same vehicle's next point. Gaps longer than a gap threshold (default 5 minutes) shall not be attributed to any location, so a vehicle that was switched off adds no heat. The last point of a vehicle's sequence is weighted by the median ping interval. **[Proposed]**
- FR-37. For Format B, each trip start and end shall count as one stop event. A stop is placed at the file's coordinates if present, otherwise at the street block matched from the address text using the FR-10 matcher. Unmatched addresses shall be listed as in FR-11. The heatmap shall be labeled as stops, not time, and cannot show routes between stops.
- FR-38. The system shall aggregate patrol data on import into a sparse count by grid cell (default 25 m, configurable), date and hour, and shall not retain raw points afterwards. The date-range, day-of-week and hour filters shall work from the aggregate. **[Proposed]**
- FR-39. Vehicle identifiers shall be used only to order points per vehicle and for an optional display filter on R8. The system shall provide no per-vehicle or per-driver totals, rankings or comparisons. Driver name or ID columns, if present, shall be discarded at import and never stored or displayed. There shall be no vehicle-to-officer mapping. **[Proposed]**
- FR-40. Patrol data and everything derived from it are internal only and shall be absent from the city PDF.

**Sample patrol data generator**
- FR-41. The system shall generate sample patrol data in Format A by default, and optionally in Format B. The output shall pass through the same importer as an uploaded file, and the user shall be able to download it as a CSV for testing.
- FR-42. The generator shall build routes from the city's street segment data (FR-13), with no hard-coded locations. It shall be independent of the citation sample data and shall not use citation locations.
- FR-43. The generator duration shall be set by the same single variable as the citation sample (FR-2), default one month, supporting multi-year runs without code changes. An optional random seed shall make a run reproducible.
- FR-44. Configurable defaults **[Proposed]**:
  - 4 vehicles; weekday shifts 07:00 to 18:00 local time; 2 vehicles on weekends from 09:00 to 17:00.
  - A 30-second ping interval (Samsara location data is sub-minute).
  - Travel at 5 to 25 mph with occasional stops (1 to 10 minutes), and a 30-minute break per shift.
  - Each shift starts and ends at a depot point set in city settings.
  - GPS jitter of about 5 m; random dropped pings (default 1%) and occasional multi-minute gaps.
  - Street choice weighted by optional hot-zone weights in city settings (uniform if none), so demo heatmaps show structure.
- FR-45. Acceptance test: default-mode sample patrol data of any supported duration, run back through the importer, shall produce zero rejected rows and zero points outside the city extent. Points inside a configured depot zone shall be excluded as expected. Any other failure indicates a defect.
- FR-46. The generator shall offer an optional error-injection mode adding invalid rows (bad timestamps, latitude and longitude out of range or swapped, (0,0) coordinates, missing vehicle, duplicates, points outside the city extent) so reject and exclude paths can be tested. The FR-45 test applies to the default mode only. **[Proposed]**

## 8. Data Requirements

### 8.1 CSV fields

| Field | Required | Format / rules |
|-------|----------|----------------|
| Citation ID | Yes | Non-personal ticket identifier; unique within an import |
| Date | Yes | Assumed ISO format (YYYY-MM-DD) until a real sample file is available; importer to be reworked against real data in a later stage **[Assumed]** |
| Time | Yes | HH:MM, 24-hour |
| Citation code | Yes | Must match a fine schedule entry by code (e.g., a CVC or BMC section). The readable name comes from the schedule. Replaces the former "Citation type" and the duplicate "Fine type" columns |
| Officer # | Yes | Internal use only |
| Fine result | Yes | One of: Paid, Unpaid, Pending (disputed, awaiting result), Reversed (voided, no payment) |
| Fine amount | Yes | Amount assessed at issuance; non-negative number |
| Paid amount | Required if Paid | Non-negative number; must be blank or zero for non-Paid rows |
| Paid date | No | If present, only on Paid rows and not earlier than Date |
| Address | Yes | Parsed to street and block |
| Vehicle type | No | |
| Vehicle color | No | |

### 8.2 Validation and error handling
- DR-1. The system shall reject rows with missing required fields, invalid date or time formats, or a Fine result outside the allowed values.
- DR-2. The system shall reject rows with a missing or duplicate Citation ID, keeping the first occurrence and rejecting later duplicates with a warning. **[Proposed]**
- DR-3. The system shall reject rows with negative or non-numeric amounts, Paid amount above zero on non-Paid rows, or Paid date on non-Paid rows.
- DR-4. The system shall flag, but not reject, Paid rows with no Paid amount, and shall treat the Fine amount (the assessed base amount, not the escalated penalty) as paid for those rows in revenue and rate calculations.
- DR-5. The system shall flag unknown citation codes (no fine schedule entry) and unmatched addresses.
- DR-6. Reversed citations shall be excluded from revenue and counted in reversal rates.
- DR-7. The data shall contain no names or plate numbers. The system shall not request them.

### 8.3 Per-city reference data
- DR-8. Fine schedule: a per-city data file in which each row is one fine entry. Adding a new fine, or a fine increase, shall require only adding a row, with no code change.
  - Fields: citation code, citation name, base amount, escalated amount (required); start date, escalation days (override of the city default in DR-11), sample weight (relative frequency for the sample generator; blank means equal) (optional). The code is the key; the name is for display. File: `data/<city>/fine-schedule.csv`.
  - A citation code may have several rows. Each later row represents an increase (or change) taking effect on its start date.
  - For each citation, the system shall use the row for its citation code with the latest start date on or before the citation date.
  - A blank start date means the entry applies from the beginning, making it the baseline for that citation type. Only one blank-start entry is allowed per code, and any increase must have an explicit start date. Example: a $55 entry with no start date plus a $65 entry starting 7/1/26 means a 6/30/26 citation owes $55 and an 8/4/26 citation owes $65.
  - The Fine amount in the CSV is still the amount assessed at issuance and wins if it differs from the schedule's base amount.
  - Values below are **ESTIMATES from quick desk research and shall be replaced with official Burbank values** before any figure is shown to the city.

  | Code (unverified) | Name | Base (est.) | Escalated (est.) | Start date | Basis |
  |---|---|---|---|---|---|
  | CVC-22500(g) | Street sweeping | $75 | $100 | (blank) | $50 in a 2021 Burbank PD staff report; $75 on a third-party 2026 site (conflict). Code taken from a third-party site |
  | BMC-6-1 | Overtime / time-limit zone | $65 | $90 | (blank) | Third-party site (parkingfight.com); code unverified |
  | BMC-ART30 | Parking meter, no payment | $70 | $95 | (blank) | Third-party site (parkingfight.com); code unverified |
  | TBD | Other types (red curb, hydrant, expired registration, alley, etc.) | TBD | TBD | n/a | No amounts or codes found |

  Escalated amounts assume a +$25 late surcharge, taken from an unverified third-party claim; no official Burbank late-fee amount was found. The sample generator uses whatever rows the file contains.
- DR-9. Street blocks: bundled from Parklas street data. `blocks.csv` must cover the full city and is a first-priority build item, because the sample generator and the address matcher both depend on it. **[Proposed]** A build-time script (not run in the browser) downloads Burbank address points from the LA County CAMS dataset, snaps each to the nearest street segment, and derives the hundred-block number. Its output is committed to the city folder and the script is rerun only when street or address data changes. Residual gaps are filled by hand using the existing blocks report; blocks lacking numbers are reported as unmatched. License terms and Burbank coverage must be verified (task BT-1).
- DR-10. Named locations: a per-city file (`data/<city>/named-locations.csv`) with one row per address: location ID, location name, address, optional latitude and longitude, optional notes. A location with several addresses repeats its location ID on each row. The system normalizes addresses (case, street-type and direction abbreviations) on both the file and the citations before matching. A blank-coordinate address is pinned at its block. A template (`named-locations.template.csv`) is provided and is not read by the app.
- DR-11. City settings: name, time zone, and default payment window in days (Burbank: 21), changeable per city without code changes. For patrol data, also: city extent (bounding box or polygon, used to exclude points outside the city), optional exclusion zones (latitude, longitude, radius in meters, for example a depot or yard), a depot point used by the sample patrol generator, and optional hot-zone weights for the generator.
- DR-12. Partial payments are not supported. The system shall flag Paid rows whose Paid amount is neither the Fine amount nor the escalated amount for that citation type. **[Proposed]**

### 8.4 Samsara patrol location CSV formats

Basis and limits of what is known: Samsara documents a Trip History report (Reports > Activity > Trip History) that exports to CSV from its more-actions menu, listing each trip's start and end location with timestamps, the vehicle, the driver and the distance. Samsara's GPS data (its API "gps" statistic) carries time, latitude, longitude, heading, speed and an address, but a point-level dashboard CSV export was not found in Samsara's public documentation. Both formats below therefore use Samsara's own field names and report columns, and **[Assumed]** exact headers and layout until a real export is available (see Q28 and A17). The file is a CSV that the user exports or prepares themselves; the application never contacts Samsara (NG8).

**Format A: GPS location history (point-level, preferred)**

| Field (accepted header aliases) | Required | Format / rules |
|---|---|---|
| Time (time, timestamp, happenedAtTime) | Yes | ISO 8601 with Z or offset preferred, as Samsara reports it (for example 2025-03-11T10:21:19Z). Unix epoch seconds or milliseconds also accepted **[Proposed]**. See FR-33 for zone handling |
| Latitude (latitude, lat) | Yes | Decimal degrees, -90 to 90; not (0,0) |
| Longitude (longitude, lon, lng) | Yes | Decimal degrees, -180 to 180 |
| Vehicle (vehicle, vehicle name, vehicle id, asset) | Yes | Used only to order points per vehicle (FR-39) |
| Speed (speedMilesPerHour, speed) | No | Non-negative; enables an optional moving or stopped filter on R8 **[Proposed]** |
| Heading (headingDegrees) | No | Ignored |
| Address (formattedLocation, address, reverseGeo) | No | Ignored |
| Driver (driver, driver name, driver id) | No | Discarded at import (FR-39) |

**Format B: Trip History report export (trip-level)**

| Field (assumed header) | Required | Format / rules |
|---|---|---|
| Trip start time | Yes | Date and time; zone per FR-33 |
| Trip start location | Yes | Latitude and longitude if present; otherwise address text, matched to a block (FR-37) |
| Trip end time | Yes | Not earlier than the start time |
| Trip end location | Yes | As for start location |
| Asset / Vehicle | Yes | Used only to identify the vehicle (FR-39) |
| Driver | No | Discarded at import (FR-39) |
| Distance | No | Ignored |

**Validation**
- DR-13. The system shall reject patrol rows with a missing or unparseable time, a non-numeric or out-of-range latitude or longitude, (0,0) coordinates (a GPS no-fix), or a missing vehicle. For Format B it shall also reject rows whose end time is before the start time. Each rejected row is listed with its reason (FR-31).
- DR-14. The system shall ignore, and count, duplicate points with the same vehicle and time, keeping the first. It shall flag, but not reject, Format B locations that can be neither read as coordinates nor matched to a block, and list them as unmatched.
- DR-15. The patrol data shall contain no names. The system shall not request driver names or IDs and shall discard them if present (FR-39), consistent with DR-7.

## 9. Report Specifications

| ID | Report | Audience | Answers |
|----|--------|----------|---------|
| R1 | Overview | Internal | Totals by type and result; Realized and Projected revenue |
| R2 | Time patterns | Internal | When do citations occur? Day-of-week by hour heatmap, filterable by type |
| R3 | Block hotspots | Internal | Which blocks have the most citations? Ranked list plus local map filtered by day and hour |
| R4 | Named locations | Internal | History and trend for each named location |
| R5 | Coverage footprint | Internal | Where was each officer # recorded, by hour, from citation data? Blank areas indicate possible gaps (proxy for patrol coverage) |
| R6 | Officer activity | Internal only | Citations by officer # |
| R7 | City PDF | City | Revenue (Realized and labeled Projected), citation type mix and trends, highlighted blocks, and a separate named-locations summary; no officer data and no patrol data |
| R8 | Patrol heatmap | Internal only | Where and when were patrol vehicles present (Samsara data)? Local map heatmap filtered by date range, day of week and hour, with a day-by-hour summary of patrol time. Not linked to citations |

Report requirements:
- RPT-1. The map shall render locally using bundled street geometry (MapLibre GL JS, as in Parklas), with no external tiles or servers.
- RPT-2. R3 shall plot citations at block level and show named locations as pins.
- RPT-3. R5 shall be labeled as a proxy and shall not be presented as measured patrol effort.
- RPT-4. R7 shall state the report as-of date, rates used, and whether each is Computed or Manually set.
- RPT-5. R7 shall not include officer number or any patrol location data, in any table, chart, or filter description.
- RPT-6. Export formats beyond PDF (CSV of report tables, images) **[Open]**.
- RPT-7. Scheduling of reports is not applicable in the MVP (no backend).
- RPT-8. R8 shall render a heatmap (MapLibre GL JS heatmap layer) over the bundled street geometry with no external tiles (RPT-1). Filters: date range, day of week, hour, optional vehicle (FR-39), and, for Format A with speed data, moving or stopped. The legend shall state the unit (minutes of vehicle presence for Format A, stop count for Format B) and whether the color scale is relative to the current filter or fixed.
- RPT-9. R8 shall display a notice that it shows vehicle presence from Samsara devices only, not officer effort or violations; that foot, bike or untracked patrols are not captured; and that GPS accuracy limits precision. R8 shall not be presented as measured total enforcement coverage.
- RPT-10. R8 shall include a day-of-week by hour summary of total patrol time (or stops); selecting a cell shall apply that day and hour to the map. **[Proposed]**
- RPT-11. R8 shall show no citation counts, citation locations or officer numbers, and shall not be computed from them (NG7).

## 10. Revenue Calculations

- **Settled citation:** any citation older than the applicable payment window as of the report date, excluding Pending, whether Paid, Unpaid or Reversed. Rates are computed over settled citations.
- **Reversal rate** = Reversed / (Paid + Unpaid + Reversed), over settled citations. It explains part of the shortfall in the collection rate (collection rate = 100% minus reversed minus uncollected) and is shown for context; it is not applied a second time in projections.
- **Collection rate** = Paid / (Paid + Unpaid + Reversed), over settled citations. The average used for projections is pooled over the whole data period; monthly rates give the low and high (FR-22b).
- **Escalation rate** = Paid citations paid at the escalated amount / all Paid citations. Paid amount is the primary signal: a Paid amount above the Fine amount means the citation was paid after escalation. If Paid amount is missing, the Fine amount is assumed paid (not escalated) and the row is flagged (DR-4). Paid date is the fallback only when Paid amount is present but cannot decide it (it matches neither the base nor the escalated amount): a payment dated later than citation date plus the payment window counts as escalated.
- **Pending** is excluded from rates and projections.
- **Expected amount of an outstanding Unpaid citation** = escalated amount if past the payment window; otherwise [base x (1 - escalation rate) + escalated x escalation rate].
- **Projected value of an outstanding Unpaid citation** = expected amount x collection rate, shown as average, low and high using the average, lowest and highest monthly collection rates in the data period.
- **Caveat:** projections apply the average collection rate to every outstanding Unpaid citation. Citations already long past due are less likely to be collected than average, so projections may be overstated. The low/high range reflects only the month-to-month variation seen in the loaded data and is not a forecast guarantee.

## 11. Non-Functional Requirements

- NFR-1 (Privacy). All data processing shall occur in the browser. Nothing is uploaded to a server or third party. The application shall not persist imported data beyond the session unless the user exports it.
- NFR-2 (Public hosting). Because the repository and site are public on GitHub Pages, real citation CSVs, real officer data and real Samsara location exports shall never be committed to the repository. Only sample data, street geometry, the fine schedule, and named locations are bundled. Depot or yard locations in city settings (DR-11) are committed, so they should be a general area or a public address, not a sensitive one.
- NFR-3 (Data minimization). Citation data shall be stripped of personal information before import. The tool shall not collect or store names or plate numbers.
- NFR-4 (Officer and patrol data). Officer # and Samsara patrol location data shall appear only in internal views and shall be absent from the city PDF. Driver names or IDs in Samsara files shall never be stored or displayed (FR-39).
- NFR-5 (Offline map). Map and geocoding shall work without network calls to external data services.
- NFR-6 (Performance). Expected volume is about 200 citations per day on average (about 6,000 per month, 73,000 per year). The system shall handle at least 5 years of data (about 365,000 rows) in the browser without freezing the interface. **[Proposed]** Patrol location files shall handle at least 2 million rows (about one year at the sample patrol defaults) by streaming parse and aggregation on import, with a progress indicator and without retaining raw points (FR-30, FR-38). Response-time targets are open (Q19).
- NFR-7 (Extensibility). Adding a city shall require only adding a data folder.
- NFR-8 (Audit and retention). Not applicable to the MVP, since no data is stored. **[Open]** whether the company has retention or compliance rules for the source data and exported PDFs.
- NFR-9 (Accessibility). **[Open]** Target standard (e.g., WCAG 2.1 AA) not yet decided.
- NFR-10 (Browser support). **[Open]**

## 12. Integrations and Dependencies

- No external integrations or APIs in the MVP.
- Authentication: none in the MVP.
- Proposed stack, inherited from Parklas: TypeScript, Vite, MapLibre GL JS, Vitest, GitHub Pages deployed via GitHub Actions. **[Proposed]**
- Client-side PDF generation library **[Open]**.
- Dependencies:
  - Parklas street data and code (author-owned, free to reuse).
  - Parklas can be located at https://github.com/sherburnec/Parklas
  - Expanded citywide `blocks.csv` (scripted from LA County address points, with manual cleanup; see DR-9; first build priority).
  - Official Burbank fine schedule values (estimates in DR-8 until then).
  - Real sample CSV from the author, to be used in a later stage to rework the importer.
  - Named-locations list from management.
  - A real Samsara export from the company's Samsara admin (a short period, driver names removed or ignored), to confirm headers, time zone and layout before the patrol importer is finalized (Q28).

## 13. MVP Scope and Phasing

**MVP**
- Build task BT-1 (first): generate the city `blocks.csv` per DR-9, starting with verifying the LA County address data license and Burbank coverage. Then build the sample data generator on it; the generator is the main tool for building and testing everything else.
- Sample data generator and CSV import with validation and reject reporting.
- Block-level matching with unmatched-address list.
- Named locations.
- Reports R1 to R7, including local map and city PDF.
- Samsara patrol data: sample patrol generator (FR-41 to FR-46), CSV import in Formats A and B (built against assumed headers and reworked when a real export is available), and patrol heatmap R8. Build after the citation sample generator, since both use the same street data.
- Revenue model with labeled Realized and Projected figures and adjustable rates.
- Burbank as the first city.

**Later phases**
- Database or persistence.
- Optional shift schedule import, to separate on-duty from off-duty patrol time.
- Address-point-level geocoding.
- Additional cities.

**Timeline and resources:** **[Open]** not yet discussed.

## 14. Risks

| ID | Risk | Mitigation |
|----|------|------------|
| K1 | Local block matching misses addresses (incomplete `blocks.csv`, varied address formats) | Expand `blocks.csv`; address normalization; unmatched list; match-rate indicator |
| K2 | Reports are biased toward where officers already patrol | Limitation notice on location and staffing reports; coverage footprint view; later schedule import |
| K3 | Projected revenue is mistaken for actual revenue or overstated | Mandatory labels; rates shown with computed/manual status; as-of date; low/high range from monthly collection rates |
| K4 | Recent-month unpaid citations make recent periods look worse | As-of date logic; rates computed from settled citations only |
| K5 | Real data or officer data is exposed via the public repository or city PDF | NFR-2, NFR-4, RPT-5; pre-export preview |
| K6 | Officer-level views create performance or quota concerns | Internal only; labeled; excluded from city output |
| K7 | Large multi-year files are slow in the browser | Performance targets and testing with generated multi-year data |
| K8 | No persistence means work is lost between sessions | Export options; revisit with database phase |
| K9 | Escalation rate may be misjudged when Paid amount includes fees or is missing | Paid amount primary, Paid date fallback; flag rows where neither is conclusive (DR-12) |
| K10 | Samsara export format differs from the assumed formats, or no point-level export exists | Two formats supported; header aliases and a column mapper (FR-35); rework against a real export (Q28) |
| K11 | Employee location data raises privacy or morale concerns | Internal only; heatmap only, with no per-driver or per-vehicle totals or rankings; driver columns discarded; no raw points retained; no linkage to citations or officers (NG7); confirm company policy (Q31) |
| K12 | Heatmap is misread as total patrol effort (foot or untracked patrols missing; trip-level data shows stops, not routes) | Notice and legend wording (RPT-8, RPT-9); format and unit labeled; data-gap summary (FR-34) |
| K13 | Depot or idle time dominates the heatmap | Exclusion zones (DR-11, FR-32); dwell-gap threshold (FR-36); moving or stopped filter |
| K14 | Time zone or daylight saving errors shift patrol hours | Explicit zone conversion and import summary (FR-33); sample data tests across a DST change |
| K15 | Large patrol files slow or crash the browser | Streaming parse, aggregation on import, no raw point retention (NFR-6) |

## 15. Open Questions

- Q4. Resolved: expected volume is about 200 citations per day (NFR-6, A21).
- Q6. Proceeding on assumed column names and formats; importer will be reworked against a real sample file in a later stage.
- Q11. Resolved: monthly collection rate is tracked (FR-22a) and sample data targets about 70% (FR-4d).
- Q12. Resolved: partial payments are not assumed possible (A16).
- Q13. Resolved as a build task (BT-1): verify license and coverage, then generate `blocks.csv`; remaining gaps are filled by hand.
- Q14. Resolved: Paid amount is the default escalation signal; Paid date is the fallback (Section 10).
- Q15. Minimum settled-citation count before computed rates are considered reliable.
- Q16. Initial `fine-schedule.csv` created with estimated values. The author will expand it with official Burbank amounts, late fees and the remaining citation types.
- Q17. Review and sign-off workflow before the city PDF is exported.
- Q18. Do manager and supervisor need different in-app permissions?
- Q19. Accessibility target, browser support, and performance targets.
- Q20. Retention or compliance rules for source data and exported PDFs.
- Q21. Additional export formats beyond PDF.
- Q22. Timeline, resources, success measurement, and rollout plan.
- Q23. Resolved: flag Paid rows with no Paid amount and assume the Fine amount was paid (DR-4).
- Q24. PDF generation approach.
- Q25. Resolved: a blank start date is the baseline (DR-8).
- Q26. Resolved: named locations use their own file, one row per address, with a template (DR-10).
- Q27. Resolved: projections use the average collection rate, with low and high cases from monthly variation (FR-22b).
- Q28. Which Samsara CSV export does the company actually have? A point-level GPS CSV was not found in Samsara's public documentation; the confirmed option is the Trip History report (trip start and end only). Options: Trip History CSV, a custom report, an API-to-CSV script run outside this tool, or a data export arranged with Samsara. Get a real sample to confirm headers and layout.
- Q29. Time zone and timestamp format of the real export (UTC or the organization's zone)?
- Q30. Depot or yard locations and radii to exclude, and whether any other areas (for example, personal-use areas) should be excluded.
- Q31. Company policy and any legal or notice requirements for using employee location data, and retention rules for Samsara files.
- Q32. Should R8 ever be shown over the R3 citation hotspot map (a visual overlay only, with no joined data)? Not in the MVP.
- Q33. Default values: grid size (25 m), gap threshold (5 minutes) and sample patrol parameters (FR-44).

## 16. Assumptions

- A1. The tool runs fully client-side, with no backend.
- A2. Real data never leaves the user's browser.
- A3. CSV data contains no plate numbers or names.
- A4. Sample data is for demos and testing only.
- A5. Geocoding uses bundled per-city street and block data plus named locations.
- A6. City reports are PDF only and exclude officer data.
- A7. Reports are labeled as reflecting enforcement activity, not violations.
- A8. Projected revenue is an estimate, not an accounting figure.
- A9. Fine amount is the amount assessed at issuance.
- A10. The as-of date defaults to the latest citation date in the data.
- A11. Pending is excluded from reversal rates and projections.
- A12. Escalation is measured from the citation date, using a city-configurable payment window. Burbank uses 21 days (per third-party sources and confirmed by the author).
- A13. Reversed means voided with no payment.
- A14. Citation type and fine type were duplicates; only Citation type is used.
- A15. Parklas is author-owned and can be reused freely.
- A16. Citations are paid in full or not at all; there are no partial payments.
- A17. Column names and formats are assumed for now and will be revised when a real sample file is available.
- A18. Fine schedule amounts are estimates until replaced with official values.
- A19. Fine increases are applied by citation date, not by report date.
- A20. Each citation type has at most one blank-start (baseline) fine entry.
- A21. Real citation volume averages about 200 per day (about 6,000 per month, 73,000 per year).
- A22. Sample data defaults are placeholders: outcomes of about 70% Paid, 20% Reversed and 10% Unpaid, varying by month (FR-4d).
- A23. Projections apply the pooled average collection rate to every outstanding Unpaid citation, with low and high cases from the lowest and highest monthly collection rates.
- A24. Source data identifies citations by code in a column assumed to be named "Citation code"; the real code format is confirmed against the sample file later (A17).
- A25. Samsara data is supplied as an exported CSV file; the tool never calls the Samsara API.
- A26. Patrol location data is used only for patrol heatmaps. It is not linked to citations, officer numbers or drivers, and no vehicle-to-officer mapping is kept.
- A27. Samsara CSV headers and layout are assumed (Section 8.4) and will be revised against a real export (Q28).
- A28. Samsara vehicles represent patrol presence; officers on foot, bike or untracked vehicles do not appear.
- A29. Sample patrol data is for demos and testing only and is generated independently of the citation sample data.
