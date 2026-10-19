# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

## Player journey and visual design audit - 2026-10-18

**Scope:** All implemented browser routes: welcome, login, registration,
anonymous board preview, private game library, game creation, and observer.
Reviewed shared navigation, form feedback, board presentation, lifecycle
controls, relevant browser tests, and the create/list/start API contracts.
This is a UI and product-journey audit, not a full-project code or security
audit. Backend rules, dependencies, generated output, vendored code, caches,
database contents, and future unbuilt mechanics were excluded.

**Git:** Local `main` at `e554f92`. The working tree was clean before this
ledger update. This reviews the current UI rather than a feature-branch
delta; no fetch or pull was performed.

**Interpretation:** Functional findings below describe reproducible behaviour.
Journey and visual findings assess the user's newly stated simplicity and
playfulness goals; they do not retroactively invalidate the earlier approved
observer specification. No P0 or P1 was confirmed. This is a fresh ledger
cycle, so IDs start at F-01; earlier resolved IDs remain prefixed in their
archives.

### F-09 [P3] open - Lifecycle reconciliation checks for an impossible null status

**File:** apps/web/src/features/games/useGameLibrary.ts:209
**Found:** 2026-10-18 by /audit (scope: F-08 repair)
**Why it matters:** `GameSummary.lifecycle_status` is a required
`GameLifecycleStatus`, and the API response validator rejects values outside
that status union. The `previousStatus === null` branch can never run, leaving
an unnecessary condition in the lifecycle reconciliation logic. This is a
small cleanup and does not affect runtime behavior.
**Suggested fix:** Remove the null comparison and keep the equality early
return, or change the API/type contract if a missing status is intentionally
supported.
**Resolution:**

## Product and visual direction to preserve for subsequent specs

The following proposals are design decisions and future work, not additional
confirmed bugs. They do not change the build plan or authorize implementation.

### Confirmed persistence preference

The user selected: save only on Start, with an optional Save setup action.
Generating or changing a preview should not automatically create durable
games. Existing unstarted games remain saved setups. Creating a game and
dispatching a queue job remain distinct failure boundaries even when the UI
presents one Start action; recovery must not silently create another game.

Suggested journey:

`My games -> New game -> opponents and board preview -> Start -> game board`

Load a default board preview on the setup screen where practical so a
mandatory extra Generate step does not recreate the current click problem.
Generate another board is an optional secondary action. Advanced seed
editing stays secondary. Match the persisted board to the visible selection
and preserve clear feedback while generation or start is pending.

### Library organisation and game mechanics

Keeping records in one database table is sound. Keeping one My games home is
also sound. The missing boundary is between player tasks within that home:

| Player task | Proposed view | Existing state mapping |
|---|---|---|
| Enter an active session | In progress | queued, running, awaiting_human_input |
| Inspect or start a chosen board | Saved setups | created, including existing unstarted games |
| Revisit a finished execution | History | completed |
| Recover a failed execution | Contextual attention/retry | failed; retain history and authoritative status |

The current Go boundary produces initialized state, not full matches. A
completed bootstrap execution must not be presented as a won/lost match.
Full turn controls, victory feedback, and Continue gameplay remain tied to
their engine milestones. Timeline stepping belongs to 4c; its absence is
not a new defect. The desktop board workspace and phone details drawer
already exist and should be preserved. Do not repeat those completed fixes
because the overview still describes some board refinements as future work.

### Colour palette alternatives

The near-black background, muted teal surfaces, gold emphasis, serif
headings, and roomy uniform cards collectively create the premium feel.
The current theme is coherent and frames colourful terrain well; changing
one background token alone would not change the overall personality.
Playfulness should come from warmth, resource colours, recognisable artwork,
and straightforward actions while keeping text readable.

| Direction | Visual treatment | Tradeoff |
|---|---|---|
| Warm coastal, suggested prototype | Teal/ocean surroundings, warm sand or cream panels, lively terrain, restrained terracotta and gold accents | Strong connection to the island and welcome illustration; needs text and state-colour retuning |
| Brighter dark | Keep the existing structure, lift black into blue-teal, brighten terrain and secondary surfaces, use gold more sparingly | Smallest visual departure and retains a calm game surround |
| Parchment tabletop | Light parchment surroundings, earthy green emphasis, blue ocean, warm wooden details used lightly | Familiar physical-board character; can become rustic or visually heavy if over-textured |

Compare warm coastal and brighter dark in desktop and phone prototypes
before choosing. Keep the chosen header treatment consistent across routes.
These are design judgments, not measured claims about retention. A future
dark/light preference can coexist with the brand, but building multiple full
application themes is not required for the immediate journey repair.

### Preserve Classic and add an Illustrated board appearance

Keep the current clean style as Classic. It is useful for fast scanning,
learning, replay inspection, and debugging. A later Illustrated style should
use recognisable top-down forests, sheep/pasture, wheat fields, clay hills,
rocky mountains, and desert. The welcome image guides atmosphere and palette;
its landscape perspective should not replace the board's addressable hexes.
Keep numbers, ownership pieces, legal-action highlights, ports, and accessible
labels readable above terrain illustrations.

Appearance changes must reuse the same board data, seed, tile positions,
ports, game rules, replay position, and viewport controls. Switching style
must not regenerate the board or alter durable game state. This is a
presentation preference, separate from actual map topology or rulesets.

Start with a small Board appearance selector and remember the selection in
the browser. A dedicated Settings page becomes useful when there are enough
real preferences, such as appearance, sound, reduced motion, and accessibility.
Account synchronization can be a later explicit decision. The absence of
this selector is an enhancement request, not a defect in the current scope.
Validate one shared renderer or small presentation boundary before creating
parallel board implementations. Both styles need an identifiable ocean.

### Suggested work order

1. Spec the continuous preview/start journey (F-01), then the library task
   views (F-02), with clear API filtering and retry behaviour.
2. Repair F-05 and F-06 in the relevant reviewed creation slice; repair F-03
   and F-04 as focused board-readability work. These are observable defects
   and do not need to wait for illustrated terrain.
3. Prototype the warmer palette and water treatment (F-07) while preserving
   the existing large-board layout. Approve a visual target before styling.
4. Introduce selectable Classic/Illustrated presentation as explicit product
   work, when artwork and scope are agreed. A full Settings page can wait.
5. Resume 4c when the chosen journey and board refinements are settled; keep
   actual gameplay controls aligned with engine progress.

## Audit evidence and limits

- Chromium inspected all seven routes using the running development UI at
  `http://127.0.0.1:5173`, at 1440x900, 1366x768, 768x1024, 390x844,
  and 320x568. Additional overlay probes covered 844x390. The observer
  details drawer and pre-start direct observer route were also inspected.
- Auth, game creation, starts, and private responses used intercepted,
  synthetic fixtures with the existing engine-generated standard board.
  No real account, token, game, queue, or database record was changed.
  This is browser evidence of frontend behaviour, not a fresh integration
  test through Laravel, Go, PostgreSQL, and Redis.
- Screenshots, 73 state/measurement entries, colour calculations, and
  overlay measurements are temporary evidence under
  `/tmp/catan-ui-audit-20261018/`. No unexpected uncaught JavaScript errors
  or horizontal document overflow were observed in those route checks.
- `cd apps/web && npm run lint`: passed.
- `cd apps/web && npm run build`: passed, including `tsc -b`.
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/auth.spec.ts e2e/game-creation.spec.ts e2e/game-library.spec.ts e2e/game-run.spec.ts e2e/game-observer.spec.ts e2e/preview.spec.ts e2e/session-routes.spec.ts e2e/site-header.spec.ts e2e/site-metadata.spec.ts`:
  passed 76/76. No product regression was inferred from the temporary audit
  script's initial ambiguous Close details selector; it was scoped to the
  dialog and the browser inspection then completed.
- No skipped/focused tests, TODO/FIXME markers, or TypeScript suppressions
  were found in the searched frontend source and tests. The separate Compose
  smoke test requires a real token/game and was not run. API and Go test
  suites and network-backed dependency/security scanners were not run.
- Standards checked: frontend presentation versus Go authority, owner-scoped
  data, existing architecture boundaries, responsive containment, keyboard
  and modal behaviour, actionable form feedback, and browser evidence.
  No dependency or source change was made during this audit.
- Contrast criteria and form-feedback guidance were checked against the
  [W3C contrast explanation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  and [WAI form notifications guidance](https://www.w3.org/WAI/tutorials/forms/notifications/).
- Ledger changes: new open P2 entries F-01 through F-05 and P3 entries F-06
  and F-07. No earlier archived finding was reopened or silently accepted.

## Illustrated board graphical and code audit - 2026-10-19

**Scope:** Current Feature 14, with emphasis on the Illustrated map. Reviewed
the committed Settings implementation, all staged, unstaged, and untracked
feature source and tests, the shared board renderer and viewport behavior,
the illustrated styles and atlas, the approved prototype, and affected
preview, setup, header, and observer consumers. This is a focused frontend
audit, not a full-project or backend audit.

**Git:** `feature/selectable-board-appearance`, using local `main` as the base.
Merge base: `16d67dfde3eaabaf28c56d95cb7bb02d326a0726`.
Committed range: that base through `2f434ed`, plus the existing working tree.
No fetch or pull was performed.

**Verdict:** No new P0 or P1 findings. F-10 was re-reviewed and closed during
this pass. The existing F-09 remains open. Optional visual refinements and
future gameplay validation are not additional confirmed defects.

### Visual assessment and optional refinements

- Keep the approved artwork. Its consistent light, painting style, terrain
  silhouettes, and palette give the board a coherent identity. Forest and
  pasture have different textures as well as different greens; fields and
  desert have different forms as well as different yellows. There are five
  producing resources plus desert, and that variety serves the game.
- The main source of visual density is the foreground: 18 number discs and
  19 resource pills create 37 pale shapes across the island. The recent
  alignment and capitalization changes improve this, and measured label
  backings remain inside their hexes at every inspected viewport. Consider
  an optional resource-label preference later, retaining names in the guide
  and accessible descriptions. Keep the learning-friendly names available;
  do not silently remove them as an audit repair.
- Fitted phone views are overviews rather than comfortable text-reading
  sizes. At 390px, resource names render at about 4.52 CSS px and port resource
  names at 3.47 px; at 320px, about 3.65 and 2.81 px. Zoom works. This does
  not reopen the user's accepted clipping or control-overlap behavior during
  inspection zoom. Larger recognizable port symbols, with full trade details
  on selection, are a useful later refinement when port interaction exists.
  On a 1366x768 laptop, port resource text is also small, about 6.21 CSS px.
- Preserve the calm water and restrained coast. More decorative scenery or
  texture would add competition for attention without helping current board
  reading. Do not add more buttons to the map for these refinements.
- Keep foreground priority clear as gameplay arrives: pieces and legal-action
  indicators first, numbers next, terrain beneath. A disposable browser-only
  probe added sample roads and settlements on all six terrain types. Outlines
  helped them separate from the artwork; pale player colors will need careful
  outline choices. The probe was synthetic, not legal game state or shipped
  gameplay, and does not prove full-match playability.
- Before calling the match UI ready, inspect a developed board with actual
  roads, settlements, cities, the robber, selection and legal-action markers,
  all player colors, and the eventual hand/turn controls. Evaluate crowded
  intersections and touch targets with real interactions. These are future
  acceptance checks, not defects for unimplemented mechanics. Full
  probability pips can also be considered in a later token-design pass; this
  audit does not treat the existing high-roll markers as new rules work.

### Evidence, code review, and limits

- `cd apps/web && npm run lint`: passed.
- `cd apps/web && npm run build`: passed, including TypeScript checking.
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/board-appearance.spec.ts e2e/settings.spec.ts e2e/game-observer.spec.ts e2e/site-header.spec.ts`:
  30 passed. Also reviewed the committed cross-route appearance test in
  `game-creation.spec.ts`; the earlier full suite is not claimed as a new run.
- Production preview inspected in managed Chromium at 1440x900, 1366x768,
  768x1024, 390x844, 320x568, and 844x390. The document fit each viewport;
  labels stayed inside their tiles. No console errors or failed requests were
  observed. Existing browser tests also exercised wheel zoom, pointer pan,
  two-finger pinch, fit reset, preference persistence, and the phone guide.
- Browser deuteranopia emulation was inspected as an approximation. Terrain
  textures and text still provide identification beyond color. This is not
  a user accessibility study or a blanket accessibility certification.
- Captures: `/tmp/catan-map-audit-1440.png`,
  `/tmp/catan-map-audit-1366.png`, `/tmp/catan-map-audit-390.png`,
  `/tmp/catan-map-audit-320.png`,
  `/tmp/catan-map-audit-deuteranopia.png`, and
  `/tmp/catan-map-audit-piece-contrast-probe.png`.
- Source review covered `features/board/`, `features/settings/`, affected
  `AuthShell.tsx` and `main.tsx` changes, board/Settings/header CSS, relevant
  browser specs and fixtures, and the approved prototype and atlas layout.
  Checked shared rendering, storage validation and fallback, SVG pattern IDs
  and crop positions, layer order, modal/keyboard behavior, data ownership
  boundaries, duplication, dead code, and test suppressions. No additional
  concrete code-quality issue or skipped/focused test was found in this scope.
- Excluded dependencies, generated build and test output as source, backend
  implementation, database data, unrelated UI, and unbuilt game mechanics.
  No network-backed audit tool was run. The Compose integration smoke test,
  API/Go suites, human playtesting, and physical-phone testing were not run.
  Runtime API responses were intercepted fixtures; no real user or game
  record was created or changed.
- Repair order: optimize the production atlas first; keep the approved art;
  revisit label detail and port presentation as explicit design slices; test
  a developed board when real pieces and interactions are implemented.
- Only this ledger was edited. No product source was changed or committed.
