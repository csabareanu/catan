# Build Plan

> Living roadmap. Keep completed item numbers stable and append new work using
> the next unused number.

## MVP

- [x] 1. **Seeded board walking skeleton** - a supplied seed produces the same configurable board in Go, exposes it through the versioned Laravel API, and renders it as a responsive SVG board in React.
- [x] 2. **Authenticated private game library** - users can register, authenticate, use API tokens, create games with two or three AI opponents, and list, view, or delete only their own games.
  - [x] 2a. **Identity and API access** - users can register, authenticate with credentials, issue Sanctum bearer tokens, inspect their identity, and revoke the current token.
  - [x] 2b. **Authenticated game creation** - an owner can create a seeded game with one human seat and two or three AI seats, persisting the game configuration and seat ownership.
  - [x] 2c. **Private game library** - an owner can list, inspect, and delete only their own games through owner-scoped API resources.
- [ ] 3. **Durable queued game execution** - owned games can run through a retry-safe Laravel queue and Go service pipeline, with lifecycle status, current state, failures, and ordered events persisted in PostgreSQL and the local stack running through Docker Compose.
- [ ] 4. **Replayable simulation observer** - users can inspect a game's status and event history in the API and step through its evolving board state in the browser.
- [ ] 5. **Initial placement phase** - three- or four-seat games enforce deterministic turn order and legal settlement and road placement, while AI seats can complete setup and the observer renders every event.
- [ ] 6. **Core turn economy** - deterministic dice rolls, resource production, private seat views, roads, settlements, cities, and bank or port trading form a legal replayable turn loop.
- [ ] 7. **Robber interactions** - rolling seven, required discards, robber movement, blocked production, and resource stealing work for AI seats and appear correctly in replay.
- [ ] 8. **Development cards** - buying, privately holding, timing, and playing every base-game development card produces deterministic state transitions and visible events.
- [ ] 9. **Player trading** - seats can propose, reject, accept, and execute legal resource trades, with simple AI evaluation and no disclosure of private holdings.
- [ ] 10. **Complete headless AI games** - Largest Army, Longest Road, victory scoring, and baseline AI decisions allow seeded games to finish legally and reproducibly with persisted results.
- [ ] 11. **Human setup and core turns** - one authenticated human can create a game, complete initial placement, roll, build, and use bank or port trades while AI opponents take their turns.
- [ ] 12. **Human special actions and negotiation** - the human player can resolve robber and discard decisions, use development cards, and negotiate player trades with AI opponents through legal-action guidance.
- [ ] 13. **Completed match experience** - the browser presents clear turns, private resources, scoring, awards, victory, important-event animation, responsive layouts, and a complete post-game replay.
