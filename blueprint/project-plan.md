# Project Plan

## 1. Problem - What problem are we solving?

Build a learning-first, backend-heavy implementation of the Catan base game that is both technically substantial and enjoyable to use.

The project should provide practical experience with:

- Domain modeling and deterministic state transitions.
- API design and authorization.
- Durable persistence and replayable event history.
- Background jobs and service integration.
- A Go rules and simulation engine.
- A modern, visually polished frontend.
- Architecture that can later support online multiplayer and additional rulesets without implementing them prematurely.

The application must remain operable through its API without the frontend. However, development will include visual feedback early: a browser-based observer will grow alongside the engine and later become the human player interface.

Success means:

- Seeded simulations produce reproducible results.
- AI-controlled games complete without illegal state transitions.
- Persisted game history can reproduce and visually replay a game.
- An authenticated human can complete a full base-game match against two or three AI opponents.
- Game ownership and private player information are enforced correctly.
- The code leaves clear extension seams for future multiplayer, maps, and rulesets without carrying their implementation cost in the MVP.

## 2. Users - Who is this for?

The primary MVP user is an authenticated individual who wants to play a complete browser-based base game against two or three AI-controlled opponents.

The critical player journey is:

1. Register or authenticate.
2. Create a new game with two or three AI opponents.
3. View the generated board and complete initial placement.
4. Take legal turns through the browser while AI players take theirs.
5. Build, trade, use development cards, interact with the robber, and pursue victory.
6. Complete the game and inspect or replay its history.
7. Delete an owned game when it is no longer wanted.

A secondary user is the developer or API consumer who wants to:

1. Authenticate through the API.
2. start an AI-only simulation with an optional deterministic seed.
3. Observe its queued or running status.
4. Inspect its current state, result, and ordered event history.
5. Replay the simulation visually in the browser.

Future users may include several authenticated humans playing together over the internet, but multiplayer between humans is not part of the MVP.

Anonymous users may generate a stateless board preview from a supplied seed.
It creates no game or user data and is not persisted. Authentication is required
for stored games, simulations, histories, results, and seat-private views.

## 3. Features - What does the MVP need?

### Delivery strategy

The product will be delivered through vertical slices rather than a long, invisible backend-only phase:

1. Establish the Go engine to Laravel API to React browser walking skeleton.
2. Generate a seeded board through the API and render it in the browser.
3. Add rules and visual feedback together in small, testable slices.
4. Complete and verify headless AI gameplay.
5. Allow one human-controlled seat to submit commands through the same engine.
6. Polish the complete human-versus-AI experience.

The API remains authoritative and independently operable throughout this process.

### Game engine

The canonical Go engine must:

- Model game state independently of HTTP, persistence, and presentation.
- Accept one command at a time and return a new state plus ordered domain events.
- Identify the acting seat on every player command.
- Use deterministic random input and reproducible seeds.
- Support three or four seats controlled by either humans or AI.
- Implement the complete base-game rules:
  - Board generation and initial placement.
  - Turn order and dice rolling.
  - Resource production.
  - Roads, settlements, and cities.
  - Bank and port trading.
  - Player-to-player trading.
  - The robber and discarding.
  - Development cards.
  - Largest Army and Longest Road.
  - Victory point calculation and game completion.
- Produce public state and seat-specific private views.
- Represent the board as configurable hexes, vertices, and edges rather than hardcoded screen positions.
- Record a ruleset identifier and version for every game.
- Expose natural seams for future rules and maps without implementing a generic plugin framework.

### AI and simulations

The MVP must:

- Provide simple AI players capable of choosing legal actions and completing games.
- Support complete AI-only simulations.
- Run simulations asynchronously.
- Expose simulation status, result, final state, and ordered history through the API.
- Retry safely through deterministic inputs and idempotent orchestration.

Advanced strategy, competitive AI, personalities, and machine learning are not required.

### Laravel application and API

Laravel must provide:

- User registration, authentication, logout, and token support.
- Authorization and private ownership of games.
- Game creation, listing, retrieval, and deletion.
- Game lifecycle and simulation orchestration.
- APIs for game state, legal human commands, status, results, and event history.
- Queue dispatch and worker processing.
- Communication with the stateless Go engine.
- Durable persistence of accepted state and events.
- Validation of API input and consistent JSON error responses.

Laravel must not duplicate gameplay rules implemented by Go.

### Web application

The React web application must provide:

- Authentication screens.
- A private game library.
- Game creation and configuration.
- A visually rich, responsive SVG board.
- An early read-only simulation observer.
- Event-by-event replay controls.
- Clear turn, status, resource, player, and victory information.
- Human move selection and legal-action guidance.
- Building placement and robber interactions.
- Trading and development-card interactions.
- Visual feedback and animation for important game events.
- A complete one-human-versus-AI gameplay experience.

The frontend may improve usability by showing legal actions supplied by the API, but it must not become a second rules engine.

### Explicit non-goals

The MVP does not include:

- Human-only internet multiplayer.
- Multiple human-controlled seats in one game.
- Real-time synchronization between remote players.
- Advanced or highly competitive AI.
- Expansion rules or alternative maps.
- Seafarers-style scenarios.
- Native mobile applications.
- Phone-first board gameplay.
- RabbitMQ or a larger microservice topology.
- Public cloud production deployment.
- High availability or automatic scaling.
- Monetization or commercial distribution.

## 4. Data - What are we storing?

PostgreSQL is the durable source of truth.

The application will store:

- User accounts and authentication data.
- API credentials or tokens where applicable.
- Game ownership and lifecycle status.
- Ruleset identifier and version.
- Deterministic random seed and game configuration.
- Seat identities and controller types.
- Board configuration.
- Current persisted game state or snapshots.
- Ordered commands and domain events needed for inspection and replay.
- Simulation status and failure information.
- Final results, winner, scores, and completion metadata.

Game records and their histories are private to the user who created them. Administrators may inspect them for debugging. Other users must not have access.

Games are retained by default without an automatic expiry. Owners can delete their games.

Redis may hold queues, transient coordination data, locks, or cache entries, but it must not be the authoritative store for users or games.

The MVP does not intentionally store sensitive personal data beyond account credentials and gameplay records.

## 5. Tech - What stack are we using?

### Laravel application

- **Laravel 13** provides the REST API, authentication integration, authorization, user and game management, job orchestration, and persistence.
- **PHP 8.3** is the minimum application runtime and is compatible with the locally installed runtime.
- **Laravel Sanctum** provides secure cookie-based authentication for the first-party React application and API tokens for CLI tools or future external clients.
- **Laravel queue workers** consume asynchronous simulation jobs.

Laravel acts as the application control plane. It owns user identity, authorization, game lifecycle, persistence, and calls to the engine.

### Go engine

- **Go using a supported 1.26-or-newer toolchain** implements the canonical game rules, AI decisions, and deterministic simulations.
- The Go component is stateless and does not access PostgreSQL or Redis directly.
- It receives game state or simulation input from Laravel and returns validated state transitions and events.
- Laravel initially communicates with it through a versioned HTTP/JSON contract.

This boundary introduces meaningful polyglot service experience without dividing the product into unnecessary microservices.

### Data and asynchronous work

- **PostgreSQL 18** is the only durable source of truth.
- **Redis 8.2** supports Laravel queues and transient coordination.
- **RabbitMQ is deferred.** It will be reconsidered only if the Go service later needs to consume work independently or richer cross-language messaging becomes necessary.

### Frontend

- **React 19 with TypeScript** provides the standalone browser application.
- **Vite** provides the frontend development and production build tooling.
- **npm** is the frontend package manager.
- **SVG** is the initial board-rendering technology because tiles, edges, vertices, highlights, interactions, and animations remain individually addressable.
- The frontend consumes Laravel's JSON API and does not use Inertia page props.

Routing, server-state caching, styling, component libraries, animation helpers, and frontend testing libraries will be chosen when their requirements become concrete.

### Repository and local environment

- The Laravel application, Go service, and standalone React application live in one repository with explicit application boundaries.
- **Docker Compose** coordinates the local services.
- HTTP/JSON is the initial communication mechanism between services.
- Production orchestration technology is intentionally deferred.

## 6. Monetize - How will this make money?

The MVP is a non-commercial learning and portfolio project. It has no monetization requirements.

The project will not introduce subscriptions, advertisements, payments, premium content, or commercial accounts.

> Open question: If commercial or broader public distribution is considered later, revisit product naming, visual assets, licensing, operating costs, and the monetization model before treating that as approved scope.

## 7. UI/UX - How should this look and feel?

The application should feel like a modern, polished strategy-game interface rather than an administrative dashboard placed around a board.

The experience should be:

- Visually clear and inviting.
- Responsive and optimized for desktop and tablet.
- Usable on smaller screens where practical, without making phone-first gameplay an MVP requirement.
- Rich in immediate visual feedback.
- Clear about the current turn, available actions, game status, and outcomes.
- Careful not to expose private resources or cards belonging to other seats.
- Consistent between live state and replayed history.

The board will be SVG-based and driven by API data rather than fixed visual coordinates. This supports interaction, animation, responsive scaling, alternate layouts, and future maps.

Visual feedback begins early. The first frontend milestone is a rendered seeded board, followed by an event observer and replay tool. That observer evolves into the interactive human player experience.

> Open question: Choose the exact visual theme, artwork direction, typography, color system, motion language, and UI component approach during dedicated frontend prototyping.

## 8. Deployment - Where and how will this ship?

The MVP ships as a reproducible local development environment using Docker Compose.

The local environment is expected to run:

- The Laravel API.
- A Laravel queue worker.
- The Go engine and simulation service.
- The React development or built web application.
- PostgreSQL.
- Redis.

No public cloud provider, managed database, production domain, automated scaling, or high-availability design is required for the MVP.

Docker Desktop is visible from the current WSL environment, but WSL integration must be enabled before Docker Compose can run successfully.

> Open question: Choose a public hosting provider, production topology, real-time transport, observability platform, and operating budget only when deployment or internet multiplayer becomes an approved goal.
