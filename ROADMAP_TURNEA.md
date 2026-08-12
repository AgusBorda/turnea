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

### ⏳ Ticket 2 — Proteger credenciales de Mercado Pago

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
* [ ] Eliminar columnas antiguas cuando la transición esté validada

**Estado:** ⏳ Pendiente

---

### ⏳ Ticket 3 — Flujo de pagos confiable

Objetivo: que Mercado Pago sea seguro y consistente incluso si el cliente cierra la página o manipula redirects.

* [ ] Implementar webhook real de Mercado Pago
* [ ] Usar webhook como fuente confiable del pago
* [ ] Validar `external_reference`
* [ ] Validar importe
* [ ] Validar moneda
* [ ] Validar barbería correspondiente
* [ ] Verificar errores de Supabase
* [ ] Evitar que `/success` confirme pagos por sí solo
* [ ] Revisar flujo `/cancel`
* [ ] Probar pagos correctamente en DEV

**Estado:** ⏳ Pendiente

---

### ⏳ Ticket 4 — Privacidad de turnos

Objetivo: que el booking pueda conocer disponibilidad sin exponer datos de clientes.

* [ ] Crear RPC `get_public_busy_slots`
* [ ] Devolver solamente `start_time` y `end_time`
* [ ] Cambiar booking para usar RPC
* [ ] Eliminar `SELECT USING (true)` de `appointments`
* [ ] Mantener acceso completo para el owner
* [ ] Revisar exposición pública de `blocked_slots`
* [ ] Ocultar `reason` si no es necesario públicamente
* [ ] Probar booking público
* [ ] Probar agenda del owner

**Estado:** ⏳ Pendiente

---

### ⏳ Ticket 5 — Evitar dobles reservas

Objetivo: garantizar desde backend/base de datos que dos clientes no puedan reservar el mismo horario.

* [ ] Corregir detección de solapamientos
* [ ] Validar disponibilidad en backend
* [ ] Evitar condiciones de carrera
* [ ] Implementar mecanismo atómico en PostgreSQL
* [ ] Validar creación manual desde agenda
* [ ] Validar creación desde booking
* [ ] Crear pruebas de concurrencia

**Estado:** ⏳ Pendiente

---

### ⏳ Ticket 6 — Reservas pendientes de pago

* [ ] Definir expiración de `pending_payment`
* [ ] Liberar horarios cuando vence una reserva
* [ ] Evitar bloqueos eternos por pagos abandonados
* [ ] Definir comportamiento cuando Mercado Pago falla
* [ ] Revisar cancelaciones

**Estado:** ⏳ Pendiente

---

### ⏳ Ticket 7 — Fechas y timezone

* [ ] Usar timezone configurado por barbería
* [ ] Evitar depender del timezone del navegador
* [ ] Evitar depender del timezone de Vercel
* [ ] Revisar fechas pasadas
* [ ] Revisar horarios del día actual
* [ ] Probar cambios de día y casos límite

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

**Próximo:** Ticket 2 — Proteger credenciales de Mercado Pago.

---

## Regla de actualización

Cuando terminemos un ticket:

1. Marcar sus tareas con `[x]`.
2. Cambiar su estado a ✅ Completado.
3. Actualizar **Ticket actual**.
4. Agregar nuevas tareas descubiertas durante el desarrollo sin perder las anteriores.
