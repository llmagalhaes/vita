# Vita — How this project is developed

> Founding document. Every AI session (orchestrator or team lead) reads this file before doing any work.

## The product

**Vita** is a personal health assistant: "a quiet log of meals, water & movement". The user logs meals, water, workouts and habits by voice, text, tap or photo; AI interprets the input and returns estimates the user confirms. Non-negotiable philosophy: **no goals, no scores, no streaks, no advice** — the app records what the user tells it and shows it back, always labeling estimates as estimates. The complete hi-fi prototype (20+ screens) is the UX/UI reference: see `docs/product-brief.md` and `docs/prototype/`.

## The premise: 100% AI-driven development

This project is built entirely by AI agents, organized as a company:

| Role | Who | Responsibility |
|---|---|---|
| CEO / Product Owner | Lucas (human) | Decides product, priorities, approves proposals and specs |
| Orchestrator | Claude (main session) | Coordinates teams, mediates dependencies, consolidates proposals, escalates questions to the CEO |
| Team Lead Backend | agent `team-lead-backend` | Kotlin backend, external integrations, product AI, backend QA automation |
| Team Lead App | agent `team-lead-app` | Mobile app, app QA automation |
| Team Lead DevOps | agent `team-lead-devops` | AWS, Terraform, pipelines, databases, monitoring, security |

AI sessions **have no memory between runs**. Therefore: **the repository is the company's memory.** Every decision, every bit of progress, every piece of work-in-flight state becomes a versioned file. If it isn't committed, it didn't happen.

## Founding decisions (by the CEO)

- **Scope to production**: the complete product — all prototype screens, working end to end.
- **Third-party integrations**: v1 ships with native health platforms only (Apple Health + Health Connect). Garmin, Strava and Flo come in v2.
- **Backend stack**: Kotlin. **Infra**: AWS, 100% Terraform.
- **App stack**: chosen by the app team's kickoff proposal. Selection criteria, in order: UI fluidity, animation fidelity to the prototype, future-proofing for new features. Implementation language is irrelevant (AI writes all code).
- **Language**: all documentation and code in English.

## Monorepo structure

```
vita/
├── DEVELOPMENT_PROCESS.md      # this file
├── .claude/agents/             # team lead agent definitions
├── docs/                       # cross-team docs (product brief, prototype, contracts)
├── backend/
├── app/
└── devops/
```

Every team folder follows the same internal structure:

```
<team>/
├── Backlog/                    # tickets to do — one .md file per ticket
│   ├── Wip/                    # tickets in progress
│   └── Done/                   # completed tickets
├── Progress/                   # [ticket-xx]-Progress.md — work journal per ticket
├── Next_session.md             # team state: what the next session needs to know
├── Doc/
│   ├── ADRs/                   # architecture decision records (numbered, immutable)
│   └── ...                     # general team docs
└── services/                   # the team's service/app code
```

### Ticket conventions

- File name: `[BE|APP|OPS]-NNN-short-title.md` (e.g. `BE-001-auth-magic-link.md`).
- Minimum content: goal, acceptance criteria, dependencies on other teams, definition of done.
- Lifecycle: `Backlog/` → `Backlog/Wip/` (moved via `git mv`) → `Backlog/Done/`.
- Every ticket in Wip has a matching `Progress/[ticket]-Progress.md`, updated on every work session.

## The cycle of a work session

1. **Read context**: `DEVELOPMENT_PROCESS.md` → `<team>/Next_session.md` → the ticket at hand.
2. **Work**: implement, test, document. Architectural decisions become ADRs on the spot.
3. **Close**: update the ticket's `Progress/` file, update `Next_session.md`, commit everything with messages `<team>: <summary>` (e.g. `backend: BE-001 magic link endpoint`).

Rules for agents:

- **Never invent a product decision.** Product doubts become recorded questions, escalated via the orchestrator → CEO.
- **Cross-team contracts are sacred**: APIs between backend and app are specified (OpenAPI) in `docs/contracts/` BEFORE either side implements. Contract changes require an ADR and notifying the other team.
- **QA automation is part of each team**, not a separate phase: no ticket reaches Done without automated tests passing.
- Small, frequent commits. The CEO reviews by diffs.

## Project phases

| Phase | Goal | Output |
|---|---|---|
| **0 — Kickoff** (current) | Each team lead analyzes the product and proposes their plan from zero to production | `<team>/Doc/kickoff-proposal.md` per team, reviewed by the CEO |
| **1 — Specification** | Approved proposals become detailed specs and Backlog tickets | Specs in `<team>/Doc/`, contracts in `docs/contracts/`, populated Backlogs |
| **2 — Implementation** | Teams execute tickets in vertical slices that always integrate | Working, tested software in staging |
| **3 — Production** | Go-live: full pipeline, observability, security review | Vita in production |

Each phase only starts with explicit CEO approval of the previous one.

## Global definition of done (DoD)

A ticket only moves to `Done/` when:

1. Code implemented and reviewed (agent code review);
2. Automated tests written and passing (unit + integration; E2E where applicable);
3. Team documentation updated (ADRs, service docs);
4. `Progress/` and `Next_session.md` updated;
5. Everything committed.
