# Local Blueprint Skills

This is a standalone, Codex-only fork of [AI Coding Blueprint](https://ai-blueprint.dev/), curated for small, human-reviewed development steps.

The source of truth for the fork is `blueprint/.agents/skills/`. The files under `blueprint/context/`, `blueprint/history/`, and the two plan files are starter state templates for projects that adopt the workflow. Generated project state should live in the consuming project, not be shared between projects.

## Included workflow

The active set contains 19 skills:

- On-ramp and planning: `start-project`, `adopt`, `onboard`, `project-plan`, `build-plan`, `overview`, `brief`, `status`
- Build loop: `feature`, `fix`, `implement`, `check`, `tests`, `try`, `audit`, `complete`, `rollback`
- Support: `doctor`, `prototype`

The following upstream skills are intentionally deferred for now:

- `autopilot` — does not fit the default human-per-step review loop
- `ci` — project-specific setup, not needed for the initial fork
- `release` — deployment/provider work, outside the initial workflow

The Claude adapter, npm installer, updater, and upstream remote are also intentionally omitted. To use this fork in another project, copy or link the selected skills into that project's `.agents/skills/` directory and keep the fork's state files under that project's `blueprint/` directory.

For a blank greenfield repository, link the skills first and run
`$start-project` before scaffolding. It aligns the product and MVP, recommends a
stack, and requires separate approval before running the scaffold command. See
the setup sequence in [`USAGE.md`](USAGE.md).

See [`USAGE.md`](USAGE.md) for installation and project setup, and
[`FORK.md`](FORK.md) for provenance and maintenance policy.
