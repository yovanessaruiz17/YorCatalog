-- =============================================================================
-- YORCATALOG - MIGRACIÓN 005: ENDURECIMIENTO R2, BOOTSTRAP MULTI-TENANT Y ORDENES
-- PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CORRECCIÓN Y ENDURECIMIENTO DE RPC get_published_catalog_by_token
-- Resuelve la discrepancia de nombres de columnas en public.workspaces:
-- (utiliza name, whatsapp_number, currency en lugar del campo inexistente settings)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_published_catalog_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_clean_token text;
    v_catalog record;
    v_version record;
    v_workspace record;
BEGIN
    IF p_token IS NULL THEN
        RETURN NULL;
    END IF;

    v_clean_token := trim(p_token);

    -- Validación estricta de longitud y formato seguro
    IF length(v_clean_token) < 4 OR length(v_clean_token) > 100 THEN
        RETURN NULL;
    END IF;

    -- Buscar exclusivamente catálogo en estado 'published'
    SELECT id, workspace_id, title, subtitle, slug, share_token, description,
           status, version, cover_image, logo_url, template_id, visual_settings,
           items_count, published_at, published_url
    INTO v_catalog
    FROM public.catalogs
    WHERE status = 'published'
      AND (share_token = v_clean_token OR slug = v_clean_token)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Snapshot inmutable publicado de la versión actual
    SELECT snapshot_products, visual_settings, template_id, public_url, published_at, version
    INTO v_version
    FROM public.catalog_versions
    WHERE catalog_id = v_catalog.id
      AND version = v_catalog.version
    LIMIT 1;

    -- Consultar campos comerciales públicos de la tabla workspaces usando las columnas canónicas
    SELECT name, whatsapp_number, currency, settings_json
    INTO v_workspace
    FROM public.workspaces
    WHERE id = v_catalog.workspace_id;

    RETURN json_build_object(
        'id', v_catalog.id,
        'workspaceId', v_catalog.workspace_id,
        'title', v_catalog.title,
        'subtitle', v_catalog.subtitle,
        'slug', v_catalog.slug,
        'shareToken', v_catalog.share_token,
        'description', v_catalog.description,
        'status', v_catalog.status,
        'version', v_catalog.version,
        'coverImage', v_catalog.cover_image,
        'logoUrl', v_catalog.logo_url,
        'templateId', COALESCE(v_version.template_id, v_catalog.template_id),
        'visualSettings', COALESCE(v_version.visual_settings, v_catalog.visual_settings),
        'itemsCount', v_catalog.items_count,
        'publishedAt', COALESCE(v_version.published_at, v_catalog.published_at),
        'publishedUrl', COALESCE(v_version.public_url, v_catalog.published_url),
        'publishedSnapshot', CASE WHEN v_version.snapshot_products IS NOT NULL THEN
            json_build_object(
                'version', v_version.version,
                'publishedAt', v_version.published_at,
                'products', v_version.snapshot_products,
                'visualSettings', v_version.visual_settings,
                'templateId', v_version.template_id,
                'publicUrl', v_version.public_url
            ) ELSE NULL END,
        'products', COALESCE(v_version.snapshot_products, '[]'::jsonb),
        'businessInfo', json_build_object(
            'businessName', COALESCE(v_workspace.name, ''),
            'whatsappNumber', COALESCE(v_workspace.whatsapp_number, ''),
            'currency', COALESCE(v_workspace.currency, 'COP')
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_published_catalog_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_catalog_by_token(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. RESOLUCIÓN DEL BLOQUEO RLS DE INSERCIÓN Y BOOTSTRAP DE WORKSPACES
-- Permite que al crear un nuevo workspace, el creador sea automáticamente asignado
-- como 'owner' sin entrar en conflicto con la política restrictiva de workspace_members.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_workspace_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        INSERT INTO public.workspace_members (workspace_id, user_id, role)
        VALUES (NEW.id, auth.uid(), 'owner')
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_after_workspace_insert ON public.workspaces;
CREATE TRIGGER tr_after_workspace_insert
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_owner();

-- Permitir a usuarios autenticados insertar su membresía inicial como owner
DROP POLICY IF EXISTS "Usuarios pueden auto-asignarse como owner al crear workspace" ON public.workspace_members;
CREATE POLICY "Usuarios pueden auto-asignarse como owner al crear workspace"
ON public.workspace_members FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = workspace_members.workspace_id
    )
);

-- -----------------------------------------------------------------------------
-- 3. TRIGGER MEJORADO DE REGISTRO EN auth.users
-- Crea el perfil y opcionalmente el primer workspace del usuario
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ws_name TEXT;
    v_ws_slug TEXT;
    v_new_ws_id UUID;
BEGIN
    -- 1. Crear perfil
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

    -- 2. Bootstrap del workspace inicial si se proporcionó o por defecto
    v_ws_name := COALESCE(NEW.raw_user_meta_data->>'workspace_name', 'Mi Comercio');
    v_ws_slug := lower(regexp_replace(v_ws_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(NEW.id::text, 1, 8);

    INSERT INTO public.workspaces (name, slug, currency, language)
    VALUES (v_ws_name, v_ws_slug, 'COP', 'es')
    RETURNING id INTO v_new_ws_id;

    -- 3. Vincular como owner
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_new_ws_id, NEW.id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Resiliencia para no bloquear el registro de Auth si falla el bootstrap del workspace
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC PARA ENVÍO ANÓNIMO SEGURO DE PEDIDOS (Anti-fuga y sin error de SELECT)
-- Permite al cliente de la revista registrar pedidos atómicamente sin requerir permisos SELECT en orders
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_order(
    p_order jsonb,
    p_items jsonb,
    p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_catalog_id uuid;
    v_catalog_status public.catalog_status;
    v_order_id uuid;
    v_order_number text;
    v_now timestamptz := timezone('utc'::text, now());
    v_random_suffix int;
    v_item jsonb;
    v_qty int;
    v_price numeric(12, 2);
BEGIN
    IF p_workspace_id IS NULL OR p_order IS NULL THEN
        RAISE EXCEPTION 'Parámetros obligatorios faltantes para registrar el pedido.';
    END IF;

    -- Validar que el catálogo referenciado existe, pertenece al workspace y está publicado
    v_catalog_id := (p_order->>'catalog_id')::uuid;
    SELECT status INTO v_catalog_status
    FROM public.catalogs
    WHERE id = v_catalog_id AND workspace_id = p_workspace_id;

    IF v_catalog_status IS NULL OR v_catalog_status != 'published' THEN
        RAISE EXCEPTION 'El catálogo especificado no existe o no está publicado actualmente.';
    END IF;

    -- Generar número de pedido único y legible
    v_random_suffix := floor(1000 + random() * 9000)::int;
    v_order_number := 'PED-' || to_char(v_now, 'YYYY') || '-' || v_random_suffix;

    -- Insertar pedido
    INSERT INTO public.orders (
        workspace_id,
        order_number,
        catalog_id,
        catalog_title,
        catalog_version,
        customer_name,
        customer_phone,
        customer_city,
        customer_address,
        notes,
        items_count,
        total_amount,
        currency,
        status,
        whatsapp_url,
        created_at,
        updated_at
    )
    VALUES (
        p_workspace_id,
        v_order_number,
        v_catalog_id,
        p_order->>'catalog_title',
        COALESCE((p_order->>'catalog_version')::int, 1),
        COALESCE(trim(p_order->>'customer_name'), 'Cliente Anónimo'),
        p_order->>'customer_phone',
        p_order->>'customer_city',
        p_order->>'customer_address',
        p_order->>'notes',
        COALESCE((p_order->>'items_count')::int, 0),
        COALESCE((p_order->>'total_amount')::numeric, 0.00),
        COALESCE(p_order->>'currency', 'COP'),
        'whatsapp_opened'::public.order_status,
        p_order->>'whatsapp_url',
        v_now,
        v_now
    )
    RETURNING id INTO v_order_id;

    -- Insertar order_items validando cantidades positivas
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_qty := (v_item->>'quantity')::int;
            IF v_qty > 0 THEN
                v_price := (v_item->>'price')::numeric;
                INSERT INTO public.order_items (
                    order_id,
                    product_id,
                    sku,
                    ean,
                    name,
                    price,
                    compare_at_price,
                    quantity,
                    subtotal,
                    image_url,
                    created_at
                )
                VALUES (
                    v_order_id,
                    CASE WHEN v_item->>'productId' ~* '^[0-9a-f-]{36}$' THEN (v_item->>'productId')::uuid ELSE NULL END,
                    COALESCE(v_item->>'sku', 'SKU-TEMP'),
                    v_item->>'ean',
                    COALESCE(v_item->>'name', 'Producto'),
                    v_price,
                    CASE WHEN v_item->>'compareAtPrice' IS NOT NULL THEN (v_item->>'compareAtPrice')::numeric ELSE NULL END,
                    v_qty,
                    COALESCE((v_item->>'subtotal')::numeric, v_price * v_qty),
                    v_item->>'imageUrl',
                    v_now
                );
            END IF;
        END LOOP;
    END IF;

    -- Retornar exclusivamente metadatos del pedido creado (sin exponer otros datos)
    RETURN json_build_object(
        'success', true,
        'orderId', v_order_id,
        'orderNumber', v_order_number,
        'status', 'whatsapp_opened',
        'createdAt', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_order(jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order(jsonb, jsonb, uuid) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. BLINDAJE DE STORAGE: VALIDACIÓN REGEX DE UUID PARA EVITAR CASTING ERRORS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Miembros suben imágenes a la carpeta de su workspace" ON storage.objects;
CREATE POLICY "Miembros suben imágenes a la carpeta de su workspace"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'catalog-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "Miembros actualizan imágenes de su workspace" ON storage.objects;
CREATE POLICY "Miembros actualizan imágenes de su workspace"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'catalog-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "Miembros eliminan imágenes de su workspace" ON storage.objects;
CREATE POLICY "Miembros eliminan imágenes de su workspace"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'catalog-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
);
