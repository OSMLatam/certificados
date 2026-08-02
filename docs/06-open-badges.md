# Open Badges

**Versión:** 1.0  
**Fecha:** 2026-06-06  
**Alcance:** Módulo **integrado** del proyecto (no extensión opcional tardía).

---

## 1. Posición en el producto

Open Badges es un **pilar del sistema**, al mismo nivel que los certificados PDF:

| Credencial | Ruta | Formato | Caso de uso |
|------------|------|---------|-------------|
| Certificado | `/c/{slug}` | PDF / imagen | Eventos, diploma, LinkedIn, AC3 legal |
| Badge | `/b/{slug}` | Open Badge 3.0 (JSON-LD) | Backpack, logros OSM, complemento de evento |

Un certificado de evento **genera automáticamente** un badge vinculado.  
Un badge de actividad OSM **puede existir sin certificado**.

---

## 2. Dos familias de badges

### 2.1. Badge de evento (`type: event_role`)

| Aspecto | Detalle |
|---------|---------|
| Fuente | Emisión de `certificate` (rol en evento) |
| PDF | Sí, en `/c/{slug}` |
| Badge | Sí, en `/b/{slug}` — evidence apunta a `/c/{slug}` |
| BadgeClass | Por evento + rol (ej. "Ponente — Mapathon 2026") |
| Instancias | osm.lat y AC3 |

### 2.2. Badge de actividad OSM (`type: osm_activity`)

| Aspecto | Detalle |
|---------|---------|
| Fuente | Criterio externo o regla OSM |
| PDF | **No** |
| Badge | Sí, solo `/b/{slug}` |
| Ejemplos | 100 changesets, 100 notas resueltas, cuenta creada |
| Instancia principal | **osm.lat** |
| Identidad | `osm_id` (+ `osm_username` actualizable) |

**Criterios externos — modos de emisión:**

```mermaid
flowchart LR
    BC[BadgeClass definido en admin]
    BC --> M1[Import CSV osm_id list]
    BC --> M2[Job evalúa API OSM / stats]
    M1 --> A[Assertion + /b/slug]
    M2 --> A
```

> **v1.0:** modos M1 (import CSV) y M2 (job Overpass). Webhook (servicio externo): [evolución futura](./01-vision-y-alcance.md#11-evolución-futura-post-v10).

---

## 3. Mapeo Open Badges 3.0

| OB 3.0 | Entidad en sistema |
|--------|-------------------|
| **Profile (Issuer)** | Config instancia + `badge_issuers` |
| **Achievement (BadgeClass)** | `badge_classes` |
| **VerifiableCredential** | `badge_assertions` |
| **Evidence** | URL `/c/` o perfil OSM / snapshot API |
| **Verification** | `/b/{slug}`, `/badges/assertions/{uuid}.json` |

---

## 4. Issuer por instancia

### osm.lat

```json
{
  "@context": "https://w3id.org/openbadges/v3",
  "type": "Profile",
  "id": "https://certificados.osm.lat/badges/issuer.json",
  "name": "OSM Latam — Certificados y Badges",
  "url": "https://certificados.osm.lat",
  "description": "Certificados de eventos y badges por actividad en OpenStreetMap."
}
```

### AC3

```json
{
  "@context": "https://w3id.org/openbadges/v3",
  "type": "Profile",
  "id": "https://certificados.ac3.org.co/badges/issuer.json",
  "name": "AC3 — Certificados institucionales",
  "url": "https://certificados.ac3.org.co",
  "description": "NIT … Certificados y badges de eventos con aval AC3."
}
```

---

## 5. Ejemplos de BadgeClass

### Evento

```json
{
  "type": "osm_activity | event_role",
  "code": "mapathon-monteria-2026-asistente",
  "name": "Asistente — Mapathon Montería 2026",
  "description": "Participó como asistente en el mapathon.",
  "image_url": "…/badges/images/mapathon-asistente.png",
  "criteria_narrative": "Asistió al evento presencial/virtual del 2 mar 2026.",
  "event_id": "uuid",
  "role_code": "asistente"
}
```

### Actividad OSM

```json
{
  "type": "osm_activity",
  "code": "osm-100-changesets",
  "name": "100 changesets en OpenStreetMap",
  "description": "Ha realizado al menos 100 changesets.",
  "criteria_narrative": "Conteo verificado vía API OSM.",
  "criteria_rule": {
    "metric": "changeset_count",
    "operator": ">=",
    "value": 100
  },
  "external_source": "osm_api | manual_import | custom_service"
}
```

---

## 6. Endpoints

| Ruta | Descripción |
|------|-------------|
| `GET /b/{slug}` | Página pública badge + verify + botón backpack |
| `GET /badges/issuer.json` | Issuer OB |
| `GET /badges/classes/{id}.json` | BadgeClass |
| `GET /badges/assertions/{uuid}.json` | Assertion JSON-LD |
| `GET /api/v1/badges/verify/{slug}` | Verificación JSON |
| `POST /api/v1/admin/badges/import` | Import awardees CSV |
| `POST /api/v1/admin/badges/sync/{class_id}` | Ejecutar reglas OSM |

---

## 7. Flujos de emisión

### 7.1. Certificado de evento → badge automático

```mermaid
sequenceDiagram
    participant A as Admin
    participant S as Sistema
    participant P as Participante

    A->>S: Registra certificate (pending)
    S->>S: Crear badge_assertion pending + /b/slug
    Note over S: Primera visita /c/ → certificate issued, badge issued
    P->>S: Visita /c/slug o /b/slug
    S-->>P: PDF + enlace "Añadir badge a mochila"
```

### 7.2. Actividad OSM — import externo

```
1. Admin crea BadgeClass "100 notas resueltas"
2. Servicio externo o CSV entrega: `osm_id`, opcional username, …
3. Sistema crea/actualiza `osm_profile` por **osm_id** y emite assertion (idempotente)
4. Usuario visita /b/{slug} o busca por osm_username
5. Opción export OB / Badgr
```

### 7.3. Actividad OSM — job automático

```
1. BadgeClass con criteria_rule (changeset_count >= 100)
2. Job nocturno: usuarios vinculados + consulta API
3. Si cumple y no tiene assertion → emitir
4. Registrar evidence (snapshot fecha + enlace perfil OSM)
```

---

## 8. Identidad y búsqueda

| Tipo badge | Identificador principal | Búsqueda pública |
|------------|----------------------|------------------|
| event_role | email / doc (como certificado) | Formulario eventos |
| osm_activity | **`osm_id`** (username opcional, resuelto vía API) | Formulario "Mis badges OSM" |

**Vinculación:** tabla `osm_profiles` permite unir usuario OSM con email/doc para ver **certificados + badges** en un solo lugar (HU-10.5).

---

## 9. Revocación

| Acción | Efecto |
|--------|--------|
| Revocar certificate | Revoca badge event_role vinculado |
| Revocar assertion OSM | Solo `/b/`; no afecta certificados |
| BadgeClass desactivado | No nuevas emisiones; existentes válidas |

---

## 10. Imagen del badge

- **Evento:** diseño por BadgeClass (admin sube PNG/SVG); puede derivarse de miniatura del certificado.
- **Actividad OSM:** iconografía estándar por tipo (changeset, nota, etc.) configurable.

Editor simple de imagen badge en admin: upload de PNG/SVG. Plantillas reutilizables: [evolución futura](./01-vision-y-alcance.md#11-evolución-futura-post-v10).

---

## 11. Evolución futura

Capacidades OB post-v1.0 (firma OBv3, webhook, plantillas de imagen, reglas OSM ampliadas, etc.): ver la lista canónica en [01 §11](./01-vision-y-alcance.md#11-evolución-futura-post-v10).

---

## 12. LinkedIn y redes

- **Certificados:** Open Graph en `/c/{slug}` (preview PDF).
- **Badges:** Open Graph en `/b/{slug}` (imagen del badge + título del logro).
- LinkedIn no importa OB nativamente; el permalink con buena preview sigue siendo clave.

---

## 13. Referencias

- [Open Badges](https://openbadges.org/)
- [OB v3.0](https://www.imsglobal.org/spec/ob/v3p0/)
- [Visión y alcance — evolución futura](./01-vision-y-alcance.md#11-evolución-futura-post-v10)
- [Modelo de datos](./03-modelo-de-datos.md)
- [Historias de usuario — Épica 9 y 10](./02-historias-de-usuario.md)
