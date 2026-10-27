-- =============================================================================
-- YORCATALOG - MIGRACIÓN 003: BUCKETS DE ALMACENAMIENTO Y POLÍTICAS DE STORAGE
-- PostgreSQL / Supabase Storage
-- =============================================================================

-- 1. BUCKET PÚBLICO: catalog-images (Imágenes de productos, fotos de portada)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'catalog-images',
    'catalog-images',
    true,
    5242880, -- 5 MB límite por imagen
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- 2. BUCKET PÚBLICO: workspace-assets (Logotipos e identidad visual)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'workspace-assets',
    'workspace-assets',
    true,
    2097152, -- 2 MB límite
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- 3. BUCKET PRIVADO: import-temp (Archivos CSV temporales y ZIPs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'import-temp',
    'import-temp',
    false,
    52428800, -- 50 MB límite para archivos comprimidos
    ARRAY['text/csv', 'application/vnd.ms-excel', 'application/zip', 'application/x-zip-compressed']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['text/csv', 'application/vnd.ms-excel', 'application/zip', 'application/x-zip-compressed'];

-- -----------------------------------------------------------------------------
-- POLÍTICAS DE STORAGE: catalog-images
-- -----------------------------------------------------------------------------
-- Acceso público de lectura para que la revista web cargue imágenes sin firmas pesadas
CREATE POLICY "Lectura pública de imágenes de catálogo"
ON storage.objects FOR SELECT
USING (bucket_id = 'catalog-images');

-- Subida y modificación restringida a usuarios autenticados
CREATE POLICY "Usuarios autenticados suben imágenes de catálogo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'catalog-images');

CREATE POLICY "Usuarios autenticados actualizan sus imágenes de catálogo"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'catalog-images');

CREATE POLICY "Usuarios autenticados eliminan imágenes de catálogo"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'catalog-images');

-- -----------------------------------------------------------------------------
-- POLÍTICAS DE STORAGE: workspace-assets
-- -----------------------------------------------------------------------------
CREATE POLICY "Lectura pública de logotipos"
ON storage.objects FOR SELECT
USING (bucket_id = 'workspace-assets');

CREATE POLICY "Usuarios autenticados gestionan logotipos"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'workspace-assets')
WITH CHECK (bucket_id = 'workspace-assets');

-- -----------------------------------------------------------------------------
-- POLÍTICAS DE STORAGE: import-temp (PRIVADO)
-- -----------------------------------------------------------------------------
CREATE POLICY "Usuarios autenticados gestionan sus archivos temporales"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'import-temp')
WITH CHECK (bucket_id = 'import-temp');
