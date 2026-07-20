# OPS-022 — Grant task role KMS on uploads CMK (unblock PDF import)

Asana: https://app.asana.com/0/1216519867368584/1216725786063191 (Done, 2026-07-20)
Related: APP-060 (app PDF plan import), BE-015/BE-026 (presigned uploads).

## Symptom (reported by app team, live prod)
S3 presigned PUT to `vita-prod-uploads-201261380352` → 403 AccessDenied. Blocks PDF plan import.

## Root cause
- Uploads bucket default SSE = `aws:kms` with the **storage CMK** `075c7c59-ebae-4806-a1a8-01e7671e29a8`
  (alias `vita-storage`), BucketKeyEnabled.
- Presigned PUTs execute with the **signing principal's** permissions — the signer is the ECS task role
  `vita-ecs-task` (S3FileStore uses the task-role creds via the default provider chain).
- The task role inline policy had `s3:PutObject/GetObject/DeleteObject/ListBucket` + SSM + SES + APS,
  but **no KMS action on the storage key**. SSE-KMS PUT needs `kms:GenerateDataKey` by the caller → 403.

## Fix (Terraform, policy-only, zero new resources)
`devops/services/terraform/modules/ecs/main.tf` — added to `data.aws_iam_policy_document.task`:

    statement {
      sid       = "S3SseKmsStorageKey"
      actions   = ["kms:GenerateDataKey", "kms:Encrypt", "kms:Decrypt"]
      resources = [var.storage_key_arn]
    }

- `GenerateDataKey` → the presigned PUT (encrypt object).
- `Decrypt` → `S3FileStore.read()` GETs the object back for the one parse call (same task role).
- Scoped to the storage CMK ARN only. The storage key policy already grants `kms:*` to account root
  (enables IAM grants), so no key-policy edit — the role-side grant suffices. `var.storage_key_arn`
  was already wired into the ecs module.
- `terraform plan` = **0 add, 1 change, 0 destroy** (in-place update of inline policy `vita-ecs-task`).
  Applied 2026-07-20.

## Verification (live prod, end-to-end — not a simulation)
1. `POST /v1/auth/magic-link` → fished token from `/ecs/vita` CloudWatch → `POST /v1/auth/magic-link/verify` → JWT.
2. `POST /v1/uploads {purpose:plan_document, contentType:application/pdf}` → presigned PUT URL, signed by
   task-role STS session (`ASIAS5XA46MA...`).
3. `curl -X PUT <url> -H 'Content-Type: application/pdf' --data-binary @test.pdf` → **HTTP 200** (was 403).
4. `head-object` → `ServerSideEncryption=aws:kms`, `SSEKMSKeyId=...075c7c59...` → GenerateDataKey ran as task role.
5. `iam simulate-principal-policy` on vita-ecs-task: GenerateDataKey/Decrypt/Encrypt on storage key +
   PutObject/GetObject on bucket → all `allowed`.
6. Test object deleted afterward.

No task restart required — IAM policy evaluation is at request time; the running task picked up the
grant immediately.

## Cost
No new resources. Zero cost delta.
