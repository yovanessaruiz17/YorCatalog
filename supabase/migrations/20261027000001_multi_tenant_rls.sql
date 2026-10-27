-- =============================================================================
-- YORCATALOG - MIGRACIÓN 002: POLÍTICAS DE SEGURIDAD RLS Y CONTROL MULTI-TENANT
-- PostgreSQL / Supabase Row Level Security
-- =============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- FUNCIÓN AUXILIAR DE AUTORIZACIÓN: VERIFICAR PERTENENCIA A WORKSPACE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID, req_role public.workspace_role DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ws_id
      AND wm.user_id = auth.uid()
      AND (
        req_role IS NULL
        OR wm.role = req_role
        OR (req_role = 'member' AND wm.role IN ('member', 'admin', 'owner'))
        OR (req_role = 'admin' AND wm.role IN ('admin', 'owner'))
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 1. POLÍTICAS: PROFILES
-- -----------------------------------------------------------------------------
CREATE POLICY "Los usuarios pueden ver su propio perfil"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Trigger para crear perfil automáticamente al registrarse en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. POLÍTICAS: WORKSPACES & WORKSPACE_MEMBERS
-- -----------------------------------------------------------------------------
CREATE POLICY "Miembros pueden ver sus workspaces"
ON public.workspaces FOR SELECT
USING (public.is_workspace_member(id));

CREATE POLICY "Owners y Admins pueden actualizar su workspace"
ON public.workspaces FOR UPDATE
USING (public.is_workspace_member(id, 'admin'));

CREATE POLICY "Usuarios autenticados pueden crear nuevos workspaces"
ON public.workspaces FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Miembros pueden ver miembros de sus workspaces"
ON public.workspace_members FOR SELECT
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Owners pueden gestionar miembros de su workspace"
ON public.workspace_members FOR ALL
USING (public.is_workspace_member(workspace_id, 'owner'));

-- -----------------------------------------------------------------------------
-- 3. POLÍTICAS: CATEGORIES & PRODUCTS (PRIVADOS AL NEGOCIO)
-- -----------------------------------------------------------------------------
CREATE POLICY "Miembros gestionan categorías de su workspace"
ON public.categories FOR ALL
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Miembros gestionan productos de su workspace"
ON public.products FOR ALL
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Miembros gestionan imágenes de productos"
ON public.product_images FOR ALL
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Miembros gestionan trabajos de importación"
ON public.import_jobs FOR ALL
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- 4. POLÍTICAS: CATALOGS & CATALOG_ITEMS
-- -----------------------------------------------------------------------------
-- Miembros tienen acceso total a catálogos de su workspace
CREATE POLICY "Miembros gestionan catálogos de su workspace"
ON public.catalogs FOR ALL
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

-- ACCESO PÚBLICO: Lectura anónima EXCLUSIVA para catálogos con estado 'published'
CREATE POLICY "Público general puede ver catálogos publicados"
ON public.catalogs FOR SELECT
TO anon, authenticated
USING (status = 'published');

CREATE POLICY "Miembros gestionan items de catálogo"
ON public.catalog_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.catalogs c
    WHERE c.id = catalog_items.catalog_id
      AND public.is_workspace_member(c.workspace_id)
  )
);

-- ACCESO PÚBLICO A VERSIONES PUBLICADAS:
CREATE POLICY "Cualquier persona puede leer snapshots publicados"
ON public.catalog_versions FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.catalogs c
    WHERE c.id = catalog_versions.catalog_id
      AND c.status = 'published'
  )
);

CREATE POLICY "Miembros pueden registrar snapshots publicados"
ON public.catalog_versions FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- 5. POLÍTICAS: ORDERS & ORDER_ITEMS
-- -----------------------------------------------------------------------------
-- Miembros del comercio pueden auditar, ver, confirmar o descartar pedidos
CREATE POLICY "Miembros gestionan pedidos de su negocio"
ON public.orders FOR ALL
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

-- ACCESO PÚBLICO: Los clientes anónimos pueden INSERTAR pedidos al abrir WhatsApp
-- pero NO pueden leer pedidos de otros, ni modificarlos ni eliminarlos.
CREATE POLICY "Clientes anónimos pueden registrar pedido de catálogo publicado"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.catalogs c
    WHERE c.id = orders.catalog_id
      AND c.status = 'published'
  )
  AND status = 'whatsapp_opened'
);

CREATE POLICY "Miembros gestionan items de pedidos"
ON public.order_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.is_workspace_member(o.workspace_id)
  )
);

CREATE POLICY "Clientes anónimos pueden insertar items de su pedido"
ON public.order_items FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.status = 'whatsapp_opened'
  )
);

-- -----------------------------------------------------------------------------
-- 6. POLÍTICAS: AUDIT LOGS
-- -----------------------------------------------------------------------------
CREATE POLICY "Miembros pueden consultar auditoría de su negocio"
ON public.audit_logs FOR SELECT
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Sistema y miembros autenticados registran eventos"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id));
