export function maskDocument(docType: string | null | undefined, docNumber: string | null | undefined): string | null {
  const type = docType?.trim() ?? "";
  const digits = (docNumber ?? "").replace(/\D/g, "");
  if (!type || !digits) {
    return null;
  }
  const visible = digits.length < 5 ? 1 : 4;
  const masked = `${"*".repeat(digits.length - visible)}${digits.slice(-visible)}`;
  return `${type} ${masked}`;
}
