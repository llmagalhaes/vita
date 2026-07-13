# ADR-0003 — Two-account AWS organization

**Status**: Accepted 2026-07-13

## Context

The kickoff's 4-account org isolated dev/staging/prod. With one environment (ADR-0001) that collapses — but a single account would put backups and workload behind the same credentials, so ransomware or a compromised key could delete both.

## Decision

AWS Organization with **2 accounts** (accounts are free):

| Account | Holds |
|---|---|
| `management` | Org root, consolidated billing, budgets, **cross-account backup vault copy** |
| `prod` | The workload |

Humans access via IAM Identity Center SSO (no IAM users, no long-lived keys); CI via GitHub OIDC roles (ADR-0008).

## Consequences

We keep the one isolation that matters at any scale — backups that survive prod-account compromise — and drop per-env blast radius, which no longer exists as a concept. Backup copy storage ~$1/mo.
