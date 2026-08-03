# Manuales — outline (ops y usuario)

**Versión:** 1.0  
**Fecha:** 2026-08-02  
**Estado:** Esbozo de contenidos. Redacción completa = entregable de fase (ops en F3; editor desde F1 piloto).

Los emails y datos de participantes **no** se recogen con consentimiento en este sistema: llegan desde otra plataforma de registro del evento. Estos manuales no sustituyen esa autorización externa.

---

## 1. Artefactos previstos

| Documento | Audiencia | Ubicación sugerida | Cuándo |
|-----------|-----------|--------------------|--------|
| **Manual de operación (runbook)** | Quien despliega/mantiene el servidor | `docs/ops.md` (o wiki del operador) | Esqueleto F1; completo **Fase 3** (F3.12) |
| **Manual del editor / admin** | Quien crea eventos y carga gente | `docs/manual-editor.md` | Crece con F1–F2; estable tras piloto |
| **Ayuda pública (corta)** | Titular del certificado | Página `/` o `/help` + párrafo en búsqueda | F1 (mínimo) |

---

## 2. Manual de operación (runbook)

Objetivo: otro operador pueda desplegar, respaldar y recuperar la instancia sin adivinar.

### 2.1. Contenidos mínimos

1. **Arquitectura del despliegue** — Compose, reverse proxy, DNS, TLS.
2. **Variables de entorno** — referencia a `docs/anexos/.env.example`; secretos (dónde viven, rotación).
3. **OAuth OSM** — registrar app, `OSM_OAUTH_*`, redirect URI, scopes (solo identidad / `read_prefs`).
4. **Bootstrap admin** — `SEED_ADMIN_OSM_USERNAMES` / `SEED_ADMIN_OSM_IDS`; primer login.
5. **Migraciones y seed** — Prisma migrate, `country_identity` + roles.
6. **Storage MinIO** — bucket, acceso, que los PDF `issued` no se regeneran.
7. **Backups** — `pg_dump` + sync MinIO **pareados**, off-host; frecuencia; retención.
8. **Restore** — procedimiento; verificación de que BD y objetos coinciden; no regenerar PDF a ciegas.
9. **Health** — `/health`, `/ready`; qué mirar tras deploy.
10. **Rate limits / PDF** — `THROTTLE_*`, `PDF_CONCURRENCY`; síntomas de saturación.
11. **SMTP (F3)** — From dedicado, reputación, cola prudente.
12. **Redis / BullMQ (F3)** — solo osm.lat jobs.
13. **Upgrade** — `docker compose pull && up -d`; orden migrate.
14. **Instancia AC3** — diferencias (`INSTANCE=ac3`, legal, sin `osm_activity`).

### 2.2. Fuera de este runbook

- Diseño de plantillas y carga CSV → manual del editor.
- Política legal de otra plataforma de registro → no aplica aquí.

---

## 3. Manual del editor / admin

Objetivo: organizar un evento piloto sin leer toda la especificación.

### 3.1. Contenidos mínimos

1. **Roles** — qué puede editor vs admin (RBAC).
2. **Login** — “Iniciar sesión con OSM”; pantalla sin acceso.
3. **Crear evento** — `draft` / `active`; qué pasa al desactivar (`active`→`draft`: sale de búsqueda, permalinks vivos).
4. **Sedes** — 0 / 1 / N; inferencia; sede = texto en certificado, no identidad.
5. **Plantilla visual** — fondo, capas, preview; A4 @ 150 DPI; fuentes abiertas.
6. **Participantes** — alta individual; CSV atómico (todo o nada) + incremental; plantilla descargable.
7. **Pregenerados** — 1:1 y sheet+ZIP; mismas reglas atómicas.
8. **Multi-rol** — una fila/certificado por rol.
9. **Permalinks** — cómo compartir `/c/{slug}`; emisión lazy (primera visita).
10. **Búsqueda pública** — qué ve el titular (sin listar por evento).
11. **Revocación (F2)** — certificado ↔ badge.
12. **Legal AC3 (F2)** — pantalla admin; capas `legal.*`.
13. **Badges OSM (F3, osm.lat)** — BadgeClass, import awardees, job (visión de editor).
14. **Soft-delete** — ocultar evento vs revocar credencial.

### 3.2. No incluir

- Texto de consentimiento de emails (otra plataforma).
- Detalle de queries Overpass (ops / desarrollo).

---

## 4. Ayuda pública (titular)

Texto corto en la UI (no un PDF largo):

1. Cómo buscar (email o documento).
2. Qué es el permalink y que se puede compartir.
3. Si aparece “revocado” / “no encontrado”.
4. (osm.lat) Cómo ver badges OSM por `osm_id` (F3).
5. Enlace discreto al crédito de software / `/about`.

---

## 5. Relación con la especificación

| Tema | Spec canónica | Manual |
|------|---------------|--------|
| Reglas de negocio | 01–08 | Resume / “cómo hacerlo en la UI” |
| Fases y tests | 09 | No duplicar |
| ENV, módulos, seguridad | 10 | Ops cita 10 + `.env.example` |
| Consentimiento registro | Otra plataforma | Explicitar “no aplica aquí” |

---

## 6. Referencias

- [Plan de implementación — F3.12](./09-plan-de-implementacion.md)
- [Multi-instancia — backups](./05-personalizacion-multi-instancia.md)
- [Diseño de código — ENV](./10-diseno-codigo-y-anexos.md)
- [Estados — draft/active](./07-estados-y-ciclo-de-vida.md)
