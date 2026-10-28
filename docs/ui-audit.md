# UI audit and design direction (Phase 9, task 9.1)

Status: **Phase 9 complete.** Reviewed in headless Edge at 1280px and 820px (dark); light theme and populated reports were not screenshot-checked.

Method: read `index.html`, `src/main.ts`, `src/ui/*`, `src/reports/*` and `src/map/style.ts`. Not yet reviewed in a running browser (no browser tool in the session); screenshots at 1280px and 900px are still to be added by the author or in a session with a browser, before task 9.2 starts.

## Findings

### Structure
- `index.html` has no stylesheet at all. Every control renders in browser defaults.
- `main.ts` stacks 15 elements in one column in build order, not task order: citation source, then patrol source, patrol format, patrol summary, R8, patrol map, "No citation data loaded.", import summary, rates, R3, citation map, R4, R5/R6, export. A user with citations only scrolls past the whole patrol block first.
- Two 480px maps (`main.ts:30`, `:40`) use inline `cssText`. Neither is labelled as to which data it shows.
- No navigation, no page header beyond the `h1`, and no indication of what is loaded or which as-of date applies.

### Hierarchy and typography
- Report headings are internal codes ("R3 Block hotspots", "R5 Coverage footprint and R6 Officer activity"). The author knows R3; a new analyst does not.
- `h2`/`h3` carry all hierarchy. There is no type scale; numbers (Realized, Projected) appear as list bullets in the same weight as notices.
- The key figures in `ratesPanel.ts` are four `li` lines. Realized vs Projected is not visually distinct.

### Panels
- **Source panel:** a bare `fieldset` with radios, a number input and a file input. Errors appear in an unstyled `p[role=status]`.
- **Import summary:** counts as one sentence. Rejects, flags and unmatched are headings plus bullet lists of up to 100 lines, so the page can grow by thousands of pixels.
- **Rates:** a 5-column table with inline number input and Reset button per row. "Computed"/"Manually set" is plain text in a cell. The as-of date is a small date input above the table.
- **Patrol:** source, format detection ("Detected Format A."), progress text and summary are separate unstyled elements. Progress is replaced text, with no bar.
- **R8 / R3 / R5-R6:** notices (`R8_INTERNAL_NOTICE`, `R3_NOTICE`, `OFFICER_NOTICE`, `R5_PROXY_LABEL`) are plain paragraphs, indistinguishable from help text, yet they are required by FR-24/RPT-3.
- **Export:** PDF confirmation checkbox is not visually prominent.

### Charts and maps
- Map palette (`style.ts`): cream background `#f4f1ea`, grey streets, yellow→orange→red hotspots, teal officer coverage, blue→navy patrol heat. Two sequential ramps and one hue family clash with whatever page theme is chosen, and the cream background is the dominant AI-default tell.
- Hotspot count ramp (yellow to red) and the patrol ramp (blue) are not shown against a legend on the citation map. Only R8 has a legend.
- Day-by-hour summary tables are plain tables. They are the natural place for a heatmap grid and currently show numbers only.

### States
- Empty states exist only as single sentences. No loading state for citation import beyond replaced text ("Importing 4,000 of 12,000 rows…").
- Errors share styling with success text.

### Accessibility and responsive
- Default browser focus rings remain (fine), but there is no skip link or landmark structure beyond `#app`; no `main`/`nav`.
- No responsive rules; maps are fixed 480px height at any width.
- Contrast and reduced-motion cannot be assessed until a theme exists.

## Proposed design direction

**Subject:** a parking-citation analysis desk for a city enforcement office. Audience: parking program managers and analysts who open it to answer "where, when, how much". The primary job is reading numbers and a map with confidence. Honesty about estimates matters as much as looks.

**Concept:** a *ledger and street-map desk*. The page reads like an analyst's working surface: a fixed left rail for data context and report navigation, a wide content column, and the map treated as the main exhibit. Figures are set like accounting columns (tabular, right-aligned); estimates are marked in the type itself, not only in labels.

**Color (named hex, to refine against contrast checks):**
- Paper `#f7f8f6` (cool off-white, deliberately not warm cream) and Ink `#16202a`
- Slate `#4a5a68` for secondary text and rules
- Citation blue `#1f5f8b` as the single interactive/accent hue
- Signal `#c4361d` reserved for rejects and errors only
- Estimate amber `#a86a00` reserved for Projected/Manually set/low-count warnings, so "this is not a fact" has one consistent color
- Dark theme derived from the same tokens

**Type:** one family with real range, self-hosted or system. Candidate: a system UI stack for body with tabular figures on, plus a self-hosted condensed grotesque for report titles and big figures. Final choice pending approval; no CDN fonts (NFR-1, NFR-5).

**Layout:**
```
+----------+------------------------------------------+
| Burbank  |  Report title            as of 2026-10-28|
| Data     |  [ status: 14,212 citations, 0 rejected ]|
|  citation|  +--------------------+  +-------------+ |
|  patrol  |  | map (primary)      |  | top blocks  | |
| Reports  |  |                    |  | list        | |
|  Overview|  +--------------------+  +-------------+ |
|  Hotspots|  filters row                             |
|  ...     |  table / chart                           |
| Export   |                                          |
+----------+------------------------------------------+
```
Left-aligned throughout; numbers right-aligned in tables. Below 900px the rail collapses to a top bar.

**Principles:**
1. Required notices (FR-22, FR-24, RPT-3, RPT-5, K3) get one consistent, visible callout style, with wording unchanged.
2. Estimates look different from facts everywhere (amber, italic figures, "Projected" in the label).
3. One memorable thing: the map-as-exhibit with a tight, readable legend. Everything else quiet.
4. Reports are named by what they answer ("Block hotspots"), with the R-code kept as a small reference, since the PRD and tests use the codes.
5. Long lists (rejects, unmatched) collapse behind a count and expand on demand.

**Reviewed against the generic defaults:** cream/terracotta and acid-on-black were rejected; the cool paper, ink and single blue is a restrained choice for a records tool. Drop the tinted all-caps eyebrow labels and decorative cards; use rules and spacing for structure.

## Decisions (approved by the author)
1. Overall direction approved (left rail, map as exhibit, cool paper palette, blue accent).
2. Light and dark themes, following the system setting with a manual toggle.
3. Reports get plain-language names; the R-code stays as a small reference.
4. Citation reports and patrol reports are separate sections.
5. Font: Public Sans (SIL OFL 1.1 / CC0), self-hosted in `src/assets/fonts/` with its license file.

## Decisions that were needed from the author (resolved above)
1. Approve or change the direction above (left rail + map-as-exhibit, cool paper palette, blue accent).
2. Light only, or light and dark (dark roughly doubles the map-palette work)?
3. Rename report headings to plain language with the R-code as a secondary reference? (Recommended: yes.)
4. Reorder the page so citation reports come first and patrol is its own section? (Recommended: yes; it also matches FR-28's independence.)
5. Font: system stack only, or a self-hosted face (adds a font file to the repo)?
