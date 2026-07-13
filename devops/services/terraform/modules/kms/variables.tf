variable "app_data_key_user_role_arns" {
  description = "IAM role ARNs allowed to USE the app-data CMK (Decrypt/GenerateDataKey). Empty until the ECS task role exists (OPS-014)."
  type        = list(string)
  default     = []
}
