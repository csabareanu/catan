# Build Plan

> Living roadmap. Keep completed item numbers stable and append new work using
> the next unused number.

## MVP

- [x] 1. **Seeded board walking skeleton** - a supplied seed produces the same configurable board in Go, exposes it through the versioned Laravel API, and renders it as a responsive SVG board in React.
- [x] 2. **Authenticated private game library** - users can register, authenticate, use API tokens, create games with two or three AI opponents, and list, view, or delete only their own games.
  - [x] 2a. **Identity and API access** - users can register, authenticate with credentials, issue Sanctum bearer tokens, inspect their identity, and revoke the current token.
  - [x] 2b. **Authenticated game creation** - an owner can create a seeded game with one human seat and two or three AI seats, persisting the game configuration and seat ownership.
  - [x] 2c. **Private game library** - an owner can list, inspect, and delete only their own games through owner-scoped API resources.
- [x] 3. **Durable queued game execution** - owned games can run through a retry-safe Laravel queue and Go service pipeline, with lifecycle status, current state, failures, and ordered events persisted in PostgreSQL and the local stack running through Docker Compose.
  - [x] 3a. **Execution persistence contract** - persist versioned lifecycle state, failure metadata, commands, events, and snapshots without starting queued execution yet.
  - [x] 3b. **Deterministic engine run contract** - add the first versioned Go execution boundary and Laravel client contract for a reproducible bootstrap run.
  - [x] 3c. **Queued game orchestration** - let an owner start a run through a retry-safe Laravel job that calls Go and persists lifecycle, state, events, and failures.
  - [x] 3d. **Local Docker Compose runtime** - run the API, worker, Go engine, PostgreSQL, and Redis together with documented health checks and smoke verification.
  - [x] 3e. **Fast local development workflow** - add a development Compose override with source bind mounts, container-managed dependency volumes, and reload-friendly API, worker, Go, and Vite commands so ordinary source edits do not require image rebuilds while dependency or Dockerfile changes still do.
- [x] 4. **Replayable simulation observer** - users can inspect a game's status and event history in the API and step through its evolving board state in the browser.
  - [x] 4a. **Owner-scoped replay API** - expose versioned public game status, visible ordered events, and replay snapshots through an authenticated owner-scoped API contract.
  - [x] 4b. **Browser game observer** - add the browser access seam and game observer screen that loads a persisted replay frame and renders it with the existing board renderer.
  - [x] 4c. **Replay timeline and state stepping** - let users move through visible events and available snapshot frames without duplicating game rules in React.
- [x] 5. **Initial placement phase** - three- or four-seat games enforce deterministic turn order and legal settlement and road placement, AI seats can complete setup, the observer renders every event, and the human owner can make their setup placements.
  - [x] 5a. **Initial placement rules contract** - the Go engine establishes a seeded, persisted setup order, models legal settlement and road placement, setup resources, and versioned placement events behind a future AI policy boundary without auto-assigning human placements.
  - [x] 5b. **Deterministic AI setup execution** - Laravel and Go can run all AI placement turns through the retry-safe execution pipeline and persist the resulting commands, events, snapshots, and lifecycle state.
  - [x] 5c. **Setup observer projection** - the API and browser observer render setup phases, active seats, structures, and viewer-appropriate setup resources, then autoplay each authorized placement event in order with smooth transitions, pause/resume, and single-event stepping until the human decision point or setup completion.
- [x] 5d. **Human initial placement** - an authenticated owner can choose legal initial settlement and connected-road placements for their seat; the engine validates and persists each command, then AI setup resumes until placement is complete.
- [ ] 6. **Core turn economy** - deterministic dice rolls, resource production, private seat views, roads, settlements, cities, and bank or port trading form a legal replayable turn loop.
  - [x] 6a. **Turn sequence and production** - establish normal turn progression, deterministic dice, resource production, and owner-appropriate resource views; a roll of seven enters a versioned robber-required boundary for Feature 7 to resolve.
  - [ ] 6b. **Core building rules** - validate and apply legal road, settlement, and city builds with their resource costs as replayable transitions.
  - [ ] 6c. **Bank and port trading** - validate and apply fixed-ratio bank and port exchanges as replayable transitions.
- [ ] 7. **Robber interactions and first human turn** - resolve seven, required discards, robber movement, blocked production, and resource stealing for AI seats; add an early human core-turn pilot after those rules are ready.
  - [ ] 7a. **Robber rules and AI resolution** - apply mandatory discards, robber movement, blocked production, and resource stealing for AI turns with ordered replay events.
  - [ ] 7b. **Human core-turn pilot** - let the owner take one core turn in the existing observer, including any required robber decision, persist and replay the accepted transitions, then stop at the next AI turn boundary.
- [ ] 8. **Development cards** - buying, privately holding, timing, and playing every base-game development card produces deterministic state transitions and visible events.
- [ ] 9. **Player trading** - seats can propose, reject, accept, and execute legal resource trades, with simple AI evaluation and no disclosure of private holdings.
- [ ] 10. **Complete headless AI games** - Largest Army, Longest Road, victory scoring, and baseline AI decisions allow seeded games to finish legally and reproducibly with persisted results.
- [ ] 11. **Human core-turn loop** - extend the Feature 7b pilot so one authenticated human can take repeated core turns while AI opponents execute their turns until the next human decision.
- [ ] 12. **Human development cards and negotiation** - the human player can use development cards and negotiate player trades with AI opponents through legal-action guidance; mandatory robber decisions are introduced with the Feature 7b pilot.
- [ ] 13. **Completed match experience** - the browser presents clear turns, private resources, scoring, awards, victory, important-event animation, responsive layouts, and a complete post-game replay.
- [x] 14. **Selectable board appearance** - retain Classic and add an Illustrated style using the approved top-down terrain artwork and visible coastline; a compact selector remembers the browser's choice across preview, setup, and observer boards while both styles share the same board data and controls.
