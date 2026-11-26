export const IMPORTER_CODES = [
  "ZIP_PATH",
  "ZIP_DUPLICATE",
  "ZIP_UNSUPPORTED",
  "ZIP_BOMB",
  "ZIP_FILE_MISSING",
  "ZIP_FILE_UNEXPECTED",
] as const;

export type ImporterCode = (typeof IMPORTER_CODES)[number];

export function importerMessage(code: string, value?: string): string {
  const name = value && value.length > 0 ? value : "";
  switch (code) {
    case "ZIP_FILE_MISSING":
      return name ? `El archivo ${name} está en la hoja, pero no en el ZIP` : "El archivo está en la hoja, pero no en el ZIP";
    case "ZIP_FILE_UNEXPECTED":
      return name ? `El archivo ${name} está en el ZIP, pero no en la hoja` : "El archivo está en el ZIP, pero no en la hoja";
    case "ZIP_PATH":
      return "El ZIP incluye una ruta no permitida.";
    case "ZIP_DUPLICATE":
      return name ? `El archivo ${name} está repetido.` : "Hay un archivo repetido.";
    case "ZIP_UNSUPPORTED":
      return name ? `El archivo ${name} no se puede abrir.` : "El archivo no es un ZIP admitido.";
    case "ZIP_BOMB":
      return "El ZIP es demasiado grande para abrirlo.";
    default:
      return code;
  }
}
