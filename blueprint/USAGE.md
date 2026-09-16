# Using the Local Blueprint Skills

This `blueprint/` directory is the source of truth for a personal, Codex-only
Blueprint fork. Reuse its workflow instructions across projects, but keep every
project's plans, context, findings, and history independent.

The central rule is:

> Share skill behavior. Never share project state.

Codex loads repository skills from `.agents/skills/` and supports symlinked
skill folders. Invoke a skill explicitly with `$skill-name`, or let Codex select
one when the request matches its description. See the
[official OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills).

## What to link, copy, or create

| Path | Action in a consuming project | Why |
| --- | --- | --- |
| `.agents/skills/<skill>/` | Symlink the whole directory, or copy it as a snapshot | Reusable workflow behavior |
| `blueprint/project-plan.md` | Copy once | User-owned product direction |
| `blueprint/build-plan.md` | Copy once | Project-specific roadmap and progress |
| `blueprint/context/` | Copy once | Generated and evolving project context |
| `blueprint/history/` | Copy once | Project-specific feature, fix, and rollback archives |
| `blueprint/README.md`, `USAGE.md`, `FORK.md`, and `LICENSE` | Copy once, recommended | Local workflow reference and fork provenance |
| Root `AGENTS.md` | Create or adapt for that project | Commands and conventions differ by project |

Do not symlink `project-plan.md`, `build-plan.md`, `context/`, `history/`,
or a project `AGENTS.md`. If two projects link any of those paths, activity in
one project will corrupt the other's workflow state.

## Recommended setup: symlink skills, copy state

This is the best setup for personal projects on this machine:

- Every project immediately sees approved changes made in this repository.
- Each project owns independent Blueprint state.
- Project-specific skills can still live beside the linked Blueprint skills.

Set the two paths for the current shell:

```bash
BLUEPRINT_FORK=/home/csabareanu/Projects/codex/ai-skills/blueprint
PROJECT_ROOT=/absolute/path/to/your/project
```

The commands below assume GNU coreutils, as available in this Linux/WSL
environment.

### 1. Link all curated skills

Create the target directory, then link each skill folder:

```bash
mkdir -p "$PROJECT_ROOT/.agents/skills"
for skill_dir in "$BLUEPRINT_FORK"/.agents/skills/*; do
  skill_name=${skill_dir##*/}
  ln -sT "$skill_dir" "$PROJECT_ROOT/.agents/skills/$skill_name"
done
```

This links the 19 curated skills individually. Do not link only each
`SKILL.md`: some skills also require their `reference/` or `agents/`
directories.

Do not replace the entire target `.agents/skills/` directory with one symlink.
Keeping it as a real directory allows the project to add its own local skills.

If a skill name already exists, `ln -sT` fails for that item instead of
replacing it or nesting another link inside it. Inspect the conflict and decide
which version the project should use.

For a blank, unscaffolded project, pause here. Launch Codex from
`$PROJECT_ROOT`, confirm that `$start-project` is available, and run it before
copying the state templates below. The skill discovers the product, recommends
a stack, writes the approved `blueprint/project-plan.md`, and scaffolds only
after separate approval of the exact command. After scaffolding succeeds, return
to step 2. The no-clobber copy preserves the approved project plan.

### 2. Copy fresh project state

Run this only when initializing Blueprint in a project. The no-clobber option
protects files that already exist:

```bash
mkdir -p "$PROJECT_ROOT/blueprint"
cp --update=none "$BLUEPRINT_FORK/project-plan.md" "$PROJECT_ROOT/blueprint/project-plan.md"
cp --update=none "$BLUEPRINT_FORK/build-plan.md" "$PROJECT_ROOT/blueprint/build-plan.md"
cp -R --update=none "$BLUEPRINT_FORK/context" "$PROJECT_ROOT/blueprint/"
cp -R --update=none "$BLUEPRINT_FORK/history" "$PROJECT_ROOT/blueprint/"
cp --update=none "$BLUEPRINT_FORK/README.md" "$PROJECT_ROOT/blueprint/README.md"
cp --update=none "$BLUEPRINT_FORK/USAGE.md" "$PROJECT_ROOT/blueprint/USAGE.md"
cp --update=none "$BLUEPRINT_FORK/FORK.md" "$PROJECT_ROOT/blueprint/FORK.md"
cp --update=none "$BLUEPRINT_FORK/LICENSE" "$PROJECT_ROOT/blueprint/LICENSE"
```

Never rerun a forceful copy over an active project. Once initialized, these
files belong to the consuming project.

### 3. Create or adapt the project's AGENTS.md

The target repository should have its own root `AGENTS.md`. At minimum, record
the project's actual commands:

```markdown
# Project instructions

## Commands

- Dev: `...`
- Build: `...`
- Test: `...` if configured
- Verify: `...` if a combined check exists
```

Keep any useful project architecture, authorization, data-scoping, and coding
conventions already present. Do not symlink the global personal working
agreement: global collaboration defaults and project facts have different
ownership.

The `$onboard` or `$adopt` skill will inspect and refine this file.

### 4. Verify discovery

From the target project:

```bash
find .agents/skills -maxdepth 1 -type l -print
test -f blueprint/project-plan.md
test -f blueprint/context/current-feature.md
```

Launch Codex from the project directory and run `/skills`. If newly linked
skills do not appear, restart Codex.

## Link only selected skills

The full curated set is recommended because skills hand work to one another. To
install only a subset, link complete skill directories explicitly:

```bash
mkdir -p "$PROJECT_ROOT/.agents/skills"
ln -sT "$BLUEPRINT_FORK/.agents/skills/project-plan" "$PROJECT_ROOT/.agents/skills/project-plan"
ln -sT "$BLUEPRINT_FORK/.agents/skills/build-plan" "$PROJECT_ROOT/.agents/skills/build-plan"
ln -sT "$BLUEPRINT_FORK/.agents/skills/overview" "$PROJECT_ROOT/.agents/skills/overview"
```

Check every skill's handoff before omitting others. For example,
`$project-plan` hands off to `$build-plan`, which hands off to `$overview`.
For pre-scaffold discovery, also link `start-project` and its required handoff
skills:

```bash
ln -sT "$BLUEPRINT_FORK/.agents/skills/start-project" "$PROJECT_ROOT/.agents/skills/start-project"
ln -sT "$BLUEPRINT_FORK/.agents/skills/onboard" "$PROJECT_ROOT/.agents/skills/onboard"
```

## Portable alternative: copy the skills

Absolute symlinks are convenient locally but break when the central repository
moves or when another machine checks out the consuming project. For a portable
or team-owned project, copy a snapshot instead:

```bash
mkdir -p "$PROJECT_ROOT/.agents/skills"
cp -R --update=none "$BLUEPRINT_FORK/.agents/skills/." "$PROJECT_ROOT/.agents/skills/"
```

Copy the state templates separately using the earlier commands. Commit the
copied skill folders only if the project is meant to carry its own workflow
snapshot.

This method changes update behavior:

- Symlinked projects receive central fork changes immediately.
- Copied projects remain pinned until their skill folders are deliberately
  reconciled with this repository.
- Never bulk-copy over a project that has modified its local skill snapshot;
  compare the two versions first.

## Starting a new project

Create the empty project directory, set `PROJECT_ROOT`, and complete step 1 of
the recommended setup so the repository-local skills are discoverable. Do not
copy the Blueprint state yet. Then run:

1. `$start-project` - clarify the problem, users, critical journey, MVP, and
   non-goals; receive a stack recommendation; confirm the shared understanding;
   approve the project plan; and separately approve the exact scaffold command.
2. Return to setup steps 2 through 4 - copy the state templates with
   no-clobber semantics, create or adapt `AGENTS.md`, and verify discovery. The
   approved `blueprint/project-plan.md` is preserved.
3. `$onboard` - detect the real stack and commands, compare them with the
   approved technology choices, tune conventions and adapters, and choose
   repository visibility.
4. `$build-plan` - turn the approved MVP into an ordered, reviewed roadmap.
5. `$overview` - generate the AI-facing project overview from both plans.
6. Optionally `$prototype` - explore the interface before feature work.
7. `$brief`, then `$feature` - clarify and specify the next roadmap item.
8. `$implement` - build the approved spec in small reviewable steps.
9. `$check` - verify behavior against the spec.
10. `$complete` - archive the work and create its work-level commit; merge and
   push remain separate approval decisions.

Use `$status` at any time to inspect progress.

If the application was already scaffolded before Blueprint was installed, skip
`$start-project`: run `$onboard`, then `$project-plan`, `$build-plan`, and
`$overview`. `$project-plan` includes the same product and technology-fit
consultation but never runs a scaffolder.

## Adopting an existing project

Install the same skill links and fresh state templates, then run:

1. `$adopt` — survey the existing code, generate plans reflecting shipped
   behavior, and adapt commands and coding standards.
2. Review the generated `project-plan.md` and `build-plan.md`.
3. `$overview` — generate the project overview.
4. Continue with `$feature`, `$implement`, `$check`, and `$complete`.

Do not run `$project-plan` or `$build-plan` first for a brownfield application
with meaningful shipped behavior. Those two skills initialize new-project
plans; `$adopt` reconciles plans with existing reality.

## Git visibility

Choose per consuming project:

- **Local personal workflow:** ignore `.agents/` when it contains absolute
  symlinks. Decide separately whether the project's `blueprint/` state should
  be tracked.
- **Portable team workflow:** copy the skill folders and commit them with the
  project, together with any Blueprint state the team wants to share.

Do not commit absolute symlinks and expect them to work on another machine. Git
stores the link target text, not the linked directory contents.

The `$onboard` skill asks whether Blueprint files should be committed or kept
local and can update `.gitignore` accordingly.

## Updating and troubleshooting

- Make shared behavior changes in this `ai-skills` repository, validate them,
  and commit them here.
- A symlinked project sees the updated skill immediately. Restart Codex if the
  change is not detected.
- A copied project must be updated manually and reviewed like any other
  dependency update.
- If this repository moves, recreate absolute links from each target project's
  `.agents/skills/` directory.
- Run `$doctor` in a consuming project to check adapters, state files,
  commands, plan shape, and workflow health.
- Remember that edits made through a symlink change this central repository, not
  the consuming project's Git history.
