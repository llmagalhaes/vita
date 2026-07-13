# OPS-006 · KMS keys (storage + app-data CMKs) — Progress

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216517969564554 · Status: **In progress** (code done, apply pending)

## 2026-07-13

- Written: `modules/kms/` — two CMKs, rotation on, 30 d deletion window, `prevent_destroy`, aliases `alias/vita-storage` and `alias/vita-app-data`.
- Storage key policy: account admin + CloudWatch Logs service (scoped to this account's log groups via encryption-context condition) + CloudTrail (scoped via `aws:SourceArn` to this account's trails) — all ARNs composed from data sources.
- App-data key: admin + a `var.app_data_key_user_role_arns` usage statement (Decrypt/GenerateDataKey only) that OPS-014 fills with the ECS task role ARN. Honest note in code: account root keeps `kms:*` (removing it bricks the key); usage separation holds because no other IAM identity exists.

Remaining for Done: apply (runbook step 3); task-role-only usage verification once OPS-014 exists.
