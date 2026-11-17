# Guía de Entornos Firebase y Despliegue Manual (YorCatalog Cloud-Only)

> Este documento describe los pasos manuales en Firebase Console y Firebase CLI necesarios tras la remediación **R2.3.1**. No se aprovisionan proyectos ni se despliegan reglas automáticamente desde el repositorio.

---

## 1. Inicialización de Firebase Storage (Bucket HTTP 404 pendiente)

El bucket `gen-lang-client-0383225470.firebasestorage.app` reportó HTTP `404 Not Found` durante la auditoría R2.3 porque Storage no había sido habilitado en Firebase Console.

1. Abre [Firebase Console](https://console.firebase.google.com/) y selecciona el proyecto `gen-lang-client-0383225470`.
2. Ve a **Build → Storage** y haz clic en **Get started**.
3. Selecciona la ubicación del bucket compatible con el proyecto (ej. `us-central1` / `us-east1` según la región de Firestore) y confirma en modo producción.
4. Verifica que el bucket creado coincida con `gen-lang-client-0383225470.firebasestorage.app` (o actualiza `storageBucket` en la configuración activa si Firebase genera un dominio distinto).
5. Si las imágenes de revista pública o PDF muestran errores CORS en navegador, aplica configuración CORS en Cloud Storage con `gsutil cors set` o Google Cloud Console permitiendo el origen de producción y `http://localhost:3000`.

---

## 2. Despliegue Manual de Reglas e Índices

El repositorio incluye `firebase.json`, `firestore.rules`, `firestore.indexes.json` y `storage.rules`. Una vez autenticado con Firebase CLI (`firebase login`):

```bash
# 1. Verificar cuenta activa y proyecto
firebase login
firebase use gen-lang-client-0383225470

# 2. Validar sintaxis de reglas localmente
npx eslint firestore.rules

# 3. Desplegar reglas Firestore, índices (collectionGroup invitations) y reglas Storage
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 3. Separación de Proyecto de Desarrollo vs Producción

Para evitar que pruebas locales de desarrollo escriban sobre el proyecto productivo `gen-lang-client-0383225470`:

1. Crea un proyecto Firebase independiente para desarrollo (ej. `yorcatalog-dev`) en Firebase Console.
2. Habilita en `yorcatalog-dev`:
   - **Authentication** (Google + Email/Password).
   - **Cloud Firestore** (anota su Database ID; si usas `(default)`, define `VITE_FIREBASE_DEV_FIRESTORE_DATABASE_ID="(default)"`).
   - **Firebase Storage**.
3. Despliega en `yorcatalog-dev` las mismas reglas (`firestore.rules`, `firestore.indexes.json`, `storage.rules`).
4. Crea un archivo `.env.local` (ignorado por Git) basado en `.env.example`:

```dotenv
VITE_FIREBASE_REQUIRE_DEV_ENV="true"
VITE_FIREBASE_DEV_API_KEY="TU_API_KEY_DEV"
VITE_FIREBASE_DEV_AUTH_DOMAIN="yorcatalog-dev.firebaseapp.com"
VITE_FIREBASE_DEV_PROJECT_ID="yorcatalog-dev"
VITE_FIREBASE_DEV_STORAGE_BUCKET="yorcatalog-dev.firebasestorage.app"
VITE_FIREBASE_DEV_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_DEV_APP_ID="1:...:web:..."
VITE_FIREBASE_DEV_FIRESTORE_DATABASE_ID="(default)"
```

5. En producción (`npm run build`), utiliza variables `VITE_FIREBASE_PROD_*` (o `firebase-applet-config.json` productivo). `src/services/firebaseConfig.ts` bloqueará el arranque si producción comparte `projectId` con `VITE_FIREBASE_DEV_PROJECT_ID`.

---

## 4. Custom Claims para Colaboradores en Firebase Storage

Debido a que YorCatalog utiliza una base Firestore nombrada (`ai-studio-yorcatalog-2bed9ea5-0c3f-4ed5-ba39-992a8dc979d8`), Storage Rules no puede ejecutar `firestore.get()` sobre colecciones de miembros en esa base.

- Los propietarios de workspaces personales (`ws_{uid}`) tienen autorización nativa inmediata en `storage.rules`.
- Para permitir que colaboradores invitados (`admin` / `member`) suban imágenes al workspace compartido en Storage, se debe desplegar una Cloud Function / backend Admin SDK que sincronice `/workspaces/{workspaceId}/members/{uid}` hacia Custom Claims en Firebase Auth:

```json
{
  "workspaces": {
    "ws_owner_uid": "member"
  }
}
```
