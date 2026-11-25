const DEFAULT_PREVIEW_BOTS =
  /LinkedInBot|WhatsApp|Slackbot|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Discordbot|SkypeUriPreview/i;

export function isPreviewBot(userAgent: string | undefined, configured: string): boolean {
  const source = configured.trim();
  if (!source) {
    return DEFAULT_PREVIEW_BOTS.test(userAgent ?? "");
  }
  return new RegExp(source, "i").test(userAgent ?? "");
}
