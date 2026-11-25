export {
  isNormalizeStrategy,
  normalizeDocNumber,
  normalizeEmail,
  NORMALIZE_STRATEGIES,
} from "./lib/normalize";
export {
  MISSING_PARTICIPANT_IDENTITY,
  parseParticipantIdentity,
  repeatedEmailMessage,
} from "./lib/participant-identity";
export type { IdentityDocument, IdentityIssue, ParticipantIdentity, ParticipantIdentityInput } from "./lib/participant-identity";
export type { NormalizeStrategy } from "./lib/normalize";
export {
  createPermalinkSlug,
  isPermalinkSlug,
  PERMALINK_SLUG_LENGTH,
  SLUG_GENERATION_ATTEMPTS,
} from "./lib/slug";
export {
  MAX_PARTICIPANT_CSV_ROWS,
  parseParticipantCsv,
  parseSemicolonRecords,
  PARTICIPANT_CSV_HEADERS,
  participantCsvTemplate,
} from "./csv/parse-participants";
export type { CsvIssue, ParticipantCsvHeader, ParticipantCsvRow } from "./csv/parse-participants";
export {
  parsePregeneratedCsv,
  PREGENERATED_CSV_HEADERS,
  pregeneratedCsvTemplate,
} from "./csv/parse-pregenerated";
export type { PregeneratedCsvHeader, PregeneratedCsvRow } from "./csv/parse-pregenerated";
export {
  CERTIFICATE_CANVAS,
  isLegalField,
  layoutHasLegal,
  minimalCertificateLayout,
  parseCertificateLayout,
} from "./lib/layout";
export type { CertificateLayout, LayoutLayer, QrLayer, TextLayer } from "./lib/layout";
export { buildTemplatePackage, parseTemplatePackage, TEMPLATE_SCHEMA_VERSION } from "./lib/template-package";
export type { TemplatePackageIssue, TemplatePackageMeta } from "./lib/template-package";
