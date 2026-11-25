import { publicDocument, type PublicChrome } from "./public-chrome";

export function privacyPage(noticeHtml: string, chrome: PublicChrome): string {
  return publicDocument({ title: `${chrome.siteName}: datos personales`, chrome, main: noticeHtml });
}
