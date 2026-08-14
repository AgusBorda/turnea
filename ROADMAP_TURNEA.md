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

### ⏳ Ticket 8 — Pagos tardíos y conciliación Mercado Pago

* [ ] Detectar pagos acreditados después del vencimiento de una reserva
* [ ] Evitar confirmar turnos vencidos aunque Mercado Pago informe pago aprobado
* [ ] Registrar correctamente el pago tardío para auditoría
* [ ] Definir estado de conciliación para estos casos
* [ ] Definir flujo de revisión manual
* [ ] Evaluar reembolso manual vs automático
* [ ] Mantener trazabilidad entre appointment, preference y payment de Mercado Pago
* [ ] Definir qué ve el cliente si pagó pero su reserva ya había vencido
* [ ] Definir qué ve la barbería ante un pago que requiere conciliación

**Estado:** ⏳ Pendiente

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

## 📌 Ticket actual

**Próximo:** Ticket 8 — Pagos tardíos y conciliación.

---

## Regla de actualización

Cuando terminemos un ticket:

1. Marcar sus tareas con `[x]`.
2. Cambiar su estado a ✅ Completado.
3. Actualizar **Ticket actual**.
4. Agregar nuevas tareas descubiertas durante el desarrollo sin perder las anteriores.
