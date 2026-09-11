# Manuales — outline (ops y usuario)

**Versión:** 1.0  
**Fecha:** 2026-08-02  
**Estado:** Esbozo de contenidos. Redacción completa = entregable de fase (ops en F3; editor desde F1 piloto).

Los emails y datos de participantes suelen llegar desde **otra plataforma de registro**. Eso **no** exime a la instancia de tratar los datos que almacena y publica. v1.0: aviso `/privacy` + ARCO por ops/admin (HU-8.3, HU-8.4). Estos manuales no sustituyen el texto legal que debe redactar el operador (sobre todo AC3 / Ley 1581).

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
2. **Variables de entorno** — referencia a [`.env.example`](../.env.example) en la raíz del repo; secretos (dónde viven, rotación).
3. **OAuth OSM** — registrar app, `OSM_OAUTH_*`; en osm.lat F3 registrar **dos** redirect URI (admin + público HU-10.5); scopes solo identidad / `read_prefs`.
4. **Bootstrap admin** — `SEED_ADMIN_OSM_USERNAMES` / `SEED_ADMIN_OSM_IDS`; primer login.
5. **Migraciones y seed** — Prisma migrate, `country_identity` (`normalize` por tipo) + roles.
6. **Storage MinIO** — bucket, acceso; **cambiar** `minioadmin` en prod (boot lo rechaza); **put → luego DB**; GC de objetos `certs/` huérfanos (>24 h sin fila `stored_files`).
7. **Backups** — `pg_dump` + sync MinIO **pareados**, off-host, **cifrados**; frecuencia; retención. Volúmenes de disco cifrados en producción.
8. **Restore** — procedimiento; verificación de que BD y objetos coinciden; no regenerar PDF a ciegas.
9. **Health** — `/health`, `/ready`; qué mirar tras deploy.
10. **Rate limits / PDF** — `THROTTLE_*`, `TRUST_PROXY` (1 detrás de Caddy), `PDF_CONCURRENCY`, `PDF_MAX_ISSUE_ATTEMPTS`; síntomas de saturación y certificados `failed`.
11. **SMTP (F3)** — obligatorio en osm.lat para códigos de vínculo HU-10.5; también envío de enlace `/c/`. From dedicado, reputación, cola prudente.
12. **Redis / BullMQ (F3)** — solo osm.lat jobs.
13. **Upgrade** — `docker compose pull && up -d`; orden migrate.
14. **Instancia AC3** — diferencias (`INSTANCE=ac3`, legal, sin `osm_activity`). Aviso `/privacy` con texto **real** (no placeholder) antes de cargar titulares.
15. **HU-10.5 /me (osm.lat)** — OAuth mapper, vínculo email, que no es acceso al panel admin.
16. **ARCO / habeas data** — `PRIVACY_CONTACT_EMAIL`; verificar identidad del solicitante; rectificación = revoke+alta o edición `pending`; supresión = `POST …/participants/{id}/erase` (solo admin). Purgar `permalink_access_log` > 90 días.
17. **Aviso de privacidad** — archivo `PRIVACY_NOTICE_FILE` (placeholder en [anexos/privacy-notice.placeholder.md](./anexos/privacy-notice.placeholder.md)); sustituir por instancia.

### 2.2. Fuera de este runbook

- Diseño de plantillas y carga CSV → manual del editor.
- Redacción jurídica definitiva del aviso (abogado/operador); el repo solo exige que la página exista y no mienta sobre el tratamiento.

---

## 3. Manual del editor / admin

Objetivo: organizar un evento piloto sin leer toda la especificación.

### 3.1. Contenidos mínimos

1. **Roles** — qué puede editor vs admin (RBAC).
2. **Login** — “Iniciar sesión con OSM”; pantalla sin acceso.
3. **Crear evento** — `draft` / `active`; evento `generated` se crea en `draft` y **no** se activa sin plantilla default; qué pasa al desactivar (`active`→`draft`: sale de búsqueda, permalinks vivos).
4. **Sedes** — 0 / 1 / N; inferencia; sede = texto en certificado, no identidad.
5. **Plantilla visual** — fondo, capas, preview; A4 @ 150 DPI; fuentes abiertas.
6. **Participantes** — alta individual; CSV atómico (todo o nada) + incremental; plantilla descargable.
7. **Pregenerados** — 1:1 y sheet+ZIP; CSV↔ZIP 1:1 (falta/sobrante tumba el lote); rol ∈ `allowed_roles`; mismas reglas atómicas.
8. **Multi-rol** — una fila/certificado por rol.
9. **Permalinks** — cómo compartir `/c/{slug}`; emisión lazy; verificación = sitio oficial + SHA-256 del archivo (no “firma digital” de la rúbrica); `/file` pending/failed → 409.
10. **Búsqueda pública** — qué ve el titular (sin listar por evento).
11. **Revocación (F2)** — endpoints cert/badge; **corrección de emitidos = revocar + alta nueva** (no editar PDF). En `pending`/`failed` sí se puede corregir; `retry-issue` desde `failed` (F1).
12. **Emisión fallida (F1)** — listado en ficha del evento; umbral `PDF_MAX_ISSUE_ATTEMPTS`; no relanzar Chromium en `failed`.
13. **Legal AC3 (F2)** — pantalla admin; capas `legal.*` y `legal.signer.{n}.*` (hasta 8 slots); folio global; pie legal = ciudad + `issued_at` (≠ fecha del evento) + disclaimer de participación (editable; snapshot).
14. **Badges OSM (F3, osm.lat)** — BadgeClass, import awardees, job (visión de editor).
15. **Soft-delete** — ocultar evento vs revocar credencial. **Restore** (solo ops):

```sql
UPDATE events SET deleted_at = NULL, updated_at = now() WHERE id = '<event-uuid>';
```

Sin pantalla ni API de restore en v1.0.
16. **Datos del titular** — ARCO: el titular escribe a `PRIVACY_CONTACT_EMAIL`; el **admin** ejecuta HU-8.4. No hay botón de auto-baja. Rectificar emitido = revocar + alta nueva.

### 3.2. No incluir

- Texto de consentimiento **de la otra plataforma** de registro (sí enlazar `/privacy` de esta instancia).
- Detalle de clientes/queries por métrica OSM (ops / desarrollo; ver [06 §5.1](./06-open-badges.md)).

---

## 4. Ayuda pública (titular)

Texto corto en la UI (no un PDF largo):

1. Cómo buscar (email o documento).
2. Qué es el permalink y que se puede compartir. La validez se comprueba **en este sitio** (mirar el dominio). En un certificado emitido aparece el **SHA-256** del archivo para contrastar la descarga. La rúbrica del PDF no es firma digital.
3. Si aparece “revocado” / “no encontrado”.
4. (osm.lat) Cómo ver badges OSM por `osm_id` (F3).
5. Enlace discreto al crédito de software / `/about`.
6. Enlace a `/privacy` (tratamiento de datos) y cómo pedir corrección o supresión (correo, no auto-baja).

---

## 5. Relación con la especificación

| Tema | Spec canónica | Manual |
|------|---------------|--------|
| Reglas de negocio | 01–08 | Resume / “cómo hacerlo en la UI” |
| Fases y tests | 09 | No duplicar |
| ENV, módulos, seguridad | 10 | Ops cita 10 + `.env.example` |
| Consentimiento registro del evento | Otra plataforma | El aviso `/privacy` de **esta** instancia sí aplica |

---

## 6. Referencias

- [Plan de implementación — F3.12](./09-plan-de-implementacion.md)
- [Multi-instancia — backups](./05-personalizacion-multi-instancia.md)
- [Diseño de código — ENV](./10-diseno-codigo-y-anexos.md)
- [Estados — draft/active](./07-estados-y-ciclo-de-vida.md)
