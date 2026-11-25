import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

export function certificateFontFaceCss(): string {
  if (cached) {
    return cached;
  }
  const dir = path.resolve(__dirname, "../../assets/fonts");
  try {
    const regular = readFileSync(path.join(dir, "LiberationSans-Regular.ttf")).toString("base64");
    const bold = readFileSync(path.join(dir, "LiberationSans-Bold.ttf")).toString("base64");
    cached = [
      `@font-face{font-family:"Liberation Sans";src:url(data:font/ttf;base64,${regular}) format("truetype");font-weight:400;}`,
      `@font-face{font-family:"Liberation Sans";src:url(data:font/ttf;base64,${bold}) format("truetype");font-weight:700;}`,
    ].join("");
    return cached;
  } catch {
    throw new Error("PDF_FONT_MISSING");
  }
}
