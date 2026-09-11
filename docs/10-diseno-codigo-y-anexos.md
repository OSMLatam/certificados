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
| `legal` | `instance_legal` + `instance_legal_signers` CRUD + bootstrap ENV; `legal_snapshot` |
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
| Estados / enums BD | inglés | `pending`, `issued`, `failed`, `revoked`, `generated`, `pregenerated` |
| Commits | Conventional Commits | `feat(certificates): emit on first visit` |

### 4.2. Flujo típico — emisión certificado

```text
GET /api/v1/public/certificates/:slug          # metadata + lazy issue (si no crawler)
  → CertificatesService.resolvePublic(slug, { isCrawler })
       → si failed && !isCrawler: 200 { status: "failed" }  # no Puppeteer
       → si pending && !isCrawler: transitionToIssued()  # lock por certificate_id
            → si INSTANCE=ac3 && folio IS NULL:
                 lock instance_legal; last_folio+1 → certificates.folio  # reserva; no durante Puppeteer
            → issuedAtCandidate = now()  # mismo instante para PDF legal.issue_date y columna issued_at
            → si generated:
                 PdfService.render (AC3: legal.folio + legal.issue_date desde issuedAtCandidate)
                 → sha256 → StorageService.put
                 → luego UPDATE issued + stored_files  # nunca issued sin objeto; ver §4.2.2
            → si pregenerated: archivo ya en storage (no Puppeteer)
            → si INSTANCE=ac3: copiar instance_legal + signers + folio + issue_city + disclaimer + issuedAtCandidate → legal_snapshot
            → update { stored_file_id?, legal_snapshot?, issued_at=issuedAtCandidate, status=issued, issue_attempts }
            → si PDF (generated) falla: no persistir issued_at; reintento toma un now() nuevo
            → si PDF (generated) falla y attempts < PDF_MAX_ISSUE_ATTEMPTS:
                 queda pending **con folio reservado**; incrementa issue_attempts; HTTP 503
            → si PDF (generated) falla y attempts alcanza MAX: status=failed (folio se conserva); HTTP 503 (ese request);
                 visitas siguientes: 200 failed, sin render
       → si pending && isCrawler: devolver metadata/OG sin emitir
       → si issued: leer stored_file metadata
GET /api/v1/public/certificates/:slug/file     # binario PDF/imagen
  → si pending o failed: HTTP 409 (no emite; el cliente debe llamar metadata primero)
  → si issued: stream desde MinIO (Content-Disposition: inline | attachment según ?download=1)
  → si revoked: 404 o 410 según OpenAPI

SPA GET /c/:slug  → CertificatePublicPage (HTML verify)
  → llama API metadata; si issued: hash sha256 + issued_at + enlace/iframe a /file
  → si failed: indicador “no se pudo generar” (sin pedir /file)
  → búsqueda: mismo orden (metadata → luego /file si aplica)
```

**Contrato de superficies (cerrado):**

| Superficie | Ruta | Responsabilidad |
|------------|------|-----------------|
| HTML verify | `/c/{slug}` (web) | Página humana; llama metadata; muestra `checksum_sha256` e `issued_at` si `issued`; no regenera PDF |
| Metadata JSON | `GET /api/v1/public/certificates/{slug}` | **Único** disparador de lazy issue (excepto crawlers). `issued`: incluye `checksum_sha256`, `issued_at`. |
| Binario | `GET /api/v1/public/certificates/{slug}/file` | Stream desde storage; **409 si pending o failed** |
| Descarga forzada | mismo `/file?download=1` | `Content-Disposition: attachment` |
| Crawler / OG | misma metadata | Respuesta sin `transitionToIssued` |

No hay superficie admin de “emitir pendientes”, ZIP de PDFs del evento ni impresión. [07 §3.2](./07-estados-y-ciclo-de-vida.md#32-emisión-masiva-e-impresión--decisión-cerrada).

### 4.2.1. Emisión concurrente (cerrado)

Dos `GET` simultáneos a un certificado `pending` **no** deben lanzar dos Puppeteer:

1. `SELECT … FOR UPDATE` (o advisory lock por `certificate_id`) dentro de la transición.
2. El segundo request espera el lock; si ya está `issued`, sirve el archivo; si pasó a `failed`, no relanza Chromium.
3. `PDF_CONCURRENCY` limita Chromium **globales** de la instancia; el lock es **por certificado**.
4. Un certificado `failed` **nunca** entra a `transitionToIssued` hasta `POST …/retry-issue`.
5. **Folio AC3:** si `folio` IS NULL, `SELECT instance_legal FOR UPDATE` y `last_folio+1` **antes** del render (transacción corta). Certificados distintos se serializan solo en ese instante; el preview **no** reserva. Un reintento con folio ya escrito no incrementa.

### 4.2.2. Atomicidad MinIO ↔ Postgres (decisión cerrada)

MinIO y PostgreSQL **no** comparten transacción. Contrato para `transitionToIssued` en modo `generated` (y para el put de un pregenerado en el **import**, no en el lazy issue):

1. **Orden:** (AC3: reservar `folio` si NULL) → capturar `issuedAtCandidate=now()` → render (buffer, con `legal.folio` / `legal.issue_date` ya conocidos) → `sha256` → **`put` a MinIO** → **después** transacción Postgres (`stored_files` + `issued`, `issued_at=issuedAtCandidate`, `legal_snapshot` AC3 con folio + `signers` + `issue_city` + `disclaimer` + `issued_at`). **Nunca** marcar `issued` si el objeto aún no está en storage. Si el render/put falla: folio reservado se conserva; **`issued_at` no se escribe** (el reintento usa un `now` nuevo).
2. **Clave determinista:** `certs/{certificate_id}/{sha256}.pdf` (o `.png`). Un reintento del mismo buffer pisa la misma clave (idempotente).
3. **Idempotencia:** si el certificado ya está `issued` con el mismo `checksum_sha256`, no hay put ni render. Si el objeto existe y el update a `issued` falló antes, el siguiente `put` es no-op/overwrite y se reintenta solo el update.
4. **Compensación:** si el `put` OK y el `UPDATE` falla → el certificado **sigue `pending`**; best-effort `delete` de esa clave si ningún `stored_files.storage_key` la referencia. Si el delete también falla, queda un **huérfano**.
5. **GC de huérfanos (ops, v1.0):** objetos en el prefijo `certs/` sin fila en `stored_files` y con `LastModified` > 24 h. Runbook: listar y borrar a mano (MinIO client). Sin pantalla admin. Un job automático es evolución futura.
6. **Pregenerado (lazy issue):** el archivo ya se subió en el import; `transitionToIssued` reserva folio AC3 si NULL y actualiza Postgres (`issued_at`, snapshot). No hay segundo put.

Invertir el orden (issued sin archivo) está **prohibido**: el titular vería “válido” y `/file` 404.

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
| `/privacy` | 1 | `PrivacyNoticePage` (HU-8.3; markdown por despliegue) |
| `/c/:slug` | 1 | `CertificatePublicPage` |
| `/admin/login` | 1 | `AdminLoginPage` (botón OAuth OSM; sin form password) |
| `/admin` | 1 | `AdminDashboardPage` (**F1:** conteos básicos eventos/participantes/certificados pending\|issued\|failed; **F2+:** + badges, legal, revocaciones — HU-7.2) |
| `/admin/users` | 1 | `AdminUsersPage` (solo rol `admin`; HU-7.4) |
| `/admin/audit` | 1 | `AdminAuditLogPage` (solo rol `admin`; HU-7.5) |
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
│   ├── field-tokens.ts     # catálogo: full_name, event_date, legal.issue_date, legal.signer.{n}.*, …
│   └── instance.ts         # InstanceId enum
├── lib/
│   └── normalize.ts        # email trim+lower; doc_number via config.normalize (digits|alnum|raw)
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
| Privacidad | `PRIVACY_NOTICE_FILE`, `PRIVACY_CONTACT_EMAIL`, `PERMALINK_ACCESS_LOG_RETENTION_DAYS` | 1 |
| Software (atribución) | `SOFTWARE_NAME`, `SOFTWARE_REPO_URL`, `SOFTWARE_CREDIT_ENABLED`, `SOFTWARE_CREDIT_TEXT` | 1 |
| Rate limit / abuso | `THROTTLE_SEARCH_*`, `THROTTLE_PERMALINK_*`, `BLOCKED_BOT_UA_REGEX`, `PREVIEW_BOT_UA_REGEX`, `TRUST_PROXY` | 1 |
| PDF / carga | `PDF_CONCURRENCY`, `PDF_TIMEOUT_MS`, `PDF_MAX_ISSUE_ATTEMPTS`, `PUPPETEER_NO_SANDBOX` | 1 |
| Logging | `LOG_LEVEL`, `LOG_REDACT_IP` | 1 |
| Ops alertas | `OPS_ALERT_EMAIL`, `OPS_ALERT_INTERVAL_MINUTES`, `OPS_ALERT_PENDING_HOURS` | 1 |
| Legal AC3 | Tabla `instance_legal` + `instance_legal_signers` (máx. 8) + bootstrap `LEGAL_*` opcional; folio global | 2 |
| Open Badges | `OB_ISSUER_*` | 2 |
| OSM API | `OSM_API_*` (fuentes por métrica en [06 §5.1](./06-open-badges.md)) | 3 |
| Turnstile | `TURNSTILE_*` | 3 |
| SMTP | `SMTP_*` (From dedicado; obligatorio osm.lat F3) | 3 |

**Validación al arranque:** `apps/api/src/config/env.schema.ts` (Zod) — falla fast si falta `DATABASE_URL`, `SESSION_SECRET` o `OSM_OAUTH_CLIENT_ID` / `OSM_OAUTH_CLIENT_SECRET`. En `NODE_ENV=production`: rechazar `SESSION_SECRET` que contenga `change-me` y `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` iguales a `minioadmin`.

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
- **`audit_log`:** acciones sensibles del catálogo ([03 §5.2](./03-modelo-de-datos.md#52-audit_log)); lectura solo admin (HU-7.5).
- **`permalink_access_log`:** accesos a `/c/` (sin IP completa si `LOG_REDACT_IP=true`).
- **No** loguear documentos completos ni contraseñas.

### 8.1. Migraciones, rollback y alertas ops — decisión cerrada

**Sin Prometheus** ni `/metrics` públicos en v1.0 (post-v1.0: [01 §11](./01-vision-y-alcance.md#11-evolución-futura-post-v10)). Las migraciones de esquema son **pocas** (saltos de fase); el procedimiento es corto, no un stack de monitoreo.

**Quién migra:** el operador de cada instancia, en cada upgrade de código que traiga Prisma nuevo. Orden:

1. Backup **pareado** Postgres + MinIO (off-host, cifrado).
2. `prisma migrate deploy` (recomendado: el contenedor API lo ejecuta al arrancar y **no** pasa a `/ready` si falla).
3. Comprobar `GET /ready` → 200.
4. Seed solo si el runbook de esa versión lo pide (catálogos YAML).

**Rollback:** no hay `migrate down`. Restaurar el backup del paso 1 (BD **y** MinIO juntos). Verificar que un `/c/` `issued` conocido sirve el PDF.

**Alertas mínimas (correo, no dashboard):** job periódico F1 (`OPS_ALERT_INTERVAL_MINUTES`, default **60**). Si `OPS_ALERT_EMAIL` está vacío → solo log `OPS_ALERT` (error). Si hay SMTP + email → un correo a ops (**no** usar `PRIVACY_CONTACT_EMAIL`: es canal ARCO).

Dispara si **alguna** condición es cierta. **No** alertar por `pending` con `issue_attempts = 0` (emisión lazy).

| Señal | Condición |
|-------|-----------|
| Ready | Lo que `/ready` comprobaría está mal (BD/MinIO/Redis F3) |
| `failed` | `COUNT(*)` de certificados `failed` > 0 |
| Pending atascado | `pending` con `issue_attempts > 0` y `last_issue_attempt_at` anterior a `OPS_ALERT_PENDING_HOURS` (default **24**) |
| F3 | Jobs BullMQ fallidos o SMTP de aplicación caído (último envío con error persistente) |

**Anti-ruido:** no reenviar la misma firma (`ready` / `failed:N` / `stuck:N` / `jobs`) antes de **24 h**, salvo que el conteo **suba**. Cuerpo del mail: conteos + “revisar ficha del evento / `retry-issue`”. Sin PII (nombres, documentos, emails de titulares).

El editor sigue viendo `failed` en la ficha del evento; el correo es para enterarse **sin** abrir el panel.

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
| CORS | Prod: mismo origen (nginx/Caddy proxy); dev: `localhost:5173` |
| Headers | `helmet` en NestJS: CSP básico, HSTS en prod |
| Uploads sueltos (fondo, firma, 1:1) | Max **10 MB**; MIME declarado **y** magic bytes (ver §10.1.3) |
| Lote pregenerados (CSV + ZIP) | Max **100 MB** comprimido; zip-slip/bomb §10.1.2; entradas internas png/jpeg/pdf validadas como upload |
| Slug | nanoid 12 chars — no secuencial, no enumerable. UNIQUE violation → reintentar (máx. 5); agotar → 500 `SLUG_COLLISION`. Mismo criterio para slugs `/b/`. |
| Secrets | Nunca en repo; `.env` gitignored. `SESSION_SECRET` y `STORAGE_*` de ejemplo **no** valen en `NODE_ENV=production` (fail-fast al boot). |
| Trust proxy | `TRUST_PROXY` (default `0`). Detrás de Caddy/nginx: `1`. El throttler usa la IP del hop de confianza (`X-Forwarded-For`). Ver §10.1.4. |
| Logging PII | `LOG_REDACT_IP=true` (default). No persistir IP en `permalink_access_log` (ya sin columna IP). |
| Cifrado en reposo | Ops: volumen cifrado (disco/LUKS o equivalente) para Postgres + MinIO, y backups cifrados off-host. La app **no** cifra columnas (rompería búsqueda). Ver §10.1.5. |

#### 10.1.1. Puppeteer / Chromium (aislamiento)

El HTML de render incluye fondos y fuentes **ya subidos**. No es un navegador abierto a internet.

| Regla | Decisión |
|-------|----------|
| Usuario del contenedor | **No-root** (UID no privilegiado). Caps mínimas; no `--privileged`. |
| Red en el render | Interceptar peticiones de página: **abort** todo lo que no sea `about:blank` o `data:`. Sin `http(s):`, `file:` remoto ni WebSocket. Fondos/fuentes se **inlinan** (data URI o buffer) desde `stored_files` **antes** de `setContent`. |
| Sandbox | Preferir sandbox de Chromium + seccomp del runtime. `PUPPETEER_NO_SANDBOX=true` **solo** si el host no puede seccomp, y **únicamente** junto a no-root. Default `false`. |
| Flags base | `--disable-dev-shm-usage`, `--disable-gpu`, timeout = `PDF_TIMEOUT_MS`. |
| Qué no hace el template | El `layout` JSON no admite URLs remotas en capas. Un `field` no es HTML libre. |

SSRF desde plantilla queda fuera de diseño: no hay fetch de URL de usuario en el render.

#### 10.1.2. ZIP (zip-slip y zip-bomb)

Además de la bijección CSV↔ZIP ([03 §10](./03-modelo-de-datos.md)):

| Límite | Valor (cerrado v1.0) |
|--------|----------------------|
| Path | Rechazar entrada cuyo nombre contenga `..`, `/`, `\` o sea absoluta. Solo basename. |
| Entradas de archivo | Máx. **500**. Directorios vacíos se ignoran. Sin ZIP anidado como certificado. |
| Comprimido (lote CSV+ZIP) | **100 MB** (ya en HU-4.1). |
| Descomprimido total | Máx. **200 MB**. Superar → `ZIP_BOMB`. |
| Ratio por entrada | Si `uncompressed / compressed > 100` (y compressed > 0) → `ZIP_BOMB`. |
| Una entrada | Máx. **20 MB** descomprimida (coherente con upload 10 MB + margen). |

No descomprimir a disco con la ruta del ZIP; leer cada entrada a buffer tras validar el nombre.

#### 10.1.3. Contenido de uploads (no solo MIME)

El `Content-Type` del cliente **no** basta.

| Tipo | Validación |
|------|------------|
| PNG / JPEG | Magic bytes (`89 50 4E 47` / `FF D8 FF`). Decodificar con límite: máx. **8000 px** por lado y **20 Mpx** totales. Fallo o bomb → 400 `UPLOAD_IMAGE_REJECTED`. |
| PDF | Magic `%PDF`. Parsear catálogo; **rechazar** si hay acciones `/JS`, `/JavaScript`, `/Launch`, `/SubmitForm` (o equivalente de la librería). No pasar el PDF de usuario por Puppeteer. |
| Fondo de plantilla | Solo PNG/JPEG (no PDF). Mismos límites de imagen. |

Los pregenerados se **almacenan y sirven**, no se re-renderizan; igual se aplican estas reglas al import.

#### 10.1.4. Rate limit detrás de reverse proxy

Caddy/nginx termina TLS y pone `X-Forwarded-For`. Si Nest **no** hace `trust proxy`, todo el tráfico es 127.0.0.1: el throttle o no dispara o bloquea a **todos**.

- `TRUST_PROXY=0` (default, dev sin proxy).
- Producción detrás de **un** proxy: `TRUST_PROXY=1`. No usar `true`/ilimitado (spoofing de `X-Forwarded-For`).
- El throttler y el audit (si hay IP) leen la IP ya resuelta por el framework, no el header crudo.
- Test: dos IPs distintas detrás de un proxy de prueba cuentan buckets separados; sin `TRUST_PROXY` el test documenta el fallo.

#### 10.1.5. Cifrado en reposo y backups (ops)

No hay cifrado campo-a-campo en v1.0 (índices y búsqueda por documento/email). Sí es **requisito de despliegue producción**:

1. Volúmenes de Postgres y MinIO en disco **cifrado** (LUKS, ZFS encryption, o cifrado del proveedor).
2. Backups off-host **cifrados** (age/gpg o bucket con SSE) y **pareados** BD+MinIO ([05 §1.1](./05-personalizacion-multi-instancia.md)). **Frecuencia:** diaria; retención ≥ 14 días; más un juego **antes de cada migrate**. A este volumen el tamaño es de unos GB, no de cientos.
3. Tránsito: HTTPS en el proxy; MinIO y Postgres no expuestos a internet.

Detalle operativo: [11](./11-manuales-ops-y-usuario.md).

### 10.2. Modelo de autenticidad (decisión cerrada)

v1.0 **no** firma el PDF (PAdES) ni emite Open Badges 3.0 con `proof`. La verificación es **hosted**: el permalink en `PUBLIC_BASE_URL` es la fuente de verdad. El SHA-256 del archivo **sí** se publica para que un verificador compare su copia con la del servidor. El siguiente paso criptográfico previsto para badges es **Open Badges 3.0** ([06 §1.1](./06-open-badges.md#11-camino-a-open-badges-30)).

#### Qué garantiza v1.0

- Un humano o máquina que abre `https://{PUBLIC_BASE_URL}/c/{slug}` (o `/b/{slug}`) en el **dominio oficial** ve el estado actual: `issued` / `pending` / `failed` / `revoked`.
- En `issued`, `/c/` y metadata (F1) y `GET /api/v1/verify/c/{slug}` (F2) exponen `checksum_sha256` (hex minúsculas, 64 chars) e `issued_at`. Quien descargue `/file` puede recalcular SHA-256 y comparar.
- Una **revocación** posterior se ve en el permalink. Un PDF ya descargado no se borra del disco del usuario.

#### Qué no garantiza v1.0

- Autenticidad **offline** del PDF o de una captura (NIT e imagen de firma son dibujo, no firma criptográfica).
- Que un QR o enlace compartido apunte al dominio oficial: hay que mirar la barra de direcciones.
- Que el badge/PDF sigan siendo comprobables si caen hosting o DNS (modelo hosted).
- Open Badges 3.0 `proof` ni PAdES.

#### Publicación del hash

| Superficie | Fase | Contrato |
|------------|------|----------|
| `GET /api/v1/public/certificates/{slug}` | 1 | Si `issued`: incluye `checksum_sha256`, `issued_at`. `pending`/`failed`: esos campos `null`. |
| Página `/c/{slug}` | 1 | Si `issued`: muestra el hash (monoespaciado, copiable) e `issued_at`. Texto corto: la validez se comprueba en este sitio oficial; el hash permite contrastar el archivo descargado. |
| `GET /api/v1/verify/c/{slug}` | 2 | `{ valid, status, issued_at, checksum_sha256, permalink }`. `valid` es `true` solo si `issued`. |
| PDF | — | **No** se pinta el hash en el archivo (el SHA-256 es del binario completo; incrustarlo lo invalidaría). |
| osm.lat y AC3 | ambas | Mismo contrato. |

`checksum_sha256` es el de `stored_files` del certificado (el objeto servido en `/file`). No se inventa un segundo hash.

#### Amenazas aceptadas en v1.0

PDF clonado a simple vista; QR a un dominio falso; copia local tras revocar; indisponibilidad del servidor. Mitigación de producto: permalink no enumerable (nanoid), rate limit, **decir en `/c/` y ayuda pública qué se garantiza**. No usar en comunicación institucional “documento infalsificable” ni “firma digital” para la imagen de rúbrica.

PAdES del PDF AC3: **no** entra en v1.0; se reevalúa junto al despliegue OB 3.0 (no sustituye el `proof` del badge).

### 10.3. Rate limiting y anti-abuso (Fase 1+)

Usar `@nestjs/throttler` (o equivalente) en **todos** los endpoints públicos costosos. Umbrales por ENV (ajustables por operador).

| Superficie | Límite por defecto | Motivo |
|------------|-------------------|--------|
| `POST /api/v1/public/search` | **10 req/min/IP** (`THROTTLE_SEARCH_*`) | Enumeración de documentos / scraping de titulares |
| `GET /c/{slug}`, descarga PDF, verify | **60 req/min/IP** (`THROTTLE_PERMALINK_*`) | Barrido de slugs + descarga masiva |
| `GET /b/{slug}` y JSON OB (Fase 2+) | Mismo bucket permalink o dedicado | Misma razón |
| Admin autenticado | Sin throttle agresivo; sí auth + CSRF | Panel confiable |

- Respuesta ante exceso: **HTTP 429** + `Retry-After`.
- **IP cliente:** ver §10.1.4 (`TRUST_PROXY`). Sin esto el rate limit no distingue usuarios reales detrás del proxy.
- **Cloudflare Turnstile** en búsqueda: **Fase 3** (o antes si hay abuso real); no sustituye el rate limit.
- **No** exponer APIs públicas de listado por evento, año o sede (HU-1.2b).
- Mensaje de búsqueda **genérico** si no hay resultados (no filtrar existencia de documento).

### 10.4. Bots, scrapers y agentes de IA

Objetivo: reducir crawling automático y uso como fuente de entrenamiento, **sin** romper verificadores humanos ni backpacks OB.

| Medida | Fase | Notas |
|--------|------|-------|
| `robots.txt` en el origen web | **1** | `Disallow` de `/api/`, `/admin/`; permalinks `/c/` y `/b/` **Allow** (verificación legítima). Opcional: `Crawl-delay` si el proxy lo respeta. |
| Meta / headers anti-IA | **1** | En HTML público: `robots` con `noai` / `noimageai` donde el stack lo permita; no bloquear verify legítimo. |
| User-Agent agresivo | **1** (opcional) | Lista corta en ENV (`BLOCKED_BOT_UA_REGEX`) para bots de entrenamiento. |
| Crawlers / preview OG | **1** (detección); OG tags en **F2** | `PREVIEW_BOT_UA_REGEX` (LinkedIn, WhatsApp, Slack, Facebook, Twitter, etc.): en metadata **no** emitir. Preview OK; Puppeteer no. **No** bloquear Badgr/Passport. |
| Sin sitemap de certificados | **1** | No generar sitemap que enumere `/c/{slug}`. |

Los permalinks siguen siendo públicos si se conoce el slug (diseño intencional). La defensa es **no enumerabilidad** + rate limit, no oscuridad del PDF.

### 10.5. Protección de desempeño (Puppeteer / storage)

Puppeteer es el mayor riesgo de carga en el servidor.

| Regla | Decisión |
|-------|----------|
| PDF `issued` | **Inmutable**: servir desde MinIO; **nunca** regenerar en visita pública |
| Primera emisión | Cola o semáforo: máx. **`PDF_CONCURRENCY=1`** (default) procesos Chromium simultáneos por instancia |
| Timeout PDF | `PDF_TIMEOUT_MS` (ej. 30s); fallo transitorio → 503 + `issue_attempts++`; al alcanzar `PDF_MAX_ISSUE_ATTEMPTS` (default 5) → `failed` (sin más Chromium hasta `retry-issue`) |
| Dead-letter | Certificados `failed` visibles en ficha del evento; `POST /api/v1/admin/certificates/{id}/retry-issue` |
| Preview admin | Misma cola/semáforo; no lanzar N Chromium en paralelo desde el editor |
| Aislamiento Chromium | No-root; abort de red salvo `data:`; ver §10.1.1 |
| Jobs masivos | Solo vía BullMQ (admin o cron); chunks pequeños; backoff |
| Redis | **Fase 3** (BullMQ). F1/F2: sin Redis; sesiones en Postgres (`admin_sessions`); límites PDF en-proceso |
| Caché HTTP | Permalinks `issued`: `Cache-Control` razonable en estáticos/PDF (CDN o nginx); HTML verify puede ser más corto |

**Dimensionamiento (cerrado, [01 §5.1](./01-vision-y-alcance.md#51-volumen-y-desempeño--decisión-cerrada)):** 50–200 certificados/evento, pocos eventos/año. `PDF_CONCURRENCY=1` es el valor correcto, no un placeholder. Subirlo exige más RAM para Chromium en un host compartido y **no** está en v1.0. Un pico de primeras visitas se encola (503 transitorio / reintento del cliente); no hay botón de emitir el lote.

Backups diarios bastan a este volumen; el snapshot pre-migrate sigue siendo obligatorio ([§8.1](#81-migraciones-rollback-y-alertas-ops--decisión-cerrada)).

### 10.6. Checklist para implementación (IA / humano)

Al escribir código de Fase 1 en adelante:

1. Todo endpoint público nuevo → decidir bucket de throttle y documentarlo en OpenAPI.
2. Ninguna ruta pública debe disparar Puppeteer si el PDF ya está en storage.
3. **Solo** metadata (no crawler) llama a `transitionToIssued` y **solo** si `pending`; `/file` en `pending`/`failed` → **409**; `failed` no lanza Puppeteer.
4. Ningún listado masivo sin sesión admin.
5. Incluir `robots.txt` en el artefacto `web` (o nginx).
6. Tests: búsqueda y permalinks devuelven **429** tras superar el umbral; `/file` pending/failed → **409**; UA preview no emite; activar `generated` sin plantilla → **400**; `failed` no relanza Chromium; CSV `role` ∉ `allowed_roles` y ZIP no biyectivo → lote 0; entrada ZIP con `..` → rechazo; upload con MIME mentiroso → 400 (ver [09 §11](./09-plan-de-implementacion.md)).
7. `transitionToIssued` (`generated`): **put MinIO → luego UPDATE** `issued`. Nunca al revés ([§4.2.2](#422-atomicidad-minio--postgres-decisión-cerrada)).
8. Puppeteer: no-root; sin fetch remoto; `TRUST_PROXY` correcto en prod ([§10.1](#101-defaults-de-seguridad)).
9. `/c/` y metadata de un `issued`: exponer `checksum_sha256` e `issued_at`. No pintar el hash dentro del PDF ([§10.2](#102-modelo-de-autenticidad-decisión-cerrada)).
10. Copy de `/c/` y ayuda: no decir “firma digital” ni “infalsificable” por la rúbrica dibujada.
11. `/privacy` en F1; no afirmar que el sistema no trata datos. `erase` solo `admin` (F2).

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
| [privacy-notice.placeholder.md](./anexos/privacy-notice.placeholder.md) | Aviso `/privacy` (sustituir por instancia) |

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
  /admin/audit-log:         GET           # admin only; HU-7.5
  /admin/events:            GET, POST
  /admin/events/{id}:       GET, PATCH, DELETE
  /admin/events/{id}/venues: GET, POST
  /admin/events/{id}/participants: GET, POST
  /admin/events/{id}/participants/import: POST  # multipart CSV
  /admin/events/{id}/participants/import/template: GET  # CSV plantilla
  /admin/events/{id}/templates: GET, POST, PATCH
  /admin/events/{id}/certificates: GET, POST
  /admin/certificates/{id}/retry-issue: POST  # failed → pending (F1)
  /admin/certificates/{id}/pregenerated: POST   # multipart file (1:1)
  /admin/events/{id}/pregenerated/import: POST  # sheet + ZIP
  /admin/events/{id}/pregenerated/import/template: GET  # CSV plantilla
  /admin/instance/legal:        GET, PATCH      # AC3 admin only; F2
  /public/search:           POST
  /public/certificates/{slug}: GET              # metadata + lazy issue
  /public/certificates/{slug}/file: GET         # PDF/imagen stream
```

Fase 2+: `/public/badges/...`, `/badges/issuer.json`, `GET /api/v1/verify/c/{slug}`, `GET /api/v1/verify/b/{slug}`, `POST /admin/certificates/{id}/revoke`, `POST /admin/badges/{id}/revoke`, `POST /admin/participants/{id}/erase`.  
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
model Certificate { id, slug /* nanoid 12 */, status /* pending|issued|failed|revoked */, mode, issueAttempts, lastIssueError?, lastIssueAttemptAt?, legalSnapshot Json?, storedFileId, ... }
model StoredFile { id, storageKey, mimeType, checksumSha256, ... }
model AdminUser { id, osmId, osmUsername, role, isActive, lastLoginAt, ... }
model AdminSession { id, adminUserId, data Json, expiresAt, ... }
model CountryIdentityConfig { countryCode, docTypeCode, normalize /* digits|alnum|raw */, validationRegex?, ... }
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
