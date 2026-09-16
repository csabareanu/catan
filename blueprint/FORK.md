# Fork policy

This directory is an independent local fork of Brad Traversy's AI Coding Blueprint.

## Provenance

- Upstream: <https://github.com/bradtraversy/ai-blueprint>
- Website: <https://ai-blueprint.dev/>
- Baseline commit: `8bcd450da903795e5df0a651c92445e7084b3761`
- Baseline commit date: 2026-08-01
- License: MIT; the upstream `LICENSE` is retained here.

## Independence

This fork has no upstream Git remote, automatic updater, npm installer, or Claude adapter. Changes are made deliberately in this repository. Upstream updates may be reviewed manually, but they must not overwrite local decisions or silently reintroduce deferred skills.

The six general-purpose Codex skills installed outside this repository remain independent too: `engineering-coach`, `knowledge-curator`, `laravel-mentor`, `learning-lab`, `senior-software-engineer`, and `software-architecture-professor`.

## Current curation

Nineteen workflow skills are included. `autopilot`, `ci`, and `release` are deferred until the core loop has been used in a real project. The first planned behavior reviews are:

1. Align `/complete` with the local rule that commits require explicit permission.
2. Give `/prototype` a durable design brief and decision record so important UI choices survive beyond temporary HTML prototypes.

Those are deliberate follow-up slices, not part of the initial source copy.

## State ownership

`project-plan.md`, `build-plan.md`, `context/`, and `history/` are workflow state owned by each consuming project. Treat the files copied here as starter templates and do not use one project's active feature or findings as another project's context.
