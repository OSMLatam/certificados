# Personalización multi-instancia

**Versión:** 1.0  
**Fecha:** 2026-06-06

---

## 1. Modelo de despliegue

```
┌──────────────────────────────────────────┐
│     GitHub — repo certificados            │
│     TypeScript monorepo (NestJS + React)  │
└────────────────────┬─────────────────────┘
                     │ build imagen Docker / deploy
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Servidor        │     │ Servidor        │
│ comunitario     │     │ AC3             │
│ osm.lat         │     │ ac3.org.co      │
│                 │     │                 │
│ certificados    │     │ certificados    │
│ .osm.lat        │     │ .ac3.org.co     │
│                 │     │                 │
│ Docker Compose  │     │ Docker Compose  │
│ ENV: osm_lat    │     │ ENV: ac3        │
│ BD propia       │     │ BD propia       │
│ Storage propio  │     │ Storage propio  │
└─────────────────┘     └─────────────────┘
```

- **Código:** un repositorio en **GitHub** (`certificados`).
- **Producción:** dos servidores **independientes** — infraestructura comunitaria osm.lat e infraestructura equivalente en AC3 — cada uno con su propio Docker Compose.
- **Datos:** bases de datos y almacenamiento de archivos **totalmente aislados** entre instancias.

### 1.1. Hosting producción (decisión cerrada)

| Instancia | Servidor | URL pública |
|-----------|----------|-------------|
| osm.lat | **Servidor comunitario osm.lat** | https://certificados.osm.lat |
| AC3 | **Servidor institucional AC3** (equivalente, misma topología) | https://certificados.ac3.org.co |

**Topología por servidor** (idéntica en ambos; solo cambia ENV y DNS):

```text
Internet → reverse proxy (Caddy o nginx, TLS)
              → contenedor web (React estático + proxy API)
              → contenedor api (NestJS)
              → PostgreSQL 16
              → MinIO (S3 local — PDFs, pregenerados, firmas)
              → Redis 7 (BullMQ) — **desde Fase 3** (jobs OSM)
```

- **No** hay BD compartida ni storage compartido entre osm.lat y AC3.
- **Backups:** responsabilidad de cada operador — **pareados** `pg_dump` (o equivalente) **+** sync del bucket MinIO hacia almacenamiento **off-host** (otro servidor o S3-compatible). Detalle (frecuencia, retención, restore): **manual de operación**. Sin regenerar PDFs `issued` tras restore incompleto.
- **CI:** GitHub Actions construye imagen; cada servidor hace `docker compose pull && up -d` (manual o webhook de deploy).
- Desarrollo local: mismo `docker-compose.yml` con perfiles `osm_lat` / `ac3`.
- **Carga:** los hosts suelen ser compartidos; aplicar rate limits, `PDF_CONCURRENCY` baja y `robots.txt` según [10 §10](./10-diseno-codigo-y-anexos.md#10-seguridad-abuso-y-protección-de-carga) para no saturar CPU/RAM del servidor.

---

## 2. URLs oficiales (objetivo)

| Instancia | URL pública | Estado |
|-----------|-------------|--------|
| osm.lat | https://certificados.osm.lat | Comunitario LATAM + badges OSM |
| AC3 | https://certificados.ac3.org.co | Institucional + badges de evento |

Los permalinks usan el dominio de la instancia:

```
https://certificados.osm.lat/c/{slug}
https://certificados.ac3.org.co/c/{slug}
```

---

## 3. Qué se configura por instancia

### 3.1. Identidad visual

| Parámetro | Ejemplo osm.lat | Ejemplo AC3 |
|-----------|-----------------|-------------|
| Nombre del sitio | Certificados OSM Latam | Certificados AC3 |
| Logo | logo-osm.svg | logo-ac3.svg |
| Favicon | idem | idem |
| Colores primarios | Verdes OSM | Colores AC3 |
| Texto footer (organización) | Comunidad LATAM | Texto legal AC3 |
| Crédito de software | Igual en ambas (ver [§10](#10-atribución-del-software-multi-instancia)) | Idem |

### 3.2. Datos legales AC3 (config de instancia — no plantilla)

**Fuente única de verdad** para textos legales. La **posición** en el certificado se define en el editor visual (capas `legal.*`).

| Parámetro | Contenido |
|-----------|-----------|
| `LEGAL_ENTITY_NAME` | Razón social |
| `LEGAL_NIT` | NIT |
| `LEGAL_REPRESENTATIVE` | Representante legal |
| `LEGAL_SIGNATURE_FILE` | Imagen firma/sello |

**Usos del mismo config:**

| Uso | Cómo |
|-----|------|
| PDF | Capas `legal.*` en `layout` |
| Verify `/c/` | Muestra `legal_snapshot` del certificado (AC3) |
| Open Badges Issuer | `name` / `description` del issuer |

osm.lat: parámetros ausentes; render ignora capas `legal.*`.

Detalle: [08-datos-legales-ac3-plantilla.md](./08-datos-legales-ac3-plantilla.md).

### 3.3. Operación

| Parámetro | Descripción |
|-----------|-------------|
| `DATABASE_URL` | Conexión BD aislada |
| `STORAGE_BUCKET` | Plantillas y archivos pregenerados |
| `PUBLIC_BASE_URL` | Base para permalinks y OG tags |
| `THROTTLE_*` / `PDF_CONCURRENCY` | Anti-abuso y límite de Chromium (hosts compartidos) |
| `SMTP_*` | Envío de **enlace** `/c/` (From dedicado; ver manual ops) |
| `DEFAULT_COUNTRY_CODE` | País por defecto en formularios admin |

### 3.4. Open Badges

| Parámetro | osm.lat | AC3 |
|-----------|---------|-----|
| Issuer name | Comunidad OSM Latam | AC3 (razón social) |
| Badges `event_role` | Sí | Sí (eventos avalados) |
| Badges `osm_activity` | **Sí** (catálogo F3) | **No** (404 / no desplegado) |
| Import awardees CSV | Sí | No |
| Jobs API OSM | Sí | No |
| SMTP envío link certificado | Sí | Sí |
| Config legal web | No | Sí (admin) |

---

## 4. Qué NO cambia entre instancias

- Historias de usuario y reglas de negocio.
- Modelo de datos (mismas tablas).
- Formatos permalink `/c/{slug}` y `/b/{slug}`.
- Badge `event_role` en ambas instancias.
- Soporte multi-rol, pregenerados, editor visual.
- Reglas de sede única e identificación por país.
- API (mismos contratos; distinto base URL).
- Atribución de software (`SOFTWARE_*`, `/about`, bloque `software` en health) — misma política en todas ([§10](#10-atribución-del-software-multi-instancia)).

**Sí cambia:** badges `osm_activity` solo osm.lat (inicialmente).

---

## 5. Identificación por país (configuración compartida)

El **catálogo** `country_identity_config` se carga desde **YAML versionado** en el repo (`docs/anexos/seed/`), aplicado en `prisma/seed.ts` en cada instancia (mismo seed en osm.lat y AC3).

Colombia inicial:

```yaml
CO:
  - code: CC
    label: Cédula de ciudadanía
  - code: CE
    label: Cédula de extranjería
  - code: TI
    label: Tarjeta de identidad
```

Añadir México, Argentina, etc. editando datos, no código.

---

## 6. Plantillas y archivos

| Recurso | Aislamiento |
|---------|-------------|
| Fondos de plantilla | Storage por instancia |
| Certificados pregenerados | Storage por instancia |
| Firmas legales AC3 | Solo bucket AC3 |

No compartir storage entre instancias.

---

## 7. Administradores

- Usuarios **distintos** en cada instancia (tabla `admin_users` propia).
- Un admin de osm.lat **no** accede a AC3.
- Login vía **OAuth OSM**; roles `admin` / `editor` (o sin rol hasta asignación).
- Sin cuenta OpenStreetMap no se puede ser editor ni admin.
- Cada instancia registra su propia OAuth app OSM y `SEED_ADMIN_OSM_USERNAMES` (y/o `SEED_ADMIN_OSM_IDS`).

---

## 8. Checklist despliegue por instancia

| Paso | osm.lat | AC3 |
|------|---------|-----|
| Servidor provisionado | Comunitario osm.lat | Institucional ac3.org.co |
| Docker + Compose instalado | ✓ | ✓ |
| TLS (Let's Encrypt) | ✓ | ✓ |
| Provisionar BD | ✓ | ✓ |
| Configurar ENV | ✓ | ✓ + legal |
| Registrar OAuth app OSM + `OSM_OAUTH_*` | ✓ | ✓ |
| `SEED_ADMIN_OSM_USERNAMES` (y/o ids) | ✓ | ✓ |
| Subir assets marca | ✓ | ✓ |
| Seed country_identity CO | ✓ | ✓ |
| Primer login OAuth del admin seed | ✓ | ✓ |
| Evento piloto | ✓ | ✓ |
| Probar permalink + búsqueda | ✓ | ✓ |
| Probar PDF con bloque legal | N/A | ✓ |
| DNS | certificados.osm.lat | certificados.ac3.org.co |

---

## 9. Tercera instancia (u otras)

Patrón ya soportado por el diseño multi-instancia; **no** forma parte del despliegue v1.0 (solo osm.lat y AC3). Catálogo: [01 §11](./01-vision-y-alcance.md#11-evolución-futura-post-v10).

Mismo patrón: nuevo despliegue + ENV + BD + DNS. Sin cambios en el núcleo de la aplicación.

---

## 10. Atribución del software (multi-instancia)

Separar siempre **emisor** (quién acredita) de **software** (qué lo genera). El branding e Issuer Open Badges son de la instancia; el crédito al código es secundario y no se mezcla con la credencial.

### 10.1. Principio

| Capa | Quién “habla” | Atribución al software |
|------|---------------|------------------------|
| PDF del certificado, datos legales, Issuer / Assertion OB | La instancia (osm.lat / AC3) | **No** |
| UI pública (búsqueda, footer, `/about`, pie de `/c/` y `/b/`) | Instancia + crédito discreto | **Sí** |
| Metadatos técnicos (`/health`, OpenAPI) | Máquina | **Sí**, sin ensuciar el JSON de la credencial |

### 10.2. Nombre y enlace

| Concepto | Valor | Notas |
|----------|-------|-------|
| Nombre de producto (software) | `SOFTWARE_NAME` (default `certificados`) | Distinto de `SITE_NAME` (marca de la instancia) |
| Origen del código | `SOFTWARE_REPO_URL` | **Siempre** el repositorio GitHub, nunca la URL de otra instancia |
| Activar crédito en UI | `SOFTWARE_CREDIT_ENABLED` (default `true`) | Una instancia puede desactivarlo si lo necesita |

Repo canónico: https://github.com/OSMLatam/certificados

### 10.3. Dónde sí

| Superficie | Qué mostrar |
|------------|-------------|
| Footer global | `SITE_FOOTER_TEXT` (organización) **+** línea de crédito de software (si `SOFTWARE_CREDIT_ENABLED`) |
| Búsqueda pública | Misma línea de crédito al pie |
| Permalinks `/c/{slug}`, `/b/{slug}` | Crédito **muy abajo**, tras el contenido de verificación; no en el bloque principal del certificado/badge |
| Página `/about` | Nombre del software, repo, licencia MIT, y que esta URL es un despliegue independiente |
| `GET /health` (y opcionalmente `/ready`) | Objeto `software` + `instance` (ver [10 §8](./10-diseno-codigo-y-anexos.md#8-health-checks-y-observabilidad)) |
| OpenAPI `info` | `title` / `license` / enlace al repo |

Ejemplo de línea de UI (default sugerido):

> Software libre — [certificados](https://github.com/OSMLatam/certificados) (MIT)

### 10.4. Dónde no

| Superficie | Motivo |
|------------|--------|
| Contenido del PDF | Documento del emisor; un “generado con…” rivaliza con marca/NIT/firma |
| Cuerpo del Issuer o Assertion Open Badges | El estándar espera issuer = organización; campos inventados rompen interoperabilidad |
| Enlace a otra instancia como “home del software” | Confunde operador con producto; el origen es el repo |

Extensiones OB para `generator`: fuera de v1.0 (evolución futura si hace falta).

### 10.5. Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `SOFTWARE_NAME` | `certificados` | Nombre del producto (no de la instancia) |
| `SOFTWARE_REPO_URL` | `https://github.com/OSMLatam/certificados` | Enlace canónico al código |
| `SOFTWARE_CREDIT_ENABLED` | `true` | Mostrar crédito en UI pública |
| `SOFTWARE_CREDIT_TEXT` | *(derivado)* | Texto opcional; si vacío, la UI compone desde nombre + repo |

La **versión** del software sale del build (`package.json` / imagen), no de ENV de instancia.

### 10.6. Relación con branding (HU-8.1)

- `SITE_*` = identidad de **esta** instancia.
- `SOFTWARE_*` = identidad del **código**, igual (salvo desactivar crédito) en osm.lat, AC3 y futuras instancias.
