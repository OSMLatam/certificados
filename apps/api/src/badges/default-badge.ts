/** Instance fallback when SITE_LOGO_URL is empty. Open Badges 2.0 wants a PNG or SVG, not the site home page. */
export const DEFAULT_BADGE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Insignia">
  <rect width="256" height="256" rx="28" fill="#0b3d0b"/>
  <circle cx="128" cy="108" r="62" fill="#f4f7f4"/>
  <path d="M86 108l16 16 36-40" fill="none" stroke="#0b3d0b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M64 168h128l-16 48H80z" fill="#d7e4d7"/>
  <path d="M96 168l32 28 32-28" fill="none" stroke="#0b3d0b" stroke-width="6"/>
</svg>
`;

export function badgeImageUrl(baseUrl: string, logoUrl: string): string {
  const logo = logoUrl.trim();
  if (logo) {
    return logo;
  }
  return `${baseUrl.replace(/\/$/, "")}/badges/default.svg`;
}
