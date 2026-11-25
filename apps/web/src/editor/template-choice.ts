export function rolesWithoutTemplate(roles: readonly string[], templates: readonly { roleCode: string | null }[]): string[] {
  const taken = new Set(templates.flatMap((template) => (template.roleCode ? [template.roleCode] : [])));
  return roles.filter((role) => !taken.has(role));
}

export function templateLabel(template: { name: string; roleCode: string | null }): string {
  return template.roleCode ? `${template.name} (${template.roleCode})` : `${template.name} (general)`;
}
