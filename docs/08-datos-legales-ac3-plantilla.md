# Datos legales AC3 — config de instancia y plantilla visual

**Versión:** 1.0  
**Fecha:** 2026-06-06

Este documento unifica cómo se modelan NIT, razón social, representante legal y firma en AC3. **No hay un subsistema “legal” aparte**: son campos de **configuración de instancia** usados como **capas en el editor visual**, igual que el nombre del participante.

---

## 1. Idea central

```text
┌─────────────────────────┐
│  instance_legal (BD)    │  ← única fuente de verdad (admin AC3)
│  entity_name, nit, …    │     bootstrap opcional desde LEGAL_* ENV
│  signature_file_id      │
└──────────┬──────────────┘
            │ valores en render / snapshot
            ▼
┌─────────────────────────┐
│  Editor visual          │  ← posición, fuente, tamaño (layout JSONB)
│  capa: legal.nit        │
│  capa: legal.entity_name│
│  capa: legal.signature  │  ← imagen desde stored_files
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
| **Tabla `instance_legal`** + pantalla admin AC3 | Rol `admin` | Razón social, NIT, representante, upload firma |
| **ENV `LEGAL_*` (bootstrap)** | Deploy | Siembra la fila si está vacía al primer arranque |
| **No** en cada evento | — | Los eventos nuevos usan la config del momento de emisión |
| **No** en cada participante | — | Son datos de la entidad, no de la persona |

Equivalente documentado en [05-personalizacion-multi-instancia.md](./05-personalizacion-multi-instancia.md) y esquema en [03 §7.2](./03-modelo-de-datos.md).

**v1.0:** edición día a día vía **pantalla admin** → BD; ENV solo como semilla de despliegue.

### 2.2. Snapshot al emitir (decisión cerrada)

Los valores legales del **PDF generado** son texto e imagen sobre la gráfica, igual que el nombre del participante. La **página `/c/`** y la API verify **nunca** leen `instance_legal` vigente de un certificado ya `issued` (si el NIT cambia, un permalink viejo no debe mentir).

1. **Vista previa / plantilla nueva:** el editor lee `instance_legal` **actual**.
2. **Al pasar a `issued` (instancia AC3, ambos modos):** el sistema copia los valores vigentes a `certificates.legal_snapshot`.
   - **`generated`:** además **incrusta** esos valores en el PDF almacenado (capas `legal.*`).
   - **`pregenerated`:** el archivo subido **no se reescribe** (el legal visual ya va en el arte). El snapshot existe **solo** para `/c/` y `GET /api/v1/verify/c/{slug}`.
3. **Certificados ya `issued`:** no cambian si se actualiza NIT, representante o firma en config. Esos cambios aplican solo a **nuevas** emisiones.
4. **`pending` / `failed`:** aún no hay snapshot. `/c/` muestra el indicador de estado y **no** un bloque legal estructurado (no se usa config vigente como si fuera la credencial).
5. **osm.lat:** `legal_snapshot` queda NULL.

No hay fallback a `instance_legal` vigente en `/c/` de un `issued`: eso reescribiría la historia del certificado.

```json
{
  "entity_name": "Asociación …",
  "nit": "900.123.456-7",
  "representative": "Nombre Apellido",
  "signature_storage_key": "legal/signatures/2026.png"
}
```

```json
{
  "entity_name": "Asociación …",
  "nit": "900.123.456-7",
  "representative": "Nombre Apellido",
  "signature_storage_key": "legal/signatures/2026.png"
}
```

### 2.3. Dónde se editan posición y estilo

| Dónde | Quién | Qué |
|-------|-------|-----|
| **Editor visual de plantilla** | Editor de evento | x, y, fuente, tamaño, alineación de cada capa |
| Por evento / rol | — | Igual que `full_name` o `fecha_evento` |

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
| `legal.representative` | `instance_legal.representative` |
| `legal.signature` | imagen vía `instance_legal.signature_file_id` → `stored_files` (capa tipo imagen, no texto) |

El editor visual **lista estos tokens solo en despliegues AC3**.

### 3.3. Ejemplo de `layout` con capas legales

```json
{
  "canvas": { "width": 1754, "height": 1240, "unit": "px", "paper": "A4", "dpi": 150, "orientation": "landscape" },
  "layers": [
    { "field": "full_name", "x": 877, "y": 400, "fontSize": 48, "align": "center", "fontFamily": "Noto Sans Bold" },
    { "field": "legal.entity_name", "x": 877, "y": 1050, "fontSize": 10, "align": "center" },
    { "field": "legal.nit", "x": 877, "y": 1065, "fontSize": 10, "align": "center" },
    { "field": "legal.representative", "x": 877, "y": 1080, "fontSize": 9, "align": "center" },
    { "field": "legal.signature", "x": 1200, "y": 1020, "width": 180, "height": 60 }
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
| Render | Genérico: `field` → resolver fuente (participant / event / **instance config**) |

---

## 5. Usos secundarios (mismos valores, sin lógica extra)

| Superficie | Comportamiento |
|------------|----------------|
| **PDF / preview** | Capas `legal.*` en layout |
| **Página `/c/{slug}`** (verify) | `issued` AC3: muestra `legal_snapshot` (no config actual). `pending`/`failed`: sin bloque legal estructurado. |
| **Open Badges Issuer** | `name` / `description` del issuer AC3 desde config **vigente** (nuevas emisiones) |
| **Certificado pregenerado** | Archivo intacto (legal visual en el upload). Snapshot al `issued` para `/c/` y verify, igual que `generated`. |

Config define valores para **nuevas** emisiones; cada certificado `issued` conserva el legal del momento en que pasó a `issued` (`legal_snapshot`).

---

## 6. Historias de usuario

Las definiciones canónicas están en [02-historias-de-usuario.md](./02-historias-de-usuario.md) (HU-8.2, HU-3.1, HU-1.5).

---

## 7. Flujo admin AC3 (resumen)

```text
1. Deploy / admin instancia → cargar `instance_legal` (HU-8.2; bootstrap ENV opcional)
2. Crear evento → diseñar plantilla en editor visual (HU-3.1)
3. Colocar capas legal.* donde corresponda
4. Vista previa → PDF con NIT/razón social de `instance_legal`
5. Cargar participantes → emitir certificados igual que osm.lat
```

---

## 8. Referencias

- [Modelo de datos — certificate_templates.layout](./03-modelo-de-datos.md)
- [Editor visual — campos arrastrables](./04-flujos-funcionales.md)
- [Config multi-instancia](./05-personalizacion-multi-instancia.md)
