# Visión y alcance del sistema de certificados y badges

**Versión:** 1.0  
**Fecha:** 2026-06-06  
**Estado:** Especificación del producto

---

## 1. Resumen ejecutivo

Sistema de **credenciales** — certificados de evento **y** Open Badges — desplegado como **dos instancias independientes** (osm.lat y AC3) con el mismo código fuente.

| Instancia | URL de despliegue | Propósito |
|-----------|-------------------|-----------|
| **osm.lat** | [certificados.osm.lat](https://certificados.osm.lat/) | Certificados comunitarios + badges OSM (eventos y actividad en la plataforma) |
| **AC3** | `certificados.ac3.org.co` | Certificados institucionales + badges de eventos avalados |

| Línea | Ejemplo | ¿Diploma PDF? | ¿Open Badge? |
|-------|---------|---------------|--------------|
| **Certificado de evento** | Asistente Mapathon 2026 | Sí (`/c/{slug}`) | Sí, vinculado |
| **Badge de actividad OSM** | 100 changesets, 100 notas resueltas | No | Sí (`/b/{slug}`) |

Cada instancia tiene BD, administradores y branding propios, desplegada en **su propio servidor** (comunitario osm.lat e institucional AC3). Código fuente en GitHub.

---

## 2. Problema que resuelve

- Certificados de evento sin permalink estable ni multi-rol.
- Reconocimientos OSM (changesets, notas, hitos) sin credencial verificable estándar.
- Necesidad de compartir en LinkedIn **y** en backpacks Open Badges.
- Dos marcas (comunitaria e institucional) sobre un mismo producto.

---

## 3. Principios de diseño

1. **Stack moderno y flexible** — API-first.
2. **Permalink por credencial** — certificados (`/c/`) y badges (`/b/`).
3. **Open Badges integrados** — no como añadido opcional.
4. **Certificado + badge de evento** — mismo hecho, dos formatos (PDF + OB).
5. **Badges de actividad OSM** — logros sin diploma; criterios externos o jobs.
6. **Múltiples roles por participante** en eventos.
7. **Certificados pregenerados** — subir PDF/imagen ya producida (eventos archivados).
8. **Identificación adaptable** por país (CC, CE, TI en Colombia, extensible).
9. **Búsqueda por titular** — correo o documento; nunca listar asistentes por evento.
10. **Editor visual** de plantillas de certificado.
11. **Multi-instancia** por configuración de despliegue.

---

## 4. Objetivos funcionales

### Certificados (eventos)

1. Emitir y consultar certificados con permalink verificable.
2. Gestionar eventos, sedes, participantes, roles y plantillas visuales.
3. Varios roles por persona → varios certificados.
4. Importar certificados pregenerados y participantes vía CSV (con **plantilla descargable** desde el panel).
5. Búsqueda unificada por identificación del titular (sin filtrar año/evento).

### Open Badges

6. Emisor (Issuer) por instancia.
7. Badge vinculado a cada certificado de evento emitido (1:1).
8. Badges de actividad OSM (osm.lat): changesets, notas, etc.
9. Importación CSV de awardees y jobs contra API/reglas OSM.
10. Permalink `/b/{slug}` + endpoints OB (`issuer.json`, assertions JSON-LD).
11. Revocación coherente certificado ↔ badge.

### Transversal

12. Auditoría, verificación pública, API REST, Open Graph para LinkedIn.

---

## 5. Objetivos no funcionales

1. Multi-instancia (osm.lat / AC3).
2. Seguridad, permalinks no adivinables, auditoría, **anti-abuso** (rate limit, sin enumeración pública) y **protección de carga** en servidores compartidos (PDF acotado, sin regenerar lo ya emitido).
3. i18n e identificación por país.
4. Compatibilidad con backpacks OB (Badgr, Open Badge Passport).

---

## 6. Fuera de alcance

| Elemento | Motivo |
|----------|--------|
| Pasarela de pagos | No aplica |
| App móvil nativa | Permalinks + Open Badges |
| Inscripción pública en línea | Participantes los carga el admin |
| Listado público de asistentes por evento | Privacidad |
| Que OSM.org emita badges oficialmente | Esta plataforma es el Issuer |

---

## 7. Instancias previstas

### 7.1. osm.lat

- Certificados comunitarios LATAM.
- Badges de actividad OSM y badges de evento comunitario.
- Sin capas legales corporativas en PDF.

### 7.2. AC3

- Certificados y badges de eventos con aval institucional.
- Badges de actividad OSM genéricos: no incluidos (solo osm.lat).
- PDF con capas `legal.*` desde config de instancia.

---

## 8. Conceptos clave

Ver también [04-flujos-funcionales.md](./04-flujos-funcionales.md) y [06-open-badges.md](./06-open-badges.md).

- **Permalink `/c/`** — certificado PDF/imagen verificable.
- **Permalink `/b/`** — Open Badge + verificación.
- **Identidad OSM** — `osm_id` inmutable; `osm_username` solo display.
- **Criterios externos** — CSV, API OSM o servicio que define elegibles para badges de actividad.

---

## 9. Stack tecnológico

Stack **definido** para implementación — detalle en [09-plan-de-implementacion.md](./09-plan-de-implementacion.md):

| Componente | Elección |
|------------|----------|
| Lenguaje / API | TypeScript, NestJS, Prisma, PostgreSQL 16 |
| Frontend | React 19, Vite, shadcn/ui, react-konva |
| PDF | Puppeteer (HTML → PDF) |
| Jobs / cola | BullMQ + Redis (**Fase 3**) |
| Archivos | MinIO (S3-compatible, en cada servidor) |
| Despliegue | Docker Compose en servidor comunitario osm.lat y servidor AC3 |

---

## 10. Alcance de la versión 1.0

La **especificación v1.0** es todo lo documentado en este repositorio **salvo** lo listado en [§11](#11-evolución-futura-post-v10). Las tres fases de implementación ([09](./09-plan-de-implementacion.md)) cubren únicamente v1.0.

Incluye:

- Instancias **osm.lat** y **AC3** (dos despliegues).
- Eventos, multi-rol, plantilla visual, pregenerados, CSV de participantes.
- Permalinks `/c/` y `/b/`, verificación, revocación.
- Issuer OB, badges de evento automáticos, badges OSM (**solo osm.lat**).
- Import CSV de awardees OSM y jobs Overpass con reglas documentadas.
- Identificación según instancia (osm.lat: nombre+email; AC3: +documento), búsqueda por titular, datos legales AC3 vía **pantalla admin**, envío de enlace por email.
- Open Graph LinkedIn.
- Imagen de badge: upload PNG/SVG por BadgeClass (sin biblioteca de plantillas).
- Protecciones de abuso y carga ([10 §10](./10-diseno-codigo-y-anexos.md#10-seguridad-abuso-y-protección-de-carga)): rate limit en búsqueda y permalinks, `robots.txt` / anti-IA básico, concurrencia PDF acotada.

**No confundir** con [§6 Fuera de alcance](#6-fuera-de-alcance): eso no entra ni en v1.0 ni en la evolución prevista.

---

## 11. Evolución futura (post v1.0)

Lista **canónica**. El resto de la documentación solo referencia esta sección; no duplica el catálogo.

| Capacidad | Notas | Detalle en |
|-----------|-------|------------|
| Firma criptográfica Open Badges v3 | Claves por instancia; en v1.0 `public_key` queda NULL | [06](./06-open-badges.md), [03](./03-modelo-de-datos.md) |
| API verify JSON `/api/v1/verify/...` | v1.0 = solo páginas `/c/` y `/b/` | [06](./06-open-badges.md) |
| API pública para terceros emisores de listas | Integraciones externas de elegibles | — |
| Webhook de criterios externos | Tercer modo además de CSV (M1) y job (M2) | [06](./06-open-badges.md) |
| Plantillas reutilizables de imagen badge | Biblioteca en admin; v1.0 = upload por BadgeClass | [06](./06-open-badges.md) |
| Reglas OSM ampliadas | Métricas adicionales al catálogo F3 | [06](./06-open-badges.md) |
| Instancia HOT / Tasking Manager | Badges por campañas TM (otro issuer) | — |
| Privacidad configurable por usuario | Opt-in badges/diplomas públicos | [02](./02-historias-de-usuario.md) |
| Confirmación 2 editores para borrar eventos antiguos | Anti-compromiso de cuenta | [02](./02-historias-de-usuario.md) RBAC |
| Emisión forzada/masiva de certificados | v1.0 = solo lazy | [07](./07-estados-y-ciclo-de-vida.md) |
| Helper local tipo Pattypan | Leer carpeta y prellenar `filename` en la hoja; v1.0 = plantilla CSV descargable + Excel | [03 §10](./03-modelo-de-datos.md), [02](./02-historias-de-usuario.md) HU-4.1 |
| Newsletter / Listmonk | Lista con alta explícita; no reutilizar emails de certificados a ciegas | Manual ops |
| Retención de PDFs en storage | Política de X años (configurable) | — |
| Tercera instancia (u otras) | Mismo patrón: despliegue + ENV + BD + DNS | [05 §9](./05-personalizacion-multi-instancia.md#9-tercera-instancia-u-otras) |
| Otros OAuth (no OSM) para panel | v1.0 = solo OAuth OSM | [02](./02-historias-de-usuario.md) HU-7.1 |

---

## 12. Glosario

| Término | Definición |
|---------|------------|
| **Certificado** | Credencial de evento con PDF/imagen (`/c/`) |
| **Badge** | Open Badge verificable (`/b/`) |
| **BadgeClass** | Definición del logro (evento+rol o actividad OSM) |
| **Assertion** | Badge emitido a una persona |
| **Issuer** | Emisor OB (osm.lat o AC3) |
| **Pregenerado** | Certificado subido como archivo (no renderizado desde plantilla) |

---

## 13. Documentos relacionados

- [Historias de usuario](./02-historias-de-usuario.md)
- [Modelo de datos](./03-modelo-de-datos.md)
- [Flujos funcionales](./04-flujos-funcionales.md)
- [Multi-instancia](./05-personalizacion-multi-instancia.md)
- [Open Badges](./06-open-badges.md)
- [Estados y ciclo de vida](./07-estados-y-ciclo-de-vida.md)
- [Datos legales AC3 y plantilla](./08-datos-legales-ac3-plantilla.md)
- [Plan de implementación (3 fases)](./09-plan-de-implementacion.md)
- [Diseño de código y anexos](./10-diseno-codigo-y-anexos.md)
