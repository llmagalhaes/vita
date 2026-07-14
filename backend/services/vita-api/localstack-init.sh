#!/bin/sh
# LocalStack init hook (OPS-020). Runs once S3 + KMS are ready inside the
# container, where awslocal is preinstalled. Creates the bucket + CMK the
# backend AWS adapters test against: BE-026 (real S3 FileStore presigner)
# and BE-027 (real KMS KeyWrapper). Not Terraform — local-only fixture.
set -eu

BUCKET=vita-uploads-local
ALIAS=alias/vita-app-data

awslocal s3 mb "s3://$BUCKET" 2>/dev/null || echo "bucket $BUCKET already exists"

if awslocal kms list-aliases --query "Aliases[?AliasName=='$ALIAS'].AliasName" --output text | grep -q "$ALIAS"; then
  echo "KMS alias $ALIAS already exists"
else
  KEY_ID=$(awslocal kms create-key --description "vita local app-data CMK (BE-027)" --query KeyMetadata.KeyId --output text)
  awslocal kms create-alias --alias-name "$ALIAS" --target-key-id "$KEY_ID"
  echo "created KMS key $KEY_ID as $ALIAS"
fi
