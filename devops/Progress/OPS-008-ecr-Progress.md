# OPS-008 — ECR repository

Asana: https://app.asana.com/0/1216519867368584/1216519895485940 (OPS-008)
Model: Sonnet · Status: DONE (applied + verified in prod 2026-07-13)

## APPLIED + verified 2026-07-13
Part of the CEO-approved 27-resource prod-eu apply. CLI-verified `vita-api` repo:
`scanOnPush=true`, `imageTagMutability=IMMUTABLE`, `encryptionType=KMS`. Repo URL
`201261380352.dkr.ecr.eu-west-1.amazonaws.com/vita-api`. Backend pushes the first
arm64 image via OPS-014/BE-004.

## Built (session 3, 2026-07-13)
`modules/ecr/main.tf`, wired in `envs/prod-eu/main.tf` as `module.ecr`.
- `aws_ecr_repository.vita-api`: IMMUTABLE tags (deploy by git SHA), scan-on-push,
  KMS encryption (storage CMK).
- `aws_ecr_lifecycle_policy`: keep last 10 images (rollback).
- Output `ecr_repository_url` (for backend push + OPS-014).

## Plan
Part of the prod-eu batch plan: **27 to add total, 0 change, 0 destroy** (ECR = 2).
Not applied — CEO approval pending.

## Remaining for Done
Apply via CI path; then backend pushes a linux/arm64 image (OPS-014 / backend CI).
