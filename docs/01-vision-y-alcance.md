# Visión y alcance del sistema de certificados y badges

**Versión:** 1.0  
**Fecha:** 2026-06-06  
**Estado:** Especificación v1.0 — revisión por pares incorporada; lista para Fase 1.

---

## 1. Resumen ejecutivo

Sistema de **credenciales** — certificados de evento **y** Open Badges — desplegado como **dos instancias independientes** (osm.lat y AC3) con el mismo código fuente.

| Instancia | URL de despliegue | Propósito |
|-----------|-------------------|-----------|
| **osm.lat** | [certificados.osm.lat](https://certificados.osm.lat/) | Certificados comunitarios + badges OSM (eventos y actividad en la plataforma) |
| **AC3** | `certificados.ac3.org.co` | Certificados institucionales + badges de evento (legal de instancia) |

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
8. **Identificación adaptable** por país (CC, CE, TI en Colombia; otros países = YAML + seed + redeploy, sin pantalla admin en v1.0).
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
3. Identificación por país; **UI y mensajes en español** en v1.0 (cadenas externalizadas para traducción futura).
4. Compatibilidad con backpacks OB (Badgr, Open Badge Passport) vía **Open Badges 2.0 hosted**.
5. **Accesibilidad:** WCAG 2.2 AA en HTML público y formularios admin (HU-1.6). El lienzo Konva y PDF/UA no son AA completos en v1.0.

### 5.1. Volumen y desempeño — decisión cerrada

Ambas instancias se dimensionan como **comunitarias pequeñas**. No es un SaaS de alta concurrencia.

| Magnitud | Valor de diseño v1.0 |
|----------|----------------------|
| Certificados por evento | Típico **50–200**. Techo de diseño **~500**. Por encima: reevaluar (no subir `PDF_CONCURRENCY` a ciegas). |
| Eventos por instancia y año | **Unos pocos** (planificación: ≤ **10**). |
| Certificados acumulados | Orden de **miles**, no cientos de miles. |
| `PDF_CONCURRENCY` | **1** (cerrado). Un Chromium a la vez en el host compartido. |
| Primera emisión (cola) | 200 visitas simultáneas a permalinks `pending` se serializan; minutos de espera son **aceptables**. Sin emisión masiva ([07 §3.2](./07-estados-y-ciclo-de-vida.md#32-emisión-masiva-e-impresión--decisión-cerrada)). |
| Timeout PDF | `PDF_TIMEOUT_MS` (30 s): un render debe caber; si no → intento / `failed`. |
| Búsqueda pública | p95 **< 2 s** con el catálogo de este volumen (índice por email/documento). |
| Storage PDF | Orden **1–2 MB** por archivo @ 150 DPI → cientos de MB por evento; **pocos GB** en años. |
| Backups | **Diarios** off-host, cifrados, BD+MinIO pareados; retención **≥ 14 días**; más el snapshot **antes de cada migrate**. Tamaño esperado: manejable en un VPS (BD pequeña + MinIO de unos GB). |
| Pruebas de carga | **No** exigidas en v1.0 ([09 §11](./09-plan-de-implementacion.md)). |

Detalle operativo: [10 §10.5](./10-diseno-codigo-y-anexos.md#105-protección-de-desempeño-puppeteer--storage).

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
- Import CSV de awardees OSM y jobs OSM con reglas y **fuente por métrica** documentadas ([06 §5.1](./06-open-badges.md)).
- Identificación según instancia (osm.lat: nombre+email; AC3: +documento), búsqueda por titular, datos legales AC3 vía **pantalla admin**, envío de enlace por email (**Fase 3**; en F1/F2 se copia el permalink).
- **Habeas data v1.0:** aviso `/privacy`, canal ARCO, supresión admin (HU-8.3, HU-8.4). Sin portal de auto-baja. Credenciales `issued` se conservan para verificar **hasta** ARCO o borrado ops; log de `/c/` **90 días**.
- **Audit log** de acciones sensibles (roles, imports, revocar, erase): Must; lectura y escrituras F1; F2/F3 amplían el catálogo ([03 §5.2](./03-modelo-de-datos.md)). Dashboard de métricas = Should.
- Open Graph LinkedIn.
- API de verificación JSON `GET /api/v1/verify/c/{slug}` y `/b/{slug}` (Fase 2), además de las páginas humanas.
- Autenticidad v1.0: permalink oficial + **SHA-256 público** del PDF ([10 §10.2](./10-diseno-codigo-y-anexos.md#102-modelo-de-autenticidad-decisión-cerrada)). OB 3.0 / PAdES = post-v1.0.
- Imagen de badge: upload PNG/SVG por BadgeClass (sin biblioteca de plantillas).
- Protecciones de abuso y carga ([10 §10](./10-diseno-codigo-y-anexos.md#10-seguridad-abuso-y-protección-de-carga)): rate limit en búsqueda y permalinks, `robots.txt` / anti-IA básico, concurrencia PDF acotada.
- **Ops v1.0:** migrate documentado + rollback = backup; alertas por correo (`failed` / `/ready`), **sin** Prometheus ([10 §8.1](./10-diseno-codigo-y-anexos.md#81-migraciones-rollback-y-alertas-ops--decisión-cerrada)).
- **Emisión solo lazy** ([07 §3.2](./07-estados-y-ciclo-de-vida.md#32-emisión-masiva-e-impresión--decisión-cerrada)): **no** hay botón de emitir pendientes, ZIP de PDFs ni impresión para entrega presencial el mismo día. Papel el día del evento = archivos **pregenerados** (fuera de este sistema).
- **Volumen v1.0:** 50–200 certificados/evento, pocos eventos/año; `PDF_CONCURRENCY=1`; backups diarios ([01 §5.1](./01-vision-y-alcance.md#51-volumen-y-desempeño--decisión-cerrada)).
- **Accesibilidad:** WCAG 2.2 AA en páginas públicas y formularios admin (HU-1.6); excepción = editor Konva.
- **Verify:** un permalink/JSON a la vez; **sin** lote en v1.0 (60 req/min/IP).

**No confundir** con [§6 Fuera de alcance](#6-fuera-de-alcance): eso no entra ni en v1.0 ni en la evolución prevista.

---

## 11. Evolución futura (post v1.0)

Lista **canónica**. El resto de la documentación solo referencia esta sección; no duplica el catálogo.

| Capacidad | Notas | Detalle en |
|-----------|-------|------------|
| Migración a Open Badges 3.0 + `proof` | v1.0 = **2.0 hosted** (deuda de durabilidad). Destino de autenticidad de badges = OB 3.0. IDs estables + `public_key` reservada. [06 §1.1](./06-open-badges.md#11-camino-a-open-badges-30) | [06](./06-open-badges.md), [10 §10.2](./10-diseno-codigo-y-anexos.md#102-modelo-de-autenticidad-decisión-cerrada) |
| Firma PAdES del PDF | No en v1.0; reevaluar con OB 3.0. Las rúbricas de plantilla no son firma criptográfica. | [10 §10.2](./10-diseno-codigo-y-anexos.md#102-modelo-de-autenticidad-decisión-cerrada) |
| API pública para terceros emisores de listas | Integraciones externas de elegibles | — |
| Webhook de criterios externos | Tercer modo además de CSV (M1) y job (M2) | [06](./06-open-badges.md) |
| Plantillas reutilizables de imagen badge | Biblioteca en admin; v1.0 = upload por BadgeClass | [06](./06-open-badges.md) |
| Reglas OSM ampliadas | Métricas adicionales al catálogo F3 | [06](./06-open-badges.md) |
| Instancia HOT / Tasking Manager | Badges por campañas TM (otro issuer) | — |
| Privacidad configurable por usuario | Opt-in badges/diplomas públicos | [02](./02-historias-de-usuario.md) |
| Confirmación 2 editores para borrar eventos antiguos | Anti-compromiso de cuenta | [02](./02-historias-de-usuario.md) RBAC |
| Emisión forzada/masiva de certificados | **Decisión cerrada:** v1.0 = solo lazy; sin ZIP de PDFs ni impresión desde el panel. Papel el mismo día = pregenerados. | [07 §3.2](./07-estados-y-ciclo-de-vida.md#32-emisión-masiva-e-impresión--decisión-cerrada) |
| Helper local para prellenar `filename` | Leer carpeta y completar la hoja; v1.0 = plantilla CSV descargable + Excel | [03 §10](./03-modelo-de-datos.md), [02](./02-historias-de-usuario.md) HU-4.1 |
| Newsletter / Listmonk | Lista con alta explícita; no reutilizar emails de certificados a ciegas | Manual ops |
| Retención de PDFs en storage | v1.0: `issued` se conserva para verificar hasta ARCO/ops; caducidad automática por años = post-v1.0 | [02 HU-8.4](./02-historias-de-usuario.md) |
| Portal de auto-baja del titular | v1.0 = aviso + ARCO **ops/admin** (HU-8.3, HU-8.4). Autoservicio público = post-v1.0 | [02](./02-historias-de-usuario.md), [11](./11-manuales-ops-y-usuario.md) |
| Traducciones (i18n) | v1.0 = español; cadenas ya externalizadas — añadir locale | — |
| Tercera instancia (u otras) | Mismo patrón: despliegue + ENV + BD + DNS | [05 §9](./05-personalizacion-multi-instancia.md#9-tercera-instancia-u-otras) |
| Prometheus / métricas scrapeables | v1.0 = `/health` + `/ready` + correo ops. Sin `/metrics`. | [10 §8.1](./10-diseno-codigo-y-anexos.md#81-migraciones-rollback-y-alertas-ops--decisión-cerrada) |
| PDF/UA y lienzo Konva AA completo | v1.0: HTML AA; PDF no etiquetado; canvas de plantilla = excepción HU-1.6 | [02 HU-1.6](./02-historias-de-usuario.md) |
| Verificación en lote (empleador / HR) | v1.0 = un slug por request + 60/min. Sin `verify/batch`. | [02 HU-1.3](./02-historias-de-usuario.md), [10 §10.3](./10-diseno-codigo-y-anexos.md#103-rate-limiting-y-anti-abuso-fase-1) |
| GC automático de objetos MinIO huérfanos | v1.0 = runbook a mano (>24 h sin fila `stored_files`). PDF `issued`/`revoked` **no** se borra por GC. | [10 §4.2.2](./10-diseno-codigo-y-anexos.md) |
| UI admin de países / roles | v1.0 = YAML + seed + redeploy | [05 §5](./05-personalizacion-multi-instancia.md) |
| Webhooks SMTP / parser de rebotes | v1.0 = reenviar enlace a mano; bounce = logs del proveedor | [02 HU-6.1](./02-historias-de-usuario.md) |
| Baking Open Badges (PNG con assertion) | v1.0 = hosted JSON + `/b/` + backpack; PNG es solo imagen | [06 §9–10](./06-open-badges.md) |

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
| **Participante** | Persona registrada en un evento (`participants`); tiene email |
| **Titular** | Quien acredita la credencial al buscar o abrir el permalink (mismo individuo, vista pública) |
| **Mapper** | Usuario OSM; identidad `osm_id` (badges de actividad) |
| **Awardee** | Destinatario de un badge OSM vía CSV/job (término de import) |
| **Editor (rol)** | Rol del panel (`admin_users.role = editor`) — no confundir con el editor visual de plantillas |
| **Editor visual** | UI Konva para diseñar plantillas (HU-3.1) |

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
- [Manuales — outline ops y usuario](./11-manuales-ops-y-usuario.md)
