# Historias de usuario

**Versión:** 1.0  
**Fecha:** 2026-06-06  
**Alcance:** Ambas instancias (osm.lat y AC3).  
**Implementación:** ver matriz HU → fase en [09-plan-de-implementacion.md](./09-plan-de-implementacion.md#8-matriz-hu--fase-de-implementación).

**Convención:**

- **Prioridad:** Must (M), Should (S), Could (C)
- **Instancia:** `Ambas` salvo indicación contraria

---

## Roles del sistema

| Rol | Descripción |
|-----|-------------|
| **Participante** | Persona con certificado(s); no requiere cuenta en el panel |
| **Editor** | Opera la instancia: eventos, participantes, plantillas, certificados, badges (según instancia), envío de enlaces |
| **Admin** | **Hereda** todo lo de editor + gestión de usuarios del panel (HU-7.4) + audit log |
| **Verificador externo** | Cualquiera con el permalink (LinkedIn, empleador) |

**Roles de participación en eventos** (no confundir con roles del sistema):  
`asistente`, `ponente`, `tallerista`, `voluntario`, `organizador` (+ extensibles por configuración).

Un participante puede tener **varios** de estos roles en el **mismo evento**; cada uno genera un certificado (`/c/`) y un **badge de evento** (`/b/`) vinculado.

**Mapper OSM** (sin evento): badges de actividad identificados por **`osm_id`** (inmutable); `osm_username` es solo nombre de visualización actual. Solo instancia **osm.lat**.

### Matriz RBAC (panel)

| Acción | Editor | Admin |
|--------|--------|-------|
| Eventos, sedes, participantes, plantillas, CSV, pregenerados | Sí | Sí (hereda) |
| Soft-delete evento | Solo si es **creador** del evento | Sí |
| Revocar certificado / badge | Sí | Sí |
| Badges actividad OSM (osm.lat) | Sí | Sí |
| Enviar email con link de certificado | Sí | Sí |
| Config legal AC3 (pantalla instancia) | No | Sí |
| Dashboard (conteos) | Sí | Sí |
| Audit log | No | Sí |
| Gestión usuarios (`admin`/`editor`) | No | Sí |

**Soft-delete:** el evento deja de listarse (`deleted_at`); **restore solo vía SQL** (`UPDATE … SET deleted_at = NULL`) — sin endpoint ni pantalla (poca frecuencia). Los permalinks `/c/{slug}` y `/b/{slug}` **siguen sirviendo**. **Evolución futura:** borrado de eventos `active` antiguos solo tras confirmación de un segundo editor.

**Emisión de certificados:** solo **lazy** vía metadata `GET /api/v1/public/certificates/{slug}` (no crawlers); `/file` en `pending` → 409. No hay emisión forzada/masiva en v1.0.

### Privacidad pública (reglas fijas v1.0)

| Recurso | Descubrimiento | Acceso |
|---------|----------------|--------|
| Badge actividad OSM | Público por `osm_id` / username | `/b/{slug}`, búsqueda OSM |
| Badge de evento | No por username | `/b/{slug}` si se conoce el slug |
| Certificado | No listado público | Permalink `/c/{slug}` o búsqueda por email/documento |

Preferencias “hacer público/privado mi perfil” = [evolución futura](./01-vision-y-alcance.md#11-evolución-futura-post-v10).

### Datos mínimos del participante

| Instancia | Obligatorio |
|-----------|-------------|
| **osm.lat** | `full_name` + `email` (documento opcional) |
| **AC3** | `full_name` + `email` + país + tipo + número de documento |

**Email:** obligatorio y **único por evento** (una persona = un email). Alta/CSV/pregenerados: email ya existente en el evento → **rechazar** (salvo nuevo rol de la misma persona). Normalizar `trim` + `lower` al guardar. Ver [03 §4.3](./03-modelo-de-datos.md).

Aviso / consentimiento de datos de contacto: **fuera de este sistema**. Los emails y datos de participantes llegan desde otra plataforma de registro (evento), donde ya se informa el uso. Este producto solo almacena y emite credenciales; no recoge el consentimiento inicial.

---

## Épica 1 — Permalink y consulta pública

### HU-1.1 — Obtener certificado mediante permalink

**Como** participante,  
**quiero** acceder a una URL permanente de mi certificado,  
**para** compartirla en LinkedIn, CV o correo sin volver a buscar en formularios.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Cada certificado tiene slug único e inmutable (ej. `/c/{slug}`).
2. La URL resuelve a vista pública del certificado y opción de descarga PDF/imagen.
3. Si el certificado fue revocado, la URL indica estado inválido sin exponer datos sensibles extra.
4. La URL es la misma en todas las consultas posteriores.
5. Metadatos Open Graph permiten preview en LinkedIn.

---

### HU-1.2 — Buscar todas mis credenciales por identificación

**Como** participante que olvidó el año o el nombre exacto del evento (ej. “participé en un FLISoL pero no recuerdo cuándo”),  
**quiero** ingresar solo mi **correo** o mi **documento (tipo + número)** y ver **todo** lo asociado a mí,  
**para** recuperar permalinks de certificados y badges sin adivinar filtros.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Formulario público **mínimo**: identificador obligatorio — **correo** **o** (**país** + tipo de documento + número). País obligatorio cuando se busca por documento.
2. **No** se pide año, evento ni sede para buscar.
3. Resultado: lista unificada de credenciales del titular:
   - Certificados `/c/{slug}` (evento, rol, fecha, estado).
   - Badges `/b/{slug}` (logro, fecha, estado).
4. Varios roles en el mismo evento → varias filas.
5. Varios eventos/años → todos en la misma respuesta.
6. Si no hay coincidencias: **mensaje genérico** (“No encontramos credenciales con esos datos”); no confirmar si el documento existe en el sistema.
7. **Rate limiting** en búsqueda (Must, Fase 1). Captcha/Turnstile ante abuso persistente (Should, Fase 3). Ver [10 §10](./10-diseno-codigo-y-anexos.md#10-seguridad-abuso-y-protección-de-carga).
8. Número de documento: normalizar igual que en el alta (quitar puntuación/espacios; CO → solo dígitos) antes de comparar.

**Ejemplo de uso:**

> Yo participé en un FLISoL pero no me acuerdo el año. Mi cédula es CC 1234567890.  
> → El sistema muestra: FLISoL Bogotá 2024 (asistente), Mapathon 2026 (voluntario), badge “100 changesets” (si aplica).

---

### HU-1.2b — Prohibir consultas que expongan datos de terceros

**Como** responsable del sistema,  
**quiero** que **nunca** se listen asistentes de un evento sin identificación del titular,  
**para** evitar extracción masiva de datos personales.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. **No existe** búsqueda pública por evento, año o sede solos.
2. Toda consulta pública exige **correo** o **documento (tipo + número)** del titular (badges OSM: **OSM id** — ver HU-10.4).
3. El panel admin sí puede listar participantes por evento (autenticado).
4. API pública sin credencial de titular no devuelve listados de personas.
5. Permalinks y búsqueda tienen rate limit; no hay sitemap que enumere slugs (protección de scraping y de carga del servidor).

---

### HU-1.3 — Validación pública de autenticidad

**Como** verificador externo (ej. empleador),  
**quiero** abrir el permalink y confirmar que el certificado es auténtico,  
**para** confiar en la participación declarada.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. La página del permalink muestra: nombre, evento, rol, fecha, emisor (instancia).
2. Indicador claro: **válido** / **revocado** / **no encontrado**.
3. Instancia AC3 muestra datos institucionales (NIT, razón social) en la página `/c/` vía `legal_snapshot` (todos los eventos de esa instancia).
4. API de verificación JSON disponible (`GET /api/v1/verify/c/{slug}` y, en Fase 2+, `/b/{slug}`).

---

### HU-1.4 — Certificado generado con datos correctos

**Como** participante,  
**quiero** que el documento refleje mi nombre, rol, evento, sede (si aplica), actividad/charla y fecha,  
**para** que sea fiel a mi participación.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Renderizado desde plantilla del evento/rol o desde archivo pregenerado.
2. Tildes, eñes y caracteres especiales correctos.
3. El permalink incluye el mismo contenido en cada acceso.

---

### HU-1.5 — Certificado con respaldo institucional AC3

**Como** participante de un evento en la instancia AC3,  
**quiero** un certificado que muestre los datos legales de AC3 (razón social, NIT, representante),  
**para** contar con un documento de mayor peso formal.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Instancia | AC3 |

**Criterios de aceptación (negocio):**

1. Las plantillas AC3 incluyen capas `legal.*` en el editor visual (ver HU-3.1 y [08-datos-legales-ac3-plantilla.md](./08-datos-legales-ac3-plantilla.md)).
2. Los **valores** (NIT, razón social, etc.) vienen de **config de instancia** (HU-8.2), no se reescriben por evento ni por participante.
3. osm.lat no ofrece capas `legal.*`.

**Nota técnica:** no hay subsistema “legal” aparte; es render de capas de plantilla + config AC3.

---

## Épica 2 — Múltiples roles por participante

### HU-2.1 — Asignar varios roles a una persona en un evento

**Como** editor,  
**quiero** registrar que una persona fue asistente y voluntario (u otros roles combinados) en el mismo evento,  
**para** emitir un certificado por cada rol.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Un participante (identificado por documento o correo) puede tener N registros de rol en un evento.
2. Cada rol genera un certificado con permalink propio.
3. No se duplica el mismo rol dos veces para la misma persona en el mismo evento.
4. Carga CSV soporta múltiples filas para la misma persona con distinto rol.

---

### HU-2.2 — Plantilla distinta por rol (opcional)

**Como** editor,  
**quiero** asociar plantillas diferentes según el rol (ej. ponente vs asistente),  
**para** que el diseño del certificado corresponda al tipo de participación.

| Campo | Valor |
|-------|-------|
| Prioridad | Should |

**Criterios de aceptación:**

1. Plantilla **default** del evento: fila con `role_code` NULL; `events.default_template_id` apunta a ella.
2. Override opcional: como máximo **una** plantilla por `role_code` (`UNIQUE (event_id, role_code)`).
3. Al crear certificado `pending` (`generated`), se resuelve y **fija** `certificates.template_id` (override del rol si existe; si no, default). Cambiar plantillas después no mueve los `pending` ya creados.
4. Editor visual compartido para todas las plantillas.

---

## Épica 3 — Plantillas visuales

### HU-3.1 — Diseñar plantilla con editor visual

**Como** editor,  
**quiero** subir una imagen de fondo y arrastrar/posicionar campos de texto sobre ella,  
**para** definir el diseño sin editar JSON ni calcular coordenadas manualmente.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Interfaz WYSIWYG: fondo + capas de texto/QR alineables.
2. Campos disponibles en paleta — tokens canónicos ([04 §5](./04-flujos-funcionales.md)):
   - `full_name`, `document`, `role_label`, `activity_title`, `event_name`, `venue_name`, `event_date`, `certificate_slug`, `permalink_qr`.
   - **Instancia AC3 only:** `legal.entity_name`, `legal.nit`, `legal.representative`, `legal.signature` (ver [08](./08-datos-legales-ac3-plantilla.md)).
3. Vista previa con datos de ejemplo; en AC3 la preview de capas `legal.*` usa config real de instancia.
4. El sistema persiste posiciones en `layout` JSONB; validación contra el catálogo de tokens en `packages/shared`.
5. No se requiere que el usuario edite JSON crudo.

---

### HU-3.2 — Previsualizar certificado antes de publicar evento

**Como** editor,  
**quiero** generar una vista previa con un participante ficticio,  
**para** validar el diseño antes de abrir la consulta pública.

| Campo | Valor |
|-------|-------|
| Prioridad | Should |

**Criterios de aceptación:**

1. Botón "Vista previa" en el editor de plantilla.
2. Render idéntico al certificado real.

---

## Épica 4 — Certificados pregenerados

### HU-4.1 — Subir certificado ya generado como imagen

**Como** editor,  
**quiero** cargar un PNG/JPG/PDF existente para un participante y rol,  
**para** archivar eventos pasados sin recrear plantillas.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Modo de certificado: `generated` | `pregenerated` (valores en inglés en BD/API; UI en español: «generado» / «pregenerado»).
2. En modo `pregenerated`, se almacena el archivo subido y se expone permalink.
3. El permalink sirve el archivo almacenado (sin re-renderizar desde plantilla).
4. **Carga individual** (un archivo por certificado) para correcciones puntuales.
5. **Carga masiva:** hoja **CSV** (delimitador fijo `;`, UTF-8) + ZIP de archivos; validación de **todo el lote** antes de escribir; si hay error, no se importa nada (informe de fallos). Límite del lote **100 MB**. Imports **incrementales** al mismo evento; rechazar duplicados ya existentes (mismo email + rol) y emails conflictivos. **v1.0 no importa ODS nativo**.
6. **Plantilla descargable** desde el panel (CSV UTF-8 `;`): encabezados + filas de ejemplo; el editor la completa (`filename` debe coincidir con el ZIP) y la sube con los archivos. Sin helper de escritorio en v1.0.
7. La edición masiva de metadatos se hace en LibreOffice/Excel (export CSV); el panel solo ofrece la plantilla, valida e importa.

---

### HU-4.2 — Evento solo con certificados pregenerados

**Como** editor,  
**quiero** crear un evento configurado solo para archivos pregenerados, sin plantilla dinámica,  
**para** centralizar certificados ya diseñados como imágenes o PDF.

| Campo | Valor |
|-------|-------|
| Prioridad | Should |

**Criterios de aceptación:**

1. Flag en evento: `pregenerated_only`.
2. No exige plantilla visual; solo upload de archivos + metadatos mínimos.

---

## Épica 5 — Eventos, sedes e identificación

### HU-5.1 — Crear y configurar evento

**Como** editor,  
**quiero** crear un evento con nombre, fechas, país, roles permitidos y estado `draft` o `active`,  
**para** habilitar emisión de certificados.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Campos: nombre, año, fecha(s), país (para reglas de identificación), roles habilitados, estado (`draft` | `active`).
2. Eventos `draft` no aparecen en búsqueda pública. Eventos `active` sí, **incluso si la fecha del evento ya pasó**.
3. Permalinks `/c/{slug}` y `/b/{slug}` **sí resuelven** (y pueden emitir) aunque el evento esté o haya estado siempre en `draft` — útil para probar antes de publicar. Soft-delete / desactivar: misma política de permalinks vivos.
4. Un evento puede tener cero, una o muchas sedes.

---

### HU-5.2 — Sede única en registro admin (no en búsqueda pública)

**Como** editor de un evento con una sola sede,  
**quiero** que el sistema asigne esa sede automáticamente al cargar participantes,  
**para** no repetir un dato obvio en CSV y formularios admin.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Si el evento tiene **exactamente una sede**, los formularios admin y CSV la infieren (columna `venue_code` opcional).
2. La **búsqueda pública** (HU-1.2) no pregunta por sede; el dato de sede aparece solo en el resultado.
3. Si hay 0 sedes, el evento es global/virtual sin sede en datos.

---

### HU-5.3 — Identificación con tipo de documento (Colombia y otros)

**Como** editor,  
**quiero** registrar participantes con tipo y número de documento según el país,  
**para** soportar CC, CE, TI en Colombia y otros esquemas en LATAM.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Colombia: tipos `CC`, `CE`, `TI` + número.
2. Configuración por país define tipos válidos, etiquetas y `validation_regex` (**seed YAML** en el repo + redeploy; sin pantalla admin en v1.0 — ver [05](./05-personalizacion-multi-instancia.md)).
3. Búsqueda pública por documento solicita **país + tipo + número**; el número se normaliza antes de buscar ([03](./03-modelo-de-datos.md)).
4. Correo electrónico sigue siendo identificador alternativo válido.
5. Al alta/CSV: normalizar `doc_number` y validar regex **después** de normalizar.

---

### HU-5.4 — Gestionar sedes (cuando aplica)

**Como** editor,  
**quiero** definir sedes de un evento (ciudad, virtual, país),  
**para** eventos multi-sede o diferenciar modalidades en el texto del certificado.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Sede opcional según evento (0 / 1 / N).
2. Nombre descriptivo y código interno corto.
3. Fecha específica opcional por sede.
4. La sede es **metadato de contexto** (PDF, resultado de búsqueda); **no** forma parte de la identidad del certificado (UNIQUE = participante + rol).

---

## Épica 6 — Carga de participantes

### HU-6.1 — Alta individual con uno o más roles

**Como** editor,  
**quiero** registrar un participante y seleccionar uno o varios roles,  
**para** crear sus certificados en estado inicial **`pending`**.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Datos mínimos según instancia (ver tabla al inicio): osm.lat → nombre + email; AC3 → nombre + email + identificación. Email único por evento (rechazar duplicado).
2. Selección múltiple de roles.
3. Campo actividad/charla opcional (ponente, tallerista).
4. Por cada rol: se crea un `certificate` en estado **`pending`** con slug `/c/` reservado.
5. Badge `event_role` asociado en **`pending`** hasta que el certificado pase a **`issued`** (ver [07-estados-y-ciclo-de-vida.md](./07-estados-y-ciclo-de-vida.md)).
6. Opcional: enviar email con **solo el enlace** `/c/{slug}` (From dedicado de la instancia; ver manual de operación). **Implementación: Fase 3** (SMTP); en Fases 1–2 el editor copia/comparte el permalink manualmente.

**Estados y flujo:** ver documento [07 — Estados y ciclo de vida](./07-estados-y-ciclo-de-vida.md).

---

### HU-6.2 — Importación masiva CSV

**Como** editor,  
**quiero** importar participantes y roles desde CSV,  
**para** cargar listas de asistencia rápidamente.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. UTF-8; delimitador fijo **`;`** (sin configurar por archivo ni ENV).
2. Columnas mínimas según instancia: siempre `full_name`, `email`, `role`; AC3 además país + tipo + número de documento.
3. Múltiples filas con mismo email (y evento) y distinto rol → múltiples certificados (misma persona).
4. **Email duplicado** (mismo evento + mismo email + mismo rol, o email ya en BD con datos conflictivos) → **rechazar**. Cada persona tiene su propio email.
5. **Validación atómica del archivo:** validar **todas** las filas antes de escribir; si hay cualquier error → **no se importa ninguna** fila; devolver informe de fallos. Si el lote es válido completo → escribir todo. Imports **incrementales** posteriores al mismo evento (altas nuevas); rechazar filas que dupliquen certificado ya existente (mismo email + rol).
6. Botón **Descargar plantilla** (CSV con columnas de la instancia + filas de ejemplo); el editor la completa en Excel/LibreOffice y la reimporta como CSV.

---

## Épica 7 — Administración del sistema

### HU-7.1 — Autenticación admin vía OAuth OSM

**Como** administrador o editor,  
**quiero** iniciar sesión en el panel de mi instancia con mi cuenta OpenStreetMap,  
**para** gestionar solo los datos de esa instancia sin contraseñas locales.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Login exclusivo mediante OAuth de openstreetmap.org (sin usuario/contraseña locales).
2. **Scopes OAuth:** solo los mínimos para leer identidad (`osm_id`, `display_name`) — p. ej. `read_prefs`. **Sin** scopes de escritura en OSM; roles y datos del panel viven solo en esta BD.
3. Sesiones aisladas por instancia (cookie de sesión propia); un admin de osm.lat no accede a AC3.
4. Identidad canónica: `osm_id`. El `osm_username` se actualiza en cada login.
5. Sin cuenta OSM no es posible ser `admin` ni `editor`.
6. Cualquier usuario OSM puede completar OAuth; si no tiene rol (`role` NULL) o está inactivo, ve pantalla “sin acceso” y las APIs admin responden 403.
7. Bootstrap: usernames en `SEED_ADMIN_OSM_USERNAMES` (y/o ids en `SEED_ADMIN_OSM_IDS`) reciben `role=admin` en el primer OAuth que coincida. Match de username case-sensitive según `display_name` OSM en ese momento; después solo importa `osm_id`.

---

### HU-7.2 — Dashboard y auditoría

**Como** editor o admin,  
**quiero** ver métricas de uso; y como admin el log de acciones,  
**para** supervisar la instancia.

| Campo | Valor |
|-------|-------|
| Prioridad | Should |

**Criterios de aceptación:**

1. **Dashboard (editor y admin):** contadores — eventos activos, certificados emitidos, consultas a permalinks (ampliable en F2/F3).
2. **Audit log (solo admin):** quién, cuándo, qué acción, sobre qué entidad (incl. asignación de roles).

---

### HU-7.3 — Revocar certificado (y corrección de emitidos)

**Como** editor o admin,  
**quiero** revocar un certificado emitido por error y, si hace falta, emitir uno corregido,  
**para** que el permalink inválido deje de acreditarse y el titular reciba uno nuevo correcto.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Fase | 2 |

**Criterios de aceptación:**

1. **Endpoint:** `POST /api/v1/admin/certificates/{id}/revoke` con motivo opcional (`revoke_reason`). Estado `revoked` + `revoked_at`.
2. Permalink `/c/` muestra revocación (sin descarga del PDF válido). API verify: `{ valid: false, reason: "revoked" }`.
3. Si hay badge de evento vinculado, pasa a `revoked` en cascada.
4. **Revocación directa de badge:** `POST /api/v1/admin/badges/{id}/revoke` (motivo opcional). Para `event_role`, preferir revocar el certificado (cascada). Para `osm_activity`, este endpoint es el camino normal.
5. **Corrección de datos (decisión cerrada):** no hay PATCH de certificado `issued` ni regeneración del PDF. Procedimiento = **revocar + alta nueva** (nuevo slug). El UNIQUE `(participant_id, role_code)` es **parcial**: solo entre filas con `status <> 'revoked'`, para permitir la nueva emisión tras revocar.
6. **Mientras `pending` (también en Fase 1):** sí se puede corregir metadatos del participante/certificado o borrar el pending y volver a dar de alta; aún no hay revocación en F1.
7. RBAC: editor y admin (matriz).

---

### HU-7.4 — Gestión de usuarios del panel

**Como** admin,  
**quiero** listar quienes ya hicieron OAuth OSM y asignar o quitar roles (`admin`, `editor`),  
**para** controlar quién edita la instancia sin crear cuentas con contraseña.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Solo el rol `admin` accede a la gestión de usuarios.
2. Listado de `admin_users`: `osm_id`, `osm_username`, `role`, `is_active`, `last_login_at`.
3. Asignar/cambiar rol a `admin` o `editor`, o quitar rol (`NULL`).
4. Activar/desactivar usuario (`is_active`); desactivado ⇒ 403 en APIs admin aunque tenga rol.
5. No se crean usuarios “a mano” con password; el alta en BD ocurre al primer OAuth exitoso.
6. Un admin no puede desactivarse ni quitarse el rol a sí mismo si es el último `admin` activo (evitar lockout).

---

## Épica 8 — Personalización por instancia

### HU-8.1 — Branding por instancia

**Como** responsable de instancia,  
**quiero** configurar logo, colores y textos,  
**para** diferenciar osm.lat de AC3.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Configuración por variables de entorno o archivo por despliegue.
2. Sin valores de marca hardcodeados en el código (`SITE_NAME`, logo, colores, `SITE_FOOTER_TEXT`).
3. Crédito de **software** separado del branding de instancia (`SOFTWARE_*`): footer / búsqueda / pie de permalinks y página `/about` según [05 §10](./05-personalizacion-multi-instancia.md#10-atribución-del-software-multi-instancia).
4. El crédito enlaza al **repositorio** GitHub, no a la URL de otra instancia.
5. PDF e Issuer/Assertion Open Badges **no** incluyen atribución de software.

---

### HU-8.2 — Datos institucionales AC3 (config de instancia)

**Como** responsable AC3,  
**quiero** definir **una vez** razón social, NIT, representante legal y imagen de firma en la config de la instancia,  
**para** que todas las plantillas reutilicen los mismos valores al renderizar capas `legal.*`.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Instancia | AC3 |

**Criterios de aceptación:**

1. Pantalla **admin** de instancia persiste en tabla **`instance_legal`**: razón social, NIT, representante, imagen de firma (upload → `stored_files`). Sin depender de paths en archivo de propiedades para el día a día.
2. Valores también legibles al arranque desde ENV (`LEGAL_*`) como bootstrap opcional si la fila está vacía.
3. **Posición** en el PDF no se configura aquí; es en el editor visual (HU-3.1).
4. osm.lat: pantalla/`instance_legal` ausentes; capas `legal.*` no disponibles.
5. Página `/c/` usa `legal_snapshot` del certificado; Issuer Open Badges lee `instance_legal` vigente (nuevas emisiones).

Ver [08-datos-legales-ac3-plantilla.md](./08-datos-legales-ac3-plantilla.md) y [03 §7.2](./03-modelo-de-datos.md).

---

## Épica 9 — Open Badges de evento

### HU-9.1 — Badge automático al emitir certificado

**Como** participante de un evento,  
**quiero** que al obtener mi certificado también exista un Open Badge equivalente,  
**para** añadirlo a mi mochila digital además del PDF.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Al pasar un `certificate` a `issued`, se crea `badge_assertion` tipo `event_role`.
2. Permalink del badge: `/b/{slug}` distinto del certificado `/c/{slug}`.
3. La assertion incluye evidence con URL del certificado.
4. Revocar certificado revoca el badge vinculado.

---

### HU-9.2 — Página pública del badge

**Como** participante o verificador,  
**quiero** abrir `/b/{slug}` y ver el logro + JSON-LD + opción de exportar,  
**para** verificar o importar el badge.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. Muestra nombre del logro, emisor, fecha, estado (válido/revocado).
2. Enlace a endpoints OB estándar (`assertions/{uuid}.json`).
3. Botón "Añadir a backpack" (redirect Badgr/Passport u otro compatible).

---

### HU-9.3 — Issuer y BadgeClass por instancia

**Como** admin,  
**quiero** que la instancia exponga un Issuer OB y clases de badge por evento/rol,  
**para** cumplir el estándar Open Badges.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |

**Criterios de aceptación:**

1. `GET /badges/issuer.json` por instancia.
2. BadgeClass `event_role` se **crea/actualiza al guardar** `allowed_roles` del evento (también en `draft`), **una por cada rol** (`UNIQUE (event_id, role_code)`). Upsert idempotente.
3. **`code`:** se asigna al crear (p. ej. `{event_slug}-{role_code}` o derivado estable del `event_id` + rol). **Inmutable** si se renombra el evento; solo se actualiza `name` / descripción visibles.
4. Endpoints OB de clase (`GET /badges/classes/{id}.json`) **responden si la clase existe**, aunque el evento esté `draft` (misma idea que permalinks: quien tiene la URL verifica). No hay catálogo público que enumere clases de eventos `draft`.
5. Imagen del badge configurable por BadgeClass.

Ver [06-open-badges.md](./06-open-badges.md).

---

## Épica 10 — Badges de actividad OpenStreetMap

> Alcance **v1.0:** instancia **osm.lat**. Badges OSM en AC3: [evolución futura](./01-vision-y-alcance.md#11-evolución-futura-post-v10).

### HU-10.1 — Definir badge de actividad OSM

**Como** editor osm.lat,  
**quiero** crear un badge para un logro OSM (ej. 100 changesets),  
**para** reconocer actividad en la plataforma sin diploma PDF.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Instancia | osm.lat |

**Criterios de aceptación:**

1. BadgeClass tipo `osm_activity` con nombre, descripción, imagen, criterios narrativos.
2. Opcional: regla estructurada (`metric`, `operator`, `value`) para automatización (catálogo en [06-open-badges.md](./06-open-badges.md)).
3. Sin certificado PDF asociado; sin datos personales (solo identidad OSM).
4. AC3 **no** ofrece esta familia (solo eventos propios). HOT / Tasking Manager = otra instancia futura.

---

### HU-10.2 — Importar awardees desde lista externa

**Como** editor osm.lat,  
**quiero** subir un CSV de usuarios OSM que ya cumplieron un criterio,  
**para** emitir badges masivamente.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Instancia | osm.lat |

**Criterios de aceptación:**

1. CSV: **`osm_username` obligatorio**; `osm_id` opcional (+ opcional `earned_at`, `evidence_url`).
2. En el import: resolver `osm_username` → `osm_id` vía API OSM; persistir ambos en `osm_profiles`. Si la fila trae `osm_id` y no coincide con el resuelto → rechazar la fila (informe de error). Username inexistente → error de fila.
3. Idempotente: no duplicar assertion para mismo **osm_id** + BadgeClass.
4. Informe de filas emitidas / ya existentes / error.
5. Botón **Descargar plantilla** (CSV de ejemplo) en la pantalla de import.

---

### HU-10.3 — Sincronizar badges vía reglas OSM (job)

**Como** editor osm.lat,  
**quiero** ejecutar (o programar) una evaluación de reglas contra datos OSM,  
**para** otorgar badges automáticamente a mappers elegibles.

| Campo | Valor |
|-------|-------|
| Prioridad | Should |
| Instancia | osm.lat |
| Fase | 3 |

**Criterios de aceptación:**

1. Job en Fase 3; catálogo inicial de métricas/umbrales y fuente por métrica en [06-open-badges.md](./06-open-badges.md) (antigüedad, changesets, trazas, días mapeando, diarios, amigos, notas).
2. Emite assertion solo si no existía para ese `osm_id` + BadgeClass.
3. Guarda evidence (enlace perfil OSM + timestamp de verificación).
4. **Candidatos del job (decisión cerrada):** solo `osm_profiles` con **email vinculado** (`email` NOT NULL y `linked_at` NOT NULL) — mappers que se autenticaron / completaron HU-10.5. No descubre usuarios OSM desconocidos ni evalúa perfiles creados solo por import CSV sin vínculo. Sin perfiles vinculados, el job no emite nada (el import CSV HU-10.2 sigue siendo el camino masivo).

---

### HU-10.4 — Consultar badges OSM por usuario (público)

**Como** mapper o visitante,  
**quiero** buscar badges de actividad OSM por **osm_id** o username,  
**para** ver logros públicos derivados de datos ya públicos en OSM.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Instancia | osm.lat |

**Criterios de aceptación:**

1. Formulario público acepta **`osm_id`** (principal) u opcionalmente `osm_username` (resuelve a id vía API).
2. Lista badges `/b/{slug}` de actividad OSM de ese id (escaparte público).
3. **No** lista certificados ni badges de evento (privacidad distinta).
4. Mensaje genérico si no hay badges.

---

### HU-10.5 — Vincular usuario OSM con email de evento

**Como** participante/mapper,  
**quiero** asociar mi `osm_id` a mi email (código de un solo uso),  
**para** ver en un solo lugar certificados de eventos y badges OSM, y poder recibir badges automáticos del job (HU-10.3).

| Campo | Valor |
|-------|-------|
| Prioridad | **Must** |
| Instancia | osm.lat |
| Fase | 3 |

**Criterios de aceptación:**

1. **OAuth OSM público** (distinto del panel admin): mismo `OSM_OAUTH_CLIENT_ID`/`SECRET`, callback propio (`OSM_OAUTH_PUBLIC_REDIRECT_URI` → `/api/v1/public/auth/osm/callback`). Tras login se crea/actualiza `osm_profiles` y se abre sesión de mapper (cookie `cert_mapper_session` + tabla `mapper_sessions`). **No** otorga rol admin/editor.
2. El mapper indica un **email** (normalizado `trim`+`lower`) y recibe **código de un solo uso** por SMTP (TTL **20 min**, un solo uso). Al confirmarlo: `osm_profiles.email` + `linked_at`. Relación **1:1** (`email` UNIQUE cuando NOT NULL; un `osm_id` un email).
3. Códigos en tabla **`osm_email_link_codes`** (hash del código, no plaintext; `expires_at`; `consumed_at`). Rechazar si el email ya está vinculado a otro `osm_id`, o si el perfil ya tiene otro email vinculado (v1.0: sin “cambiar email”; soporte = ops/SQL).
4. **Vista unificada** (`/me`, autenticada): certificados `/c/` y badges de evento del **email vinculado** + badges `/b/` de actividad OSM del **`osm_id`**. Sin sesión mapper → login OAuth; sin vínculo → solo flujo de código (no listar por email tecleado).
5. Sin vínculo no se mezclan identidades (evita spoofing). La búsqueda pública por email/documento (**HU-1.2**) sigue existiendo aparte y **no** sustituye a `/me`.
6. Newsletter / marketing = canal aparte con alta explícita (fuera de este flujo).
7. **SMTP obligatorio** en osm.lat F3 para este flujo (no solo “opcional para enlace de certificado”).

---

### HU-10.6 — Identidad OSM: osm_id + username

**Como** sistema,  
**quiero** almacenar **`osm_id` inmutable** y **`osm_username` actualizable**,  
**para** que renombrados no reasignen badges a otra persona.

| Campo | Valor |
|-------|-------|
| Prioridad | Must |
| Instancia | osm.lat |

**Criterios de aceptación:**

1. `osm_id` es clave de identidad; UNIQUE NOT NULL en `osm_profiles`.
2. `osm_username` no es UNIQUE; se actualiza al sincronizar con API OSM.
3. Import CSV: **`osm_username` obligatorio**; `osm_id` opcional. Resolver username → `osm_id` en el momento del import y persistir ambos.
4. Si el CSV trae `osm_id` y no coincide con el resuelto desde username → error de fila.
5. Badges (`badge_assertions`) referencian **`osm_profile_id`**, nunca username suelto.
6. Tras renombrado OSM, el mismo `osm_id` conserva todos los badges; la UI muestra username actual.

---


## Matriz resumen

| ID | Historia | Prioridad |
|----|----------|-----------|
| HU-1.1 | Permalink | Must |
| HU-1.2 | Búsqueda por identidad | Must |
| HU-1.2b | Prohibir listado por evento | Must |
| HU-1.3 | Verificación | Must |
| HU-1.4 | Datos correctos | Must |
| HU-1.5 | Legal AC3 | Must |
| HU-2.1 | Múltiples roles | Must |
| HU-2.2 | Plantilla por rol | Should |
| HU-3.1 | Editor visual | Must |
| HU-3.2 | Preview plantilla | Should |
| HU-4.1 | Certificado pregenerado | Must |
| HU-4.2 | Evento pregenerated_only | Should |
| HU-5.1 | Crear evento | Must |
| HU-5.2 | Sede única (admin/CSV) | Must |
| HU-5.3 | Doc por país | Must |
| HU-5.4 | Sedes | Must |
| HU-6.1 | Alta individual | Must |
| HU-6.2 | CSV | Must |
| HU-7.1 | Login OAuth OSM | Must |
| HU-7.2 | Dashboard/logs | Should |
| HU-7.3 | Revocación | Must |
| HU-7.4 | Gestión usuarios panel | Must |
| HU-8.1 | Branding | Must |
| HU-8.2 | Legal AC3 | Must |
| HU-9.1 | Badge auto por certificado | Must |
| HU-9.2 | Página `/b/{slug}` | Must |
| HU-9.3 | Issuer + BadgeClass | Must |
| HU-10.1 | Badge actividad OSM | Must |
| HU-10.2 | Import awardees CSV | Must |
| HU-10.3 | Job reglas OSM | Should |
| HU-10.4 | Buscar badges por osm_id | Must |
| HU-10.5 | Vincular OSM + evento | Must |
| HU-10.6 | osm_id + username | Must |
