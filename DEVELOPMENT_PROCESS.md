# Vita — How this project is developed

> Founding document. Every AI session (orchestrator or team lead) reads this file before doing any work.

## The product

**Vita** is a personal health assistant: "a quiet log of meals, water & movement". The user logs meals, water, workouts and habits by voice, text, tap or photo; AI interprets the input and returns estimates the user confirms. Non-negotiable philosophy: **no goals, no scores, no streaks, no advice** — the app records what the user tells it and shows it back, always labeling estimates as estimates. The complete hi-fi prototype (20+ screens) is the UX/UI reference: see `docs/product-brief.md` and `docs/prototype/`.

## The premise: 100% AI-driven development

This project is built entirely by AI agents, organized as a company:

| Role | Who | Responsibility |
|---|---|---|
| CEO / Product Owner | Lucas (human) | Decides product, priorities, approves proposals and specs; performs human-only actions (accounts, Terraform applies, app store releases) |
| Orchestrator | Claude (main session) | Coordinates teams, mediates dependencies, consolidates proposals, escalates questions to the CEO |
| Team Lead Backend | agent `team-lead-backend` | Kotlin backend, external integrations, product AI, backend QA automation |
| Team Lead App | agent `team-lead-app` | Mobile app, app QA automation |
| Team Lead DevOps | agent `team-lead-devops` | AWS, Terraform, pipelines, databases, monitoring, security |

AI sessions **have no memory between runs**. Therefore: **the repository is the company's memory.** Every decision, every bit of progress, every piece of work-in-flight state becomes a versioned file. If it isn't committed, it didn't happen.

## Founding decisions (by the CEO)

See `docs/ceo-decisions.md` for the full dated decision log. Currently in force:

- **Scope to production**: the complete product — all prototype screens, working end to end.
- **Third-party integrations**: v1 ships with native health platforms only (Apple Health + Health Connect). Garmin, Strava and Flo come in v2.
- **Backend stack**: Kotlin. **Infra**: AWS, 100% Terraform. **App stack**: React Native + Expo (app team recommendation).
- **Data responsibility (core premise)**: store strictly what is necessary; sensitive data is encrypted. Every schema and endpoint is designed with this filter.
- **Single environment: production only.** All pre-production testing is local. Cost is the priority — but never at the expense of security/encryption.
- **Region**: Europe, with region-agnostic services/Terraform so a Brazil region can be spun up easily if needed.
- **Notifications**: habit/check-in notifications are local on device (no server push in v1).
- **Language**: launch in English; i18n-ready from day one (a new language = new translation files only). All docs and code in English.
- **Mobile builds**: the CEO builds and submits the apps manually from his Mac — no paid build pipeline.
- **Observability**: OpenTelemetry as the pipe; Prometheus hosted on AWS for metrics; Grafana runs locally on the CEO's machine pointing at Prometheus.
- **Initial audience**: ~5 test users; size and cost everything accordingly.

## Tools of record

| Tool | Role | Where |
|---|---|---|
| **Git monorepo** | The memory: code, specs, ADRs, session state | this repo |
| **Asana** | Tickets (our Jira) | boards below |
| **Notion** | Living documentation (our Confluence) | [Vita space](https://app.notion.com/p/39c213f6aff4804ea42ceea4269556f7) |

### Asana boards (tickets)

| Team | Board | Project GID |
|---|---|---|
| Backend | [Vita backend](https://app.asana.com/1/1216482759560814/project/1216519867368580/board/1216517943001322) | `1216519867368580` |
| App (mobile) | [Vita frontend](https://app.asana.com/1/1216482759560814/project/1216519867368576/board/1216514517218385) | `1216519867368576` |
| DevOps | [Vita devops](https://app.asana.com/1/1216482759560814/project/1216519867368584/board/1216519868860048) | `1216519867368584` |

- Flow: `Backlog` → `To do` → `In progress` → `Done`. **Definition of done: in production.**
- Each team lead picks tasks from their own board's Backlog, works them, and moves them to Done.
- Ticket minimum content (in the Asana task description): goal, acceptance criteria, dependencies on other teams.
- Cross-team needs are tickets too: if backend/app needs infra (queue, topic, bucket, …), the requesting lead creates a ticket in the **devops** board's Backlog and tells the orchestrator, who dispatches a devops agent.
- Work-in-progress journal stays in the repo: `<team>/Progress/<short-ticket-name>-Progress.md`, referencing the Asana task URL.

### Notion (living documentation)

Structure under the Vita page: `Product` (objective, philosophy, scope, business plan) · `Backend` / `Mobile` / `DevOps` (each: Decisions, Stack, Notes) · `How we work`.

> **Every team lead and the orchestrator must update Notion at the end of every working session**: new decisions → a dated line on the team page; product changes → Product page. Keep it short and factual — Notion is a summary surface, the repo holds the detail.

## Monorepo structure

```
vita/
├── DEVELOPMENT_PROCESS.md      # this file
├── .claude/agents/             # team lead agent definitions
├── docs/                       # cross-team docs (product brief, prototype, contracts, decisions)
├── backend/
├── app/
└── devops/
```

Every team folder follows the same internal structure:

```
<team>/
├── Progress/                   # <ticket>-Progress.md — work journal per ticket (links the Asana task)
├── Next_session.md             # team state: what the next session needs to know
├── Doc/
│   ├── ADRs/                   # architecture decision records (numbered, immutable)
│   └── ...                     # general team docs
└── services/                   # the team's service/app code
```

## The cycle of a work session

1. **Read context**: `DEVELOPMENT_PROCESS.md` → `<team>/Next_session.md` → the Asana ticket at hand (move it to `In progress`).
2. **Work**: implement, test, document. Architectural decisions become ADRs on the spot.
3. **Close**: update the ticket's `Progress/` file and `Next_session.md`; commit with `<team>: <summary>`; update the Notion team page (decisions/notes); move the Asana ticket (`Done` only when in production).

Rules for agents:

- **Never invent a product decision.** Product doubts become recorded questions, escalated via the orchestrator → CEO.
- **Cross-team contracts are sacred**: APIs between backend and app are specified (OpenAPI) in `docs/contracts/` BEFORE either side implements. Contract changes require an ADR and notifying the other team.
- **QA automation is part of each team**, not a separate phase: no ticket reaches Done without automated tests passing.
- **Keep it simple** (ponytail): no speculative abstractions, no heavy layered architectures. Modules with clear boundaries, minimum code that works, boring over clever.
- Small, frequent commits. The CEO reviews by diffs.
- **Model per task (CEO Round 7, cost rule)**: every Asana ticket carries a `Model:` line — **Sonnet** for simple tasks, **Opus 4.8** for complex ones. **Fable** is reserved for orchestration that needs it; simple orchestration runs on Opus. Team leads may run on Opus. The orchestrator sets the model when dispatching agents.

## Project phases

| Phase | Goal | Output |
|---|---|---|
| **0 — Kickoff** (done) | Each team lead proposes their plan from zero to production | `<team>/Doc/kickoff-proposal.md`, CEO reviewed |
| **1 — Specification** | Approved proposals become detailed specs and Asana tickets | Specs in `<team>/Doc/`, contracts in `docs/contracts/`, populated Asana Backlogs |
| **2 — Implementation** | Teams execute tickets in vertical slices that always integrate | Working, tested software |
| **3 — Production** | Go-live: pipeline, observability, security review | Vita in production |

Each phase only starts with explicit CEO approval of the previous one.

## Global definition of done (DoD)

A ticket only moves to `Done` when:

1. Code implemented and reviewed (agent code review);
2. Automated tests written and passing (unit + integration; E2E where applicable);
3. Team documentation updated (ADRs, service docs, Notion team page);
4. `Progress/` and `Next_session.md` updated, everything committed;
5. **Deployed and working in production.**
