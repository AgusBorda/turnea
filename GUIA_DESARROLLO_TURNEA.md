# Guía de desarrollo de Turnea

Esta guía explica cómo trabajar en Turnea sin tocar producción por accidente.

## 1. Mapa general

Tenés una sola carpeta local:

```text
turnea/
```

Y dos ramas principales:

```text
master   = PRODUCCIÓN
develop  = DESARROLLO
```

También tenés dos proyectos Supabase:

```text
Turnea original = PROD
Turnea DEV      = DEV / pruebas
```

Y Vercel está separado así:

```text
master  -> Vercel Production -> Supabase PROD
develop -> Vercel Preview    -> Supabase DEV
```

Tu computadora usa:

```text
localhost:3000 -> .env.local -> Supabase DEV
```

### Regla número 1

**Para programar normalmente, trabajá siempre en `develop`.**

Pensá así:

```text
develop = laboratorio
master  = lo que usan los usuarios reales
```

---

# 2. Cuando abrís Turnea para empezar a trabajar

Abrí VS Code en la carpeta `turnea`.

Primero mirá en qué rama estás:

```powershell
git branch
```

Lo normal:

```text
* develop
  master
```

Si estás en `master`:

```powershell
git switch develop
```

Después traé lo último de GitHub:

```powershell
git pull
```

Luego levantá Turnea:

```powershell
npm run dev
```

Y abrí:

```text
http://localhost:3000
```

Ese localhost usa **Supabase DEV**.

---

# 3. Cómo hacer un cambio normal

Ejemplo: querés agregar un botón para cancelar un turno.

### Paso 1 — Confirmar rama

```powershell
git branch
```

Tiene que aparecer:

```text
* develop
```

### Paso 2 — Levantar el proyecto

```powershell
npm run dev
```

### Paso 3 — Programar

Modificás el código manualmente o con IA dentro de VS Code.

### Paso 4 — Probar

Entrás a:

```text
http://localhost:3000
```

y probás todo.

Recordá:

```text
localhost -> Supabase DEV
```

Podés crear usuarios, turnos y datos de prueba sin tocar producción.

---

# 4. Cómo guardar y subir cambios

Cuando terminaste y funciona localmente:

### Ver qué cambió

```powershell
git status
```

### Preparar los cambios

```powershell
git add .
```

### Crear un commit

```powershell
git commit -m "feat: permitir cancelar turnos"
```

Ejemplos de mensajes:

```text
feat: agregar cancelación de turnos
fix: corregir error al reservar horario
docs: actualizar documentación
style: mejorar vista mobile
```

### Subir a GitHub

```powershell
git push
```

Como estás en `develop`, se sube a:

```text
GitHub -> develop
```

No a producción.

---

# 5. Qué pasa después de `git push`

Vercel detecta el nuevo commit y genera un:

```text
Preview Deployment
```

Ese Preview usa:

```text
Supabase DEV
```

Entrá a:

```text
Vercel -> Turnea -> Deployments
```

Buscá:

```text
Preview
develop
```

Cuando esté `Ready`, abrilo y probá ahí también.

---

# 6. Por qué probar localhost Y Preview

## Localhost

Sirve para desarrollar rápido:

```text
VS Code -> localhost -> Supabase DEV
```

## Preview

Sirve para probar el proyecto ya desplegado:

```text
GitHub develop -> Vercel Preview -> Supabase DEV
```

Flujo ideal:

```text
Programo
↓
Pruebo localhost
↓
git push
↓
Pruebo Preview
↓
Todo OK
↓
Producción
```

---

# 7. Cómo pasar un cambio a PRODUCCIÓN

Cuando el cambio funciona bien en Preview, hay que pasar:

```text
develop -> master
```

La forma recomendada es mediante un **Pull Request en GitHub**.

En GitHub creá un PR con:

```text
base: master
compare: develop
```

Revisá los cambios.

Si está todo bien:

```text
Merge Pull Request
```

Después:

```text
master cambia
↓
Vercel detecta master
↓
Production Deployment
↓
Supabase PROD
```

No necesitás cambiar claves ni tocar `.env.local`.

---

# 8. Recorrido completo de una funcionalidad

Ejemplo: agregar recordatorios de turnos.

```text
1. Abrir VS Code
2. git switch develop
3. git pull
4. npm run dev
5. Programar
6. Probar localhost
7. git status
8. git add .
9. git commit -m "feat: agregar recordatorios"
10. git push
11. Vercel Preview
12. Probar Preview
13. Pull Request develop -> master
14. Merge
15. Vercel Production
```

---

# 9. Qué pasa con `.env.local`

Ese archivo existe solo en tu computadora.

Debe apuntar a **Supabase DEV**:

```env
NEXT_PUBLIC_SUPABASE_URL=URL_DE_SUPABASE_DEV
NEXT_PUBLIC_SUPABASE_ANON_KEY=KEY_DE_SUPABASE_DEV
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### IMPORTANTE

**Nunca cambies `.env.local` a PROD para publicar.**

No hace falta.

`.env.local` no se sube a GitHub.

Vercel tiene sus propias variables:

```text
Production -> Supabase PROD
Preview develop -> Supabase DEV
```

---

# 10. Cómo saber en qué ambiente estás

### localhost

```text
http://localhost:3000
```

→ **DEV**

### Vercel Preview

→ **DEV**

### Web oficial de Turnea

```text
turnea.vercel.app
```

→ **PRODUCCIÓN**

---

# 11. Qué rama usar

Para programar:

```text
develop
```

Para producción:

```text
master
```

Si estás programando y ves `master`, preguntate:

> ¿Por qué estoy en producción?

Normalmente deberías volver con:

```powershell
git switch develop
```

---

# 12. Cambiar entre ramas

Ir a develop:

```powershell
git switch develop
```

Ir a master:

```powershell
git switch master
```

Ver rama actual:

```powershell
git branch
```

---

# 13. Qué es `git pull`

```powershell
git pull
```

Significa:

> Traeme a mi computadora los últimos cambios de esta rama que existen en GitHub.

Rutina recomendada al arrancar:

```powershell
git switch develop
git pull
npm run dev
```

---

# 14. Qué es `git status`

```powershell
git status
```

Te dice:

- en qué rama estás
- qué archivos modificaste
- qué archivos todavía no están en un commit
- si tu rama está actualizada

Si no sabés qué está pasando con Git, primero corré:

```powershell
git status
```

---

# 15. Qué hacen add, commit y push

### `git add`

```powershell
git add .
```

> Quiero incluir estos cambios en mi próximo guardado.

### `git commit`

```powershell
git commit -m "feat: nueva funcionalidad"
```

> Guardá una versión de estos cambios en Git.

Todavía está en tu computadora.

### `git push`

```powershell
git push
```

> Subí mis commits a GitHub.

Resumen:

```text
git add
↓
git commit
↓
git push
```

---

# 16. Ejemplo de corrección pequeña

Problema:

```text
El botón Reservar se ve mal en celular.
```

Arrancás:

```powershell
git switch develop
git pull
npm run dev
```

Modificás el código y probás localhost.

Después:

```powershell
git status
git add .
git commit -m "fix: corregir boton reservar en mobile"
git push
```

Esperás Preview, lo probás y si funciona:

```text
GitHub -> Pull Request develop -> master -> Merge
```

---

# 17. Ejemplo de funcionalidad grande

Queremos agregar:

```text
Pago automático de seña con Mercado Pago
```

Desarrollo:

```text
develop
↓
Mercado Pago TEST
↓
Supabase DEV
↓
localhost
↓
Preview
```

Cuando esté completamente probado:

```text
develop -> master
```

Producción utilizará:

```text
Mercado Pago PROD
Supabase PROD
```

---

# 18. Cambios en la BASE DE DATOS

Las migrations viven en:

```text
supabase/migrations/
```

La idea es que cambios como:

```text
crear tabla
agregar columna
cambiar función
agregar policy
```

queden guardados como migration.

NO queremos:

```text
Modificar DEV manualmente
Modificar PROD manualmente
Intentar acordarnos de hacer ambos iguales
```

Queremos:

```text
Crear migration
↓
Aplicar a DEV
↓
Probar
↓
Guardar migration en Git
↓
Aplicar a PROD cuando corresponda
```

### Regla importante

Si vas a cambiar estructura de Supabase y no estás seguro, no ejecutes comandos de base a ciegas.

Especial cuidado con:

```text
db push
db reset
migration repair
```

Primero confirmá a qué proyecto estás linkeado.

---

# 19. Qué NO hacer

```text
❌ Programar directamente en master
❌ Cambiar .env.local a PROD para publicar
❌ Subir claves secretas a GitHub
❌ Probar pagos reales mientras desarrollás
❌ Borrar datos de Supabase PROD para probar
❌ Ejecutar db reset contra PROD
❌ Hacer cambios manuales diferentes en DEV y PROD sin migration
```

---

# 20. Si te equivocaste o no sabés dónde estás

Primero:

```powershell
git status
```

Después:

```powershell
git branch
```

No ejecutes `git reset`, `git push --force`, `db reset` ni comandos raros para intentar arreglarlo.

Si no estás seguro, frená ahí.

---

# 21. Inicio normal de un día de trabajo

```powershell
git switch develop
git pull
npm run dev
```

Después programás.

---

# 22. Final normal de una sesión

```powershell
git status
git add .
git commit -m "descripcion del cambio"
git push
```

Después:

```text
Vercel -> Deployments -> Preview -> probar
```

---

# 23. Publicar una versión

Cuando Preview funciona:

```text
GitHub
↓
Pull Request
↓
develop -> master
↓
Revisar cambios
↓
Merge
↓
Vercel Production
```

---

# 24. CHULETA RÁPIDA

### Quiero empezar a programar

```powershell
git switch develop
git pull
npm run dev
```

### Quiero saber qué cambié

```powershell
git status
```

### Quiero guardar y subir mis cambios

```powershell
git add .
git commit -m "descripcion"
git push
```

### Quiero probar online

```text
Vercel -> Deployments -> Preview de develop
```

### Quiero publicar

```text
GitHub -> Pull Request -> develop hacia master -> Merge
```

### Quiero saber mi rama

```powershell
git branch
```

### Estoy en master y quiero programar

```powershell
git switch develop
```

---

# 25. El mapa mental

```text
                DESARROLLO

VS Code
  ↓
develop
  ↓
localhost
  ↓
Supabase DEV

       git push
          ↓
Vercel Preview
          ↓
Supabase DEV

          TODO OK
             ↓
       Pull Request
             ↓
     develop -> master
             ↓

                PRODUCCIÓN

master
  ↓
Vercel Production
  ↓
Supabase PROD
  ↓
usuarios reales
```

## Regla final

**Desarrollá y rompé cosas en DEV. Publicá únicamente lo que ya probaste.**
