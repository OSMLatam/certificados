# Datos legales AC3 — config de instancia y plantilla visual

**Versión:** 1.0  
**Fecha:** 2026-06-06

Este documento unifica cómo se modelan NIT, razón social, representante legal, **N firmantes**, **ciudad/fecha de expedición** y **folio consecutivo** en AC3. **No hay un subsistema “legal” aparte**: son campos de **configuración de instancia** (más un contador de sistema) usados como **capas en el editor visual**, igual que el nombre del participante.

---

## 1. Idea central

```text
┌─────────────────────────┐
│  instance_legal (BD)    │  ← única fuente de verdad (admin AC3)
│  entity_name, nit, …    │     bootstrap opcional desde LEGAL_* ENV
│  last_folio (sistema)   │  ← no editable en pantalla; serie global
│  issue_city             │  ← ciudad de expedición (pie legal)
│  instance_legal_signers │  ← N firmantes; slots 1..8 estables
└──────────┬──────────────┘
            │ valores en render / snapshot
            ▼
┌─────────────────────────┐
│  Editor visual          │  ← posición, fuente, tamaño (layout JSONB)
│  capa: legal.nit        │
│  capa: legal.entity_name│
│  capa: legal.folio      │  ← consecutivo al issued (preview: “—”)
│  capa: legal.issue_city │
│  capa: legal.issue_date │  ← issued_at (preview: “—”); ≠ event_date
│  capa: legal.signer.1.* │  ← name, title, signature (imagen)
│  capa: legal.signer.2.* │  ← idem; hasta slot 8
└──────────┬──────────────┘
            ▼
       PDF / preview /c/{slug}
```

**osm.lat:** no se usa `instance_legal`; las capas `legal.*` no se ofrecen en el editor (o se ignoran al renderizar).

**AC3:** todos los eventos de la instancia pueden usar capas `legal.*`; no hay flag “avalado” por evento. Si una plantilla no incluye esas capas, el PDF `generated` no muestra bloque legal. El `legal_snapshot` se escribe **igual** al pasar a `issued` (también en pregenerados) para la página `/c/` y la API verify.

---

## 2. Fuente única de verdad

### 2.1. Dónde se editan los valores (texto legal)

| Dónde | Quién | Qué |
|-------|-------|-----|
| **Tabla `instance_legal`** + `instance_legal_signers` + pantalla admin AC3 | Rol `admin` | Razón social, NIT, representante, ciudad de expedición, N firmantes (nombre, cargo, imagen). **No** edita `last_folio`. |
| **ENV `LEGAL_*` (bootstrap)** | Deploy | Siembra la fila si está vacía al primer arranque |
| **No** en cada evento | — | Los eventos nuevos usan la config del momento de emisión |
| **No** en cada participante | — | Son datos de la entidad, no de la persona |

Equivalente documentado en [05-personalizacion-multi-instancia.md](./05-personalizacion-multi-instancia.md) y esquema en [03 §7.2](./03-modelo-de-datos.md).

**v1.0:** edición día a día vía **pantalla admin** → BD; ENV solo como semilla de despliegue.

### 2.2. Snapshot al emitir (decisión cerrada)

Los valores legales del **PDF generado** son texto e imagen sobre la gráfica, igual que el nombre del participante. La **página `/c/`** y la API verify **nunca** leen `instance_legal` vigente de un certificado ya `issued` (si el NIT cambia, un permalink viejo no debe mentir).

1. **Vista previa / plantilla nueva:** el editor lee `instance_legal` **actual**.
2. **Al pasar a `issued` (instancia AC3, ambos modos):** el sistema reserva `folio` (§2.4), fija la fecha de expedición (§2.6) y copia los valores vigentes **más folio, firmantes, ciudad y `issued_at`** a `certificates.legal_snapshot`.
   - **`generated`:** además **incrusta** esos valores en el PDF almacenado (capas `legal.*`, incluido `legal.folio`, `legal.issue_*` y `legal.signer.{n}.*`).
   - **`pregenerated`:** el archivo subido **no se reescribe** (el legal visual ya va en el arte). El snapshot existe **solo** para `/c/` y `GET /api/v1/verify/c/{slug}`. Un “N.º”, firmas o “expedido en…” pintados en el arte **no** se sincronizan con el snapshot.
3. **Certificados ya `issued`:** no cambian si se actualiza NIT, representante, firmantes o firma en config. Esos cambios aplican solo a **nuevas** emisiones.
4. **`pending` / `failed`:** aún no hay snapshot. `/c/` muestra el indicador de estado y **no** un bloque legal estructurado (no se usa config vigente como si fuera la credencial).
5. **osm.lat:** `legal_snapshot` queda NULL.

No hay fallback a `instance_legal` vigente en `/c/` de un `issued`: eso reescribiría la historia del certificado.

```json
{
  "entity_name": "Asociación …",
  "nit": "900.123.456-7",
  "representative": "Nombre Apellido",
  "issue_city": "Bogotá D.C.",
  "issued_at": "2026-09-10T19:23:00.000Z",
  "folio": 142,
  "signers": [
    {
      "slot": 1,
      "name": "Ana Pérez",
      "title": "Presidente",
      "signature_storage_key": "legal/signatures/ana.png"
    },
    {
      "slot": 2,
      "name": "Luis Gómez",
      "title": "Secretario",
      "signature_storage_key": "legal/signatures/luis.png"
    }
  ]
}
```

### 2.3. Dónde se editan posición y estilo

| Dónde | Quién | Qué |
|-------|-------|-----|
| **Editor visual de plantilla** | Editor de evento | x, y, fuente, tamaño, alineación de cada capa |
| Por evento / rol | — | Igual que `full_name` o `fecha_evento` |

### 2.4. Folio consecutivo (decisión cerrada)

Serie **global de la instancia AC3**: un solo contador para todos los eventos y años. No se reinicia. osm.lat no asigna folio.

El folio es el número humano (“certificado AC3 n.º 142”). El `slug` sigue siendo el identificador técnico del permalink.

| Pieza | Contrato |
|-------|----------|
| Columna `certificates.folio` | INT NULL. UNIQUE parcial `WHERE folio IS NOT NULL`. |
| Contador `instance_legal.last_folio` | INT NOT NULL DEFAULT 0. Lo incrementa **solo** el sistema. |
| Cuándo nace | Al **primer** `transitionToIssued` (lazy: primera visita humana a metadata). **No** al alta CSV. |
| Por qué antes del `issued` | El PDF `generated` pinta `legal.folio`; hay que **reservar** el número **antes** de Puppeteer. No se puede asignar después del put. |
| Reserva | Lock certificado → si `folio` IS NULL: `SELECT instance_legal FOR UPDATE`; `last_folio + 1`; escribir `certificates.folio`; soltar el lock de `instance_legal` (no retenerlo durante el render). Reintento / `failed` / `retry-issue`: **mismo** folio (no incrementar otra vez). |
| Render falla | El certificado sigue `pending` (o pasa a `failed`) **con folio ya reservado**. Hueco si nunca llega a `issued`. No se decrementa `last_folio`. |
| Pregenerado | Misma reserva al inicio de `transitionToIssued`; el archivo no se reescribe. Folio visible en `/c/` vía snapshot. No pintar un “N.º” competidor en el arte. |
| `issued` | Snapshot incluye `folio`. Put MinIO **antes** del UPDATE `issued` ([10 §4.2.2](./10-diseno-codigo-y-anexos.md)). |
| Revocación | Conserva el folio. No se reutiliza. |
| Preview / plantilla | Token `legal.folio` muestra **“—”**. **No** reserva ni incrementa. |
| `/c/` y verify | Folio del snapshot (AC3 `issued`). Búsqueda pública v1.0: email/documento. Admin **sí** filtra por folio. |
| PATCH legal | No acepta `last_folio`. Reset de emergencia = ops SQL. |

### 2.5. Firmantes N (decisión cerrada)

No hay un único `signature_file_id` en `instance_legal`. Hay **N firmantes** en `instance_legal_signers`, cada uno con nombre, cargo e imagen.

El **representante legal** (`instance_legal.representative` / token `legal.representative`) sigue siendo dato **institucional** de la entidad. Puede coincidir con un firmante; no se fusiona en el esquema.

| Pieza | Contrato |
|-------|----------|
| Máximo | `LEGAL_MAX_SIGNERS` = **8** (constante de spec/código, no ENV). |
| Slot | Entero **1..8**, estable. Borrar el slot 2 **no** convierte el 3 en 2. |
| Fila | Slot vacío = no hay fila. `name` obligatorio si la fila existe; `title` e imagen opcionales. |
| Tokens | `legal.signer.{n}.name`, `legal.signer.{n}.title`, `legal.signer.{n}.signature` (imagen). **No** existe `legal.signature` (singular). |
| Paleta del editor | AC3 lista solo los slots **con fila**. El schema de `layout` acepta `n` 1..8 (una plantilla hecha para 3 firmas sigue válida si luego hay 2). |
| Render | Slot sin fila → capa vacía (emisión OK). Firmante sin capa en la plantilla → no sale en el PDF. |
| Preview | Usa firmantes **vigentes** (como NIT). |
| Snapshot | Array `signers` con `slot`, `name`, `title`, `signature_storage_key`. |
| `/c/` y verify | Muestran nombres/cargos del snapshot (imágenes opcionales). `pending`/`failed`: sin bloque. |
| Pregenerado | Firmas visuales van en el arte; el snapshot igual se escribe para `/c/`. |
| Bootstrap | Solo slot 1: `LEGAL_SIGNER_1_NAME`, `LEGAL_SIGNER_1_TITLE`, `LEGAL_SIGNER_1_SIGNATURE_FILE`. |
| PATCH | Reescritura de la lista de slots; 400 si `slot` fuera de 1..8 o duplicado. |

### 2.6. Ciudad y fecha de expedición (decisión cerrada)

Dos capas distintas. El **cuerpo** del certificado sigue usando `event_date` y `venue_name` (cuándo/dónde fue la actividad). El **pie legal** usa ciudad de la instancia + día en que se **expide** el documento (`issued_at`).

Con emisión lazy, esa fecha puede ser **días o semanas después** del evento: es intencional.

| Pieza | Contrato |
|-------|----------|
| Ciudad | `instance_legal.issue_city` (texto libre, p. ej. “Bogotá D.C.”). Token `legal.issue_city`. Vacío → capa vacía. |
| Fecha | `certificates.issued_at` (TIMESTAMPTZ, ya existía). Token `legal.issue_date`: **solo fecha** en zona `America/Bogota`, locale `es-CO` (ej. “10 de septiembre de 2026”). **Sin hora.** |
| Cuándo se fija | En el `transitionToIssued` que **tiene éxito**. Se captura `now` **antes** del render, se pinta en el PDF `generated` y se persiste **el mismo** instante como `issued_at`. Si el render/put falla, no se escribe `issued_at`; el reintento toma un `now` nuevo. |
| Preview | `legal.issue_city` = config vigente. `legal.issue_date` = “—” (como el folio). |
| `/c/` y verify | Muestran **ambas** fechas: actividad (`event_date`) y expedición (snapshot / `issued_at`). |
| Pregenerado | El arte no se reescribe. Snapshot lleva `issue_city` + `issued_at` para `/c/`. |
| osm.lat | Sin estos tokens. |
| Bootstrap | `LEGAL_ISSUE_CITY`. |
| No es | `event_date`, sede del evento, ni un token único “expedido en X a Y” (el editor coloca las dos capas). |

---

## 3. Catálogo de campos de plantilla

### 3.1. Campos por participante / evento (ambas instancias)

| Token `field` | Origen del valor |
|---------------|------------------|
| `full_name` | `participants.full_name` |
| `document` | tipo + número |
| `role_label` | rol del certificado |
| `event_name` | `events.name` |
| `venue_name` | `certificates.venue_id` → fallback `participants.venue_id` |
| `event_date` | fecha evento/sede |
| `activity_title` | charla/taller |
| `certificate_slug` | texto del slug del certificado |
| `permalink_qr` | imagen QR con URL `/c/{slug}` |

Catálogo canónico compartido con [04 §5](./04-flujos-funcionales.md). **No** fusionar slug y QR en un solo token.

### 3.2. Campos de instancia (solo AC3, solo si la capa está en la plantilla)

| Token `field` | Origen del valor |
|---------------|------------------|
| `legal.entity_name` | `instance_legal.entity_name` |
| `legal.nit` | `instance_legal.nit` (ej. prefijo UI: "NIT …") |
| `legal.representative` | `instance_legal.representative` (entidad; no es un firmante) |
| `legal.folio` | `certificates.folio` al `issued`; en preview: “—” |
| `legal.issue_city` | `instance_legal.issue_city` |
| `legal.issue_date` | `certificates.issued_at` en `America/Bogota` (solo fecha, `es-CO`); preview: “—” |
| `legal.signer.{n}.name` | `instance_legal_signers.name` del slot `n` (1..8) |
| `legal.signer.{n}.title` | `instance_legal_signers.title` |
| `legal.signer.{n}.signature` | imagen vía `signature_file_id` → `stored_files` |

El editor visual **lista estos tokens solo en despliegues AC3**. Paleta de firmantes: solo slots **con fila**. Schema: `n` ∈ 1..8. **No** hay token `legal.signature`.

### 3.3. Ejemplo de `layout` con capas legales

```json
{
  "canvas": { "width": 1754, "height": 1240, "unit": "px", "paper": "A4", "dpi": 150, "orientation": "landscape" },
  "layers": [
    { "field": "full_name", "x": 877, "y": 400, "fontSize": 48, "align": "center", "fontFamily": "Noto Sans Bold" },
    { "field": "event_date", "x": 877, "y": 560, "fontSize": 22, "align": "center" },
    { "field": "legal.folio", "x": 140, "y": 80, "fontSize": 12, "align": "left" },
    { "field": "legal.entity_name", "x": 877, "y": 1050, "fontSize": 10, "align": "center" },
    { "field": "legal.nit", "x": 877, "y": 1065, "fontSize": 10, "align": "center" },
    { "field": "legal.issue_city", "x": 877, "y": 1100, "fontSize": 10, "align": "center" },
    { "field": "legal.issue_date", "x": 877, "y": 1115, "fontSize": 10, "align": "center" },
    { "field": "legal.representative", "x": 877, "y": 1080, "fontSize": 9, "align": "center" },
    { "field": "legal.signer.1.signature", "x": 400, "y": 980, "width": 180, "height": 60 },
    { "field": "legal.signer.1.name", "x": 490, "y": 1050, "fontSize": 10, "align": "center" },
    { "field": "legal.signer.1.title", "x": 490, "y": 1065, "fontSize": 9, "align": "center" },
    { "field": "legal.signer.2.signature", "x": 1200, "y": 980, "width": 180, "height": 60 },
    { "field": "legal.signer.2.name", "x": 1290, "y": 1050, "fontSize": 10, "align": "center" },
    { "field": "legal.signer.2.title", "x": 1290, "y": 1065, "fontSize": 9, "align": "center" }
  ]
}
```

---

## 4. Principios de diseño

| Concepto | Enfoque |
|----------|---------|
| Bloque legal institucional | Capas `legal.*` en la plantilla, no subsistema aparte |
| Presencia del bloque legal | Si la plantilla no tiene capas `legal.*`, no se muestra nada |
| Responsabilidades HU | **HU-8.2** = editar valores (config instancia); **HU-1.5** + **HU-3.1** = colocar capas en plantilla |
| Render | Genérico: `field` → resolver fuente (participant / event / **instance config** / firmantes / `certificates.folio` / `issued_at`) |

---

## 5. Usos secundarios (mismos valores, sin lógica extra)

| Superficie | Comportamiento |
|------------|----------------|
| **PDF / preview** | Capas `legal.*` en layout. Preview de `legal.folio` y `legal.issue_date` = “—”. |
| **Página `/c/{slug}`** (verify) | `issued` AC3: muestra `legal_snapshot` (folio, firmantes, ciudad/fecha de expedición) **y** la fecha del evento. `pending`/`failed`: sin bloque legal estructurado. |
| **Open Badges Issuer** | `name` / `description` del issuer AC3 desde config **vigente** (nuevas emisiones) |
| **Certificado pregenerado** | Archivo intacto (legal visual en el upload). Snapshot al `issued` para `/c/` y verify, igual que `generated`. |

Config define valores para **nuevas** emisiones; cada certificado `issued` conserva el legal del momento en que pasó a `issued` (`legal_snapshot`).

---

## 6. Historias de usuario

Las definiciones canónicas están en [02-historias-de-usuario.md](./02-historias-de-usuario.md) (HU-8.2, HU-3.1, HU-1.5).

---

## 7. Flujo admin AC3 (resumen)

```text
1. Deploy / admin instancia → cargar `instance_legal` (ciudad de expedición) y firmantes (HU-8.2)
2. Crear evento → diseñar plantilla en editor visual (HU-3.1)
3. Colocar capas de **evento** (`event_date`, `venue_name`) y de **pie legal** (`legal.issue_city`, `legal.issue_date`, firmantes, …)
4. Vista previa → ciudad real; folio y fecha de expedición = “—”
5. Cargar participantes → emitir (lazy): `issued_at` = primera visita humana
```

---

## 8. Referencias

- [Modelo de datos — certificate_templates.layout](./03-modelo-de-datos.md)
- [Editor visual — campos arrastrables](./04-flujos-funcionales.md)
- [Config multi-instancia](./05-personalizacion-multi-instancia.md)
