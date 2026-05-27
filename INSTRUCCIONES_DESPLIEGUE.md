# 📖 BIBLIOTHECA CATHOLICA — Guía de despliegue paso a paso

> Sin conocimientos técnicos. Tiempo estimado: 30 minutos.

---

## LO QUE VAMOS A HACER

```
Su computadora → GitHub (guarda el código) → Render.com (lo pone en línea)
```

Al terminar tendrá dos direcciones web:
- **API (backend):** `https://bibliotheca-catholica-api.onrender.com`
- **Aplicación (frontend):** `https://bibliotheca-catholica.onrender.com`

---

## PASO 1 — Crear cuenta en GitHub (gratis)

1. Vaya a **https://github.com**
2. Haga clic en **Sign up**
3. Elija un nombre de usuario, email y contraseña
4. Verifique su email

---

## PASO 2 — Subir el código a GitHub

### 2a. Instalar GitHub Desktop (más fácil que la terminal)
1. Vaya a **https://desktop.github.com**
2. Descargue e instale **GitHub Desktop**
3. Ábralo e inicie sesión con su cuenta de GitHub

### 2b. Crear el repositorio
1. En GitHub Desktop → **File → New Repository**
2. Nombre: `bibliotheca-catholica`
3. Local path: elija una carpeta en su computadora
4. Haga clic en **Create Repository**

### 2c. Copiar los archivos del proyecto
1. Abra la carpeta que acaba de crear (botón **Show in Explorer / Finder**)
2. Copie TODOS los archivos de este proyecto dentro de esa carpeta
   - Carpeta `backend/`
   - Carpeta `frontend/`
   - Archivo `package.json`
   - Archivo `.gitignore`

### 2d. Publicar en GitHub
1. En GitHub Desktop verá todos los archivos en verde (nuevos)
2. En el campo **Summary** escriba: `primer commit`
3. Haga clic en **Commit to main**
4. Haga clic en **Publish repository**
5. Asegúrese de que **Keep this code private** esté DESMARCADO (público es necesario para el plan gratis)
6. Haga clic en **Publish Repository**

✅ Su código ya está en GitHub en: `https://github.com/SU-USUARIO/bibliotheca-catholica`

---

## PASO 3 — Crear cuenta en Render.com (gratis)

1. Vaya a **https://render.com**
2. Haga clic en **Get Started for Free**
3. Elija **Sign up with GitHub** (así queda todo conectado automáticamente)
4. Autorice el acceso

---

## PASO 4 — Crear la base de datos PostgreSQL

1. En Render, haga clic en **New +** → **PostgreSQL**
2. Complete:
   - **Name:** `bibliotheca-db`
   - **Region:** Oregon (US West) — la más cercana disponible en plan gratis
   - **Plan:** Free
3. Haga clic en **Create Database**
4. Espere 1-2 minutos hasta que diga **Available**
5. **⚠ IMPORTANTE:** Copie y guarde el valor de **Internal Database URL** (lo necesita en el Paso 5)

---

## PASO 5 — Crear el backend (API)

1. En Render, haga clic en **New +** → **Web Service**
2. Conecte su repositorio de GitHub:
   - Seleccione **bibliotheca-catholica**
   - Haga clic en **Connect**
3. Complete la configuración:
   - **Name:** `bibliotheca-catholica-api`
   - **Region:** Oregon (igual que la base de datos)
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
4. Baje hasta **Environment Variables** y agregue estas variables (botón **Add Environment Variable**):

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | (pegue la URL que copió en el Paso 4) |
   | `JWT_SECRET` | (invente una frase larga, ej: `miSecretoSuperSeguro2024Catholica`) |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | `https://bibliotheca-catholica.onrender.com` |

5. Haga clic en **Create Web Service**
6. Espere 3-5 minutos. Cuando diga **Live** ✅ copie la URL (ej: `https://bibliotheca-catholica-api.onrender.com`)

---

## PASO 6 — Actualizar la URL del backend en el frontend

1. Abra el archivo `frontend/.env.production` en su computadora
2. Cambie la línea por la URL real de su backend:
   ```
   REACT_APP_API_URL=https://bibliotheca-catholica-api.onrender.com
   ```
   (reemplazando con la URL exacta que le dio Render)
3. Guarde el archivo
4. En GitHub Desktop, verá el archivo modificado
5. Escriba `actualizar url backend` en Summary → **Commit** → **Push origin**

---

## PASO 7 — Crear el frontend

1. En Render, haga clic en **New +** → **Static Site**
2. Conecte el mismo repositorio **bibliotheca-catholica**
3. Complete:
   - **Name:** `bibliotheca-catholica`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `build`
4. Agregue variable de entorno:

   | Key | Value |
   |-----|-------|
   | `REACT_APP_API_URL` | `https://bibliotheca-catholica-api.onrender.com` |

5. Haga clic en **Create Static Site**
6. Espere 5-10 minutos (instala dependencias y construye)
7. Cuando diga **Live** ✅ tendrá su URL, ej: `https://bibliotheca-catholica.onrender.com`

---

## ✅ ¡LISTO!

Abra `https://bibliotheca-catholica.onrender.com` desde cualquier dispositivo.

---

## NOTAS IMPORTANTES

### Plan gratuito de Render
- El backend en plan gratuito **se duerme** después de 15 minutos sin uso
- La primera visita después de inactividad puede tardar 30-60 segundos en responder (se está despertando)
- Para evitar esto, puede actualizar al plan Starter ($7/mes) en Render

### Agregar textos completos
Una vez en línea, puede subir los textos completos desde la aplicación:
1. Inicie sesión
2. Haga clic en **+ Agregar texto** en la barra lateral
3. Suba el archivo TXT, PDF, DOCX o CSV

### Si algo no funciona
- Verifique los **Logs** en el panel de Render (pestaña Logs de cada servicio)
- El error más común es una `DATABASE_URL` mal copiada
- Contácteme y le ayudo a resolverlo

---

## RESUMEN DE ARCHIVOS DEL PROYECTO

```
bibliotheca-catholica/
├── backend/
│   ├── server.js          ← API completa (usuarios, libros, progreso, comentarios)
│   ├── package.json       ← dependencias del backend
│   └── .env.example       ← ejemplo de variables de entorno
├── frontend/
│   ├── src/
│   │   ├── App.js         ← aplicación React completa
│   │   ├── App.css        ← estilos
│   │   ├── api.js         ← llamadas al backend
│   │   └── index.js       ← punto de entrada
│   ├── public/
│   │   └── index.html     ← HTML base
│   ├── package.json       ← dependencias del frontend
│   └── .env.production    ← URL del backend en producción ⚠ EDITAR
├── package.json           ← scripts convenientes
├── .gitignore
└── INSTRUCCIONES_DESPLIEGUE.md  ← este archivo
```
