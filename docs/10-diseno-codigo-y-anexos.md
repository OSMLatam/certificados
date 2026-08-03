# Diseño de código y anexos de implementación

**Versión:** 1.0  
**Fecha:** 2026-06-06  
**Propósito:** Plasmar la **arquitectura del código**, convenciones, variables de entorno, health checks y archivos de ejemplo. Complementa [09-plan-de-implementacion.md](./09-plan-de-implementacion.md).

---

## 1. Arquitectura general

```text
┌─────────────────────────────────────────────────────────────┐
│  apps/web (React + Vite)                                     │
│  ├─ /admin/*          Panel editor/admin (sesión cookie)     │
│  ├─ /c/:slug          Certificado público                    │
│  ├─ /b/:slug          Badge público (Fase 2+)                │
│  └─ /                 Búsqueda pública                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP /api/v1 (proxy en prod)
┌───────────────────────────▼─────────────────────────────────┐
│  apps/api (NestJS)                                           │
│  Controllers → Services → Prisma / Storage / Queue           │
└───────┬─────────────┬──────────────┬────────────────────────┘
        │             │              │
   PostgreSQL      MinIO          Redis (BullMQ, Fase 3+)
```

**Principios:**

1. **Dominio en servicios**, no en controllers.
2. **Validación de entrada** en DTOs (`class-validator`) + schemas Zod en `packages/shared` para contratos compartidos.
3. **Un módulo Nest por agregado** (events, certificates, badges…).
4. **Sin lógica de instancia hardcodeada** — feature flags vía `INSTANCE` y config ENV.
5. **Side effects explícitos:** PDF → storage; emisión → snapshot legal; issued → badge (Fase 2).
6. **Servidores compartidos:** rate limit en lo público, PDF con concurrencia acotada, sin regenerar `issued` (§10).

---

## 2. Estructura del monorepo

```text
certificados/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # lint, test, build
│       └── docker-publish.yml     # optional: push image
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts            # country CO, roles (admin via OAuth seed ENV)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/            # ConfigModule, env validation (Zod)
│   │   │   ├── common/            # guards, filters, interceptors, pipes
│   │   │   ├── health/            # GET /health, /ready
│   │   │   ├── auth/
│   │   │   ├── events/
│   │   │   ├── venues/
│   │   │   ├── participants/
│   │   │   ├── certificates/
│   │   │   ├── templates/         # certificate_templates + layout
│   │   │   ├── public/            # search, verify pages API
│   │   │   ├── storage/           # MinIO wrapper
│   │   │   ├── pdf/               # Puppeteer render
│   │   │   ├── badges/            # Fase 2+
│   │   │   ├── legal/             # Fase 2 — AC3 config reader
│   │   │   ├── osm/               # Fase 3 — profiles, métricas por fuente
│   │   │   └── jobs/              # Fase 3 — BullMQ processors
│   │   ├── test/
│   │   │   ├── app.e2e-spec.ts
│   │   │   └── helpers/           # factories, db reset
│   │   └── openapi.yaml           # generado/mantenido Fase 1
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/               # router
│       │   ├── features/
│       │   │   ├── admin/         # eventos, participantes, plantillas
│       │   │   ├── editor/        # react-konva template editor
│       │   │   ├── public/        # search, certificate page
│       │   │   └── badges/        # Fase 2+
│       │   ├── components/ui/     # shadcn
│       │   ├── lib/api.ts         # fetch wrapper, credentials include
│       │   └── hooks/
│       └── index.html
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── schemas/           # Zod: search, csv row, layout layer
│       │   ├── types/             # CertificateStatus, EventStatus…
│       │   ├── constants/         # roles, field tokens
│       │   └── csv/               # parser participantes
│       └── package.json
├── docs/
│   └── anexos/                    # CSV ejemplos, seed YAML (`.env.example` canónico = raíz del repo)
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   └── nginx.conf                 # prod: static + proxy /api
├── docker-compose.yml
├── docker-compose.test.yml
├── pnpm-workspace.yaml
├── package.json
├── .env.example                   # canónico en la **raíz** del repo
├── CONTRIBUTING.md
└── README.md
```

---

## 3. Módulos NestJS (por fase)

### Fase 1

| Módulo | Responsabilidad |
|--------|-----------------|
| `config` | Carga ENV, validación Zod al boot |
| `health` | Liveness/readiness |
| `auth` | Login, logout, session guard (tabla `admin_sessions`), roles |
| `events` | CRUD eventos `draft`/`active` |
| `venues` | Sedes por evento |
| `participants` | Alta individual + UNIQUE email por evento |
| `templates` | Plantillas, layout JSONB, fondo → `stored_files` |
| `certificates` | Slug, estados, pregenerados, emisión con lock |
| `pdf` | HTML template → Puppeteer → buffer |
| `storage` | Upload/download MinIO |
| `public` | `POST /public/search`, metadata `/public/certificates/:slug`, `/file` |
| `import` | CSV participantes |

### Fase 2 (añadir)

| Módulo | Responsabilidad |
|--------|-----------------|
| `badges` | Issuer, BadgeClass, assertions, `/b/` |
| `legal` | `instance_legal` CRUD + bootstrap ENV; `legal_snapshot` |
| `revocation` | Sub-módulo de `certificates` + `badges` (no paquete aparte) |

### Fase 3 (añadir)

| Módulo | Responsabilidad |
|--------|-----------------|
| `osm` | Profiles, API user lookup, clientes por métrica ([06 §5.1](./06-open-badges.md)) |
| `jobs` | BullMQ: sync rules, scheduled cron |

---

## 4. Capas y convenciones

### 4.1. Naming

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Tablas BD | `snake_case`; plural en colecciones; singular OK en config/log singleton | `certificates`, `instance_legal` |
| Prisma models | PascalCase | `CertificateTemplate` |
| API routes | kebab o recurso plural | `/api/v1/admin/events` |
| DTOs | Suffix `Dto` | `CreateEventDto` |
| Servicios | Suffix `Service` | `CertificatesService` |
| Estados / enums BD | inglés | `pending`, `issued`, `generated`, `pregenerated` |
| Commits | Conventional Commits | `feat(certificates): emit on first visit` |

### 4.2. Flujo típico — emisión certificado

```text
GET /api/v1/public/certificates/:slug          # metadata + lazy issue (si no crawler)
  → CertificatesService.resolvePublic(slug, { isCrawler })
       → si pending && !isCrawler: transitionToIssued()  # lock por certificate_id
            → PdfService.render(...)
            → StorageService.put(pdf)
            → update { stored_file_id, legal_snapshot?, issued_at, status=issued }
            → si PDF falla: queda pending; HTTP 503; reintento en siguiente visita
       → si pending && isCrawler: devolver metadata/OG sin emitir
       → si issued: leer stored_file metadata
GET /api/v1/public/certificates/:slug/file     # binario PDF/imagen
  → si pending: HTTP 409 (no emite; el cliente debe llamar metadata primero)
  → si issued: stream desde MinIO (Content-Disposition: inline | attachment según ?download=1)
  → si revoked: 404 o 410 según OpenAPI

SPA GET /c/:slug  → CertificatePublicPage (HTML verify)
  → llama API metadata; si issued, enlace/iframe a /file
  → búsqueda: mismo orden (metadata → luego /file si aplica)
```

**Contrato de superficies (cerrado):**

| Superficie | Ruta | Responsabilidad |
|------------|------|-----------------|
| HTML verify | `/c/{slug}` (web) | Página humana; llama metadata; no regenera PDF |
| Metadata JSON | `GET /api/v1/public/certificates/{slug}` | **Único** disparador de lazy issue (excepto crawlers) |
| Binario | `GET /api/v1/public/certificates/{slug}/file` | Stream desde storage; **409 si pending** |
| Descarga forzada | mismo `/file?download=1` | `Content-Disposition: attachment` |
| Crawler / OG | misma metadata | Respuesta sin `transitionToIssued` |

### 4.2.1. Emisión concurrente (cerrado)

Dos `GET` simultáneos a un certificado `pending` **no** deben lanzar dos Puppeteer:

1. `SELECT … FOR UPDATE` (o advisory lock por `certificate_id`) dentro de la transición.
2. El segundo request espera el lock; si ya está `issued`, sirve el archivo.
3. `PDF_CONCURRENCY` limita Chromium **globales** de la instancia; el lock es **por certificado**.

### 4.3. Formato de errores API

JSON uniforme:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [{ "field": "doc_number", "message": "Invalid format for CC" }]
}
```

Búsqueda sin resultados: **200** con `{ "items": [] }` y mensaje genérico en UI (no 404).

### 4.4. Paginación admin (listados)

```json
{ "items": [], "meta": { "page": 1, "pageSize": 20, "total": 0 } }
```

---

## 5. Frontend — rutas

| Ruta | Fase | Componente |
|------|------|------------|
| `/` | 1 | `PublicSearchPage` (+ texto corto de ayuda) |
| `/help` | 1 | `PublicHelpPage` (opcional; puede ser ancla en `/`) |
| `/about` | 1 | `AboutPage` (atribución software — [05 §10](./05-personalizacion-multi-instancia.md#10-atribución-del-software-multi-instancia)) |
| `/c/:slug` | 1 | `CertificatePublicPage` |
| `/admin/login` | 1 | `AdminLoginPage` (botón OAuth OSM; sin form password) |
| `/admin` | 1 | `AdminDashboardPage` (**F1:** conteos básicos eventos/participantes/certificados pending\|issued; **F2+:** + badges, legal, revocaciones — HU-7.2) |
| `/admin/users` | 1 | `AdminUsersPage` (solo rol `admin`; HU-7.4) |
| `/admin/events` | 1 | `EventsListPage` |
| `/admin/events/:id` | 1 | `EventDetailPage` (participantes, plantillas) |
| `/admin/events/:id/template` | 1 | `TemplateEditorPage` (Konva) |
| `/b/:slug` | 2 | `BadgePublicPage` |
| `/me` | 3 | `MapperMePage` (OAuth público + vínculo email + vista unificada; osm.lat) |
| `/admin/badges` | 3 | `BadgesAdminPage` |

**API client:** `fetch` con `credentials: 'include'` (cookie admin o mapper según ruta).

---

## 6. `packages/shared`

Contenido mínimo compartido:

```text
shared/src/
├── types/
│   ├── certificate.ts      # CertificateStatus, CertificateMode
│   ├── event.ts            # EventStatus
│   └── layout.ts           # TemplateLayer, FieldToken
├── schemas/
│   ├── public-search.ts    # Zod: email XOR document
│   ├── participant-csv.ts  # fila CSV
│   └── layout.ts           # validación layout JSONB
├── constants/
│   ├── field-tokens.ts     # catálogo canónico: full_name, certificate_slug, permalink_qr, legal.nit, …
│   └── instance.ts         # InstanceId enum
├── lib/
│   └── normalize.ts        # email trim+lower; doc_number (strip + dígitos CO)
└── csv/
    └── parse-participants.ts
```

---

## 7. Variables de entorno

Plantilla completa: [`.env.example`](../.env.example) en la **raíz** del repositorio.

| Grupo | Variables clave | Fase |
|-------|-----------------|------|
| Instancia | `INSTANCE`, `PUBLIC_BASE_URL` | 1 |
| BD | `DATABASE_URL` | 1 |
| Storage | `STORAGE_*` | 1 |
| Auth | `SESSION_*` (`SESSION_COOKIE_NAME=cert_session`), store en Postgres (`admin_sessions`), `OSM_OAUTH_*`, `SEED_ADMIN_OSM_*` | 1 |
| Auth mapper (osm.lat) | `MAPPER_SESSION_COOKIE_NAME=cert_mapper_session`, `OSM_OAUTH_PUBLIC_REDIRECT_URI`, tablas `mapper_sessions` / `osm_email_link_codes` | 3 |
| Branding | `SITE_NAME`, `SITE_LOGO_URL`, `SITE_FOOTER_TEXT` | 1 |
| Software (atribución) | `SOFTWARE_NAME`, `SOFTWARE_REPO_URL`, `SOFTWARE_CREDIT_ENABLED`, `SOFTWARE_CREDIT_TEXT` | 1 |
| Rate limit / abuso | `THROTTLE_SEARCH_*`, `THROTTLE_PERMALINK_*`, `BLOCKED_BOT_UA_REGEX`, `PREVIEW_BOT_UA_REGEX` | 1 |
| PDF / carga | `PDF_CONCURRENCY`, `PDF_TIMEOUT_MS` | 1 |
| Logging | `LOG_LEVEL`, `LOG_REDACT_IP` | 1 |
| Legal AC3 | Tabla `instance_legal` + bootstrap `LEGAL_*` opcional | 2 |
| Open Badges | `OB_ISSUER_*` | 2 |
| OSM API | `OSM_API_*` (fuentes por métrica en [06 §5.1](./06-open-badges.md)) | 3 |
| Turnstile | `TURNSTILE_*` | 3 |
| SMTP | `SMTP_*` (From dedicado; obligatorio osm.lat F3) | 3 |

**Validación al arranque:** `apps/api/src/config/env.schema.ts` (Zod) — falla fast si falta `DATABASE_URL`, `SESSION_SECRET` o `OSM_OAUTH_CLIENT_ID` / `OSM_OAUTH_CLIENT_SECRET`.

---

## 8. Health checks y observabilidad

### Endpoints (Fase 1)

| Ruta | Tipo | Comprueba | Uso |
|------|------|-----------|-----|
| `GET /health` | Liveness | Proceso vivo | Docker `healthcheck` |
| `GET /ready` | Readiness | PostgreSQL + MinIO ping (+ Redis si Fase 3) | Tráfico / deploy |

Respuesta ejemplo:

```json
{
  "status": "ok",
  "checks": {
    "database": "up",
    "storage": "up"
  },
  "instance": "osm_lat",
  "software": {
    "name": "certificados",
    "version": "1.0.0",
    "repository": "https://github.com/OSMLatam/certificados"
  }
}
```

- `version` del producto vive en `software.version` (no duplicar en la raíz).
- `redis` en `/ready` solo si el despliegue incluye Fase 3 (BullMQ); en F1/F2 omitir.
- `instance` = despliegue (`INSTANCE`); `software` = producto/código. Política: [05 §10](./05-personalizacion-multi-instancia.md#10-atribución-del-software-multi-instancia).
- Si BD caída → `503` en `/ready`, `200` en `/health`.

### Logging

- **NestJS** `Logger` estructurado (JSON en producción).
- **`audit_log`:** acciones admin (crear evento, revocar, import CSV).
- **`permalink_access_log`:** accesos a `/c/` (sin IP completa si `LOG_REDACT_IP=true`).
- **No** loguear documentos completos ni contraseñas.

---

## 9. Docker Compose

### Servicios (dev / prod)

| Servicio | Imagen | Puerto |
|----------|--------|--------|
| `postgres` | postgres:16-alpine | 5432 |
| `redis` | redis:7-alpine | 6379 — **perfil/compose Fase 3** |
| `minio` | minio/minio | 9000, 9001 |
| `api` | build `docker/api.Dockerfile` | 3000 |
| `web` | build `docker/web.Dockerfile` | 5173 (dev) / 80 (prod nginx) |

### Perfiles

```bash
# Desarrollo osm.lat
docker compose --profile osm_lat up

# Desarrollo AC3 (Fase 2)
docker compose --profile ac3 up
```

Archivo env por perfil: `.env.osm_lat`, `.env.ac3` (copiar desde [`.env.example`](../.env.example) en la raíz).

### Test CI

`docker-compose.test.yml`: solo PostgreSQL (+ opcional MinIO) para integración.

---

## 10. Seguridad, abuso y protección de carga

Las instancias viven en **servidores comunitarios/institucionales compartidos**. El diseño debe **priorizar protección ante abuso y scraping** y **evitar picos de CPU/RAM/IO** (PDF con Puppeteer, BD, MinIO) que degraden el host u otros servicios.

### 10.1. Defaults de seguridad

| Tema | Decisión |
|------|----------|
| Sesión admin | Cookie `httpOnly`, `Secure` en prod, `SameSite=Lax` |
| CSRF | `SameSite=Lax` en cookie + validar header `Origin` en mutaciones admin POST/PATCH/DELETE |
| CORS | Prod: mismo origen (nginx proxy); dev: `localhost:5173` |
| Headers | `helmet` en NestJS: CSP básico, HSTS en prod |
| Uploads sueltos (fondo, firma, 1:1) | Max **10 MB**; MIME: `image/png`, `image/jpeg`, `application/pdf` |
| Lote pregenerados (CSV + ZIP) | Max **100 MB** total; ZIP MIME `application/zip` (o `application/x-zip-compressed`); entradas internas: png/jpeg/pdf |
| Slug | nanoid 12 chars — no secuencial, no enumerable |
| Secrets | Nunca en repo; `.env` gitignored |

### 10.2. Rate limiting y anti-abuso (Fase 1+)

Usar `@nestjs/throttler` (o equivalente) en **todos** los endpoints públicos costosos. Umbrales por ENV (ajustables por operador).

| Superficie | Límite por defecto | Motivo |
|------------|-------------------|--------|
| `POST /api/v1/public/search` | **10 req/min/IP** (`THROTTLE_SEARCH_*`) | Enumeración de documentos / scraping de titulares |
| `GET /c/{slug}`, descarga PDF, verify | **60 req/min/IP** (`THROTTLE_PERMALINK_*`) | Barrido de slugs + descarga masiva |
| `GET /b/{slug}` y JSON OB (Fase 2+) | Mismo bucket permalink o dedicado | Misma razón |
| Admin autenticado | Sin throttle agresivo; sí auth + CSRF | Panel confiable |

- Respuesta ante exceso: **HTTP 429** + `Retry-After`.
- **Cloudflare Turnstile** en búsqueda: **Fase 3** (o antes si hay abuso real); no sustituye el rate limit.
- **No** exponer APIs públicas de listado por evento, año o sede (HU-1.2b).
- Mensaje de búsqueda **genérico** si no hay resultados (no filtrar existencia de documento).

### 10.3. Bots, scrapers y agentes de IA

Objetivo: reducir crawling automático y uso como fuente de entrenamiento, **sin** romper verificadores humanos ni backpacks OB.

| Medida | Fase | Notas |
|--------|------|-------|
| `robots.txt` en el origen web | **1** | `Disallow` de `/api/`, `/admin/`; permalinks `/c/` y `/b/` **Allow** (verificación legítima). Opcional: `Crawl-delay` si el proxy lo respeta. |
| Meta / headers anti-IA | **1** | En HTML público: `robots` con `noai` / `noimageai` donde el stack lo permita; no bloquear verify legítimo. |
| User-Agent agresivo | **1** (opcional) | Lista corta en ENV (`BLOCKED_BOT_UA_REGEX`) para bots de entrenamiento. |
| Crawlers / preview OG | **1** (detección); OG tags en **F2** | `PREVIEW_BOT_UA_REGEX` (LinkedIn, WhatsApp, Slack, Facebook, Twitter, etc.): en metadata **no** emitir. Preview OK; Puppeteer no. **No** bloquear Badgr/Passport. |
| Sin sitemap de certificados | **1** | No generar sitemap que enumere `/c/{slug}`. |

Los permalinks siguen siendo públicos si se conoce el slug (diseño intencional). La defensa es **no enumerabilidad** + rate limit, no oscuridad del PDF.

### 10.4. Protección de desempeño (Puppeteer / storage)

Puppeteer es el mayor riesgo de carga en el servidor.

| Regla | Decisión |
|-------|----------|
| PDF `issued` | **Inmutable**: servir desde MinIO; **nunca** regenerar en visita pública |
| Primera emisión | Cola o semáforo: máx. **`PDF_CONCURRENCY=1`** (default) procesos Chromium simultáneos por instancia |
| Timeout PDF | `PDF_TIMEOUT_MS` (ej. 30s); fallo → 503 + reintento admin, no saturar |
| Preview admin | Misma cola/semáforo; no lanzar N Chromium en paralelo desde el editor |
| Jobs masivos | Solo vía BullMQ (admin o cron); chunks pequeños; backoff |
| Redis | **Fase 3** (BullMQ). F1/F2: sin Redis; sesiones en Postgres (`admin_sessions`); límites PDF en-proceso |
| Caché HTTP | Permalinks `issued`: `Cache-Control` razonable en estáticos/PDF (CDN o nginx); HTML verify puede ser más corto |

### 10.5. Checklist para implementación (IA / humano)

Al escribir código de Fase 1 en adelante:

1. Todo endpoint público nuevo → decidir bucket de throttle y documentarlo en OpenAPI.
2. Ninguna ruta pública debe disparar Puppeteer si el PDF ya está en storage.
3. **Solo** metadata (no crawler) llama a `transitionToIssued`; `/file` en `pending` → **409**.
4. Ningún listado masivo sin sesión admin.
5. Incluir `robots.txt` en el artefacto `web` (o nginx).
6. Tests: búsqueda y permalinks devuelven **429** tras superar el umbral; `/file` pending → **409**; UA preview no emite (ver [09 §11](./09-plan-de-implementacion.md)).

---

## 11. Anexos — CSV

Ejemplos en [`anexos/csv/`](./anexos/csv/):

| Archivo | Uso | Fase |
|---------|-----|------|
| [participantes-ejemplo.csv](./anexos/csv/participantes-ejemplo.csv) | Import participantes evento (+ plantilla panel) | 1 |
| [pregenerados-ejemplo.csv](./anexos/csv/pregenerados-ejemplo.csv) | Import pregenerados sheet+ZIP (+ plantilla panel) | 1 |
| [awardees-osm-ejemplo.csv](./anexos/csv/awardees-osm-ejemplo.csv) | Import badges OSM (+ plantilla panel) | 3 |

**Delimiter:** fijo **`;`**. Encoding: UTF-8 con BOM opcional. Sin `CSV_DELIMITER` ni detección automática.

Las pantallas de import ofrecen **Descargar plantilla**: sirven estos CSV (o equivalentes por instancia) para completar en Excel/LibreOffice y reimportar. Ver [03 §8–10](./03-modelo-de-datos.md).

---

## 12. Anexos — seed

| Archivo | Contenido |
|---------|-----------|
| [seed/roles.yaml](./anexos/seed/roles.yaml) | Catálogo roles participación |
| [seed/country-identity-co.yaml](./anexos/seed/country-identity-co.yaml) | CC, CE, TI Colombia |

`prisma/seed.ts` lee YAML de `docs/anexos/seed/` e inserta en `country_identity_config` y **`roles`**.

**Admin inicial:** no se inserta en seed. Bootstrap en el **primer OAuth**: si `display_name` ∈ `SEED_ADMIN_OSM_USERNAMES` o `osm_id` ∈ `SEED_ADMIN_OSM_IDS`, se crea/actualiza `admin_users` con `role=admin`. El resto de usuarios OSM quedan con `role` NULL hasta HU-7.4.

---

## 13. OpenAPI — outline Fase 1

Prefijo: `/api/v1`

`info` debe identificar el **software** (no solo la instancia): `title` alineado con `SOFTWARE_NAME`, `license` MIT, URL del repo en `contact` o `externalDocs`.

```yaml
tags:
  - Auth
  - Admin Users
  - Admin Events
  - Admin Participants
  - Admin Templates
  - Admin Certificates
  - Public

paths:
  /admin/auth/osm/start:    GET   # redirect to OSM OAuth
  /admin/auth/osm/callback: GET   # code → session cookie
  /admin/auth/logout:       POST
  /admin/auth/me:           GET
  /admin/users:             GET           # admin only
  /admin/users/{id}:        PATCH         # role, is_active; admin only
  /admin/events:            GET, POST
  /admin/events/{id}:       GET, PATCH, DELETE
  /admin/events/{id}/venues: GET, POST
  /admin/events/{id}/participants: GET, POST
  /admin/events/{id}/participants/import: POST  # multipart CSV
  /admin/events/{id}/participants/import/template: GET  # CSV plantilla
  /admin/events/{id}/templates: GET, POST, PATCH
  /admin/events/{id}/certificates: GET, POST
  /admin/certificates/{id}/pregenerated: POST   # multipart file (1:1)
  /admin/events/{id}/pregenerated/import: POST  # sheet + ZIP
  /admin/events/{id}/pregenerated/import/template: GET  # CSV plantilla
  /admin/instance/legal:        GET, PATCH      # AC3 admin only; F2
  /public/search:           POST
  /public/certificates/{slug}: GET              # metadata + lazy issue
  /public/certificates/{slug}/file: GET         # PDF/imagen stream
```

Fase 2+: `/public/badges/...`, `/badges/issuer.json`, `GET /api/v1/verify/c/{slug}`, `GET /api/v1/verify/b/{slug}`, `POST /admin/certificates/{id}/revoke`, `POST /admin/badges/{id}/revoke`.  
Fase 3+: `/public/badges/osm`, `/public/auth/osm/*`, `/public/me`, `/public/me/link-email`, `/admin/badges/import`, `/admin/badges/import/template`.

---

## 14. Prisma — modelos Fase 1

Entidades mínimas (nombres alineados con [03-modelo-de-datos.md](./03-modelo-de-datos.md)):

```prisma
model Role { id, code, label, displayOrder, isActive, ... }
model Event { id, name, year, startDate, endDate, countryCode, allowedRoles Json, status, pregeneratedOnly, defaultTemplateId?, ... }
model Venue { ... }
model Participant { id, eventId, email /* unique per event, normalized */, ... }
model CertificateTemplate { id, eventId, roleCode?, layout Json, backgroundFileId /* StoredFile */, ... }
model Certificate { id, slug /* nanoid 12 */, status, mode, legalSnapshot Json?, storedFileId, ... }
model StoredFile { id, storageKey, mimeType, checksumSha256, ... }
model AdminUser { id, osmId, osmUsername, role, isActive, lastLoginAt, ... }
model AdminSession { id, adminUserId, data Json, expiresAt, ... }
model CountryIdentityConfig { ... }
model AuditLog { ... }
model PermalinkAccessLog { ... }
```

Fase 2: `BadgeIssuer`, `BadgeClass`, `BadgeAssertion` (FK `certificateId` hacia Certificate; **sin** FK inversa en Certificate), `InstanceLegal`.  
Fase 3: `OsmProfile`.

---

## 15. Integraciones externas (Fase 3)

### OSM API — resolver usuario

Por **id** (canónico tras import/vínculo):

```http
GET /api/0.6/user/{osm_id}.json
User-Agent: CertificadosOSMLatam/1.0 (contact@osm.lat)
```

Por **username** (CSV awardees y búsqueda pública): resolver `display_name` → `osm_id` en el momento de la operación (endpoint/cliente concreto en implementación; mock en CI). Contrato: fallar la fila/búsqueda si el username no existe.

### OSM API — métricas Must (antigüedad, changesets, trazas)

Fuente canónica: respuesta `GET /api/0.6/user/{osm_id}` (campos de cuenta / changesets / traces). La query exacta y el parseo se fijan en implementación. El **contrato de producto** (métricas, umbrales, fuente por métrica) está en [06 §5.1](./06-open-badges.md). Mockear en tests.

Otras métricas: ver tabla de fuentes en §5.1 (CSV, Should, o evolución). **No** hay Overpass obligatorio en v1.0.
### Badgr — redirect backpack (Fase 2)

Plantilla URL (configurable):

```text
https://api.badgr.io/o/auth?badge={assertion_url}
```

---

## 16. CI (GitHub Actions)

```yaml
# Resumen ci.yml
jobs:
  test:
    steps:
      - pnpm install
      - docker compose -f docker-compose.test.yml up -d
      - pnpm --filter api prisma migrate deploy
      - pnpm lint
      - pnpm test
      - pnpm build
```

---

## 17. Referencias cruzadas

| Documento | Relación |
|-----------|----------|
| [09-plan-de-implementacion.md](./09-plan-de-implementacion.md) | Fases, prompts, tests |
| [03-modelo-de-datos.md](./03-modelo-de-datos.md) | Esquema BD |
| [04-flujos-funcionales.md](./04-flujos-funcionales.md) | Flujos y T1–T16 |
| [07-estados-y-ciclo-de-vida.md](./07-estados-y-ciclo-de-vida.md) | Máquina de estados |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Convenciones contribución |
