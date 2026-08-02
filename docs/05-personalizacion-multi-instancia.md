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
              → Redis 7 (BullMQ)
              → MinIO (S3 local — PDFs, pregenerados, firmas)
```

- **No** hay BD compartida ni storage compartido entre osm.lat y AC3.
- **Backups:** responsabilidad de cada operador (pg_dump + sync bucket MinIO).
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
| Texto footer | Comunidad LATAM | Texto legal AC3 |

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
| `SMTP_*` | Envío opcional de enlaces por correo |
| `DEFAULT_COUNTRY_CODE` | País por defecto en formularios admin |

### 3.4. Open Badges

| Parámetro | osm.lat | AC3 |
|-----------|---------|-----|
| Issuer name | Comunidad OSM Latam | AC3 (razón social) |
| Badges `event_role` | Sí | Sí (eventos avalados) |
| Badges `osm_activity` | **Sí** (100 changesets, notas, etc.) | No (inicialmente) |
| Import awardees CSV | Sí | No |
| Jobs API OSM | Sí | No |

---

## 4. Qué NO cambia entre instancias

- Historias de usuario y reglas de negocio.
- Modelo de datos (mismas tablas).
- Formatos permalink `/c/{slug}` y `/b/{slug}`.
- Badge `event_role` en ambas instancias.
- Soporte multi-rol, pregenerados, editor visual.
- Reglas de sede única e identificación por país.
- API (mismos contratos; distinto base URL).

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
