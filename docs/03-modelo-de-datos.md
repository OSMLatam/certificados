# Modelo de datos

**Versión:** 1.0  
**Fecha:** 2026-06-06  

Esquema conceptual agnóstico de motor (PostgreSQL recomendado).

---

## 1. Principios

1. **Un certificado = un permalink = un rol** en un evento para una persona.
2. **Múltiples roles** → múltiples filas en `certificates` para el mismo `participant` + `event`.
3. **Dos modos:** `generated` (plantilla) | `pregenerated` (archivo subido).
4. **Identificación** extensible por país vía configuración, no ENUM rígido global.
5. **Instancias aisladas:** cada despliegue tiene su propia BD; no hay `instance_id` en tablas.

---

## 2. Diagrama entidad-relación

```
country_identity_config

events 1──N venues
events 1──N participants
events 1──N certificate_templates
events 1──N badge_classes (event_role)

participants 1──N certificates
certificates 1──0..1 badge_assertions (event_role; FK en assertion)

badge_classes 1──N badge_assertions
osm_profiles 1──N badge_assertions (osm_activity)

badge_issuers (1 por instancia, singleton lógico)
instance_legal (0..1 — AC3)
certificates → /c/{slug}
badge_assertions → /b/{slug}

admin_users, admin_sessions, audit_log, permalink_access_log
```

---

## 3. Catálogo de identificación por país

### 3.1. `country_identity_config`

Define tipos de documento válidos por código ISO de país.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID/PK | |
| country_code | CHAR(2) | ISO 3166-1 alpha-2 (`CO`, `MX`, `AR`…) |
| doc_type_code | VARCHAR(10) | `CC`, `CE`, `TI`, `DNI`, `PASSPORT`… |
| doc_type_label | VARCHAR(100) | Etiqueta UI: "Cédula de ciudadanía" |
| validation_regex | VARCHAR(255) | NULL = solo longitud mínima |
| display_order | INT | Orden en selectores |

**Colombia (seed inicial):**

| country_code | doc_type_code | doc_type_label |
|--------------|---------------|----------------|
| CO | CC | Cédula de ciudadanía |
| CO | CE | Cédula de extranjería |
| CO | TI | Tarjeta de identidad |

Otros países se añaden por **datos de configuración**, no cambios de código.

---

## 4. Núcleo del dominio

### 4.1. `events`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| name | VARCHAR(255) | Nombre del evento |
| year | INT | Año (filtro público) |
| start_date | DATE | Fecha principal |
| end_date | DATE | NULL si un solo día |
| country_code | CHAR(2) | País del evento (reglas ID) |
| allowed_roles | JSONB | Array de códigos de rol habilitados |
| status | ENUM | `draft`, `active` |
| pregenerated_only | BOOLEAN | Solo certificados pregenerados (sin plantilla dinámica) |
| default_template_id | UUID FK | NULL al crear; se setea al guardar la primera plantilla (o al marcar default) |
| created_by | UUID FK | `admin_users.id` del creador (soft-delete) |
| deleted_at | TIMESTAMPTZ | NULL = visible; soft-delete |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Orden de creación:** el evento nace **sin** `default_template_id` (nullable). Tras crear la primera `certificate_template` del evento, el sistema la asigna como default si aún es NULL. Evita FK circular evento↔plantilla en el insert inicial.

**Regla UX:** si `venues` count = 1, la sede se infiere en consulta pública.  
**Soft-delete:** excluir de listados admin y de **búsqueda pública** si `deleted_at` no es NULL. Los permalinks `/c/{slug}` y `/b/{slug}` **siguen resolviendo** (enlaces ya compartidos no se rompen). Restore = limpiar `deleted_at` (admin/SQL).

---

### 4.2. `venues` (sedes)

Opcional. Metadato de **contexto** (ciudad, virtual, fecha local) para PDF y admin — **no** identifica al certificado.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| event_id | UUID FK | |
| name | VARCHAR(255) | Ej. Virtual, Bogotá |
| code | VARCHAR(20) | Código interno corto |
| event_date | DATE | NULL = usa fecha del evento |
| created_at | TIMESTAMPTZ | |

**Para qué sirve:** eventos multi-hub o presencial/virtual; texto `venue_name` en plantilla; fecha opcional por sede. **No** entra en UNIQUE del certificado (`participant` + `role` basta).

---

### 4.3. `participants`

Persona en el contexto de un evento (datos de contacto/identidad).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| event_id | UUID FK | |
| venue_id | UUID FK | NULL si no aplica; **metadato** (dónde/modalidad), no parte de la identidad del certificado |
| full_name | VARCHAR(255) | Obligatorio (sale en el certificado) |
| email | VARCHAR(255) | Obligatorio (osm.lat y AC3); almacenar **normalizado** (`trim` + `lower`) |
| country_code | CHAR(2) | País del documento (obligatorio en AC3) |
| doc_type_code | VARCHAR(10) | Obligatorio en AC3; opcional en osm.lat |
| doc_number | VARCHAR(100) | Obligatorio en AC3; opcional en osm.lat |
| activity_title | TEXT | Charla/taller (opcional); si el certificado define override, gana el de `certificates` |
| created_at | TIMESTAMPTZ | |

**Reglas por instancia:**

- **osm.lat:** `full_name` + `email` obligatorios; documento opcional.
- **AC3:** `full_name` + `email` + `country_code` + `doc_type_code` + `doc_number` obligatorios.

**Identidad y unicidad (cerrado):**

- Cada persona en un evento tiene **su propio email**. Un email identifica a **un** participante del evento.
- **UNIQUE** `(event_id, email)` — alta individual, CSV o pregenerados: si el email ya existe en el evento → **rechazar** (error de validación; en CSV atómico → falla todo el lote).
- Varios roles de la misma persona = **varias filas CSV / varios certificados**, mismo email (no otro participante).
- Documento (cuando existe): validar formato vía `country_identity_config`; **no** es clave de unicidad alternativa. Si llega el mismo email con documento distinto al ya guardado → **rechazar** (conflicto de datos).
- Búsqueda pública por email: comparar contra el valor normalizado.

> **Nota:** los **roles** no van aquí; van en `certificates`. La **sede** no forma parte de la clave del certificado: una persona es asistente/ponente/… del **evento**; si hubo varias sedes, se elige una sede “de contexto” (o ninguna) para el texto del PDF.

---

### 4.4. `roles` (catálogo — tabla BD)

Catálogo de roles de participación en eventos. Seed desde [`anexos/seed/roles.yaml`](./anexos/seed/roles.yaml).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| code | VARCHAR(50) UNIQUE | `asistente`, `ponente`, … |
| label | VARCHAR(100) | Etiqueta UI en español |
| display_order | INT | Orden en selectores |
| is_active | BOOLEAN | Default true |

Valores iniciales:

| code | label (es) |
|------|------------|
| asistente | Asistente |
| ponente | Ponente / Conferencista |
| tallerista | Tallerista |
| voluntario | Voluntario |
| organizador | Organizador |

`events.allowed_roles` (JSONB) referencia códigos de esta tabla habilitados por evento.

---

### 4.5. `certificate_templates`

Diseño visual para certificados generados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| event_id | UUID FK | |
| role_code | VARCHAR(50) | NULL = plantilla default del evento |
| name | VARCHAR(255) | Nombre interno |
| background_file_id | UUID FK | → `stored_files` (imagen de fondo en MinIO) |
| layout | JSONB | Capas: posición, fuente, campo (`full_name`, `legal.nit`, …) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**`layout` (generado por editor visual, no editado a mano):**

- **Página:** A4 (210×297 mm). Orientación por defecto del producto: **apaisada** (landscape).
- **Resolución de render:** **150 DPI** → canvas de referencia **1754×1240 px** (A4 landscape).
- **Tipografías:** solo fuentes **abiertas** (SIL OFL / Apache / equivalentes), p. ej. familias tipo Google Fonts (**Noto Sans**, Source Sans 3, …). Embebidas o self-hosted en el HTML de Puppeteer y en el preview del editor; no depender de fuentes instaladas en el cliente.

```json
{
  "canvas": { "width": 1754, "height": 1240, "unit": "px", "paper": "A4", "dpi": 150, "orientation": "landscape" },
  "layers": [
    {
      "field": "full_name",
      "x": 877, "y": 420,
      "fontFamily": "Noto Sans Bold",
      "fontSize": 48,
      "align": "center",
      "color": "#1a1a1a"
    },
    {
      "field": "role_label",
      "x": 877, "y": 520,
      "fontSize": 28,
      "align": "center"
    },
    {
      "field": "permalink_qr",
      "x": 120, "y": 1100,
      "size": 120
    },
    {
      "field": "legal.nit",
      "x": 877, "y": 1065,
      "fontSize": 10,
      "align": "center"
    }
  ]
}
```

Capas `legal.*` solo en plantillas AC3; valores desde config de instancia. Detalle: [08-datos-legales-ac3-plantilla.md](./08-datos-legales-ac3-plantilla.md).

---

### 4.6. `certificates` (entidad central)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| slug | VARCHAR(16) | Permalink; valor generado = **nanoid 12** chars `[A-Za-z0-9_-]` (columna con margen) |
| participant_id | UUID FK | |
| event_id | UUID FK | |
| venue_id | UUID FK | NULL |
| role_code | VARCHAR(50) | Rol de este certificado |
| mode | ENUM | `generated`, `pregenerated` |
| template_id | UUID FK | NULL si pregenerado |
| stored_file_id | UUID FK | Archivo servido: pregenerado subido o PDF generado (inmutable tras `issued`) |
| activity_title | TEXT | Override por rol (ej. charla); si NULL, usar `participants.activity_title` |
| status | ENUM | `pending`, `issued`, `revoked` |
| issued_at | TIMESTAMPTZ | Primera emisión / activación |
| revoked_at | TIMESTAMPTZ | NULL |
| revoke_reason | TEXT | NULL |
| legal_snapshot | JSONB | NULL; copia de `instance_legal` al generar PDF (solo AC3, modo `generated`) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Constraints:**

- UNIQUE `(participant_id, role_code)` — un certificado por rol por persona por evento.
- UNIQUE `slug`.

**Enlace al badge (Fase 2):** la relación canónica es `badge_assertions.certificate_id` → este certificado. **No** hay `badge_assertion_id` en `certificates` (evita FK circular). Consulta: assertion donde `certificate_id = certificates.id`.

**Permalink:**

```
https://certificados.osm.lat/c/{slug}
https://certificados.ac3.org.co/c/{slug}
```

**`legal_snapshot`:** al pasar a `issued` en modo `generated` (instancia AC3), se persisten los valores vigentes de `instance_legal` (y se incrustan en el PDF). El PDF almacenado es inmutable. Ver [08-datos-legales-ac3-plantilla.md](./08-datos-legales-ac3-plantilla.md).

---

### 4.7. `stored_files`

Archivos binarios (pregenerados o renders cacheados).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| storage_key | VARCHAR(500) | |
| mime_type | VARCHAR(100) | `image/png`, `application/pdf` |
| byte_size | BIGINT | |
| checksum_sha256 | CHAR(64) | Integridad |
| uploaded_by | UUID FK admin | |
| created_at | TIMESTAMPTZ | |

---

## 5. Administración y auditoría

### 5.1. `admin_users`

Usuarios del panel autenticados vía **OAuth OpenStreetMap**. Identidad canónica: `osm_id` (sin contraseñas locales). Distinto de `osm_profiles` (badges Fase 3); posible vínculo futuro por el mismo `osm_id`.

| Columna | Tipo | Notas |
|---------|------|--------|
| id | UUID PK | |
| osm_id | BIGINT UNIQUE NOT NULL | ID numérico OSM |
| osm_username | VARCHAR(255) NOT NULL | Nombre actual (se actualiza en cada login) |
| role | `admin` \| `editor` \| NULL | NULL = autenticado sin permiso de panel |
| is_active | BOOLEAN | `false` ⇒ sin acceso aunque tenga rol |
| last_login_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Bootstrap:** al primer OAuth, si `osm_username` está en `SEED_ADMIN_OSM_USERNAMES` o `osm_id` en `SEED_ADMIN_OSM_IDS`, se asigna `role=admin`.

### 5.2. `audit_log`

Acciones administrativas.

| Columna | Tipo |
|---------|------|
| id | UUID PK |
| admin_user_id | UUID FK |
| action | VARCHAR(50) |
| entity_type | VARCHAR(50) |
| entity_id | UUID |
| ip_address | INET |
| metadata | JSONB |
| created_at | TIMESTAMPTZ |

### 5.3. `permalink_access_log`

Consultas al permalink (privacidad: no loguear IPs completas en producción si no es necesario — configurable).

| Columna | Tipo |
|---------|------|
| id | UUID PK |
| certificate_id | UUID FK |
| accessed_at | TIMESTAMPTZ |
| referer | VARCHAR(500) |
| user_agent | TEXT |

### 5.4. `admin_sessions` (Fase 1)

Store de sesión admin en **PostgreSQL** (F1/F2 sin Redis). Cookie `cert_session` = id opaco; el servidor valida contra esta tabla.

| Columna | Tipo | Notas |
|---------|------|--------|
| id | VARCHAR(64) PK | Id de sesión (aleatorio) |
| admin_user_id | UUID FK | |
| data | JSONB | Payload mínimo (p. ej. role snapshot opcional) |
| expires_at | TIMESTAMPTZ | Alineado con `SESSION_MAX_AGE_MS` |
| created_at | TIMESTAMPTZ | |

Logout / expiración → borrar fila. Reinicio de API no pierde sesiones.

---

## 6. Open Badges (núcleo del proyecto)

Ver detalle en [06-open-badges.md](./06-open-badges.md).

**Implementación:** tablas de esta sección en **Fase 2** (`badge_*`) y **Fase 3** (`osm_profiles`). Fase 1 no las crea.

### 6.1. `badge_issuers`

Un registro por instancia (o derivado de config ENV).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| name | VARCHAR(255) | Nombre público del emisor |
| url | VARCHAR(255) | URL instancia |
| description | TEXT | |
| image_storage_key | VARCHAR(500) | Logo issuer |
| public_key | TEXT | NULL en v1.0; firma OBv3 en [evolución futura](./01-vision-y-alcance.md#11-evolución-futura-post-v10) |
| created_at | TIMESTAMPTZ | |

### 6.2. `badge_classes`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| code | VARCHAR(100) UNIQUE | Ej. `osm-100-changesets`, `mapathon-2026-asistente` |
| type | ENUM | `event_role`, `osm_activity` |
| name | VARCHAR(255) | Título del logro |
| description | TEXT | |
| criteria_narrative | TEXT | Texto humano del criterio |
| criteria_rule | JSONB | NULL; regla evaluable por jobs OSM |
| external_source | ENUM | `manual_import`, `osm_api`, `certificate_sync`, `custom` |
| image_storage_key | VARCHAR(500) | Imagen del badge |
| event_id | UUID FK | NULL; obligatorio si `event_role` |
| role_code | VARCHAR(50) | NULL; obligatorio si `event_role` |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

**Ejemplo `criteria_rule` (osm_activity):**

```json
{
  "metric": "changesets_count",
  "operator": ">=",
  "value": 100
}
```

### 6.3. `osm_profiles`

Identidad OSM **estable por `osm_id`**. El username puede cambiar; otro mapper puede reutilizar un username abandonado.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| osm_id | BIGINT UNIQUE NOT NULL | ID numérico OSM (openstreetmap.org) |
| osm_username | VARCHAR(255) NOT NULL | Nombre **actual** (actualizable) |
| osm_username_updated_at | TIMESTAMPTZ | Última sync con API OSM |
| email | VARCHAR(255) | NULL hasta HU-10.5; UNIQUE parcial cuando NOT NULL |
| linked_at | TIMESTAMPTZ | NULL; cuándo se verificó el vínculo email ↔ osm_id |
| created_at | TIMESTAMPTZ | |

**Reglas:**

- Toda emisión/consulta de badge OSM usa **`osm_id`**, no username solo.
- Username en UI se refresca periódicamente o al buscar por username (resolver → osm_id).
- **Vínculo con eventos (HU-10.5):** canónico = `email` verificado en este perfil (1:1). **No** hay `participant_id`: `participants` es por evento; la vista unificada busca certificados por el email vinculado.

### 6.4. `badge_assertions`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| uuid | UUID UNIQUE | ID público OB |
| slug | VARCHAR(16) UNIQUE | Permalink `/b/{slug}` |
| badge_class_id | UUID FK | |
| certificate_id | UUID FK | NULL; set si `event_role` — **única** FK del vínculo certificado↔badge |
| osm_profile_id | UUID FK | NULL; set si `osm_activity` |
| recipient_name | VARCHAR(255) | Snapshot nombre mostrado |
| evidence_url | VARCHAR(500) | `/c/slug`, perfil OSM, etc. |
| evidence_metadata | JSONB | Snapshot métricas en emisión |
| status | ENUM | `pending`, `issued`, `revoked` |
| issued_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | NULL |
| assertion_json | JSONB | Cache JSON-LD |
| created_at | TIMESTAMPTZ | |

**Constraints:**

- UNIQUE `(badge_class_id, certificate_id)` cuando certificate_id NOT NULL.
- UNIQUE `(badge_class_id, osm_profile_id)` cuando osm_profile_id NOT NULL.

Ver ciclo de estados en [07-estados-y-ciclo-de-vida.md](./07-estados-y-ciclo-de-vida.md).

**Permalinks:**

```
https://certificados.osm.lat/b/{slug}
https://certificados.ac3.org.co/b/{slug}
```

### 6.5. `badge_import_batches`

Trazabilidad de imports externos (actividad OSM).

| Columna | Tipo |
|---------|------|
| id | UUID PK |
| badge_class_id | UUID FK |
| source_filename | VARCHAR(255) |
| rows_total | INT |
| rows_issued | INT |
| rows_skipped | INT |
| admin_user_id | UUID FK |
| created_at | TIMESTAMPTZ |

---

## 7. Configuración de instancia

Identidad técnica y marca vía ENV; datos legales AC3 vía **tabla `instance_legal`** (bootstrap ENV opcional). Ver [05](./05-personalizacion-multi-instancia.md) y [08](./08-datos-legales-ac3-plantilla.md).

### 7.1. Variables ENV (identidad / ops)

| Clave | Rol | Ejemplo |
|-------|-----|---------|
| `INSTANCE` | Id técnico del despliegue | `osm_lat` \| `ac3` |
| `SITE_NAME` | Nombre visible (marca) | Certificados OSM Latam |
| `PUBLIC_BASE_URL` | Base única: web, permalinks, OG, links en email | https://certificados.osm.lat |
| `SITE_LOGO_URL` / `SITE_PRIMARY_COLOR` / … | Branding | — |
| `LEGAL_*` | Bootstrap opcional AC3 al primer arranque → fila `instance_legal` | — |
| `DEFAULT_COUNTRY_CODE` | País por defecto formularios | `CO` |

No usar `INSTANCE_NAME` ni `API_PUBLIC_URL` (fusionados en `SITE_NAME` / `PUBLIC_BASE_URL`).

### 7.2. `instance_legal` (Fase 2 — solo AC3)

Singleton lógico: **como máximo una fila** por despliegue. Fuente de verdad editable en pantalla admin (`GET`/`PATCH /api/v1/admin/instance/legal`). Los `LEGAL_*` del ENV solo **siembran** la fila si está vacía al boot.

| Columna | Tipo | Descripción |
|--------|------|-------------|
| id | UUID PK | |
| entity_name | VARCHAR(255) | Razón social |
| nit | VARCHAR(50) | NIT |
| representative | VARCHAR(255) | Representante legal |
| signature_file_id | UUID FK | → `stored_files` (firma/sello); NULL si aún no hay upload |
| updated_by | UUID FK | `admin_users.id` |
| updated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Render:** capas `legal.*` leen esta tabla (no el ENV en caliente). **Snapshot** al emitir: copia JSON a `certificates.legal_snapshot`. **osm.lat:** tabla vacía / no usada; el editor no ofrece capas `legal.*`.

---

## 8. Formato CSV — participantes evento

**Plantilla en panel:** `GET` de descarga (CSV UTF-8) con los mismos encabezados; el editor la abre en Excel/LibreOffice, completa y sube.

**Import atómico (igual que pregenerados):** validar **todas** las filas; si hay error → no escribir nada; informe de fallos. Lote válido → escribir todo. Imports posteriores = incremental (nuevas altas; rechazar duplicados ya en BD).

**Email duplicado en el lote o ya en BD (mismo evento, mismo email, mismo rol):** rechazar. **Mismo email + otro rol:** OK (otro certificado). **Mismo email con documento distinto al del participante existente:** rechazar.

Ejemplo: [anexos/csv/participantes-ejemplo.csv](./anexos/csv/participantes-ejemplo.csv).

```csv
full_name;email;country_code;doc_type;doc_number;role;activity_title;venue_code
Ana García;ana@mail.com;CO;CC;1234567890;asistente;;
Ana García;ana@mail.com;CO;CC;1234567890;voluntario;;
Carlos López;carlos@mail.com;CO;CE;987654;ponente;Mapping con OpenStreetMap;VIR
```

| Columna | Obligatorio | Notas |
|---------|-------------|-------|
| full_name | Sí | |
| email | Sí | Obligatorio en osm.lat y AC3 (recipient OB + envío de enlace) |
| country_code | Si hay doc / siempre en AC3 | ISO alpha-2 |
| doc_type | Si hay doc / siempre en AC3 | CC, CE, TI… |
| doc_number | Si hay doc / siempre en AC3 | |
| role | Sí | Uno por fila |
| activity_title | No | Ponente/tallerista |
| venue_code | No | Si evento multi-sede |

## 9. Formato CSV — awardees badge OSM

**Plantilla en panel:** descarga CSV de ejemplo (mismo formato).

Ejemplo: [anexos/csv/awardees-osm-ejemplo.csv](./anexos/csv/awardees-osm-ejemplo.csv).

```csv
osm_id;osm_username;earned_at;evidence_url
123456;AngocA;2026-01-15T10:00:00Z;https://www.openstreetmap.org/user/AngocA
789012;;;
```

| Columna | Obligatorio | Notas |
|---------|-------------|-------|
| osm_id | Sí | Identidad estable |
| osm_username | No | Etiqueta legible; se actualiza en profile |
| earned_at | No | Default = now |
| evidence_url | No | Default = perfil OSM por osm_id |

---

## 10. Carga de certificados pregenerados

Flujo de carga masiva (Must):

1. El editor **descarga la plantilla** CSV desde el panel (encabezados + filas de ejemplo; abre en Excel/LibreOffice).
2. Completa la hoja: columnas mínimas `filename`, `full_name`, `email`, `role` (+ doc en AC3). `filename` debe coincidir exactamente con un archivo del ZIP.
3. Sube hoja **CSV** (UTF-8; delimiter `;`) + ZIP (o carpeta empaquetada) con los archivos. **v1.0 no importa ODS nativo** — si se edita en LibreOffice/Excel, guardar/exportar como CSV.
4. Validar **todo el lote**; si hay error → no escribir nada; devolver informe.
5. Imports **incrementales** al mismo evento; rechazar filas que dupliquen certificado ya existente (mismo email + rol) o email con datos conflictivos.
6. Upload 1:1 sigue disponible para correcciones.

**Fuera de v1.0:** herramienta de escritorio que lea una carpeta local y prellene `filename`.

Ejemplo de hoja: [anexos/csv/pregenerados-ejemplo.csv](./anexos/csv/pregenerados-ejemplo.csv).

```csv
filename;full_name;email;country_code;doc_type;doc_number;role
cert-ana-asistente.pdf;Ana García;ana@mail.com;CO;CC;1234567890;asistente
cert-carlos-ponente.pdf;Carlos López;carlos@mail.com;CO;CE;987654321;ponente
```

---

## 11. Índices sugeridos

```sql
CREATE UNIQUE INDEX idx_certificates_slug ON certificates(slug);
CREATE INDEX idx_certificates_event ON certificates(event_id);
CREATE UNIQUE INDEX idx_participants_event_email ON participants(event_id, email);
CREATE INDEX idx_participants_event_doc ON participants(event_id, country_code, doc_type_code, doc_number);
CREATE UNIQUE INDEX idx_badge_assertions_slug ON badge_assertions(slug);
CREATE INDEX idx_badge_assertions_certificate ON badge_assertions(certificate_id);
CREATE INDEX idx_badge_assertions_osm ON badge_assertions(osm_profile_id);
CREATE INDEX idx_osm_profiles_osm_id ON osm_profiles(osm_id);
CREATE INDEX idx_osm_profiles_username ON osm_profiles(osm_username);
CREATE INDEX idx_badge_classes_type ON badge_classes(type, is_active);
CREATE INDEX idx_events_year_status ON events(year, status);
```
