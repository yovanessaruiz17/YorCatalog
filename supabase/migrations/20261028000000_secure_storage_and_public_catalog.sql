-- =============================================================================
-- YORCATALOG - MIGRACIÓN 004: SEGURIDAD DE STORAGE Y PREVENCIÓN DE ENUMERACIÓN
-- PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PARTE 1: SEGURIDAD DE STORAGE Y RESTRICCIÓN DE FORMATOS RASTER (ANTI-SVG XSS)
-- -----------------------------------------------------------------------------

-- 1. Restringir tipos MIME permitidos a formatos rasterizados seguros (elimina SVG no confiable)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('catalog-images', 'workspace-assets');

-- 2. Eliminar políticas genéricas de Storage sin control multi-tenant
DROP POLICY IF EXISTS "Usuarios autenticados suben imágenes de catálogo" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados actualizan sus imágenes de catálogo" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados eliminan imágenes de catálogo" ON storage.objects;

-- 3. Crear políticas de Storage con aislamiento estricto por workspace_id
-- La ruta debe estructurarse como: catalog-images/{workspace_id}/{nombre_seguro}
CREATE POLICY "Miembros suben imágenes a la carpeta de su workspace"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'catalog-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Miembros actualizan imágenes de su workspace"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'catalog-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Miembros eliminan imágenes de su workspace"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'catalog-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
);

-- La lectura de imágenes de catálogo continúa siendo pública para que los clientes
-- de revistas publicadas puedan ver las fotos de producto sin requerir autenticación
DROP POLICY IF EXISTS "Lectura pública de imágenes de catálogo" ON storage.objects;
CREATE POLICY "Lectura pública de imágenes de catálogo"
ON storage.objects FOR SELECT
USING (bucket_id = 'catalog-images');


-- -----------------------------------------------------------------------------
-- PARTE 2: PREVENCIÓN DE ENUMERACIÓN DE CATÁLOGOS PÚBLICOS
-- -----------------------------------------------------------------------------

-- 1. Eliminar políticas abiertas que permitían a usuarios anónimos listar todos los
-- catálogos de todos los negocios haciendo un SELECT sin filtros.
DROP POLICY IF EXISTS "Público general puede ver catálogos publicados" ON public.catalogs;
DROP POLICY IF EXISTS "Cualquier persona puede leer snapshots publicados" ON public.catalog_versions;

-- 2. La tabla catalogs y catalog_versions ahora son estrictamente privadas
-- y solo accesibles directamente por los miembros confirmados del workspace correspondiente.

-- 3. Función RPC segura con privilegio mínimo para consulta pública exclusiva por token
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
    -- Validación estricta de entrada
    IF p_token IS NULL THEN
        RETURN NULL;
    END IF;

    v_clean_token := trim(p_token);

    -- Longitud y caracteres seguros
    IF length(v_clean_token) < 4 OR length(v_clean_token) > 100 THEN
        RETURN NULL;
    END IF;

    -- Buscar exclusivamente el catálogo que esté en estado 'published'
    -- y que coincida exactamente con su share_token o slug
    SELECT id, workspace_id, title, subtitle, slug, share_token, description,
           status, version, cover_image, logo_url, template_id, visual_settings,
           items_count, published_at, published_url
    INTO v_catalog
    FROM public.catalogs
    WHERE status = 'published'
      AND (share_token = v_clean_token OR slug = v_clean_token)
    LIMIT 1;

    -- Si no existe o no está publicado (borrador/despublicado), retornar NULL inmediatamente
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Obtener el snapshot inmutable publicado de la versión actual
    SELECT snapshot_products, visual_settings, template_id, public_url, published_at, version
    INTO v_version
    FROM public.catalog_versions
    WHERE catalog_id = v_catalog.id
      AND version = v_catalog.version
    LIMIT 1;

    -- Obtener información comercial pública del workspace (sin datos privados de facturación o miembros)
    SELECT name, settings
    INTO v_workspace
    FROM public.workspaces
    WHERE id = v_catalog.workspace_id;

    -- Construir respuesta JSON filtrada conteniendo únicamente datos de consumo público
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
            'whatsappNumber', COALESCE(v_workspace.settings->>'whatsapp_number', ''),
            'currency', COALESCE(v_workspace.settings->>'currency', 'COP')
        )
    );
END;
$$;

-- Permitir ejecución anónima y autenticada para lectura de catálogos publicados
REVOKE ALL ON FUNCTION public.get_published_catalog_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_catalog_by_token(text) TO anon, authenticated;
