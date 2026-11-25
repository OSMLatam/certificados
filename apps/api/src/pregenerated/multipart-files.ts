export type MultipartFile = { filename: string; bytes: Buffer };

/** Reads named file parts from one multipart body. Bytes stay intact. */
export function extractMultipartFiles(
  body: Buffer,
  contentType: string,
): { ok: true; files: Map<string, MultipartFile> } | { ok: false; message: string } {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  if (!boundary) {
    return { ok: false, message: "El formulario no trae el límite del archivo." };
  }
  const files = new Map<string, MultipartFile>();
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
    const headerLength = chunk.indexOf("\r\n\r\n") === splitAt ? 4 : 2;
    const disposition = /content-disposition:([^\n]+)/i.exec(chunk.slice(0, splitAt))?.[1] ?? "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1] ?? /name=([^;\s]+)/i.exec(disposition)?.[1];
    if (!name) {
      continue;
    }
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1] ?? /filename=([^;\s]+)/i.exec(disposition)?.[1] ?? name;
    files.set(name, { filename, bytes: Buffer.from(chunk.slice(splitAt + headerLength), "latin1") });
  }
  return { ok: true, files };
}
