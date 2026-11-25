export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 8000;
const MAX_PIXELS = 20_000_000;

export type ImageInfo = {
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
};

export function inspectImage(
  bytes: Buffer,
  maxBytes = MAX_BACKGROUND_BYTES,
): { ok: true; info: ImageInfo } | { ok: false; message: string } {
  if (bytes.length === 0) {
    return { ok: false, message: "El archivo está vacío." };
  }
  if (bytes.length > maxBytes) {
    return { ok: false, message: `La imagen supera ${Math.round(maxBytes / (1024 * 1024))} MB.` };
  }
  const png = readPng(bytes);
  const jpeg = png ? null : readJpeg(bytes);
  const info = png ?? jpeg;
  if (!info) {
    return { ok: false, message: "El fondo tiene que ser PNG o JPEG." };
  }
  if (info.width < 1 || info.height < 1 || info.width > MAX_SIDE || info.height > MAX_SIDE) {
    return { ok: false, message: "La imagen no puede pasar de 8000 px por lado." };
  }
  if (info.width * info.height > MAX_PIXELS) {
    return { ok: false, message: "La imagen supera 20 megapíxeles." };
  }
  return { ok: true, info };
}

function readPng(bytes: Buffer): ImageInfo | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    return null;
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  return {
    mimeType: "image/png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readJpeg(bytes: Buffer): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }
    if (offset + 1 >= bytes.length) {
      return null;
    }
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) {
      return null;
    }
    if (isStartOfFrame(marker)) {
      return {
        mimeType: "image/jpeg",
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export async function readLimitedStream(
  stream: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<{ ok: true; buffer: Buffer } | { ok: false }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      return { ok: false };
    }
    chunks.push(Buffer.from(chunk));
  }
  return { ok: true, buffer: Buffer.concat(chunks) };
}
