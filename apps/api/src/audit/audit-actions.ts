export const AUDIT_ACTIONS = [
  "user_role_change",
  "user_activation_change",
  "event_status_change",
  "event_soft_delete",
  "participant_csv_import",
  "participant_update",
  "pregenerated_import",
  "certificate_retry_issue",
  "template_export",
  "template_import",
  "certificate_revoke",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
