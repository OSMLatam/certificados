# Datos legales AC3 — config de instancia y plantilla visual

**Versión:** 1.0  
**Fecha:** 2026-06-06

Este documento unifica cómo se modelan NIT, razón social, representante legal y firma en AC3. **No hay un subsistema “legal” aparte**: son campos de **configuración de instancia** usados como **capas en el editor visual**, igual que el nombre del participante.

---

## 1. Idea central

```text
┌─────────────────────────┐
│  Config instancia AC3   │  ← única fuente de verdad (ENV / admin instancia)
│  LEGAL_ENTITY_NAME      │
│  LEGAL_NIT              │
│  LEGAL_REPRESENTATIVE   │
│  LEGAL_SIGNATURE_FILE   │
└───────────┬─────────────┘
            │ valores en render
            ▼
┌─────────────────────────┐
│  Editor visual          │  ← posición, fuente, tamaño (layout JSONB)
│  capa: legal.nit        │
│  capa: legal.entity_name│
│  capa: legal.signature  │  ← imagen desde config
└───────────┬─────────────┘
            ▼
       PDF / preview /c/{slug}
```

**osm.lat:** esas claves de config **no existen**; las capas `legal.*` no se ofrecen en el editor (o se ignoran al renderizar).

---

## 2. Fuente única de verdad

### 2.1. Dónde se editan los valores (texto legal)

| Dónde | Quién | Qué |
|-------|-------|-----|
| **Pantalla admin AC3** | Rol `admin` | Razón social, NIT, representante, upload firma |
| **ENV (bootstrap)** | Deploy | Valores iniciales opcionales del primer arranque |
| **No** en cada evento | — | Los eventos nuevos usan la config del momento de emisión |
| **No** en cada participante | — | Son datos de la entidad, no de la persona |

Equivalente documentado en [05-personalizacion-multi-instancia.md](./05-personalizacion-multi-instancia.md).

**v1.0:** edición día a día vía **pantalla admin**; ENV solo como semilla de despliegue.

### 2.2. Snapshot al emitir (decisión cerrada)

Los valores legales son **texto e imagen sobre la gráfica del certificado**, igual que el nombre del participante:

1. **Vista previa / plantilla nueva:** el editor lee la config **actual** (`LEGAL_*`).
2. **Al generar el PDF** (certificado pasa a `issued`, modo `generated`): el sistema copia los valores vigentes a `certificates.legal_snapshot` y los **incrusta en el PDF** almacenado.
3. **Certificados ya emitidos:** no cambian si se actualiza NIT, representante o firma en config. Esos cambios aplican solo a **nuevas emisiones** (otros eventos o nuevos titulares).
4. **Pregenerados:** el legal ya va en el archivo subido; no hay snapshot ni re-render.

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
| `venue_name` | `venues.name` (si aplica) |
| `event_date` | fecha evento/sede |
| `activity_title` | charla/taller |
| `certificate_slug` | texto o QR → `/c/{slug}` |

### 3.2. Campos de instancia (solo AC3, solo si la capa está en la plantilla)

| Token `field` | Origen del valor |
|---------------|------------------|
| `legal.entity_name` | `LEGAL_ENTITY_NAME` |
| `legal.nit` | `LEGAL_NIT` (ej. prefijo UI: "NIT …") |
| `legal.representative` | `LEGAL_REPRESENTATIVE` |
| `legal.signature` | imagen `LEGAL_SIGNATURE_FILE` (capa tipo imagen, no texto) |

El editor visual **lista estos tokens solo en despliegues AC3**.

### 3.3. Ejemplo de `layout` con capas legales

```json
{
  "canvas": { "width": 1754, "height": 1240, "unit": "px" },
  "layers": [
    { "field": "full_name", "x": 877, "y": 400, "fontSize": 48, "align": "center" },
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
| **Página `/c/{slug}`** (verify) | Muestra `legal_snapshot` del certificado (no config actual) |
| **Open Badges Issuer** | `name` / `description` del issuer AC3 desde config **vigente** (nuevas emisiones) |
| **Certificado pregenerado** | Sin capas dinámicas; legal ya va en la imagen subida |

Config define valores para **nuevas** emisiones; cada certificado emitido conserva el legal del momento de generación.

---

## 6. Historias de usuario

Las definiciones canónicas están en [02-historias-de-usuario.md](./02-historias-de-usuario.md) (HU-8.2, HU-3.1, HU-1.5).

---

## 7. Flujo admin AC3 (resumen)

```text
1. Deploy / admin instancia → cargar LEGAL_* (HU-8.2)
2. Crear evento → diseñar plantilla en editor visual (HU-3.1)
3. Colocar capas legal.* donde corresponda
4. Vista previa → PDF con NIT/razón social de config
5. Cargar participantes → emitir certificados igual que osm.lat
```

---

## 8. Referencias

- [Modelo de datos — certificate_templates.layout](./03-modelo-de-datos.md)
- [Editor visual — campos arrastrables](./04-flujos-funcionales.md)
- [Config multi-instancia](./05-personalizacion-multi-instancia.md)
