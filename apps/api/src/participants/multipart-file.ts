/** Pull the CSV file out of a single-file multipart body. */
export function extractCsvPart(
  body: Buffer,
  contentType: string,
): { ok: true; filename: string; bytes: Buffer } | { ok: false; message: string } {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  if (!boundary) {
    return { ok: false, message: "El formulario no trae el límite del archivo." };
  }
  const source = body.toString("latin1");
  for (const part of source.split(`--${boundary}`)) {
    if (part.startsWith("--") || part.trim().length === 0) {
      continue;
    }
    let chunk = part.startsWith("\r\n") ? part.slice(2) : part.startsWith("\n") ? part.slice(1) : part;
    if (chunk.endsWith("\r\n")) {
      chunk = chunk.slice(0, -2);
    } else if (chunk.endsWith("\n")) {
      chunk = chunk.slice(0, -1);
    }
    const splitAt = chunk.indexOf("\r\n\r\n") >= 0 ? chunk.indexOf("\r\n\r\n") : chunk.indexOf("\n\n");
    if (splitAt < 0) {
      continue;
    }
    const headerLength = chunk.startsWith(chunk.slice(0, splitAt)) && chunk.indexOf("\r\n\r\n") === splitAt ? 4 : 2;
    const headers = chunk.slice(0, splitAt);
    if (!/content-disposition:/i.test(headers)) {
      continue;
    }
    const disposition = /content-disposition:([^\n]+)/i.exec(headers)?.[1] ?? "";
    const named = /name="file"/i.test(disposition) || /name=file(?:;|$)/i.test(disposition) || /filename=/i.test(disposition);
    if (!named) {
      continue;
    }
    const filename =
      /filename="([^"]*)"/i.exec(disposition)?.[1] ??
      /filename=([^;\s]+)/i.exec(disposition)?.[1] ??
      "participantes.csv";
    return { ok: true, filename, bytes: Buffer.from(chunk.slice(splitAt + headerLength), "latin1") };
  }
  return { ok: false, message: "El formulario no incluye el archivo CSV." };
}

/** Basename only. A path or parent segment is rejected before the file is stored in the audit row. */
export function csvBasename(filename: string): string | null {
  const trimmed = filename.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    return null;
  }
  if (/[/\\]|\.\.|\u0000/.test(trimmed)) {
    return null;
  }
  return trimmed;
}
