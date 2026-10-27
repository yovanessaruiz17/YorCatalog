# YorCatalog - Guía de Configuración e Integración con Supabase (Fase 5)

Esta guía documenta la arquitectura multi-tenant, las migraciones SQL versionadas, las políticas de Row Level Security (RLS), la configuración de Storage y el despliegue a producción de **YorCatalog**.

---

## 1. Arquitectura de Datos Multi-Tenant

YorCatalog implementa aislamiento a nivel de base de datos PostgreSQL utilizando Row Level Security (RLS) en Supabase:

- **`workspaces`**: Representa la entidad de un comercio o negocio independiente. Contiene configuración de moneda, idioma, número de WhatsApp para pedidos, y logotipo.
- **`profiles`**: Perfiles de usuario vinculados directamente a `auth.users(id)`.
- **`workspace_members`**: Asigna usuarios a comercios con roles estrictos (`owner`, `admin`, `member`).
- **`products`**: Inventario privado del negocio. El campo `ean` se preserva como `TEXT` para proteger ceros iniciales.
- **`categories`**: Categorización interna aislada por negocio.
- **`import_jobs`**: Historial y auditoría de importaciones masivas por CSV.
- **`catalogs`**: Diseños de revistas digitales en borrador o publicados.
- **`catalog_versions`**: Instantáneas inmutables de las revistas en el momento exacto de su publicación. Garantiza que modificaciones posteriores en el inventario o precios no alteren retroactivamente un catálogo ya compartido con clientes.
- **`orders`**: Registro formal de pedidos generados desde la revista pública o panel comercial, con diferenciación de estados (`whatsapp_opened`, `prepared`, `confirmed`, `cancelled`).
- **`order_items`**: Desglose de ítems con congelamiento de precio, cantidad y EAN.
- **`audit_logs`**: Registro de operaciones críticas y eventos de seguridad.

---

## 2. Migraciones SQL Versionadas

Las migraciones se encuentran en el directorio `/supabase/migrations/`:

1. `20261027000000_initial_schema.sql`: Creación de tablas, tipos ENUM, restricciones de unicidad e índices de rendimiento.
2. `20261027000001_multi_tenant_rls.sql`: Activación de RLS, función `is_workspace_member()`, políticas de lectura/escritura y política de acceso público a catálogos publicados.
3. `20261027000002_storage_buckets.sql`: Creación de buckets (`catalog-images`, `workspace-assets`, `import-temp`), límites de peso y políticas de acceso.

### Aplicación de Migraciones en Supabase CLI:

```bash
# 1. Iniciar sesión en Supabase CLI
supabase login

# 2. Vincular el proyecto remoto
supabase link --project-ref TU_PROJECT_REF

# 3. Aplicar migraciones
supabase db push
```

Alternativamente, el contenido de los archivos SQL puede ejecutarse en orden secuencial directamente en el **SQL Editor** del panel de control de Supabase.

---

## 3. Variables de Entorno

Configura en tu archivo `.env` o en las variables del servicio de hosting (Cloud Run, Vercel, Netlify):

```bash
# Supabase Project URL y Clave Anónima Pública
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."

# URL canónica desplegada de la aplicación (para enlaces comerciales sin localhost)
VITE_APP_URL="https://tu-catalogo.com"
```

> **IMPORTANTE DE SEGURIDAD**: La clave `service_role` de Supabase **NUNCA** debe incluirse en variables con prefijo `VITE_` ni incorporarse al bundle del navegador. Las políticas RLS garantizan que la clave `anon` opere de manera segura respetando la pertenencia a cada comercio.

---

## 4. Modo Dual de Persistencia y Tolerancia a Fallos

YorCatalog implementa una arquitectura híbrida de persistencia:
- **Modo Producción Conectado (Supabase Live)**: Cuando `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están configurados y el usuario inicia sesión, todas las operaciones de inventario, catálogos, pedidos y subida de imágenes operan directamente contra PostgreSQL y Supabase Storage.
- **Modo Offline / Demostración Local**: Si las credenciales de Supabase no están presentes, la aplicación conmuta automáticamente al adaptador local de alta fidelidad (`mockDataService`). Esto asegura que la aplicación nunca falle ni muestre pantallas en blanco en entornos de evaluación o previsualización.
