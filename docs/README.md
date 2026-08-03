# Documentación — Certificados y Open Badges

Especificación **v1.0** del sistema de **certificados de evento** y **Open Badges** (evento + actividad OSM), desplegado en dos instancias independientes.

**Estado:** Especificación v1.0 lista para **revisión por pares** (aún no cerrada para implementación).

**Origen del proyecto:** ver [Historia](../README.md#historia) en el README del repositorio.

---

## Despliegues

| Instancia | URL | Rol |
|-----------|-----|-----|
| osm.lat | [certificados.osm.lat](https://certificados.osm.lat/) | Comunitario LATAM + badges OSM |
| AC3 | `certificados.ac3.org.co` | Institucional; legal en todos los eventos de la instancia |

**Repositorio de código:** GitHub. **Producción:** servidor comunitario osm.lat y servidor institucional AC3 (Docker Compose en cada uno).

---

## Índice

| Documento | Contenido |
|-----------|-----------|
| [01 — Visión y alcance](./01-vision-y-alcance.md) | Objetivos, **alcance v1.0** (§10) vs **evolución futura** (§11), instancias |
| [02 — Historias de usuario](./02-historias-de-usuario.md) | Historias con criterios de aceptación |
| [03 — Modelo de datos](./03-modelo-de-datos.md) | Esquema BD, CSV, identidad OSM |
| [04 — Flujos funcionales](./04-flujos-funcionales.md) | Permalinks, búsqueda, emisión |
| [05 — Multi-instancia](./05-personalizacion-multi-instancia.md) | Config osm.lat / AC3, despliegue, **atribución del software (§10)** |
| [06 — Open Badges](./06-open-badges.md) | Issuer, event_role, osm_activity |
| [07 — Estados y ciclo de vida](./07-estados-y-ciclo-de-vida.md) | pending / issued / revoked |
| [08 — Datos legales AC3](./08-datos-legales-ac3-plantilla.md) | Config instancia + capas `legal.*` |
| [09 — Plan de implementación](./09-plan-de-implementacion.md) | Stack, 3 fases, prompts IA, pruebas (§11) |
| [10 — Diseño de código](./10-diseno-codigo-y-anexos.md) | Monorepo, módulos Nest, ENV, health, **seguridad/abuso/carga (§10)**, CSV/seeds |
| [11 — Manuales (outline)](./11-manuales-ops-y-usuario.md) | Esbozo runbook ops + manual editor + ayuda pública |

---

## Decisiones clave

| Tema | Decisión |
|------|----------|
| Certificado evento | `/c/{slug}` PDF + badge `/b/{slug}` automático |
| Badge actividad OSM | Solo `/b/{slug}`; criterios CSV o jobs OSM (fuente por métrica) |
| Búsqueda pública | Solo correo, documento u `osm_id` del titular |
| Multi-rol | Varios certificados por persona y evento |
| Plantillas | Default `role_code` NULL + `default_template_id`; tokens canónicos ([04](./04-flujos-funcionales.md)) |
| Pregenerados | Upload de PDF/imagen + permalink |
| Identidad OSM | `osm_id` inmutable + username actualizable; vínculo email vía `/me` (F3) |
| Datos legales AC3 | Config instancia + capas en plantilla |
| Anti-abuso / carga | Rate limit búsqueda+permalinks, PDF sin regenerar, `robots.txt` ([10 §10](./10-diseno-codigo-y-anexos.md#10-seguridad-abuso-y-protección-de-carga)) |
| Atribución software | Footer/`/about`/health; no en PDF ni JSON-LD OB ([05 §10](./05-personalizacion-multi-instancia.md#10-atribución-del-software-multi-instancia)) |
| Verify JSON | `GET /api/v1/verify/c|b/{slug}` en Fase 2 (además de páginas humanas) |
| Corrección emitido | Revocar + alta nueva (sin editar PDF issued) |
| Soft-delete / draft | Oculta búsqueda; permalinks y clases OB por URL siguen vivos |
| Email participante | Obligatorio; **único por evento** (rechazar duplicado); normalizado |
| i18n | Español v1; cadenas externalizadas |
| CSV | Delimitador fijo `;` |
| PDF | A4 landscape @ 150 DPI; tipografías abiertas embebidas |
| CSV import | Atómico (solo CSV); error → 0 escrituras |
| Sesión admin | Cookie + tabla `admin_sessions` (Postgres; sin Redis en F1/F2) |
| Legal AC3 | Tabla `instance_legal` + bootstrap ENV; snapshot al emitir |
| Contrato `/c/` | SPA + metadata (único lazy issue) + `/file` (**409** si pending); crawlers no emiten |
| Vínculo cert↔badge | FK solo en `badge_assertions.certificate_id` |
| Formato Open Badges | **2.0 hosted** en v1.0; OBv3 + firma = post-v1.0 ([06](./06-open-badges.md)) |

---

## Próximos pasos

1. **Revisión por pares** de esta especificación v1.0.
2. Tras OK: implementar **Fase 1** según [09-plan-de-implementacion.md](./09-plan-de-implementacion.md).
3. Validar criterios de aceptación con un evento piloto osm.lat.
4. Confirmar DNS `certificados.ac3.org.co` en servidor AC3 antes de Fase 2.

---

## Licencia

Esta documentación (`docs/`) está bajo [CC BY 4.0](../LICENSE-DOCS). El código del repositorio está bajo [MIT](../LICENSE).
