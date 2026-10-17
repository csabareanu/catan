# Player-friendly game creation

**Type:** Fix

**Fixes:** F-13

**Status:** complete

## The problem

The authenticated game creation screen presents a required fixed seed as its
first input and places disabled ruleset and map selects beside it. This makes a
normal game look like a developer configuration task, repeats the same board by
default, and hides the meaningful choice of how many AI opponents to include.

## The fix

- Make two or three AI opponents the primary setup choice and explain that a
  fresh board is created automatically.
- Generate a fresh canonical seed for each new form and keep the seed available
  as an optional, clearly labeled Advanced option for reproducible games.
- Replace disabled ruleset and map controls with concise read-only game-format
  information, while continuing to submit the existing versioned
  `ruleset_key`, `map_key`, and `seed` fields to the API.
- Preserve server validation, error messages, owner scoping, and the existing
  post-creation navigation. Do not imply that human gameplay is already
  implemented.

## Build steps

### 1. [x] Make game creation player-facing

Update the creation screen, its responsive styles if needed, and focused
browser coverage so the normal path starts with opponent choice and a fresh
board. Keep advanced seed editing accessible without making it part of the
primary flow.

**Done when:** a fresh visit shows no repeated fixed seed in the primary form,
the user can create a game with two or three AI opponents using the generated
seed, Advanced options expose a reproducible seed and its validation errors,
the fixed Base game and Standard map values are readable without looking like
disabled inputs, and the request still sends the existing API contract.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run test:e2e -- e2e/game-creation.spec.ts`
- Manually open `/games/new`, create a game with the default fresh board, then
  expand Advanced options and create one with a supplied seed.

## Findings

### player-friendly-game-creation/F-13 [P2] closed - Creating an ordinary game starts with developer configuration

**File:** apps/web/src/features/games/GameCreationScreen.tsx:83
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The original creation screen made a normal game look like
developer configuration by leading with a fixed seed and disabled ruleset and
map controls. It also repeated the same board by default.
**Suggested fix:** Make opponent choice the normal path, generate a fresh board
by default, move reproducibility into Advanced options, and present the fixed
format as read-only information while preserving the API contract.
**Resolution:** Implemented the player-facing creation flow and re-reviewed it
with focused browser tests and a running 390px screen. Generated seeds remain
within the signed 64-bit contract, the primary path hides the seed, Advanced
options accept a supplied seed, and no new issue was found. Closed by /audit on
2026-10-17.
