export const AUDIT_ACTIONS = [
  "user_role_change",
  "user_activation_change",
  "event_status_change",
  "event_soft_delete",
  "participant_csv_import",
  "pregenerated_import",
  "certificate_retry_issue",
  "template_export",
  "template_import",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
