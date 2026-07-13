# OPS-009 — RDS PostgreSQL t4g.micro

Asana: https://app.asana.com/0/1216519867368584/1216519895577916 (OPS-009)
Model: Opus 4.8 · ADR-0006 (amended) · Status: In progress (applied; verifying)

## APPLIED + verified read-only 2026-07-13
Endpoint `vita.c10cyc6g8s2h.eu-west-1.rds.amazonaws.com`. CLI-verified:
`StorageEncrypted=true` (storage CMK), `PubliclyAccessible=false`,
`DeletionProtection=true`, `BackupRetentionPeriod=14` (PITR), `MultiAZ=false`,
`rds.force_ssl=1`, db SG ingress = 5432 from the app SG (sg-0642c4529d86f52cb) only
(no CIDR). AWS Backup: rule `daily-45d` → vault `vita`, `DeleteAfter=45`.
Parameter-group `apply_method=pending-reboot` pinned (killed a perpetual-diff churn).

## Remaining for Done
- First scheduled backup (cron 05:00) must land in the vault — verify tomorrow.
- CEO sets the real RDS master password in console + matching `/vita/prod/db-credentials`.
- Standing quarterly restore-rehearsal ticket **created: OPS-017**.

## Built (session 3, 2026-07-13)
`modules/rds/main.tf`, wired as `module.rds` in prod-eu (db subnets + db SG + storage CMK).
- `aws_db_instance.vita`: postgres 16, db.t4g.micro, single-AZ, 20 GB gp3,
  `storage_encrypted` (storage CMK), `publicly_accessible=false`, in the private DB
  subnets, db SG only (5432 from app SG). `deletion_protection=true`,
  `prevent_destroy`, `final_snapshot_identifier=vita-final`.
- `aws_db_parameter_group` (postgres16): `rds.force_ssl=1` — non-TLS rejected.
- **Backups**: RDS automated PITR = 14 d; **45-day retention via AWS Backup** vault
  (`vita`, KMS storage CMK) + daily plan `delete_after=45` + backup service role +
  selection of the RDS instance.

## Decisions / flags surfaced (need CEO/backend confirm)
1. **45 d needs AWS Backup, not RDS.** RDS automated `backup_retention_period` caps
   at 35 d. So 45 d lives in the AWS Backup vault; RDS PITR is 14 d. ADR-0006 amended.
2. **Cross-account vault copy DEFERRED** — single account (ADR-0010), no target vault.
   The ticket's "copy to management-account vault" can't be done until an org exists.
3. **Master password**: Terraform sets a placeholder with `ignore_changes=[password]`
   (never holds the real password in state). After apply the CEO sets the real RDS
   password in the console AND pastes the same value into `/vita/prod/db-credentials`
   (OPS-010) — the app reads creds from SSM (task role is SSM-only). Confirm this
   sync flow with backend, or switch to RDS-managed password if backend can read
   Secrets Manager instead.

## Plan
Part of the prod-eu batch: 27 to add total (RDS module = 8). Not applied.

## Remaining for Done
Apply; verify reachable only from app SG on 5432, non-SSL rejected, a backup lands
in the vault. Create the quarterly restore-rehearsal standing ticket (backlog).
