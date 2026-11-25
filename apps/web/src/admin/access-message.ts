export function accessMessage(input: { osmUsername: string; contactEmail: string; reason: "role" | "inactive" | "section" }): string {
  const contact = input.contactEmail ? ` Escribe a ${input.contactEmail}.` : "";
  if (input.reason === "inactive") {
    return `Iniciaste sesión como ${input.osmUsername}, pero esta cuenta está desactivada.${contact}`;
  }
  if (input.reason === "section") {
    return `Iniciaste sesión como ${input.osmUsername}, pero tu rol no puede ver esta sección.${contact}`;
  }
  return `Iniciaste sesión como ${input.osmUsername}, pero tu cuenta todavía no tiene permisos en este panel. Pide a un administrador que te asigne un rol.${contact}`;
}
