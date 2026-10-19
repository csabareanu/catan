# Keep seed validation visible when options are collapsed

**Type:** Fix

**Fixes:** F-05

**Status:** complete

## The problem

On `/games/new`, applying a non-canonical seed such as `01` returns a field
validation error. The exact message is shown inside the collapsible Advanced
options section. If the player collapses that section, only the generic board
generation error remains visible, so the actionable explanation is hidden.
The invalid preview also keeps Start game disabled.

## The fix

- Keep the exact seed validation message visible in the creation form when
  Advanced options is collapsed. Make that message visibly red and identify
  Advanced options as the place to fix it; the collapsed section label also
  shows a red "Seed needs attention" indicator. Retain the field-level error
  beside the seed input when expanded.
- Preserve the entered seed and keep Start game disabled until a valid board
  preview is available. Clear the error indicators after a valid preview is
  applied. Advanced options remains collapsible.

## Build steps

### 1. [x] Keep the actionable seed error visible

Add the field-specific seed error to the existing visible creation feedback
when its input is hidden, and cover the collapsed-section recovery in the
game-creation browser tests.

**Done when:** After applying `01` and receiving the 422 validation response,
collapsing Advanced options shows a red attention indicator on the section and
a red error callout that names Advanced options and states the exact seed error.
Opening the section again shows the unchanged value and its invalid state.
After applying a valid seed, the red indicators clear and Start game becomes
available.

## Verify

- From `apps/web`, run `npm run test:e2e -- e2e/game-creation.spec.ts`.
- Run `npm run lint` and `npm run build` from `apps/web`.
- Run `git diff --check`.
- Manually test `/games/new` with seed `01`: apply it, collapse Advanced
  options, confirm the exact message remains visible, then reopen the section.

## Findings

### keep-seed-validation-visible-when-collapsed/F-04 [P2] accepted - Phone board controls overlap a port in the fitted view

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
**Resolution:** Accepted by the user on 2026-10-19 as a reasonable trade-off
for floating zoom controls used to inspect the board. The board can be zoomed
and panned to bring content beneath the controls into view; no change is wanted
unless this obstructs a required gameplay interaction or prevents inspection.

### keep-seed-validation-visible-when-collapsed/F-05 [P2] closed - A collapsed advanced section hides its seed validation error

**File:** apps/web/src/features/games/GameCreationScreen.tsx:161, 263, 326;
apps/web/src/App.css:543, 1578;
apps/web/e2e/game-creation.spec.ts:109
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** Reproduction: open Advanced options, enter `01`, click
Apply seed, then collapse the section after the 422 response. The seed field
and actionable error stayed inside the closed details element, leaving only a
generic board-generation message elsewhere on the page. Existing validation
coverage submitted with the section open, so it missed this recovery problem.
**Suggested fix:** Expand the advanced section when it contains a field
error, and make the first invalid field discoverable through focus or a
linked error summary. Preserve all entered values. Add the collapsed-section
reproduction to the existing creation tests. Carry this recovery behaviour
into the future preview-and-start form.
**Resolution:** Re-audited and closed on 2026-10-19. The collapsed Advanced
options summary stays red and displays a "Seed needs attention" badge. A red
alert below the setup controls names Advanced options and shows the exact seed
error. The entered value remains intact, Start game stays disabled, and both
error cues clear after a valid seed is applied. The 17-test game-creation
browser suite, lint, and build all pass; the screenshot confirmed the intended
visual hierarchy.
