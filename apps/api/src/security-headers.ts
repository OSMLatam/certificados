import helmet from "helmet";

export const securityHeaderOptions = {
  contentSecurityPolicy: {
    reportOnly: true,
    useDefaults: true,
    directives: {
      "frame-ancestors": ["'none'"],
    },
  },
  frameguard: { action: "deny" as const },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" as const },
  hsts: { maxAge: 15_552_000, includeSubDomains: true },
  crossOriginEmbedderPolicy: false,
};

export function securityHeaders() {
  return helmet(securityHeaderOptions);
}
