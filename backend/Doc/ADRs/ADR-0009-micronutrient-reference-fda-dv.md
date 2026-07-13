# ADR-0009 — Micronutrient daily-reference set: FDA Daily Values

**Status:** Accepted — 2026-07-13 (CEO default, Round 3 #10)

## Context

Meal estimates include micronutrients with a "% of daily reference" label. Some reference set must anchor the percentage; candidates included FDA Daily Values and EFSA DRVs. Purely a labeling/source choice, but it must be deliberate and consistent.

## Decision

**FDA Daily Values** are the reference set for all "% daily reference" figures, in AI parse prompts, stored estimates, and export PDFs. The reference-set name travels with the label (the product shows estimates as estimates; the reference is part of that honesty).

## Consequences

- One constant table in the nutrition preamble of the parse prompt (prompt-cached, ADR-0005); no per-user or per-region variation in v1.
- Not personalized advice: percentages are generic labeling, consistent with the no-advice philosophy.
- If EU labeling rules ever demand EFSA values for EU users, that is a config-level reference-set swap plus a re-run of the AI eval set — no schema change.
