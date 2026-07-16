# Copilot instructions for saas-hono-setup

Read [AGENTS.md](../AGENTS.md) first — it's the durable rule set for this repo (architecture, auth model, response contract, testing conventions) and applies regardless of which tool is editing the code. [PROGRESS.md](../PROGRESS.md) tracks what's actually implemented right now; don't assume something exists just because a rule describes how it should behave.

## Skills available in this repo

Structured workflows in `.github/skills/<name>/SKILL.md`, each with steps, verification gates, and anti-rationalization tables. Apply the one matching the current task rather than defaulting to ad hoc behavior:

- `using-agent-skills` — meta-skill: maps incoming work to the right skill
- `spec-driven-development` — write a spec before non-trivial code
- `test-driven-development` — test pyramid, red-green-refactor
- `api-and-interface-design` — contract-first design, boundary validation
- `git-workflow-and-versioning` — atomic commits, change sizing, commit-as-save-point
- `doubt-driven-development` — adversarial review of non-trivial decisions before they stand (claim → extract → doubt → reconcile)
- `source-driven-development` — ground framework/library decisions in official docs, cite sources
- `context-engineering` — how to configure rules/context files for this project
- `documentation-and-adrs` — record architectural decisions and the why behind them
- `observability-and-instrumentation` — structured logging, metrics, tracing when shipping anything production-facing
- `ci-cd-and-automation` — pipeline/quality-gate setup

## Personas

Available in `.github/agents/` (invoke with `@<name>` in Copilot Chat): `code-reviewer`, `test-engineer`, `security-auditor`, `web-performance-auditor`.

## Project-specific notes Copilot should know

- Package manager is pnpm, not npm/yarn — see `AGENTS.md`'s Environment section.
- `NODE_ENV` is set only via `cross-env` in each script, never inside a `.env.*` file.
- Every `apps/api` response uses the `success`/`failure` envelope from `apps/api/src/lib/response.ts` — never hand-construct a response shape.
- `packages/core` must never import Hono/HTTP/socket code — see the DDD/DIP section in `AGENTS.md` for the one accepted exception and why.
