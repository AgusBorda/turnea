<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Turnea Project Rules

## 1. Branches and environments

La rama normal de trabajo es:

```text
develop = desarrollo
```

La rama de producción es:

```text
master = producción
```

Mapa de ambientes:

```text
LOCAL:
develop local
→ localhost
→ .env.local
→ Supabase DEV

PREVIEW:
develop en GitHub
→ Vercel Preview
→ variables específicas de develop
→ Supabase DEV

PRODUCTION:
master en GitHub
→ Vercel Production
→ variables de Production
→ Supabase PROD
```

Reglas:

- Trabajar normalmente sobre `develop`.
- Nunca desarrollar directamente sobre `master` salvo instrucción explícita del usuario.
- Nunca hacer merge a `master` automáticamente.
- Nunca hacer `git push` sin autorización explícita.
- Nunca cambiar `.env.local` para apuntar a PROD con el objetivo de publicar.
- El código debe ser independiente del ambiente; las credenciales y la configuración cambian mediante variables de entorno.
- Si la rama actual no es `develop`, avisar antes de modificar código.

## 2. Supabase safety

Existen dos proyectos separados:

```text
Turnea DEV = desarrollo/pruebas
Turnea PROD = producción/datos reales
```

Reglas:

- Todo cambio de desarrollo debe probarse primero contra Supabase DEV.
- Tratar Supabase PROD como entorno sensible.
- Nunca ejecutar `db reset` contra un proyecto remoto.
- Nunca hacer `db push` hacia PROD sin autorización explícita.
- Antes de cualquier operación Supabase CLI sensible, comprobar a qué proyecto está linkeado el repo.
- Los cambios estructurales de DB deben quedar versionados mediante migrations en `supabase/migrations`.
- No mantener DEV y PROD sincronizados haciendo cambios manuales duplicados.
- Nunca exponer `service_role` keys, access tokens ni secretos en código cliente.
- No pegar secretos en logs, respuestas ni commits.

## 3. Git workflow

- Antes de empezar una tarea, ejecutar o comprobar `git status`.
- Si existen cambios locales ajenos a la tarea, no sobrescribirlos ni descartarlos sin autorización.

Inicio normal:

```text
git switch develop
git pull
```

Desarrollo:

- Modificar código.
- Probar en localhost.

Guardar:

```text
git status
git add ...
git commit ...
```

El agente puede preparar cambios y sugerir commits, pero:

- No debe hacer `git push` sin permiso.
- No debe crear PR ni mergear sin permiso.
- No debe modificar `master` sin permiso.

Flujo esperado:

```text
develop
→ localhost
→ git commit
→ git push
→ Vercel Preview
→ prueba manual
→ Pull Request develop -> master
→ revisión
→ merge
→ Vercel Production
```

## 4. Deployment

Vercel:

- `develop` genera Preview.
- `master` genera Production.
- Preview de `develop` debe usar Supabase DEV.
- Production debe usar Supabase PROD.

Nunca:

- Redeployar Production para probar cambios de desarrollo.
- Modificar variables Production para hacer pruebas.
- Asumir que un deploy exitoso significa que la funcionalidad fue validada.

## 5. Current architecture

Stack principal:

- Next.js 16 App Router.
- React 19.
- TypeScript.
- Tailwind CSS 4.
- Supabase Auth/Postgres/RLS.
- `@supabase/ssr`.
- Vercel.
- Mercado Pago mediante HTTP.
- `date-fns`.
- `lucide-react`.

Estructura conceptual:

- `src/app/[slug]` = booking público.
- `src/app/dashboard` = panel de barbería.
- `src/app/dashboard/agenda` = agenda.
- `src/app/dashboard/barbers` = barberos y horarios.
- `src/app/dashboard/services` = servicios.
- `src/app/dashboard/settings` = configuración.
- `src/app/api` = endpoints/backend.
- `src/lib` = clientes Supabase, tipos y utilidades.
- `supabase/migrations` = evolución del esquema.

## 6. Agenda

La agenda actual tiene:

- Vista Día.
- Vista Semana.
- Vista Mes.
- Navegación entre fechas.
- Creación manual de turnos.
- Estados de turnos.
- Modal de detalle.
- Diseño responsive/mobile.

No simplificar ni reemplazar esta agenda por la versión semanal antigua.

La agenda avanzada fue recuperada desde un deployment previo y actualmente `develop` contiene la versión que debe conservarse.

## 7. Booking público

Flujo actual:

```text
Servicio
→ Barbero
→ Fecha
→ Horario
→ Datos del cliente
→ Confirmación/pago
```

Si una barbería requiere seña y Mercado Pago está configurado, el flujo pasa por `/api/checkout`.

Antes de modificar booking:

- Revisar disponibilidad.
- Validar que barbero y servicio pertenezcan a la barbería.
- Considerar horarios y bloqueos.
- Evitar dobles reservas.
- No confiar solo en validaciones del cliente.

## 8. Mercado Pago

Mercado Pago es una zona sensible.

Reglas:

- Nunca usar credenciales reales de PROD para pruebas.
- DEV debe usar credenciales de prueba cuando corresponda.
- No exponer `mp_access_token` al browser.
- No confiar únicamente en el redirect de success para confirmar pagos.
- Los webhooks deben considerarse la fuente confiable para confirmación.
- Toda escritura backend debe verificar errores de Supabase.
- No asumir que un update funcionó si no se verificó el resultado.

## 9. Security priorities

Antes de considerar producción segura, tener presentes estos riesgos detectados:

- Posible exposición de `mp_access_token`.
- Lectura pública excesiva de `appointments`.
- Flujo Mercado Pago y RLS.
- Confirmación de pagos.
- Doble reserva concurrente.
- Solapamiento incorrecto de horarios.
- `pending_payment` sin expiración.
- Timezone.

Si una tarea toca alguna de estas áreas, advertirlo y priorizar una solución segura.

## 10. Coding behavior

Antes de modificar:

- Leer archivos relacionados.
- Entender el flujo existente.
- No asumir APIs de Next.js; consultar documentación local según la regla superior.
- Mantener el estilo visual existente.
- Evitar refactors innecesarios.
- No cambiar arquitectura sin justificarlo.

Después de modificar:

- Informar archivos modificados.
- Resumir qué cambió.
- Indicar riesgos o decisiones.
- Ejecutar lint cuando sea razonable.
- Ejecutar build para cambios importantes cuando sea razonable.
- No ocultar errores de build/lint.
- No publicar automáticamente.

## 11. Database changes

Para cambios de DB:

- Crear migration.
- Aplicar primero en DEV.
- Verificar resultado.
- Versionar la migration en Git.
- No aplicar automáticamente a PROD.

Si hay duda sobre el proyecto Supabase linkeado: **DETENERSE y pedir confirmación**.

## 12. User working style

El usuario quiere que el agente programe activamente, pero también quiere entender qué se está haciendo.

Por eso:

- Explicar brevemente decisiones importantes.
- Usar lenguaje claro.
- No asumir conocimientos de Git/DevOps.
- Evitar cambios grandes silenciosos.
- Para acciones peligrosas, pedir confirmación antes.
- Distinguir siempre DEV de PROD.

## 13. Definition of done

Una tarea no está terminada solo porque “compila”.

Antes de darla por completada:

- Código coherente con la arquitectura existente.
- Sin exposición de secretos.
- Validaciones backend cuando corresponda.
- Errores manejados explícitamente.
- Probado en DEV cuando sea posible.
- Lint/build revisados según impacto.
- Explicar cómo probar manualmente.
- No hacer push, merge ni deploy sin autorización.


## Project roadmap

El estado de tareas técnicas y de producto se mantiene en `ROADMAP_TURNEA.md`.

- Revisarlo cuando una tarea esté relacionada con un ticket existente.
- Al finalizar un ticket, proponer su actualización.
- No marcar tareas como completadas si no fueron realmente implementadas y verificadas.