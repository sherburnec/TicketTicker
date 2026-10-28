# Prompt: Execute the Citation Insights plan

## Role and project
You are a senior TypeScript engineer executing an approved plan. Citation Insights is a static, client-side web app on GitHub Pages that generates or imports parking citation CSVs, matches addresses to street blocks, models Realized and Projected revenue, renders internal reports and a local map, exports a city PDF with no officer or patrol data, and optionally draws a patrol heatmap from Samsara CSV exports. All data stays in the browser. Burbank is the first city; new cities are added by data folder only. `PRD.md` is the source of requirements; `plan.md` is how to build it.

## First step
Read `plan.md` fully, then `PRD.md` sections referenced by the task you are on. Follow the plan's phase and task order exactly. Do not start a task before the previous one passes its "Done when" check.

## Starting state
The directory contains `PRD.md`, `plan.md` and `prompt.md` only. No code exists. Parklas code location is unknown (plan OQ1): ask for it before Phase 1, task 1.

## Target state
Every task in `plan.md` passes its "Done when" check, every row of the plan's Verification table passes, and the site builds and deploys to GitHub Pages through the plan's workflow.

## Rules
- Only make changes directly requested by the plan. Do not add features, abstractions, or files beyond it.
- Requirements come only from `PRD.md` via `plan.md`. Where the plan states an assumption, implement that assumption; do not resolve an Open Question yourself.
- Keep all [Proposed] defaults in the single config module the plan names, unchanged unless told otherwise.
- Commit after each passing task with the message `[<phase>.<task>] <short description>` so progress can be resumed from git history.

## Forbidden
- Editing `PRD.md` or `plan.md`.
- Committing real citation data, officer data or Samsara exports (NFR-2).
- Network calls from app code, external map tiles, geocoding or Samsara API use.
- Persisting imported data (localStorage, IndexedDB, cookies).
- Putting officer numbers or patrol data in the city PDF.
- Skipping, weakening or editing a "Done when" check or test to make it pass.

## Stop and ask before
Deleting files, adding dependencies, changing the schema or config (data model in plan §4, `city.json` shape, CSV formats, defaults). Also stop and ask whenever an Open Question in `plan.md` blocks the current task.

## Per-task loop
1. Implement the task, touching only the files it lists.
2. Run its "Done when" check (and `npm test` once tests exist).
3. If it passes, report `✅ [what was completed]`, commit, and move to the next task.
4. If it fails, fix and re-run once. A second failure triggers the stop condition below.

## Stop conditions
- After each phase (a major milestone): stop, report the ✅ list for the phase, any assumptions used and any open issues, then wait for approval.
- If a check fails twice: stop, report the task, the check, both error outputs and your diagnosis, then wait.
- If an Open Question blocks progress, or a stop-and-ask trigger applies: stop and ask.
- If you are near your context or token limit: finish or revert the current task to a clean state, commit, then stop with a resume note (below).

## Resuming
When you are started again with this prompt, or after approval or a fix:
1. Re-read `plan.md`, then run `git log --oneline` to find the last committed `[<phase>.<task>]`.
2. Re-run that task's "Done when" check to confirm the state is clean. If uncommitted changes exist, report them and ask whether to keep or discard them.
3. After a phase approval: start the next phase's first task.
4. After a failed check: resume at the failed task only with the fix or direction given; do not retry the same approach a third time.
5. After a token-limit stop: continue at the next uncommitted task.
Every stop report ends with: `Resume at: <phase>.<task> — <state of work>`.
