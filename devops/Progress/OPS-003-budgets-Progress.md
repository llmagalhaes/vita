# OPS-003 · Budgets & billing alarms — Progress

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216521831717641 · Status: **In progress** (code done, apply pending)

## 2026-07-13

- Written: `aws_budgets_budget` in the bootstrap stack — $40/mo, email alerts at 50/80/100% actual + 100% forecast to the CEO.
- Ticket's second (vita-filtered) budget **dropped per ADR-0010**: the account is now dedicated to Vita, so the unfiltered $40 budget IS the vita budget — a filtered twin would alert identically.
- Claude API $10/mo stays a manual Anthropic-console hard limit (setup guide step 3) — not AWS-representable.
- Free-tier caveat flagged to CEO/orchestrator: post-July-2025 accounts get the credit-based free tier ($100 + up to $100), not the legacy 12-month offers — realistic run rate ~$37/mo offset by credits, still under the alarm.

Remaining for Done: runbook step 1 applied; alert email config verified.
