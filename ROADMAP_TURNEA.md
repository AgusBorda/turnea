# 🚀 Turnea — Roadmap técnico y producto

Este archivo sirve como tablero simple para seguir el estado del proyecto.

Estados:

* ✅ Completado
* 🚧 En progreso
* ⏳ Pendiente
* 💡 Futuro / por analizar

---

## 🛡️ Fase 0 — Seguridad y estabilidad

Antes de sumar funcionalidades importantes, queremos asegurar que Turnea pueda manejar clientes, turnos y pagos reales de forma segura.

### ✅ Ticket 1 — Cliente Supabase Admin seguro

* [x] Crear `src/lib/supabase/admin.ts`
* [x] Usar `SUPABASE_SERVICE_ROLE_KEY`
* [x] Proteger el módulo con `server-only`
* [x] No utilizar cookies ni sesión de usuario
* [x] Configurar Service Role de DEV en `.env.local`
* [x] Configurar Service Role de DEV en Vercel Preview
* [x] Verificar TypeScript
* [x] Verificar lint específico
* [x] Commit y push a `develop`
* [x] Deployment Preview generado correctamente

**Estado:** ✅ Completado

---

### ✅ Ticket 2 — Proteger credenciales de Mercado Pago

Objetivo: evitar que `mp_access_token` pueda quedar expuesto públicamente.

* [x] Crear tabla privada `barbershop_payment_credentials`
* [x] Agregar `mp_configured` a `barbershops`
* [x] Crear migration compatible
* [x] Migrar credenciales existentes
* [x] Adaptar Settings
* [x] Adaptar Checkout
* [x] Evitar enviar el token al navegador
* [x] Probar en Supabase DEV
* [x] Probar localhost
* [x] Probar Vercel Preview
* [x] Eliminar columnas antiguas cuando la transición esté validada

**Validaciones realizadas:**
* `mp_access_token` y `mp_user_id` eliminados de `barbershops`.
* Credenciales conservadas en `barbershop_payment_credentials`.
* `mp_configured` continúa activo en las barberías configuradas.
* Ningún flujo productivo depende de las columnas legacy.
* Dashboard dejó de sobreleer datos de `barbershops`.

**Estado:** ✅ Completado

---

### ✅ Ticket 3 — Flujo de pagos confiable

Objetivo: que Mercado Pago sea seguro y consistente incluso si el cliente cierra la página o manipula redirects.

* [x] Implementar webhook real de Mercado Pago
* [x] Usar webhook como fuente confiable del pago
* [x] Validar `external_reference`
* [x] Validar importe
* [x] Validar moneda
* [x] Validar barbería correspondiente
* [x] Verificar errores de Supabase
* [x] Evitar que `/success` confirme pagos por sí solo
* [x] Revisar flujo `/cancel`
* [x] Probar pagos correctamente en DEV

**Validaciones realizadas:**
* Checkout obtiene desde la base de datos el monto, la duración y la configuración necesaria, sin confiar en importes enviados por el navegador.
* Los turnos con seña se crean como `pending_payment`, con `expires_at`, y la preference de Mercado Pago usa la misma expiración.
* La `notification_url` solicita Webhooks mediante `source_news=webhooks` y funciona en Vercel Preview con Protection Bypass server-only.
* Las IPN legacy `merchant_order` se acknowledgean con HTTP 200 sin lecturas, escrituras ni confirmaciones.
* Los Webhooks `payment` mantienen validación HMAC obligatoria.
* El webhook consulta el payment oficial y valida `external_reference`, barbería, monto, moneda y preference mediante merchant order.
* La confirmación usa `confirm_paid_appointment_atomic()` y el procesamiento es idempotente.
* Success es de sólo lectura y refleja la confirmación mediante polling seguro.
* Los `pending_payment` vencidos se liberan y expiran; un pago tardío no confirma el turno y queda pendiente de conciliación en Ticket 8.
* El flujo TEST fue validado en DEV mediante el simulador oficial y un payment TEST real recién creado.

> Producción todavía no fue desplegada ni probada. Esa validación corresponde al proceso de salida a producción.

**Estado:** ✅ Completado

---

### ⏳ Ticket 4 — Privacidad de turnos

Objetivo: que el booking pueda conocer disponibilidad sin exponer datos de clientes.

- [x] Eliminar SELECT público directo de appointments
- [x] Crear RPC pública de busy slots
- [x] Crear RPC mínima para estado de pago
- [x] Crear RPC mínima para resultado de Success
- [x] Mantener Agenda/Dashboard protegidos por ownership
- [x] Centralizar semántica de ocupación
- [x] Validar Booking después de restringir SELECT
- [x] Validar Success y Cancel
- [x] Validar polling
- [x] Validar acceso anon con prueba real

**Validaciones realizadas:**
- `anon` no puede ejecutar `SELECT *` sobre `appointments`.
- `anon` no puede seleccionar campos sensibles.
- `get_public_busy_slots()` funciona con anon.
- La RPC pública devuelve únicamente `date`, `start_time` y `end_time`.
- Booking sigue funcionando.
- Success, Cancel y polling siguen funcionando.
- Agenda y Dashboard siguen funcionando para el owner autenticado.

**Estado:** ✅ Completado

---

### ✅ Ticket 4.1 — Privacidad de blocked_slots

Objetivo: impedir que usuarios públicos puedan leer metadata interna de bloqueos y exponer únicamente la información necesaria para disponibilidad.

- [x] Crear RPC pública mínima para blocked_slots
- [x] Reemplazar SELECT público directo en Booking
- [x] Retirar acceso directo de anon a blocked_slots
- [x] Ocultar reason, id y created_at
- [x] Mantener lógica de bloqueos parciales y de día completo
- [x] Validar RPC con anon
- [x] Validar Booking después de restringir acceso

**Validaciones realizadas:**
- `anon` no puede ejecutar `SELECT *` sobre `blocked_slots`.
- `anon` no puede consultar `reason`, `id` ni `created_at`.
- `get_public_blocked_slots()` funciona con anon.
- La RPC devuelve únicamente `date`, `start_time`, `end_time` y `all_day`.
- Booking respeta correctamente los blocked slots usando la RPC.

**Estado:** ✅ Completado

---

### ✅ Ticket 5 — Evitar dobles reservas

Objetivo: garantizar desde backend/base de datos que dos clientes no puedan reservar el mismo horario.

- [x] Corregir detección de solapamientos
- [x] Validar disponibilidad en backend
- [x] Evitar condiciones de carrera
- [x] Implementar mecanismo atómico en PostgreSQL
- [x] Validar creación manual desde agenda
- [x] Validar creación desde booking
- [x] Crear y ejecutar pruebas de concurrencia

**Validaciones realizadas:**
- 10 reservas simultáneas sobre el mismo horario.
- Resultado: 1 reserva creada y 9 rechazadas con `SLOT_CONFLICT`.
- Confirmado en base de datos que sólo existe 1 appointment bloqueante activo.
- Los `pending_payment` vencidos no bloquean horarios.
- Los `confirmed` sí bloquean siempre.
- Booking, Checkout y Agenda utilizan `create_appointment_atomic()`.
- El webhook confirma pagos mediante `confirm_paid_appointment_atomic()` bajo el mismo lock por barbero.

**Estado:** ✅ Completado

---

### ✅ Ticket 6 — Reservas pendientes de pago

* [x] Definir expiración de `pending_payment`
  * Las reservas pendientes vencen a los 15 minutos mediante `expires_at`.

* [x] Liberar horarios cuando vence una reserva
  * Los `pending_payment` vencidos dejan de bloquear disponibilidad automáticamente.
  * La liberación no depende del cron.

* [x] Evitar bloqueos eternos por pagos abandonados
  * Se implementó `cleanup_expired_pending_payments()`.
  * Los pagos pendientes vencidos pasan automáticamente a:
    * `status = 'cancelled'`
    * `cancelled_by = 'payment_expired'`
    * `cancelled_at = clock_timestamp()`
  * `deposit_status` permanece en `pending` para conservar trazabilidad.
  * Cleanup automático mediante Supabase `pg_cron` cada 5 minutos.

* [x] Definir comportamiento cuando Mercado Pago falla
  * Si el pago no se completa antes de `expires_at`, el turno vence y se libera.
  * El webhook no puede confirmar un appointment vencido.
  * Un pago confirmado correctamente antes del vencimiento pasa a `confirmed / paid` y nunca es afectado por el cleanup.

* [x] Revisar cancelaciones
  * Las reservas vencidas se registran como `cancelled`.
  * Se diferencia una expiración automática mediante `cancelled_by = 'payment_expired'`.
  * Agenda y Dashboard mantienen un comportamiento coherente con turnos cancelados.

**Validaciones realizadas:**
* Cleanup manual de un `pending_payment` vencido → 1 fila cancelada.
* Segunda ejecución → 0 filas, confirmando idempotencia.
* `pending_payment` vigente no es afectado.
* `confirmed / paid` no puede ser cancelado por el cleanup.
* `pg_cron` instalado en Supabase DEV (`1.6.4`).
* Job `turnea-cleanup-expired-pending-payments` activo cada 5 minutos.
* Ejecución automática real validada correctamente mediante `cron.job_run_details`.

**Estado:** ✅ Completado

> Pendiente separado: definir conciliación/reembolso para el caso excepcional en que Mercado Pago acredite un pago después del vencimiento del turno.
---

### ✅ Ticket 7 — Fechas y timezone

Objetivo: interpretar fechas y horarios civiles según el timezone IANA configurado por cada barbería, sin depender del navegador ni del timezone del servidor.

* [x] Persistir y validar timezone IANA por barbería
* [x] Configurar timezone desde Settings
* [x] Usar timezone de barbería en Booking
* [x] Usar timezone de barbería en Agenda
* [x] Usar timezone de barbería en Dashboard
* [x] Validar horarios pasados en Checkout y PostgreSQL
* [x] Formatear fechas civiles de Success sin desplazamientos
* [x] Actualizar Booking y Agenda al avanzar el reloj o cambiar el día
* [x] Rechazar horas inexistentes por DST
* [x] Rechazar horas ambiguas/repetidas por DST
* [x] Rechazar intervalos cuya duración absoluta cambie por una transición DST
* [x] Probar fechas pasadas, futuras, rollover, timezone distinto y DST
* [x] Validar helper DST y create_appointment_atomic() en Supabase DEV

**Política temporal:**
* appointment.date, start_time y end_time son valores civiles de la barbería.
* created_at, updated_at, expires_at, cancelled_at y timestamps de Mercado Pago son instantes absolutos.
* Horas DST inexistentes o ambiguas se rechazan; el usuario debe elegir otro horario.
* Los turnos que cruzan medianoche no están soportados actualmente.

**Timezones ofrecidos en Settings:**
* America/Argentina/Buenos_Aires
* America/Montevideo
* America/Santiago
* America/Sao_Paulo
* Europe/Madrid
* America/Mexico_City

La base de datos acepta cualquier identificador IANA válido, aunque Settings ofrece estos valores como presets.

**Validaciones realizadas:**
* Turno pasado rechazado desde Checkout y desde la RPC.
* Turnos futuros de hoy y mañana aceptados.
* Success mostró establemente jueves 13 de agosto para 2026-08-13.
* Rollover y reloj vivo validados en Booking y Agenda.
* DST_NONEXISTENT_TIME, DST_AMBIGUOUS_TIME y DST_TRANSITION_INTERVAL validados en DEV.
* create_appointment_atomic() propagó correctamente los tres errores DST.
* Build completado correctamente.

**Estado:** ✅ Completado

---

### 🚧 Ticket 8 — Pagos tardíos y conciliación Mercado Pago

#### ✅ Etapa 8A — Schema y registro atómico

* [x] Crear `payment_reconciliations`
* [x] Proteger la tabla mediante RLS owner-only
* [x] Registrar conciliaciones desde una RPC exclusiva de `service_role`
* [x] Garantizar idempotencia mediante `mp_payment_id`
* [x] Rechazar conflictos de integridad sin sobrescribir datos financieros

**Validaciones DEV:**
* `anon` no puede leer conciliaciones.
* El owner sólo puede leer conciliaciones de sus barberías.
* `authenticated` no puede insertar ni modificar filas directamente.
* Retries con el mismo `mp_payment_id` no duplican registros.
* Datos financieros o asociaciones inconsistentes producen un error de integridad.

#### ✅ Etapa 8B — Detección desde webhook

* [x] Clasificar atómicamente confirmaciones de pagos
* [x] Registrar pagos de appointments vencidos
* [x] Registrar conflictos con un horario ya ocupado
* [x] Mantener idempotencia ante retries del webhook
* [x] Evitar confirmar appointments cuando corresponde conciliación

**Validaciones DEV:**
* `appointment_expired` validado end-to-end.
* `slot_conflict → confirmation_conflict` validado end-to-end.
* Retries del mismo payment mantuvieron una única conciliación.
* Los appointments vencidos o con conflicto no se confirmaron incorrectamente.

#### ✅ Etapa 8C — Dashboard y resolución manual retaining

* [x] Crear listado owner-only de conciliaciones
* [x] Mostrar badge de conciliaciones pendientes
* [x] Crear vista de detalle
* [x] Permitir `pending_review → resolved_retained`
* [x] Exigir nota y registrar `resolved_by`/`resolved_at`
* [x] Mantener el appointment original intacto
* [x] Hacer idempotente un segundo intento de resolución

**Validaciones DEV:**
* Listado, filtros, badge y detalle validados con un owner real.
* Ownership validado tanto en lectura como en la RPC autenticada.
* La resolución guardó nota, owner y timestamp correctos.
* El appointment asociado no cambió.
* Un segundo intento no sobrescribió los datos de resolución.

#### 🚧 Etapa 8D — Reembolso manual

**Estado:** Implementada parcialmente / bloqueada en validación E2E.

**Implementado:**
* Refund total manual owner-only.
* Idempotency key persistida antes de la solicitud HTTP.
* Retry seguro con la misma idempotency key.
* Verificación oficial de payment, merchant order y refunds antes del POST.
* Detección y conciliación local de un refund existente.
* Flujos de complete, fail y `verification_required`.
* UI de solicitud, retry y verificación.
* Límites de ownership y service role.
* El appointment asociado permanece intacto.

**Validado en DEV:**
* Schema y RPCs de reembolso.
* Ownership y acceso owner-only.
* Persistencia y reutilización de la idempotency key.
* Protección frente a doble claim.
* Complete idempotente y detección de conflictos de integridad.
* Fallos seguros, retry y `verification_required`.
* Los retries no duplican la intención de reembolso.
* UI de solicitud y verificación de reembolso.

**Bloqueo E2E externo/configuración:**
* Un único `POST /v1/payments/{payment_id}/refunds` controlado devolvió HTTP 401, código 7: `Unauthorized use of live credentials`.
* La referencia oficial de Mercado Pago clasifica esa respuesta como credencial sin el scope `payment` requerido.
* El endpoint, método, formato Bearer, `X-Idempotency-Key` estable y body vacío de Turnea coinciden con la API oficial de refund total.
* Con la misma credencial funcionan GET identity, payment, merchant order y refunds.
* El owner del Access Token coincide con el collector del payment.
* El payment está `approved`/`accredited`, dentro de los 180 días, y coinciden appointment, preference, monto y moneda.
* No existe un refund aprobado ni parcial previo.
* El rechazo ocurre antes de crear el refund; la conciliación conserva estado, appointment e idempotency key.
* Ningún refund TEST llegó aún a `status = refunded` mediante la API de Turnea.

##### ✅ 8D.1 — Refund API blocked externally; workaround MVP documentado

* [x] Auditar el flujo owner → credencial privada → validaciones oficiales → refund → conciliación.
* [x] Reproducir una sola vez el 401 con precondiciones verificadas y respuesta sanitizada.
* [x] Confirmar endpoint, headers, body e idempotencia contra documentación oficial.
* [x] Confirmar identidad token/collector y elegibilidad del payment.
* [x] Confirmar que no hubo refund ni mutación local ante el rechazo.
* [x] Definir workaround MVP: el owner reembolsa desde Mercado Pago y luego usa `Verificar estado` en Turnea.
* [x] Mantener la conciliación abierta hasta que GET refunds confirme oficialmente el refund total.
* [x] Mantener el appointment asociado intacto.

Para habilitar el POST desde Turnea debe revisarse la credencial/aplicación con Mercado Pago usando el request ID del intento controlado. No se hará retry automático ni se considerará el refund confirmado sin verificación oficial.

#### ⏳ Etapas pendientes

* [ ] Evaluar reembolso automático opcional
* [ ] Definir qué ve el cliente si pagó pero su reserva ya había vencido

> Producción todavía no fue desplegada ni probada. Estas validaciones corresponden exclusivamente a Supabase DEV y Vercel Preview/develop.

**Estado:** 🚧 En progreso

---

### 🚧 Ticket 9 — Disponibilidad especial y vacaciones

Objetivo: permitir ausencias, bloqueos horarios y vacaciones por barbero sin romper reservas existentes ni depender únicamente de validaciones del navegador.

#### ✅ Etapa 9A — Auditoría y modelo

* [x] Auditar `blocked_slots`, `barber_schedules`, Booking y Agenda
* [x] Mantener una fila de `blocked_slots` por barbero y fecha
* [x] Definir vacaciones como expansión transaccional del rango
* [x] Mantener fechas y horas como valores civiles de la barbería
* [x] Definir política de conflicto con appointments existentes
* [x] Diferir schedule overrides y bloqueos a nivel barbería

#### ✅ Etapa 9B — Integridad y API owner

* [x] Endurecer la estructura de `blocked_slots`
* [x] Crear RPC owner-only para bloqueo individual
* [x] Crear RPC owner-only para vacaciones
* [x] Crear RPC owner-only para eliminación
* [x] Verificar ownership dentro de PostgreSQL
* [x] Retirar escrituras directas de `authenticated`
* [x] Mantener lectura pública mínima sin exponer `reason`
* [x] Rechazar bloqueos sobre appointments bloqueantes
* [x] Serializar reservas y bloqueos mediante el mismo row lock de `barbers`
* [x] Corregir solapamientos visuales usando el intervalo completo del servicio
* [x] Reducir la lectura pública de `barber_schedules` a columnas mínimas

**Política implementada:**
* Un bloqueo puede ser de día completo o una franja civil sin cruce de medianoche.
* Las fechas pasadas se evalúan según el timezone IANA de la barbería.
* No se cancelan ni modifican appointments automáticamente.
* `confirmed`, `pending` y `pending_payment` vigente impiden crear un bloqueo solapado.
* `pending_payment` vencido y estados no bloqueantes no impiden el bloqueo.
* Las vacaciones se insertan completamente o no se inserta ningún día.

**Validaciones DEV:**
* Creación y eliminación owner del happy path.
* Solapamiento parcial rechazado.
* Conflicto entre bloqueo de día completo y franja rechazado.
* Vacaciones de cinco días creadas atómicamente.
* Conflicto intermedio en vacaciones produjo cero inserts.
* Bloqueo contra appointment `confirmed` rechazado.
* `pending_payment` vigente bloqueó correctamente.
* `pending_payment` vencido no bloqueó.
* Ownership cruzado y acceso `anon` rechazados.
* Carrera real appointment versus blocked slot serializada correctamente.
* La sesión concurrente esperó sobre `transactionid` y continuó después de aproximadamente 15 segundos.
* Confirmado que `create_appointment_atomic()` y `create_barber_blocked_slot()` bloquean la misma fila de `public.barbers`.

#### 🚧 Etapa 9C — Gestión por barbero

* [x] Integrar “Ausencias y bloqueos” en la configuración de horarios del barbero
* [x] Listar próximos bloqueos con fecha, franja, tipo y motivo interno
* [x] Crear bloqueos de día completo mediante RPC owner-only
* [x] Crear bloqueos horarios parciales mediante RPC owner-only
* [x] Crear vacaciones por rango mediante RPC owner-only
* [x] Eliminar bloqueos con confirmación mediante RPC owner-only
* [x] Traducir errores cerrados de PostgreSQL a mensajes amigables
* [x] Calcular fechas futuras según el timezone IANA de la barbería
* [x] Mantener lectura owner server-side sin usar `service_role`
* [ ] Validar el flujo completo en localhost y Vercel Preview contra Supabase DEV
* [ ] Validar experiencia mobile real

**Estado:** implementado localmente; pendiente de validación UI en DEV/Preview.

#### ✅ Etapa 9D — Agenda y disponibilidad especial

* [x] 9D.1 — Auditoría funcional y diseño
* [x] 9D.2 — Datos base y filtro por barbero
* [x] 9D.3 — Representación de bloqueos parciales
* [x] 9D.4 — Representación de días completos y vacaciones
* [x] 9D.5 — Responsive y polish general
* [x] 9D.6 — Validación y cierre técnico

**Resultado:**
* Agenda carga appointments y blocked slots en paralelo para todo el rango visible.
* Los horarios semanales se cargan una sola vez server-side con columnas mínimas.
* El filtro por barbero funciona client-side y no provoca nuevas consultas.
* Los bloqueos parciales respetan su geometría civil y los días completos se muestran como estados read-only.
* Las vistas Día, Semana y Mes identifican al barbero cuando se usa el filtro “Todos”.
* Pending payments vigentes y vencidos mantienen una representación diferenciada sin cambiar reglas backend.
* Header, navegación, filtros y calendarios fueron adaptados para mobile, tablet y desktop.
* Estados vacíos, error y retry quedaron integrados al lenguaje visual actual.
* El modal “Nuevo turno” fue modernizado con DatePicker, TimePicker y Select de Turnea, feedback inline, toast de éxito y shell responsive centrado.
* TypeScript, ESLint específico, `git diff --check` y build fueron validados.

**Deuda fuera del alcance de 9D:**
* Evaluar sombreado de disponibilidad basado en `barber_schedules`.
* Evaluar un rango temporal dinámico en lugar del intervalo visual fijo 08:00–22:00.

**Estado:** ✅ Completado

#### ✅ Vista Semana rediseñada

* [x] S1 — Auditoría UX/UI y definición de Week Strip + Day Focus
* [x] S2 — Estructura, selección civil y navegación implementadas localmente
* [x] S3 — Lenguaje visual y densidad aprobados visualmente
* [x] S4 — Responsive y accesibilidad fina
* [x] S5 — Validación funcional y cierre

**Resultado:**
* Week Strip de siete días + Day Focus, sin scroll horizontal obligatorio.
* Diseño responsive con estados `selected` y `today`, conteos e indicadores de disponibilidad alineados.
* Filas compactas de appointments, bloqueos parciales y ausencias de día completo.
* Modo Todos con identificación de barbero en contenido agregado.
* Densidad controlada: hasta ocho elementos y CTA para abrir el día completo cuando hay más.
* Navegación por semana, accesibilidad por teclado y fechas civiles según timezone de la barbería validadas.

**Estado:** ✅ S1–S5 completadas

#### ✅ Modernización de Servicios

* [x] Servicios S1 — Auditoría UX/UI y propuesta
* [x] Servicios S2 — Base visual y listado moderno validados
* [x] Servicios S3 — Formulario Nuevo/Editar validado visual y funcionalmente
* [x] Servicios S4 — Lifecycle Desactivar/Reactivar aprobado visual y funcionalmente
* [x] Servicios S5 — Responsive y accesibilidad final validados
* [x] Servicios S6 — Validación funcional y cierre técnico

**Resultado:**
* Listado moderno separado entre servicios activos e inactivos, con estados vacíos cuidados.
* Formulario accesible y responsive para crear y editar servicios activos o inactivos.
* Lifecycle owner mediante desactivación y reactivación, sin eliminar servicios ni modificar turnos históricos.
* Feedback mediante validaciones inline, estados de carga y toasts de éxito o error.
* Menús y dialogs operables con teclado, foco visible y adaptación a viewports pequeños.
* Foundation compartida con cursor de texto y caret visible en inputs claros.

**Estado:** ✅ S1–S6 completadas

#### ✅ Seguridad e integridad de Servicios

* [x] Services Security S1 — Auditar schema, grants, policies, consumidores e historial.
* [x] Services Security S2 — Crear RPCs mínimas para Booking y Checkout.
* [x] Services Security S3 — Crear `create_service()` con ownership, lock por barbería y `MAX(sort_order) + 1`.
* [x] Services Security S4 — Revocar `DELETE`, `TRUNCATE`, `REFERENCES` y `TRIGGER` a roles cliente.
* [x] Services Security S5 — Reemplazar la policy owner `FOR ALL` por policies explícitas de `SELECT`, `INSERT` temporal y `UPDATE`.
* [x] Services Security S6 — Limitar `UPDATE` owner a `name`, `description`, `duration`, `price` y `active`.
* [x] Services Security S7 — Validar constraints, concurrencia, ownership, lifecycle e historial en Supabase DEV.
* [x] Validar Servicios, Booking, Agenda y Checkout en Vercel Preview.
* [x] Aplicar en DEV la migration restrictiva que retira `SELECT` anon e `INSERT` owner directos.
* [x] Revalidar permisos finales, RPCs y regresión funcional post-restricción.

**Resultado:**
* El `DELETE` físico fue eliminado y el lifecycle continúa siendo desactivar/reactivar sin borrar servicios.
* La creación owner usa exclusivamente `create_service()` y serializa altas concurrentes mediante el lock de la barbería.
* `sort_order` se calcula de forma segura considerando servicios activos e inactivos; dos altas simultáneas recibieron valores diferentes.
* Las RPCs públicas mínimas exponen sólo servicios activos y las columnas necesarias para Booking y Checkout.
* El `INSERT` directo autenticado fue retirado.
* Owner conserva `SELECT` por ownership y `UPDATE` limitado a `name`, `description`, `duration`, `price` y `active`.
* Edición, desactivación y reactivación preservan la identidad y `appointments.service_id` históricos.
* Booking, Checkout, permisos finales y aislamiento cross-owner fueron validados después de aplicar la restricción en DEV.
* La regresión funcional fue aprobada en Vercel Preview.
* Supabase PROD permanece intacto.

**Estado:** ✅ Completado

**Estado general de Servicios:** ✅ MVP COMPLETE

#### 🚧 Modernización de Barberos

* [x] Barberos B1 — Auditoría UX/UI y propuesta
* [x] Barberos B2A — Privacidad pública
  * Booking usa `get_public_barbers()` y recibe únicamente datos públicos mínimos de barberos activos.
  * Checkout valida pertenencia y estado mediante `is_public_barber_active()`.
  * `anon` ya no puede ejecutar `SELECT` directo sobre `public.barbers`.
  * La gestión owner autenticada continúa operativa en Dashboard y Disponibilidad.
  * Booking y Checkout fueron validados en Vercel Preview contra Supabase DEV.
  * Other-owner permanece protegido por `owner_id = auth.uid()`; no se creó un fixture E2E artificial.
  * Supabase PROD permanece intacto.
* [x] Barberos B2B — Creación atómica de barbero y horarios default
  * Barbero y seis schedules default se crean dentro de una única transacción PostgreSQL.
  * El lock por barbería serializa altas concurrentes y protege el cálculo de `sort_order` incluyendo activos e inactivos.
  * La atomicidad y el rollback completo ante un fallo de schedules fueron validados en Supabase DEV.
  * El `INSERT` directo autenticado sobre `public.barbers` fue revocado; el alta owner usa exclusivamente `create_barber_with_default_schedule()`.
  * La RPC continuó funcionando después de la restricción y creó lunes–sábado de 09:00 a 20:00.
  * Alta, Disponibilidad, Booking y Agenda fueron validados en Vercel Preview.
  * Supabase PROD permanece intacto.
* [x] Barberos B3 — Modernización visual
  * Listado compacto separado entre barberos activos e inactivos, con estados vacíos cuidados.
  * Acceso visible a Disponibilidad para barberos activos e inactivos.
  * Menú de acciones accesible y modales modernos para crear, editar y confirmar la desactivación.
  * Lifecycle de desactivar/reactivar con feedback claro y sin eliminar historial.
  * Experiencia responsive, navegación por teclado, foco y Escape validados.
  * Revisión visual y funcional aprobada para alta, edición, lifecycle y disponibilidad.
* [x] Barberos B4 — Seguridad de permisos
  * `DELETE` físico revocado y cascadas de appointments, schedules y blocked slots protegidas frente a borrados owner.
  * `INSERT` directo continúa revocado; el alta usa exclusivamente `create_barber_with_default_schedule()`.
  * Owner conserva únicamente `SELECT` por ownership y `UPDATE(name, bio, active)`.
  * Policies owner separadas y explícitas para `SELECT` y `UPDATE`; no existen policies de `INSERT` ni `DELETE`.
  * `service_role` permanece intacto.
  * RPC de creación, permisos técnicos y aislamiento cross-owner validados en Supabase DEV.
  * Regresión de listado, alta, edición, lifecycle, Disponibilidad y Booking aprobada en Vercel Preview.
  * Supabase PROD permanece intacto.
* [x] Barberos B5 — Continuidad al desactivar
  * Agenda distingue `activeBarbers` para nuevas acciones y `agendaBarbers` para representar datos existentes.
  * Appointments, bloqueos e identidad de barberos inactivos siguen visibles y filtrables en Día, Semana y Mes.
  * El modal Nuevo turno continúa ofreciendo exclusivamente barberos activos.
  * Blocked slots y vacaciones pueden configurarse mientras el barbero está inactivo, sin relajar ownership ni conflictos.
  * La reactivación conserva schedules, appointments, blocked slots, configuración e historial.
  * Booking continúa siendo active-only antes y después de la reactivación.
  * Regresión funcional aprobada en Vercel Preview; Supabase PROD permanece intacto.
* [x] Barberos B6 — Horarios semanales atómicos
  * La RPC owner `replace_barber_weekly_schedule()` valida server-side los siete días y reemplaza la semana completa dentro de una única transacción.
  * Rollback completo y concurrencia serializada mediante el lock del barbero validados en Supabase DEV.
  * `UNIQUE (barber_id, day_of_week)` impide días duplicados y las escrituras directas autenticadas sobre schedules fueron retiradas.
  * Barberos inactivos continúan soportados sin relajar ownership ni permisos.
  * Persistencia, días no laborables, Agenda, Booking y feedback de guardado validados en Vercel Preview.
  * Supabase PROD permanece intacto.

**Estado:** ✅ B1–B6 completadas

#### ✅ Etapa 9F — Visual polish de Disponibilidad

* [x] 9F.1 — Foundations visuales reutilizables
* [x] 9F.2 — Nueva estructura de la pantalla de horarios
* [x] 9F.3 — Polish visual de cards, formularios e inputs
* [x] 9F.4A — Editor semanal y TimePicker
* [x] 9F.4B — DatePicker civil propio
* [x] 9F.4C — TimePicker en ausencias y bloqueos
* [x] 9F.5 — Lista compacta de próximos bloqueos y micro-polish final

**Resultado:**
* La pantalla de Disponibilidad pasa a ser la referencia visual inicial del “nuevo Turnea”.
* El editor semanal usa selector de días, panel único y controles de hora propios sin cambiar el contrato de persistencia.
* Ausencias, bloqueos y vacaciones usan fechas/horas civiles y feedback visual consistente.
* Los próximos bloqueos usan una lista compacta, acciones discretas y agrupación puramente presentacional de vacaciones consecutivas.
* La eliminación continúa siendo individual y conserva la confirmación destructiva existente.
* La experiencia fue revisada visualmente en mobile y desktop.

**Deuda técnica fuera del alcance de 9F:**
* Hacer atómico el guardado semanal, que actualmente conserva el flujo `delete + insert` existente.
* Migrar la convención de Next.js de `middleware` a `proxy`.
* Resolver por separado las vulnerabilidades informadas por `npm audit` y la actualización de Next.js.
* Extender gradualmente este lenguaje visual a Agenda, Servicios, Barberos, Configuración y Conciliaciones.

**Estado:** ✅ Completado

#### ⏳ Etapas pendientes

* [ ] 9E — Validación UX/mobile

> Producción todavía no fue desplegada ni probada. Las validaciones de 9B corresponden exclusivamente a Supabase DEV.

**Estado:** 🚧 En progreso

---

## 🧹 Deuda técnica

### ⏳ Tipado Supabase

* [ ] Generar tipos desde Supabase
* [ ] Reducir uso de `any`
* [ ] Sincronizar tipos TypeScript con PostgreSQL
* [ ] Agregar `pending_payment` a los estados TypeScript

### ⏳ Lint

* [ ] Revisar errores preexistentes
* [ ] Llevar `npm run lint` a cero errores

### ⏳ Tests

* [ ] Tests de disponibilidad
* [ ] Tests de overlaps
* [ ] Tests de booking
* [ ] Tests de RLS
* [ ] Tests de Mercado Pago
* [ ] Tests de doble reserva

### ⏳ Documentación

* [ ] Reemplazar README genérico de Next.js
* [ ] Documentar arquitectura
* [ ] Documentar instalación local
* [ ] Documentar DEV / Preview / PROD

---

## 💡 Producto — Próximas funcionalidades

Estas tareas se definirán después de completar las prioridades críticas de seguridad.

* [ ] Bloqueo de días / vacaciones de barberos
* [ ] Mejor gestión de horarios especiales
* [ ] Gestión de clientes
* [ ] Historial de clientes
* [ ] Métricas mejoradas
* [ ] Recordatorios de turnos
* [ ] Mejoras de cancelación/reprogramación
* [ ] Revisar experiencia completa mobile
* [ ] Definir futuras funcionalidades junto al roadmap comercial

---

## 🏗️ Infraestructura actual

```text
LOCAL
develop
→ localhost
→ Supabase DEV

PREVIEW
develop
→ GitHub
→ Vercel Preview
→ Supabase DEV

PRODUCTION
master
→ GitHub
→ Vercel Production
→ Supabase PROD
```

---

### ✅ Core Security — Barbershops y clientes legacy

#### ✅ Core Security S1 — Barbershops

* [x] Auditar grants, policies, consumidores y cascadas efectivas.
* [x] Crear contratos RPC públicos mínimos para lectura por slug y configuración de Checkout.
* [x] Reemplazar la policy owner `FOR ALL` por policies explícitas de `SELECT`, `INSERT` y `UPDATE`.
* [x] Limitar `INSERT` y `UPDATE` owner a las columnas usadas por onboarding y Settings.
* [x] Revocar `DELETE`, `TRUNCATE`, `REFERENCES` y `TRIGGER` a roles cliente.
* [x] Migrar localmente Booking, Checkout, Success, Cancel y polling a las RPC públicas.
* [x] Validar migration aditiva y permisos en Supabase DEV.
* [x] Validar regresión en Vercel Preview.
* [x] Aplicar en DEV la migration restrictiva que retira el `SELECT` público directo.
* [x] Revalidar RPCs públicas, Dashboard, Settings, onboarding, Booking y Checkout.

#### ✅ Core Security S2 — Legacy clients

* [x] Confirmar ausencia de consumidores productivos de `clients` y `client_barbershop`.
* [x] Retirar policies públicas y owner legacy.
* [x] Revocar todo acceso directo de `PUBLIC`, `anon` y `authenticated`.
* [x] Mantener las tablas dormidas y disponibles únicamente para uso técnico de `service_role`.
* [x] Validar permisos efectivos y ausencia de regresiones en Supabase DEV.

**Resultado:**
* El `DELETE` físico owner fue revocado y la policy general `FOR ALL` fue eliminada.
* Owner conserva policies explícitas de `SELECT`, `INSERT` y `UPDATE`, con escrituras limitadas a las columnas configurables.
* Onboarding y Settings continúan operativos bajo el contrato owner de mínimo privilegio.
* La superficie pública de barberías usa RPCs mínimas por slug y para configuración de Checkout; `anon` ya no puede ejecutar `SELECT` directo sobre `barbershops`.
* Booking, Checkout, Success, Cancel y payment-status fueron validados después de la restricción.
* El aislamiento cross-owner fue validado: un owner no puede leer la barbería ajena.
* `clients` y `client_barbershop` permanecen dormidas, sin writes para `PUBLIC`, `anon` ni `authenticated`.
* Pruebas técnicas en Supabase DEV y regresión funcional en Vercel Preview aprobadas.
* Supabase PROD permanece intacto.

**Estado:** ✅ S1/S2 completadas

---

### ✅ Agenda / Appointments A1 — State machine hardening

**Objetivo:** separar transiciones manuales owner de confirmaciones financieras y expiraciones del sistema.

* [x] Auditar estados, consumidores, timestamps y permisos actuales.
* [x] Definir una matriz explícita de transiciones owner.
* [x] Mantener `pending_payment → confirmed` exclusivamente en la confirmación atómica de pagos.
* [x] Mantener la expiración de pagos pendientes exclusivamente en cleanup.
* [x] Serializar cambios owner con lock sobre el appointment.
* [x] Preservar datos financieros al cancelar un turno pagado.
* [x] Alinear acciones visibles de Agenda con la matriz owner.
* [x] Retirar privilegios directos residuales y conservar sólo `SELECT` owner para `authenticated`.
* [x] Aplicar y validar la migration en Supabase DEV.
* [x] Probar transiciones permitidas, prohibidas, ownership y concurrencia en DEV.
* [x] Validar regresión de Agenda, Booking y pagos en Preview.

**Matriz owner implementada localmente:**
* `confirmed → completed | no_show | cancelled`.
* `pending → completed | no_show | cancelled` para compatibilidad con registros legacy.
* `pending_payment → cancelled`; nunca `confirmed`, `completed` ni `no_show` por owner.
* `completed`, `no_show` y `cancelled` son terminales; repetir el mismo estado es un no-op idempotente.

**Timestamps:** `cancelled` completa `cancelled_at` y `cancelled_by = owner`; `updated_at` continúa a cargo del trigger existente. El schema actual no posee `confirmed_at` ni `completed_at`.

**Validado en DEV:** transiciones owner permitidas y prohibidas, no-op idempotente, owner ajeno, anon, `DELETE` directo revocado, preservación de datos financieros, confirmación por RPC de pagos y concurrencia con un único ganador. Una follow-up de mínimo privilegio retira además `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` y `TRIGGER` directos de roles cliente, preservando únicamente `SELECT` owner para `authenticated`. Los fixtures temporales fueron eliminados.

**Resultado final:**
* La matriz owner permite únicamente transiciones manuales explícitas y mantiene separados los cambios de payment/system.
* `pending_payment` no puede confirmarse manualmente y los estados terminales no pueden revivir.
* Las transiciones concurrentes se serializan mediante lock y se revalidan contra el estado vigente.
* Los privilegios directos de `appointments` quedaron reducidos al mínimo necesario.
* La cancelación persiste y preserva los datos financieros y las relaciones históricas del appointment.
* Agenda, Booking, Checkout y el flujo de pagos fueron validados en Preview.
* Supabase PROD permanece intacto.

**Estado:** ✅ Completado

---

### 🚧 Production Readiness P1 — Dependency Security Hardening

**Objetivo:** eliminar vulnerabilidades `HIGH` del árbol de dependencias de producción mediante una actualización mínima y verificable, sin introducir cambios funcionales ni desplegar a PROD.

* [x] Auditar dependencias directas, transitivas y advisories de producción.
* [x] Actualizar `next` y `eslint-config-next` de `16.2.7` a `16.3.4`.
* [x] Actualizar transitivamente `postcss`, `nanoid` y `sharp` a versiones corregidas.
* [x] Confirmar `npm audit --omit=dev` sin vulnerabilidades.
* [x] Validar TypeScript, ESLint y build de producción.
* [ ] Validar regresión funcional en Vercel Preview sobre `develop`.

**Validación local:**
* `npm audit --omit=dev`: 0 vulnerabilidades (`HIGH` y `CRITICAL`: 0).
* React permanece en `19.2.4`; App Router, Turbopack, Supabase SSR, middleware y Route Handlers compilan sin cambios de código.
* TypeScript y build aprobados; ESLint sin errores y con dos warnings preexistentes por uso de `<img>`.
* La migración de la convención `middleware` a `proxy` sigue como deuda separada y no forma parte de este hardening.
* El audit completo conserva vulnerabilidades `HIGH` sólo en tooling de desarrollo (`brace-expansion`, `browserslist` y `js-yaml`); no integran el runtime productivo.
* Supabase DEV/PROD, migrations, Mercado Pago y lógica productiva permanecen intactos.

**Estado:** 🚧 Implementado localmente; pendiente validación en Preview. PROD intacto.

---

## 📌 Ticket actual

**Actual:** Production Readiness P1 — Dependency Security Hardening. Pendiente validación funcional en Vercel Preview.

---

## Regla de actualización

Cuando terminemos un ticket:

1. Marcar sus tareas con `[x]`.
2. Cambiar su estado a ✅ Completado.
3. Actualizar **Ticket actual**.
4. Agregar nuevas tareas descubiertas durante el desarrollo sin perder las anteriores.
