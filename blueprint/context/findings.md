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

### F-03 [P2] open - Resource labels have insufficient contrast on three terrain types

**File:** apps/web/src/App.css:2056;
apps/web/src/features/board/BoardSvg.tsx:336
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** Pale resource text is placed directly on the brighter
forest, hills, and mountains fills. Contrast calculated from Chromium's
computed SVG colours is approximately 3.01:1 for Lumber, 2.84:1 for Brick,
and 2.83:1 for Ore. The fitted labels rendered at about 9.8 CSS pixels on
desktop and 4.5 pixels on a 390px phone; they are not large text. These
labels convey game information, so the ordinary-text contrast benchmark is
4.5:1. Existing tests check distinct fills and viewport behaviour, but do not
catch these foreground/background combinations. Zoom helps size, but does
not correct the colour contrast. This is distinct from the archived work
that added zoom and resource encoding.
**Suggested fix:** Use sufficiently dark resource text for these fills or
give labels a contrasting backing. Preserve redundant symbols and labels.
Verify actual computed colours and the phone fitted/zoomed states. Carry
the same readability criteria into both future map styles, with numbers,
roads, buildings, and highlights remaining visually clear over artwork.
**Resolution:**

### F-04 [P2] open - Phone board controls overlap a port in the fitted view

**File:** apps/web/src/App.css:1928;
apps/web/src/App.css:2820;
apps/web/src/features/board/BoardSvg.tsx:170
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** The absolutely positioned bottom-right zoom toolbar
overlaps the lower-right port on the standard board fixture. At 320x568,
the toolbar intersects approximately 244 square CSS pixels of its badge
and 31 of its text bounding box. At 390x844, it overlaps about 160 square
pixels of the badge. Screenshots confirm the collision at the initial
fitted zoom. Tablet, landscape-phone, and desktop probes did not reproduce
it. The existing containment assertions pass because both elements stay
inside the canvas; containment does not test whether controls hide game
information.
**Suggested fix:** Reserve a compact control area outside the fitted board
content or fit the board into a region that excludes the controls. Preserve
the large desktop map and phone zoom/pan behaviour. Add a focused overlap
assertion for fitted and reset phone states, including the Game details
trigger; do not solve the collision with a much wider ocean or smaller text.
**Resolution:**

### F-05 [P2] open - A collapsed advanced section hides its seed validation error

**File:** apps/web/src/features/games/GameCreationScreen.tsx:50;
apps/web/src/features/games/GameCreationScreen.tsx:108
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** Reproduction: open Advanced options, enter `01`, close
the section, and submit. For a 422 response carrying the existing canonical
seed error, only The game configuration is invalid is visible. The seed
field and the actionable error stay inside the closed details element.
The browser confirmed that the specific error was hidden and the section
remained closed. Existing validation coverage submits with the section open,
so it misses this recovery problem.
**Suggested fix:** Expand the advanced section when it contains a field
error, and make the first invalid field discoverable through focus or a
linked error summary. Preserve all entered values. Add the collapsed-section
reproduction to the existing creation tests. Carry this recovery behaviour
into the future preview-and-start form.
**Resolution:**

### F-06 [P3] open - The creation screen's board-preview link opens the welcome page

**File:** apps/web/src/features/games/GameCreationScreen.tsx:143
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** Return to board preview links to `/`, while the board
preview lives at `/preview`. Browser navigation confirmed the link goes to
the welcome route. The label promises a different destination and adds a
detour for someone trying to inspect a board.
**Suggested fix:** Point an explicit board-demo link at `/preview`, or label
the `/` destination Home. Reconsider whether a separate demo escape link is
useful once F-01 provides a preview within game setup. Cover the retained
link's actual destination in the creation browser test.
**Resolution:**

### F-07 [P3] open - The sea has colour but little visual identity as water

**File:** apps/web/src/features/board/BoardSvg.tsx:137;
apps/web/src/App.css:2008
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** The island sits on a uniformly filled rounded rectangle
using computed colour `rgb(36, 93, 110)`. The sea is distinguishable from
land, but the observer has no visible waves, shoreline, shallow-water band,
or depth cues. At desktop and phone sizes it reads as a board canvas rather
than the body of water requested by the user. This is a visual refinement
against the new art direction, not a broken gameplay or API contract.
**Suggested fix:** Add restrained wave marks, a light coastal/shallow-water
edge, and a deeper-water gradient. Apply a clean treatment to the current
style and a richer treatment to a future illustrated style. Preserve the
current compact island framing and port readability; increasing empty ocean
width would undo the earlier desktop layout improvements. Keep decorative
effects separate from topology, input targets, and canonical state.
**Resolution:**

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
