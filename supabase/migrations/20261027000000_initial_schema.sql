-- =============================================================================
-- YORCATALOG - MIGRACIÓN 001: ESQUEMA MULTI-TENANT INICIAL
-- PostgreSQL / Supabase
-- =============================================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (Perfiles de usuario enlazados a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. WORKSPACES (Negocios o Comercios aislados)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    tagline TEXT,
    logo_url TEXT,
    whatsapp_number TEXT NOT NULL DEFAULT '+573001234567',
    contact_email TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'COP',
    language VARCHAR(2) NOT NULL DEFAULT 'es',
    theme VARCHAR(10) NOT NULL DEFAULT 'light',
    custom_domain TEXT,
    settings_json JSONB NOT NULL DEFAULT '{
        "showPrices": true,
        "showStock": false,
        "defaultTemplate": "editorial",
        "allowDirectOrder": true,
        "includeQrCode": true
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. WORKSPACE MEMBERS (Pertenencia y Roles de Usuario en el Negocio)
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.workspace_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_user UNIQUE (workspace_id, user_id)
);

-- 4. CATEGORIES (Categorías de productos por negocio)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_category_name UNIQUE (workspace_id, name)
);

-- 5. PRODUCTS (Inventario de productos por negocio)
CREATE TYPE public.image_match_status AS ENUM (
    'exact_match',
    'pending_review',
    'no_image',
    'invalid_image',
    'confirmed'
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    -- EAN se almacena estrictamente como TEXT para preservar ceros a la izquierda
    ean TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name TEXT,
    brand TEXT,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    compare_at_price NUMERIC(12, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'COP',
    stock INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    image_verified BOOLEAN NOT NULL DEFAULT false,
    image_match_status public.image_match_status NOT NULL DEFAULT 'no_image',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_product_sku UNIQUE (workspace_id, sku)
);

-- Índices de consulta rápida en inventario
CREATE INDEX IF NOT EXISTS idx_products_workspace ON public.products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(workspace_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_ean ON public.products(workspace_id, ean);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(workspace_id, category_id);

-- 6. PRODUCT IMAGES (Imágenes adicionales por producto)
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. IMPORT JOBS (Historial de importaciones CSV)
CREATE TYPE public.import_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.conflict_resolution AS ENUM ('update_existing', 'skip_existing', 'create_new_sku');

CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    duplicates_count INTEGER NOT NULL DEFAULT 0,
    errors_count INTEGER NOT NULL DEFAULT 0,
    conflict_resolution public.conflict_resolution NOT NULL DEFAULT 'update_existing',
    status public.import_status NOT NULL DEFAULT 'pending',
    error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. CATALOGS (Catálogos y revistas digitales)
CREATE TYPE public.catalog_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE IF NOT EXISTS public.catalogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    internal_name TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    slug TEXT NOT NULL,
    share_token TEXT UNIQUE,
    description TEXT,
    status public.catalog_status NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    cover_image TEXT,
    logo_url TEXT,
    template_id TEXT NOT NULL DEFAULT 'editorial',
    visual_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    items_count INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    published_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_catalog_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_share_token ON public.catalogs(share_token);
CREATE INDEX IF NOT EXISTS idx_catalogs_workspace ON public.catalogs(workspace_id);

-- 9. CATALOG ITEMS (Relación de productos en un catálogo en edición)
CREATE TABLE IF NOT EXISTS public.catalog_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    custom_title TEXT,
    custom_price NUMERIC(12, 2),
    custom_description TEXT,
    featured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_catalog_product UNIQUE (catalog_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_order ON public.catalog_items(catalog_id, order_index);

-- 10. CATALOG VERSIONS (Instantáneas Inmutables Publicadas)
CREATE TABLE IF NOT EXISTS public.catalog_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    share_token TEXT NOT NULL,
    public_url TEXT NOT NULL,
    template_id TEXT NOT NULL,
    visual_settings JSONB NOT NULL,
    -- Snapshot completo inmutable de productos, precios, EAN y orden en formato JSONB
    snapshot_products JSONB NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT uq_catalog_version UNIQUE (catalog_id, version)
);

CREATE INDEX IF NOT EXISTS idx_catalog_versions_token ON public.catalog_versions(share_token);

-- 11. ORDERS (Pedidos comerciales registrados)
CREATE TYPE public.order_status AS ENUM (
    'prepared',
    'whatsapp_opened',
    'confirmed',
    'cancelled'
);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    catalog_id UUID REFERENCES public.catalogs(id) ON DELETE SET NULL,
    catalog_title TEXT,
    catalog_version INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_city TEXT,
    customer_address TEXT,
    notes TEXT,
    items_count INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'COP',
    status public.order_status NOT NULL DEFAULT 'whatsapp_opened',
    whatsapp_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_order_number UNIQUE (workspace_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_workspace ON public.orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(workspace_id, status);

-- 12. ORDER ITEMS (Desglose inmutable de productos por pedido)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID,
    sku TEXT NOT NULL,
    ean TEXT,
    name TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    compare_at_price NUMERIC(12, 2),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(12, 2) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. AUDIT LOGS (Registro de auditoría operativa y de seguridad)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON public.audit_logs(workspace_id, created_at DESC);
