# FileDrop v2

Compartí archivos temporales con contraseña. Múltiples archivos, un código. Se borran solos.

```
┌─────────────────────────────────────────────────────────────┐
│  Subís archivos + contraseña → obtenés un grupo             │
│  Compartís la contraseña (o el link) → se listan y bajan    │
│  Podés agregar más archivos al mismo grupo después           │
│  A las 24 hs → se borran de Google Drive y Firestore        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura del proyecto

```
filedrop/
├── backend/
│   ├── src/
│   │   ├── index.js                  # Servidor Express principal
│   │   ├── routes/
│   │   │   ├── upload.js             # POST /api/upload
│   │   │   └── files.js              # POST /api/files · GET /api/files/:id · POST /api/files/download/:id
│   │   ├── services/
│   │   │   ├── firestore.js          # Capa de acceso a Firestore
│   │   │   ├── drive.js              # Google Drive API
│   │   │   └── cleanup.js            # Cron de limpieza
│   │   └── middleware/
│   │       └── upload.js             # Multer (10 archivos, 10 MB c/u)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .gitignore
└── README.md
```

---

## 🗃️ Modelo de datos (Firestore)

### Colección `file_groups`

```
{
  id:           string,     // UUID
  passwordHash: string,     // bcrypt hash de la contraseña
  createdAt:    Timestamp
}
```

### Colección `files`

```
{
  id:           string,     // UUID
  groupId:      string,     // referencia al grupo
  driveFileId:  string,     // fileId en Google Drive
  originalName: string,
  mimeType:     string,
  size:         number,     // bytes
  createdAt:    Timestamp,
  expiresAt:    Timestamp   // createdAt + 24 hs
}
```

---

## 🔧 Instalación y uso local

### 1. Clonar el repo

```bash
git clone https://github.com/TU_USUARIO/filedrop.git
cd filedrop/backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales (ver secciones abajo)
```

### 3. Iniciar el servidor

```bash
npm run dev   # Desarrollo (nodemon)
npm start     # Producción
```

### 4. Abrir el frontend

Abrí `frontend/index.html` directamente en el navegador, o usá Live Server en VS Code (puerto 5500).

---

## ☁️ Paso a paso: Firebase y Firestore

### Paso 1 — Crear proyecto Firebase

1. Ir a [console.firebase.google.com](https://console.firebase.google.com)
2. **Agregar proyecto** → nombre: `filedrop`
3. Desactivar Google Analytics (no es necesario)
4. Esperar que se cree el proyecto

### Paso 2 — Activar Firestore

1. En el menú lateral → **Firestore Database**
2. **Crear base de datos**
3. Elegir modo: **Producción** (podés cambiar las reglas después)
4. Elegir región: `us-central` (recomendado para free tier)
5. Esperar que se inicialice

### Paso 3 — Configurar reglas de Firestore

En la pestaña **Reglas**, reemplazar con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Solo el backend (Service Account) puede leer/escribir
    // En producción: denegar todo acceso desde el cliente
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> El backend usa el Admin SDK que ignora estas reglas, así que esto bloquea correctamente el acceso directo desde browsers.

### Paso 4 — Crear índice compuesto (requerido por la consulta de limpieza)

Firestore necesita un índice para consultas con `where` + `orderBy`.

1. Ir a **Firestore** → **Índices** → **Compuesto**
2. Crear índice en colección `files`:
   - Campo 1: `groupId` → Ascendente
   - Campo 2: `createdAt` → Ascendente

3. Crear otro índice en `files`:
   - Campo 1: `expiresAt` → Ascendente

> Alternativamente, cuando corras el backend por primera vez y veas el error de índice faltante, Firestore te da el link directo para crearlo.

### Paso 5 — Obtener credenciales del Service Account

1. En Firebase Console → **Configuración del proyecto** (⚙️)
2. Pestaña **Cuentas de servicio**
3. **Generar nueva clave privada** → se descarga un archivo `.json`
4. El contenido de ese JSON es lo que va en `FIREBASE_SERVICE_ACCOUNT_JSON`

---

## ☁️ Paso a paso: Google Drive API

### Paso 1 — Activar la API

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Seleccionar el mismo proyecto que Firebase (o crear uno nuevo)
3. **APIs y servicios** → **Biblioteca** → buscar **Google Drive API** → Habilitar

### Paso 2 — Service Account

> Si ya creaste el Service Account de Firebase, podés usarlo también para Drive (son del mismo proyecto) o crear uno nuevo.

1. **APIs y servicios** → **Credenciales** → **Crear credenciales** → **Cuenta de servicio**
2. Nombre: `filedrop-drive`
3. Rol: puede dejarse vacío (los permisos se configuran por carpeta en Drive)
4. Una vez creada → clic en la cuenta → **Claves** → **Agregar clave** → **JSON**
5. Se descarga el archivo con las credenciales

> Si usás el mismo Service Account para Firebase y Drive, solo necesitás un JSON para ambas variables.

### Paso 3 — Crear y compartir la carpeta en Drive

1. Ir a [drive.google.com](https://drive.google.com)
2. Crear una carpeta: `filedrop-uploads`
3. Clic derecho → **Compartir**
4. Compartir con el `client_email` del Service Account (ej: `filedrop@project.iam.gserviceaccount.com`)
5. Darle rol **Editor**
6. Copiar el ID de la carpeta desde la URL:
   ```
   https://drive.google.com/drive/folders/ESTE_ID_ES_GOOGLE_DRIVE_FOLDER_ID
   ```

### Paso 4 — Configurar .env

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"filedrop",...}
GOOGLE_DRIVE_FOLDER_ID=1ABCdefGHIjklMNO_XXXXXXXX
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}  # puede ser el mismo
FIREBASE_PROJECT_ID=filedrop-12345
```

> Para pegar el JSON en una sola línea: `cat key.json | tr -d '\n'`

---

## 🌐 Deploy gratuito

### Backend → Render

1. Pusheá el código a GitHub
2. Ir a [render.com](https://render.com) → **New** → **Web Service**
3. Conectar el repositorio → elegir la rama `main`
4. Configurar:
   | Campo | Valor |
   |---|---|
   | **Root Directory** | `backend` |
   | **Build Command** | `npm install` |
   | **Start Command** | `node src/index.js` |
   | **Instance Type** | Free |

5. En **Environment Variables**, agregar todas las del `.env.example`:

   | Variable | Valor |
   |---|---|
   | `PORT` | (dejar vacío — Render lo asigna) |
   | `FRONTEND_URL` | URL de Vercel (después de deployar el frontend) |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON completo del Service Account |
   | `GOOGLE_DRIVE_FOLDER_ID` | ID de la carpeta |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON completo |
   | `FIREBASE_PROJECT_ID` | ID del proyecto Firebase |
   | `MAX_FILE_SIZE` | `10485760` |
   | `FILE_EXPIRY_HOURS` | `24` |
   | `MAX_FILES_PER_GROUP` | `20` |
   | `RATE_LIMIT_MAX` | `30` |
   | `UPLOAD_RATE_LIMIT_MAX` | `15` |

6. Deploy → Render te da `https://filedrop-api.onrender.com`

> ⚠️ **Free tier de Render** hiberna el servicio tras 15 min de inactividad. El primer request tarda ~30 s. Usá [UptimeRobot](https://uptimerobot.com) con ping cada 5 min para mantenerlo activo (gratis).

### Frontend → Vercel

1. Antes del deploy, editar `frontend/app.js` línea 6:
   ```js
   return 'https://filedrop-api.onrender.com/api';
   ```

2. Ir a [vercel.com](https://vercel.com) → **New Project**
3. Importar el repo
4. Configurar:
   | Campo | Valor |
   |---|---|
   | **Root Directory** | `frontend` |
   | **Framework Preset** | Other |
   | **Output Directory** | (vacío) |

5. Deploy → `https://filedrop.vercel.app`

6. Volver a Render y actualizar `FRONTEND_URL` con la URL de Vercel.

---

## 🧪 Probar localmente con curl

```bash
# ── Health check ────────────────────────────────
curl http://localhost:3001/api/health

# ── Subir archivos ──────────────────────────────
curl -X POST http://localhost:3001/api/upload \
  -F "files=@/ruta/a/archivo1.pdf" \
  -F "files=@/ruta/a/archivo2.jpg" \
  -F "password=mipass1234"

# Respuesta:
# {"success":true,"groupId":"uuid-del-grupo","uploaded":[...],"expiresAt":"..."}

# ── Listar archivos del grupo ───────────────────
curl -X POST http://localhost:3001/api/files \
  -H "Content-Type: application/json" \
  -d '{"password":"mipass1234"}'

# ── Info pública del grupo ──────────────────────
curl http://localhost:3001/api/files/UUID-DEL-GRUPO

# ── Descargar un archivo ────────────────────────
curl -X POST http://localhost:3001/api/files/download/UUID-DEL-ARCHIVO \
  -H "Content-Type: application/json" \
  -d '{"password":"mipass1234"}' \
  --output descargado.pdf
```

---

## 🔐 Seguridad implementada

| Mecanismo | Detalle |
|---|---|
| **bcryptjs** | Contraseñas hasheadas con 10 rounds. Nunca se almacenan en texto plano. |
| **Rate limiting** | 30 req/15 min (global) · 15 uploads/hora por IP |
| **Multer limits** | Rechaza archivos > 10 MB antes de procesarlos · Máx. 10 archivos por request |
| **CORS** | Solo acepta requests del frontend autorizado |
| **Firestore rules** | Acceso directo desde el cliente bloqueado. Solo el Admin SDK puede escribir. |
| **Validación de inputs** | Contraseña mínima 4 chars, máxima 128 · Nombres de archivo sanitizados |
| **Expiración doble** | Archivos se borran de Drive AND de Firestore |
| **Sin exposición de datos** | `GET /api/files/:groupId` no devuelve nombres ni IDs de archivos sin contraseña |

---

## 📡 API Reference

### `POST /api/upload`

```
Content-Type: multipart/form-data
files[]:   [archivo1, archivo2, ...]
password:  "contraseña"
```

**201 Created:**
```json
{
  "success": true,
  "groupId": "uuid",
  "isNewGroup": true,
  "uploaded": [{ "id": "...", "originalName": "doc.pdf", "size": 1234, "expiresAt": "..." }],
  "expiresAt": "2024-01-17T10:00:00.000Z"
}
```

---

### `POST /api/files`

```json
{ "password": "contraseña" }
```

**200 OK:**
```json
{
  "groupId": "uuid",
  "files": [
    {
      "id": "...", "originalName": "doc.pdf",
      "size": 1234, "mimeType": "application/pdf",
      "expiresAt": "...", "timeRemaining": { "hours": 18, "minutes": 30 }
    }
  ],
  "count": 1
}
```

---

### `GET /api/files/:groupId`

Info pública (sin contraseña): solo count y tiempo restante.

---

### `POST /api/files/download/:fileId`

```json
{ "password": "contraseña" }
```

Devuelve el archivo como stream binario.

---

## 💡 Roadmap / mejoras futuras

- [ ] **Límite de uploads por IP** — para entornos de alta carga
- [ ] **Cloudflare R2** — reemplazar Drive por almacenamiento más rápido y barato
- [ ] **Preview** — imágenes y PDFs en el navegador sin descargar
- [ ] **Notificación de descarga** — "tu archivo fue bajado"
- [ ] **Expiración personalizada** — 1h / 6h / 24h / 72h
- [ ] **Borrar archivo individual** — sin afectar el grupo
- [ ] **Progreso por archivo** — en lugar de progreso total del batch

---

## 📝 Licencia

MIT — Libre para uso personal, educativo y no comercial.
