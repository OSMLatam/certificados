# Análisis crítico — Sistema de Certificados y Open Badges (OSMLatam / AC3)

**Autor:** Claude (secretario-IA de Leonardo)
**Fecha:** 2026-09-10
**Objeto:** Repositorio de especificación `certificados` (v1.0), documentación en `docs/01..11` + anexos.
**Naturaleza del repo:** solo documentación/especificación; aún no hay código.
**Propósito de este documento:** revisión por pares constructiva para que el equipo de AC3 refine la definición **antes** de escribir la primera línea de código.

> Nota de método: cito archivos y secciones concretas (p. ej. `docs/03-modelo-de-datos.md §4.6`). Donde señalo un vacío, es porque no aparece en la especificación leída, no porque lo suponga mal resuelto. Reconozco primero lo que está bien y luego lo que falta.

---

## 1. Resumen ejecutivo y veredicto general

**Qué es.** Un sistema para **emitir, consultar y verificar** dos tipos de credenciales de la comunidad OpenStreetMap LATAM: (a) *certificados de evento* en PDF con permalink `/c/{slug}` (asistente, ponente, tallerista, etc.), y (b) *Open Badges* `/b/{slug}` — tanto el badge automático vinculado a cada certificado de evento como badges de *actividad OSM* (changesets, notas, antigüedad…). El mismo código se despliega en **dos instancias independientes**: una comunitaria (`certificados.osm.lat`) y una institucional con respaldo legal (`certificados.ac3.org.co`), cada una con su propia base de datos, storage y administradores (`docs/01-vision-y-alcance.md §1`, `README.md`). Nace para reemplazar el trabajo manual de Yasmila en los SotM Latam 2024/2025 y una herramienta previa de FLISoL considerada difícil de mantener.

**Veredicto general.** Es una de las especificaciones mejor cerradas que se pueden pedir para un proyecto de este tamaño. Está **claro** (cientos de "decisiones cerradas" explícitas que eliminan ambigüedad), está **bien pensado** (privacidad por diseño, aislamiento multi-instancia limpio, inmutabilidad de PDFs emitidos, manejo correcto de identidad OSM), y la **Fase 1 está razonablemente lista para implementar** con la salvedad de un puñado de vacíos que conviene tapar antes de codificar. Sin embargo, **hay una brecha de fondo que el propio proyecto reconoce pero minimiza**: la autenticidad de las credenciales descansa **exclusivamente** en la verificación *hosted* (que el permalink resuelva en el dominio oficial). No hay firma criptográfica ni tamper-evidence en el PDF ni en el badge. Para una instancia **institucional con personería jurídica (AC3)** que emite documentos con NIT y representante legal, esto es una decisión estratégica que merece discutirse a conciencia, no darse por cerrada. Segundo tema de fondo: **habeas data / Ley 1581** (el sistema almacena y publica cédulas y nombres) se declara "fuera de alcance" delegándolo a "otra plataforma de registro", lo cual es discutible cuando AC3 actúa como responsable del tratamiento.

**En una frase:** excelente ingeniería de especificación de producto; los riesgos que quedan no son de *claridad* sino de *seguridad/legalidad de la credencial* y de un conjunto acotado de casos borde operativos.

---

## 2. Requerimientos: ¿completos y claros?

### Lo bueno
- **Historias de usuario bien formadas.** `docs/02-historias-de-usuario.md` usa consistentemente el patrón *Como… quiero… para…* con **criterios de aceptación numerados y verificables**, prioridad (Must/Should/Could), instancia y fase. Ejemplos sobresalientes: HU-1.2 (búsqueda por identidad, con ejemplo de uso "participé en un FLISoL pero no recuerdo el año"), HU-7.3 (revocación con la decisión cerrada "revocar + alta nueva"), HU-10.5 (vínculo OSM↔email con TTL y 1:1).
- **Matriz HU→fase** (`docs/09-plan-de-implementacion.md §8`) sin huecos aparentes; cada HU sabe en qué fase entra.
- **Alcance disciplinado:** §10 (v1.0) vs §11 (evolución futura) vs §6 (fuera de alcance) en `docs/01`, con la lista de evolución declarada "canónica" y no duplicada — muy buena higiene documental.
- **Glosario** (`docs/01 §12`) que desambigua términos colisionantes (Editor rol vs Editor visual; Participante vs Titular vs Mapper vs Awardee).

### Vacíos y ambigüedades
1. **Sin criterios de aceptación no funcionales cuantificados.** No hay objetivos de volumen esperado (¿cuántos certificados/evento, cuántos eventos/año?), ni de rendimiento (tiempo de emisión de PDF, latencia de búsqueda), ni de capacidad del servidor compartido. La duración de fases es "orientativa". Esto dificulta dimensionar `PDF_CONCURRENCY`, backups y retención.
2. **Accesibilidad (a11y) ausente.** Se elige shadcn/ui "por accesible" (`docs/09 §1.1`) pero **no hay ninguna HU ni criterio WCAG**. Para credenciales públicas y para docencia comunitaria es un hueco relevante.
3. **Consentimiento / habeas data delegado a terceros.** `docs/02` (encabezado "Datos mínimos del participante") y `docs/11 §encabezado` declaran que el consentimiento "llega desde otra plataforma de registro" y que este sistema "solo almacena y emite". Es una postura frágil: el sistema **almacena cédulas y correos y los publica** en permalinks. Para AC3 (entidad jurídica en Colombia) esto puede constituir tratamiento de datos personales sensibles sujeto a Ley 1581/2012. Falta, como mínimo, una HU de *supresión/rectificación* (hoy en `docs/01 §11` como evolución futura y en `docs/11 §3.1.15` como "procedimiento ops manual") y una política de retención. Ver §8 y §9.
4. **El rol "Verificador externo" no tiene HU propia** más allá de abrir el permalink; un empleador que quiera verificar en lote choca contra el rate limit de 60 req/min sin ruta legítima alternativa. Menor, pero no contemplado.
5. **Tensión Must/Should en auditoría.** El `audit_log` (quién revocó, quién asignó roles) vive dentro de HU-7.2 marcada **Should** (`docs/02` Épica 7), pero para una instancia institucional la trazabilidad de revocaciones y de cambios de rol es casi un Must de gobernanza. Conviene subir el *audit log de acciones sensibles* a Must aunque el dashboard de métricas quede Should.
6. **No hay HU para gestionar el catálogo de roles/tipos de documento por UI** — se resuelve con YAML + redeploy (`docs/05 §5`), lo cual está *documentado y aceptado*, pero limita la promesa de "extensible por LATAM" a algo que requiere intervención de un operador técnico.

---

## 3. Flujos funcionales: coherencia y casos borde

`docs/04-flujos-funcionales.md` está bien: diagramas mermaid para login OAuth, permalink, búsqueda, multi-rol, editor, pregenerados, revocación, badge automático, import OSM, job y vínculo `/me`. El **contrato de superficies** (`docs/04 §2` + `docs/10 §4.2`: SPA `/c/` → metadata (único disparador de emisión, salvo crawlers) → `/file` con **409 si pending**) es una pieza de diseño elegante y explícita.

### Casos borde bien cubiertos
- Fallo de Puppeteer en la emisión → queda `pending` + 503, reintento en la siguiente visita (`docs/07 §3` punto 4, `docs/10 §4.2`).
- Emisión concurrente → lock por `certificate_id` (`SELECT … FOR UPDATE`/advisory lock) para no lanzar dos Chromium (`docs/10 §4.2.1`).
- Revocación en cascada certificado→badge (`docs/04 §9`, `docs/07 §3` punto 6).
- Duplicados (mismo email+rol) → rechazar; import CSV **atómico** (todo o nada) + incremental (`docs/03 §8`, HU-6.2).
- Crawlers/preview OG no disparan emisión (`PREVIEW_BOT_UA_REGEX`, `docs/07 §3` punto 10).

### Casos borde faltantes o subespecificados (accionables)
1. **Rol de la fila CSV que no está en `events.allowed_roles`.** No se especifica qué pasa. Debe ser error de validación de fila (y, por atomicidad, falla el lote). *Añadir al contrato del parser.*
2. **Evento `generated` activado sin plantilla default.** Nada impide poner `active` un evento sin `default_template_id`; al primer `/c/` la emisión intentará renderizar sin plantilla → 503 permanente para todos. **Falta una precondición** ("no se puede activar un evento `generated` sin plantilla default o sin ser `pregenerated_only`"). Riesgo real de "certificado que nunca emite".
3. **`pending` atascado / dead-letter.** Si el PDF falla siempre (fuente rota, fondo corrupto), el certificado queda `pending` para siempre y devuelve 503 en cada visita, **sin alerta ni visibilidad admin**. Falta: panel/consulta de "pendings con N fallos" y/o un estado/flag de error.
4. **Atomicidad MinIO↔Postgres.** `transitionToIssued` hace `PdfService.render → StorageService.put → update DB` (`docs/10 §4.2`). MinIO y Postgres **no comparten transacción**: si el `put` a MinIO tiene éxito pero el `update` falla, queda un objeto huérfano; si se invierte el orden, un certificado `issued` sin archivo. No se define el orden ni la compensación. *Especificar orden (put → update, con GC de huérfanos) e idempotencia por checksum.*
5. **ZIP de pregenerados: zip-slip y zip-bomb.** `docs/10 §10.1` valida MIME y tamaño total (100 MB) pero **no** menciona protección contra rutas maliciosas (`../`) ni descompresión abusiva. Vector clásico de RCE/DoS en imports. *Añadir a los defaults de seguridad.*
6. **Archivos del ZIP sin fila CSV (o al revés).** Se exige que `filename` coincida (`docs/03 §10`), pero no se dice qué pasa con archivos sobrantes en el ZIP (¿ignorar, advertir, fallar?).
7. **Colisión de slug.** nanoid 12 hace la colisión improbable pero no imposible; no se describe retry-on-unique-violation. Menor, pero conviene un criterio.
8. **Reenvío de correo / rebotes (bounce).** El envío de enlace por email es F3 (HU-6.1 punto 6), pero **no hay flujo de reenvío ni manejo de rebotes/hard-bounces** ni de emails inválidos. Para "el titular no recibió el enlace" no hay procedimiento.
9. **Generación/impresión masiva imposible en v1.0.** Al ser emisión **solo lazy**, no existe forma de pre-generar los PDFs de un evento para imprimirlos o adjuntarlos en lote; cada PDF nace cuando alguien abre su permalink. Está reconocido como evolución futura ("emisión forzada/masiva", `docs/01 §11`), pero es una **limitación operativa fuerte** para eventos presenciales que quieran entregar el PDF impreso el mismo día. Conviene que AC3 confirme que no lo necesita en v1.0.

---

## 4. Modelo de datos: solidez, integridad, multi-instancia

`docs/03-modelo-de-datos.md` es sólido y profesional: UUID PK, normalización de email y documento, **índices únicos parciales** bien pensados (p. ej. `certificates(participant_id, role_code) WHERE status <> 'revoked'` para permitir revocar+reemitir), `checksum_sha256` en `stored_files`, y el diagrama ER razonable.

### Aciertos
- **Aislamiento multi-instancia sin `instance_id` en tablas** (`docs/03 §1` principio 5): cada despliegue = una BD. Simplifica el modelo y elimina fugas cross-instancia por diseño.
- **Vínculo cert↔badge unidireccional** (`badge_assertions.certificate_id`, sin FK inversa) evita la FK circular (`docs/03 §4.6`, "Enlace al badge").
- **Identidad OSM correcta:** `osm_id` inmutable UNIQUE + `osm_username` actualizable; badges referencian `osm_profile_id`, nunca username suelto (HU-10.6, `docs/03 §6.3`). Maneja bien el renombrado de cuentas OSM.
- **Orden de creación evento↔plantilla** resuelto con `default_template_id` nullable seteado después (`docs/03 §4.1`).

### Riesgos e inconsistencias
1. **La normalización de `doc_number` es CO-hardcoded y contradice el principio de extensibilidad.** `docs/03 §4.3` dice "para tipos numéricos de Colombia (CC, CE, TI…): dejar **solo dígitos**". Pero el principio 4 (§1) promete identificación "extensible por país vía configuración, no ENUM rígido global". Si mañana se añade `PASSPORT` (alfanumérico) o un país con documentos con letras, la regla de normalización **exige cambio de código**, no de config. *Recomendación: mover la estrategia de normalización a `country_identity_config` (p. ej. campo `normalize: digits|alnum|raw`).*
2. **`legal_snapshot` no existe para pregenerados → contradice HU-1.3.** HU-1.3 criterio 3 dice que la página `/c/` de AC3 muestra NIT/razón social "vía `legal_snapshot` (**todos** los eventos de esa instancia)". Pero `docs/08 §2.2` punto 4 y `docs/03 §4.6` dicen que en pregenerados "el legal ya va en el archivo subido; no hay snapshot". Resultado: un certificado **pregenerado en AC3** no tendrá datos institucionales estructurados en la página de verificación. *Resolver: o la página `/c/` de pregenerados AC3 lee `instance_legal` vigente como fallback, o se acota HU-1.3 a certificados `generated`.*
3. **`role_code ∈ allowed_roles` no se puede garantizar en BD.** `allowed_roles` es JSONB (`docs/03 §4.1`); la coherencia entre el rol del certificado y los roles permitidos del evento es solo a nivel de aplicación. Aceptable, pero debe estar en los tests.
4. **`permalink_access_log` crece sin límite.** Cada visita a `/c/` inserta una fila con `user_agent` + `referer` (`docs/03 §5.3`). No hay política de retención ni particionado. En un evento viral puede inflar la BD y, además, guardar UA/referer completos es rastro personal (aunque se redacte la IP con `LOG_REDACT_IP`). *Definir retención/agregación.*
5. **Fragmentación de persona por email.** `UNIQUE (event_id, email)` implica que si la misma persona aparece con dos correos distintos en el mismo evento, se crean **dos** `participants` y sus certificados no se unifican en la búsqueda por documento… salvo que el documento coincida. La búsqueda por documento usa `(event_id, country_code, doc_type_code, doc_number)` que **no es UNIQUE** (`docs/03 §4.3`: "no es clave de unicidad alternativa"), así que devolverá ambas filas — bien —, pero la relación email↔persona puede fragmentarse. Menor; conviene documentar el comportamiento esperado.
6. **Sin índice por `status` para dashboards.** Los conteos "certificados pending|issued" (HU-7.2) y listados admin se beneficiarían de un índice `(event_id, status)`. Menor/optimización.
7. **GC de `stored_files`.** Tras revocar+reemitir, el PDF viejo queda huérfano (por diseño de inmutabilidad, aceptable), pero no hay política de limpieza ni de retención de objetos MinIO (mencionada como evolución futura en `docs/01 §11`). Menor.

**Multi-país:** el catálogo se siembra por despliegue desde YAML (`docs/05 §5`), y ambas instancias siembran solo CO. Añadir MX/AR = nuevo YAML + redeploy. Correcto para v1.0, pero (junto con el punto 1) la promesa "LATAM" es hoy más un patrón preparado que una capacidad operable sin desarrolladores.

---

## 5. Estados y ciclo de vida

`docs/07-estados-y-ciclo-de-vida.md` es claro y usa diagramas de estados por entidad.

- **Evento:** `draft ↔ active` (`docs/07 §2`). Bien resuelto el matiz "un evento pasado sigue `active`" y que `active→draft` saca de búsqueda pero mantiene permalinks vivos. Coherente con soft-delete.
- **Certificado:** `pending → issued → revoked` y `pending → revoked` (`docs/07 §3`). Sin callejones: `revoked` es terminal y la corrección se hace con alta nueva (nuevo slug), habilitada por el UNIQUE parcial. Coherente.
- **Badge event_role:** espeja al certificado (`docs/07 §4.1`). **Badge osm_activity:** nace directamente `issued` (sin `pending`), con re-emisión posible tras revoke por el UNIQUE parcial (`docs/07 §4.2`).

### Huecos
1. **No hay estado de error para el certificado.** Como se dijo en §3.3, un `pending` que nunca logra renderizar no tiene representación distinta de un `pending` recién creado. La máquina de estados es completa *para el camino feliz*, pero **le falta el manejo del fallo persistente de emisión** (dead-letter / `failed` / contador de intentos). Es el único hueco real de la máquina de estados.
2. **Precondición de activación** (ver §3.2): la transición `draft→active` de un evento `generated` debería exigir plantilla default. Hoy no está.
3. **Reversibilidad:** no hay "des-revocar" (correcto y deliberado) ni "restore" de evento salvo por SQL (`docs/07`/`docs/11 §3.1.14`). Aceptado y documentado.

En conjunto: máquina de estados **casi completa**; solo falta modelar el fallo de emisión.

---

## 6. Open Badges / multi-instancia / personalización

### Estándar
- El sistema emite **Open Badges 2.0 *hosted*** (`docs/06 §1`, decisión cerrada), difiriendo OB 3.0 + firma (`proof`) a evolución futura (`docs/01 §11`). El mapeo Issuer/BadgeClass/Assertion/Evidence/Verification es correcto (`docs/06 §3`), el `@context` es `https://w3id.org/openbadges/v2` (`docs/06 §4`), y el manejo del recipient es **correcto**: `IdentityObject` con email **hasheado + salt por assertion** para event_role, e identidad por **URL estable con `osm_id`** para osm_activity sin email (`docs/06 §2.3`).
- **Advertencia estratégica sobre "hosted".** OB 2.0 es un estándar en fin de ciclo; 1EdTech empujó OB 3.0 (Verifiable Credentials) desde ~2023. Badgr/Canvas Credentials y Open Badge Passport aún consumen 2.0 hosted, así que **la interoperabilidad hoy funciona**. Pero la verificación *hosted* tiene una debilidad estructural: **la validez del badge depende de que el servidor siga vivo y sirviendo `assertions/{uuid}.json` para siempre** (`docs/06 §2.3`). Si una instancia se apaga o cambia de dominio, **todos sus badges dejan de verificar** (link rot). Para AC3 (institucional, con vocación de permanencia) un badge **firmado** (OB 3.0) sobreviviría a la caída del servidor. Recomiendo que AC3 decida esto con los ojos abiertos: 2.0 hosted es la vía rápida, pero es deuda de durabilidad, no solo de formato.
- **Falta *baking* de badges** (incrustar la assertion en el PNG) — una característica común de portabilidad OB. No aparece; hoy solo hay upload de PNG/SVG (`docs/06 §10`). Menor / evolución.
- **RevocationList del issuer no se expone.** La revocación se refleja en la assertion (`revoked: true`) (`docs/06 §9`), suficiente para hosted, pero algunos consumidores consultan una `revocationList` en el issuer. Menor.
- **Caché `assertion_json` puede quedar stale** si cambia el nombre del issuer (AC3). Probablemente irrelevante porque `issuer.json` es otra URL, pero conviene una nota de invalidación.

### Multi-instancia y personalización
- **Muy bien resuelto.** `docs/05` define despliegues totalmente aislados (BD/storage/OAuth propios), topología idéntica y solo cambian ENV + DNS. El **checklist de despliegue** (`docs/05 §8`) es concreto y útil.
- **Separación marca (instancia) vs software (código)** (`docs/05 §10`) es un detalle maduro: el crédito al software va en footer/`/about`/`/health` pero **nunca** en el PDF ni en el JSON-LD del Issuer, para no romper interoperabilidad ni "competir" con la marca del emisor. Excelente criterio.
- **Personalización legal** vía `instance_legal` + capas `legal.*` en el editor, con snapshot al emitir. Limpio (ver §8).

---

## 7. Implementación: plan, diseño de código, `.env.example`, seguridad

### Enfoque técnico
- **Stack moderno y coherente** (`docs/09 §1.1`): TypeScript, monorepo pnpm, NestJS 11 + Prisma 6 + PostgreSQL 16, React 19 + Vite + shadcn + react-konva, Puppeteer para PDF, MinIO S3, BullMQ+Redis (solo F3), Docker Compose, GitHub Actions. Es una elección realista, mantenible y "amigable para IA" (justificación explícita). El **fasado** (F1 sin Redis/SMTP; Redis y SMTP solo en F3) reduce complejidad temprana — muy buen criterio.
- **Diseño de código** (`docs/10`) inusualmente completo para una spec: estructura de monorepo, módulos Nest por fase, contrato de superficies `/c/`, formato de errores, health checks (`/health` liveness, `/ready` con checks de BD+MinIO+Redis), outline de OpenAPI y de Prisma. El README trae incluso **prompts de IA por fase** y criterios de aceptación por fase (`docs/09 §2.4/3.3/4.3`). Esto acelera muchísimo el arranque.
- **Pruebas** (`docs/09 §11`): unit (Jest/Vitest) + integración (Supertest + Postgres real) + E2E opcional (Playwright), con casos T1–T16 mapeados a flujos y cobertura ≥80% en dominio F1. Estrategia sólida. Se excluyen explícitamente carga y pentest en v1.0 (aceptable, pero ver abajo).

### Seguridad — evaluación
**Base correcta:** cookies `httpOnly`/`Secure`/`SameSite=Lax`, CSRF por SameSite + validación de `Origin`, `helmet`/CSP/HSTS, secrets fuera del repo, slug no enumerable (nanoid 12 ≈ 71 bits), rate limiting con `@nestjs/throttler`, 429 + `Retry-After`, sin sitemap de slugs, `robots.txt` (`docs/10 §10`). El diseño **anti-abuso/anti-carga** (rate limit en búsqueda 10/min y permalinks 60/min, `PDF_CONCURRENCY=1`, no regenerar `issued`) es maduro y está pensado para hosts compartidos — un punto fuerte real.

**Brechas de seguridad a atender antes de codificar:**
1. **ANTI-FALSIFICACIÓN / firma — la brecha más importante.** El producto se vende como "validación pública de autenticidad" (HU-1.3), pero **no hay ninguna prueba criptográfica en la credencial**: ni firma PAdES en el PDF, ni hash publicado, ni firma en el badge (OB 2.0 hosted no firma). La autenticidad = "el permalink resuelve en el dominio oficial". Consecuencias:
   - Un PDF **falsificado** (visualmente idéntico, con NIT y firma de AC3) es indistinguible **offline**; solo se detecta si el verificador teclea/escanea el permalink y este resuelve. Un QR alterado que apunte a otro dominio engaña a quien no mira la URL.
   - El `checksum_sha256` existe en `stored_files` (`docs/03 §4.7`) pero **no se expone** en la página `/c/` ni en la API verify, así que no sirve como prueba pública.
   - *Recomendaciones concretas y baratas para v1.0:* (a) mostrar el **sha256 del PDF** y la fecha de emisión en la página `/c/` y en `GET /api/v1/verify/c/{slug}`; (b) considerar **firma PAdES** del PDF de AC3 (LEGAL_SIGNATURE ya contempla imagen de firma, pero es decorativa, no criptográfica); (c) evaluar seriamente OB 3.0 firmado para AC3 (ver §6). Como mínimo, **documentar explícitamente el modelo de amenaza** ("la autenticidad depende del permalink; no hay tamper-evidence offline") para que AC3 no comunique más garantía de la que da.
2. **Hardening de Puppeteer/Chromium.** Renderiza HTML con **fondos e imágenes subidos por el usuario** y fuentes. Riesgos no tratados en `docs/10`: SSRF si la plantilla puede referenciar URLs remotas; ejecución como root en el contenedor; falta de `--no-sandbox`/seccomp bien configurado. *Especificar: deshabilitar carga de recursos remotos, correr como usuario no-root, timeouts (ya está `PDF_TIMEOUT_MS`), y aislar red del contenedor de render.*
3. **Validación de contenido de uploads, no solo MIME.** `docs/10 §10.1` limita MIME y tamaño, pero un PNG puede ser una *decompression bomb* y un PDF puede traer JS. Sumado a **zip-slip/zip-bomb** (§3.5). *Añadir escaneo/validación de contenido y límites de descompresión.*
4. **PII en reposo sin cifrado.** La BD guarda cédulas, nombres y correos; los backups van off-host (`docs/05 §1.1`). No se menciona **cifrado en reposo** (disco/BD) ni **cifrado de backups**. Para habeas data es recomendable. *Añadir al runbook y a defaults.*
5. **Rate limit tras reverse proxy.** El throttler por IP necesita `trust proxy` y leer `X-Forwarded-For` correctamente detrás de Caddy/nginx; si no, **todo el tráfico parece una sola IP** y el rate limit se vuelve inútil o bloquea a todos. No está mencionado. *Detalle de implementación a fijar.*
6. **Credenciales por defecto en el ejemplo.** `.env.example` trae `STORAGE_ACCESS_KEY=minioadmin`/`minioadmin` sin la advertencia "change-me" que sí tiene `SESSION_SECRET`. Menor, pero fácil de olvidar en prod.
7. **Migraciones en producción subespecificadas.** El CI corre `prisma migrate deploy` para test, pero en prod solo hay un bullet "upgrade: docker compose pull && up -d; orden migrate" (`docs/09 §1.2`, `docs/11 §2.1.13`). **Quién ejecuta las migraciones al desplegar, y la estrategia de rollback**, no están definidos. Riesgo operativo.
8. **Observabilidad/alertas.** Hay health checks y logs estructurados + `audit_log`, pero **no hay métricas (Prometheus) ni alertas** (PDF fallidos, pendings atascados, jobs OSM fallidos, SMTP caído). Para operación 24/7 en servidor comunitario conviene al menos alertas básicas.

### `.env.example`
Muy completo y bien comentado, con secciones por fase, y coherente con `docs/10 §7`. Buen detalle: `PREVIEW_BOT_UA_REGEX`, nota de no bloquear Badgr/Passport, `LOG_REDACT_IP`. Observaciones: (a) `LOG_REDACT_IP` se cita en `docs/03 §5.3`/`docs/10 §7` pero **no aparece en `.env.example`** — inconsistencia menor a corregir; (b) sin advertencia de cambiar `minioadmin` (punto 6).

---

## 8. Datos legales / plantilla AC3

`docs/08-datos-legales-ac3-plantilla.md` resuelve el tema con elegancia: **no hay subsistema legal aparte**; NIT/razón social/representante/firma son **config de instancia** (`instance_legal`, editable por pantalla admin, con bootstrap `LEGAL_*`) usada como **capas `legal.*` en el editor visual**, con **snapshot inmutable al emitir** (`docs/08 §2.2`). Esto es correcto y auditable: certificados viejos no cambian si se actualiza el NIT.

### ¿Suficiente?
Para certificados de **participación** comunitarios, sí. Para uso institucional más formal, faltan campos que las entidades colombianas suelen incluir:
1. **Número de resolución/registro o consecutivo del certificado.** No hay un identificador institucional legible (más allá del slug técnico). Muchas entidades numeran sus certificados. *Considerar un campo consecutivo por evento/instancia.*
2. **Un solo firmante.** `instance_legal` modela **una** firma (`signature_file_id`). Los certificados institucionales suelen llevar **dos firmas** (p. ej. presidente + secretario/director). *Evaluar soportar N firmas.*
3. **Ciudad y fecha de expedición institucional** como campos legales (hoy la fecha es la del evento/sede, no la de expedición del documento).
4. **Disclaimer de naturaleza.** Al llevar NIT y "aval institucional", conviene un texto que aclare que es un **certificado de participación**, no un título de educación formal/acreditada, para no inducir a error. Es un matiz legal barato de incluir.
5. **Vínculo con habeas data (Ley 1581).** Ya señalado en §2.3 y §9: AC3, al emitir con su NIT y publicar cédulas, actúa como responsable del tratamiento en Colombia. La delegación del consentimiento a "otra plataforma" (`docs/11`) no exime a AC3 de tener política de tratamiento, aviso de privacidad accesible desde el sitio y procedimiento de supresión. **Falta como requisito, no solo como ops manual.**

Los datos institucionales en `docs/08` y `.env.example` son **plantilla con placeholders** ("Asociación …", "900.123.456-7") — correcto, se llenan por config; solo hay que asegurarse de contrastarlos contra `admin/DATOS_INSTITUCIONALES_TRUFI.md`/datos reales de AC3 al desplegar.

---

## 9. Vacíos y riesgos priorizados (de mayor a menor)

1. **[Alto — estratégico] Ausencia de anti-falsificación / firma criptográfica.** Autenticidad = permalink en dominio oficial; el PDF y el badge no tienen tamper-evidence. Crítico para la instancia institucional AC3. (§7.1, §6)
2. **[Alto — legal] Habeas data / Ley 1581 delegado a terceros.** Se almacenan y publican cédulas/correos sin política de tratamiento, aviso de privacidad ni flujo de supresión en producto (solo "ops manual" / evolución futura). Riesgo de cumplimiento para AC3. (§2.3, §8.5)
3. **[Alto — durabilidad] Dependencia total de verificación *hosted* (OB 2.0).** Si un servidor cae o cambia de dominio, todos sus badges dejan de verificar; estándar en fin de ciclo. (§6)
4. **[Medio — funcional] Evento `generated` activable sin plantilla + `pending` atascado sin dead-letter.** Combinados producen "certificados que nunca emiten" y 503 invisibles. Falta precondición de activación y estado/visibilidad de error. (§3.2, §3.3, §5.1)
5. **[Medio — datos] `legal_snapshot` inexistente en pregenerados contradice HU-1.3** (página `/c/` de AC3 promete datos legales en "todos los eventos"). (§4.2)
6. **[Medio — seguridad] Hardening Puppeteer + zip-slip/zip-bomb + validación de contenido de uploads + rate limit tras proxy.** Vectores de RCE/DoS y de evasión del rate limit no tratados. (§7.2, §7.3, §7.5, §3.5)
7. **[Medio — extensibilidad] Normalización de documento CO-hardcoded** rompe la promesa de identificación configurable por país. (§4.1)
8. **[Medio — operativo] Emisión solo lazy impide generación/impresión masiva** para entrega presencial. Confirmar que AC3 no lo necesita en v1.0. (§3.9)
9. **[Medio — operativo] Migraciones en prod y observabilidad/alertas subespecificadas.** Quién migra, rollback, alertas de fallos. (§7.7, §7.8)
10. **[Bajo] `permalink_access_log` sin retención; PII en reposo sin cifrado explícito; audit log en Should; a11y ausente; sin criterios no funcionales/volumen; `LOG_REDACT_IP` ausente en `.env.example`; sin baking OB; sin resend/bounce de email.** (§2, §4.4, §7.4, §7.8)

---

## 10. Recomendaciones concretas y accionables (priorizadas — qué haría antes de codificar)

**Antes de tocar código (decisiones de producto/legal que cambian el diseño):**
1. **Decidir el modelo de autenticidad de forma consciente y documentarlo.** Como mínimo: (a) publicar `sha256` + fecha de emisión en `/c/` y en `verify`; (b) escribir un breve *modelo de amenaza* ("qué garantiza y qué no el permalink"). Para AC3, evaluar **firma PAdES del PDF** y/o **OB 3.0 firmado**; si se mantiene 2.0 hosted, aceptarlo explícitamente como deuda de durabilidad. *(Riesgos 1 y 3.)*
2. **Cerrar el frente habeas data.** Añadir HU de *política de tratamiento + aviso de privacidad + supresión/rectificación* como **requisito de v1.0 para la instancia AC3** (no evolución futura). Definir **retención** de PDFs, de `participants` y de `permalink_access_log`. *(Riesgo 2.)*
3. **Confirmar si v1.0 necesita emisión/impresión masiva.** Si sí, subir "emisión forzada" de evolución futura a Fase 1/2; si no, dejar constancia de la decisión. *(Riesgo 8.)*
4. **Subir a Must el audit log de acciones sensibles** (revocaciones, cambios de rol, imports) aunque el dashboard quede Should. *(§2.5.)*

**Ajustes de especificación (rápidos, tapan huecos sin rediseñar):**
5. **Añadir precondición** "no activar evento `generated` sin plantilla default" y **modelar el fallo de emisión** (estado/flag `failed` o contador de intentos + visibilidad admin). *(Riesgo 4.)*
6. **Resolver la contradicción de `legal_snapshot` en pregenerados** (fallback a `instance_legal` vigente en `/c/`, o acotar HU-1.3 a `generated`). *(Riesgo 5.)*
7. **Hacer configurable la normalización de documento** por `country_identity_config` (`normalize: digits|alnum|raw`). *(Riesgo 7.)*
8. **Especificar el contrato transaccional de emisión** (orden put→update, idempotencia por checksum, GC de huérfanos) y el **manejo de rol fuera de `allowed_roles`** y de **archivos ZIP sobrantes/faltantes**. *(§3.1, §3.4, §3.6.)*
9. **Ampliar los defaults de seguridad en `docs/10 §10`:** hardening Puppeteer (sin recursos remotos, no-root), protección zip-slip/zip-bomb, validación de contenido de uploads, `trust proxy` para el rate limit, cifrado en reposo y de backups, y advertencia de cambiar `minioadmin`. Corregir `LOG_REDACT_IP` ausente en `.env.example`. *(Riesgo 6, §7.)*

**Robustez institucional y operación (para AC3):**
10. **Enriquecer `instance_legal`**: consecutivo/número de certificado, hasta N firmantes, ciudad/fecha de expedición, y disclaimer de "certificado de participación". Definir **migraciones de prod + rollback** y **alertas mínimas** (PDF fallidos, pendings atascados, SMTP/jobs). Añadir un **criterio de aceptación no funcional** con volumen esperado por evento para dimensionar `PDF_CONCURRENCY` y backups. *(§8, §7.7, §7.8, §2.1.)*

**Nota de proceso:** hay una leve inconsistencia de "estado de madurez" entre `docs/README.md` ("lista para **revisión por pares**, aún no cerrada para implementación") y `README.md` raíz / `docs/09 §10` ("**lista para iniciar Fase 1**"). Antes de arrancar conviene alinear el mensaje: esta revisión sugiere que Fase 1 puede empezar **una vez incorporados al menos los ajustes rápidos 5–9**, y que las decisiones 1–4 (autenticidad, habeas data, masivo, auditoría) se cierren en paralelo porque afectan sobre todo a Fase 2 (AC3/badges) y no bloquean el núcleo de Fase 1.

---

### Apéndice — lo que está claramente bien (para no perderlo en el refactor de la spec)
- Contrato de emisión lazy `/c/` metadata→`/file` (409) con lock por certificado y crawlers que no emiten.
- Privacidad por diseño en búsqueda (sin enumeración; mensaje genérico; sin sitemap).
- Aislamiento multi-instancia sin `instance_id`; separación marca vs software.
- Identidad OSM `osm_id` inmutable; vínculo email 1:1 con código de un solo uso hasheado y TTL.
- Inmutabilidad de PDFs emitidos + snapshot legal; corrección = revocar + alta nueva con UNIQUE parcial.
- Higiene documental: alcance v1.0 vs evolución futura canónica y no duplicada; matriz HU→fase; prompts y criterios de aceptación por fase; estrategia de pruebas con casos T1–T16.
