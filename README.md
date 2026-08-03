# Certificados y Open Badges

Especificación **v1.0** de un sistema de **certificados de evento** (`/c/{slug}`) y **Open Badges** (`/b/{slug}`), incluyendo logros de actividad en OpenStreetMap.

## Historia

En la comunidad OSM Latam es habitual que los participantes pidan certificados por los roles que desempeñaron en un evento (asistente, organizador, ponente, etc.).

Para el **State of the Map Latam 2024** (Belém) y el **2025** (Medellín), Yasmila (@la_nenemini) elaboró los certificados a mano y los publicó en GitHub (repositorios de la organización [OSMLatam](https://github.com/OSMLatam)). El proceso funciona, pero no escala: cada evento vuelve a depender de trabajo manual.

Más adelante apareció la herramienta de certificados FLISoL creada por **Camilo Losada**. Tras revisarla, el código resultó difícil de mantener y evolucionar, y el alcance no encajaba con lo que necesitaba la comunidad (multi-instancia, Open Badges, identidad OSM, etc.).

**David Ríos** empezó a probar ese software y, junto con **Andrés Gómez**, decidieron diseñar un sistema nuevo: el mismo producto para toda la comunidad OSM Latam, de modo que cualquier organizador pueda emitir certificados de sus eventos con facilidad.

En paralelo, **AC3** —capítulo local de la OpenStreetMap Foundation (OSMF) en Colombia, con personería jurídica— puede emitir certificados con mayor respaldo institucional en el país. Por eso el diseño contempla dos instancias con el mismo código: una comunitaria ([certificados.osm.lat](https://certificados.osm.lat)) y otra institucional (`certificados.ac3.org.co`).

## Instancias

| Instancia | URL |
|-----------|-----|
| osm.lat | https://certificados.osm.lat |
| AC3 | https://certificados.ac3.org.co |


## Documentación

Índice completo: [`docs/README.md`](./docs/README.md)

- [Visión y alcance](./docs/01-vision-y-alcance.md)
- [Historias de usuario](./docs/02-historias-de-usuario.md)
- [Modelo de datos](./docs/03-modelo-de-datos.md)
- [Flujos funcionales](./docs/04-flujos-funcionales.md)
- [Multi-instancia](./docs/05-personalizacion-multi-instancia.md)
- [Open Badges](./docs/06-open-badges.md)
- [Estados y ciclo de vida](./docs/07-estados-y-ciclo-de-vida.md)
- [Datos legales AC3 y plantilla](./docs/08-datos-legales-ac3-plantilla.md)
- [Plan de implementación — 3 fases](./docs/09-plan-de-implementacion.md)
- [Diseño de código y anexos](./docs/10-diseno-codigo-y-anexos.md)
- [Manuales — outline](./docs/11-manuales-ops-y-usuario.md)

**Estado:** especificación v1.0 — Fase 1 lista para implementar.

Anexos: [`.env.example`](./.env.example), [CSV ejemplo](./docs/anexos/csv/), [seeds YAML](./docs/anexos/seed/).

---

## Implementación en 3 fases

Detalle completo: [`docs/09-plan-de-implementacion.md`](./docs/09-plan-de-implementacion.md).

| Fase | Alcance | Prerequisito |
|------|---------|--------------|
| **1** | Certificados core (osm.lat): admin, editor, PDF, `/c/`, búsqueda | — |
| **2** | Open Badges evento, AC3 + `legal_snapshot`, revocación | Fase 1 estable |
| **3** | Badges OSM, jobs por métrica, Turnstile, SMTP | Fase 2 en osm.lat |

### Prompts para IA (copiar al iniciar cada fase)

**Fase 1 — Certificados core**

```text
Implementa Fase 1 según docs/09-plan-de-implementacion.md sección 2, docs/10-diseno-codigo-y-anexos.md y docs/03-modelo-de-datos.md (§1–5).

Stack: monorepo pnpm, NestJS + Prisma + PostgreSQL, React + Vite + Konva, Puppeteer, MinIO, Docker Compose.

Alcance: una instancia osm.lat. CRUD eventos (draft/active), participantes, CSV, plantillas visuales, certificados generated/pregenerated, permalink /c/, búsqueda por email/documento, auth admin OAuth OSM.

No implementes: Open Badges, capas legal.*, revocación, badges OSM.

Incluye tests unitarios e integración (docs/09 §11). Genera apps/api/openapi.yaml según outline docs/10 §13. Implementa GET /health y GET /ready (docs/10 §8). Usa `.env.example` (raíz) y seeds YAML en `docs/anexos/seed/`. Al terminar, cumple criterios de aceptación §2.4.
```

**Fase 2 — Open Badges + AC3**

```text
Sobre el código de Fase 1, implementa Fase 2 según docs/09-plan-de-implementacion.md sección 3, docs/06-open-badges.md y docs/08-datos-legales-ac3-plantilla.md.

Añade: badge event_role automático, /b/, issuer JSON-LD, revocación certificado↔badge, legal_snapshot al generar PDF, config LEGAL_* y capas legal.* en editor, perfil de despliegue INSTANCE=ac3, Open Graph, API verify JSON.

No implementes: osm_activity, import awardees OSM, jobs OSM.

Incluye tests unitarios e integración de la fase (docs/09 §11). Al terminar, cumple criterios §3.3.
```

**Fase 3 — Badges OSM + operación**

```text
Sobre el código de Fase 2, implementa Fase 3 según docs/09-plan-de-implementacion.md sección 4 y épica 10 en docs/02-historias-de-usuario.md.

Añade: osm_profiles, BadgeClass osm_activity, import CSV awardees (`osm_username` → resolver `osm_id`), job BullMQ solo sobre perfiles con email vinculado + fuentes por métrica ([06 §5.1](./docs/06-open-badges.md)), búsqueda por osm_id, vinculación OSM↔email (HU-10.5), Turnstile, SMTP opcional, README operación.

Emisión OB = **2.0 hosted**; OBv3/`public_key` queda NULL. Mock de APIs OSM en CI; test live opcional.

Incluye tests unitarios e integración (docs/09 §11). Al terminar, cumple criterios §4.3.
```

---

## Pruebas

Sí — **cada fase incluye tests unitarios e de integración**. Resumen:

| Tipo | Herramienta | Qué cubre |
|------|-------------|-----------|
| **Unitarios** | Jest (API), Vitest (web) | Lógica de dominio, parsers CSV, transiciones de estado, layout, reglas de negocio |
| **Integración** | Jest + Supertest + PostgreSQL de test | Endpoints API, Prisma, flujos permalink/búsqueda/emisión, badges, jobs (mocks) |
| **E2E** (opcional Fase 3) | Playwright | Flujos críticos admin + público en navegador |

CI (GitHub Actions): lint + tests + build Docker en cada push/PR.

Detalle por fase y casos T1–T16: [`docs/09-plan-de-implementacion.md` §11](./docs/09-plan-de-implementacion.md) y [`docs/04-flujos-funcionales.md` §10–11](./docs/04-flujos-funcionales.md).

---

## Licencia

| Contenido | Licencia |
|-----------|----------|
| Código fuente y archivos del proyecto (salvo `docs/`) | [MIT](./LICENSE) |
| Documentación en `docs/` | [CC BY 4.0](./LICENSE-DOCS) |

Las marcas y logos de OpenStreetMap, OSM Latam, osm.lat y AC3 **no** están cubiertos por estas licencias.
