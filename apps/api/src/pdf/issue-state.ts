export function nextIssueState(
  currentAttempts: number,
  maxAttempts: number,
): { issueAttempts: number; status: "pending" | "failed" } {
  const issueAttempts = currentAttempts + 1;
  return {
    issueAttempts,
    status: issueAttempts >= maxAttempts ? "failed" : "pending",
  };
}

export function issueErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/timeout/i.test(message)) {
    return "PDF_TIMEOUT";
  }
  if (/PREGENERATED_FILE_MISSING|TEMPLATE_MISSING|PDF_FONT_MISSING/.test(message)) {
    return message;
  }
  return "PDF_RENDER";
}
