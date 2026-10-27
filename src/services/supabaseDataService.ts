/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SERVICIO DE DATOS SUPABASE MULTI-TENANT (FASE 5)
 * Implementa persistencia real en PostgreSQL con RLS, buckets de Storage y snapshots de versiones.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  Product,
  Category,
  Catalog,
  Order,
  OrderStatus,
  ImportRecord,
  CandidateImage,
  ImageMatchStatus,
  Workspace,
  CatalogPublishedSnapshot,
} from '../types';

export class SupabaseDataService {
  /**
   * Obtiene todos los productos del workspace actual
   */
  async getProducts(workspaceId: string): Promise<Product[]> {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      ean: row.ean,
      categoryId: row.category_id || '',
      categoryName: row.category_name,
      brand: row.brand,
      description: row.description,
      price: Number(row.price),
      compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
      currency: row.currency || 'COP',
      stock: row.stock,
      imageUrl: row.image_url,
      imageVerified: row.image_verified,
      imageMatchStatus: row.image_match_status,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Crea un producto en el workspace
   */
  async createProduct(
    workspaceId: string,
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const { data, error } = await supabase
      .from('products')
      .insert({
        workspace_id: workspaceId,
        name: product.name,
        sku: product.sku,
        ean: product.ean,
        category_id: product.categoryId || null,
        category_name: product.categoryName,
        brand: product.brand,
        description: product.description,
        price: product.price,
        compare_at_price: product.compareAtPrice,
        currency: product.currency || 'COP',
        stock: product.stock || 0,
        image_url: product.imageUrl,
        image_verified: product.imageVerified || false,
        image_match_status: product.imageMatchStatus || 'no_image',
        active: product.active ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      sku: data.sku,
      ean: data.ean,
      categoryId: data.category_id || '',
      categoryName: data.category_name,
      brand: data.brand,
      description: data.description,
      price: Number(data.price),
      compareAtPrice: data.compare_at_price ? Number(data.compare_at_price) : undefined,
      currency: data.currency,
      stock: data.stock,
      imageUrl: data.image_url,
      imageVerified: data.image_verified,
      imageMatchStatus: data.image_match_status,
      active: data.active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Actualiza un producto existente
   */
  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const payload: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.sku !== undefined) payload.sku = updates.sku;
    if (updates.ean !== undefined) payload.ean = updates.ean;
    if (updates.categoryId !== undefined) payload.category_id = updates.categoryId || null;
    if (updates.categoryName !== undefined) payload.category_name = updates.categoryName;
    if (updates.brand !== undefined) payload.brand = updates.brand;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.price !== undefined) payload.price = updates.price;
    if (updates.compareAtPrice !== undefined) payload.compare_at_price = updates.compareAtPrice;
    if (updates.stock !== undefined) payload.stock = updates.stock;
    if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
    if (updates.imageVerified !== undefined) payload.image_verified = updates.imageVerified;
    if (updates.imageMatchStatus !== undefined) payload.image_match_status = updates.imageMatchStatus;
    if (updates.active !== undefined) payload.active = updates.active;

    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      sku: data.sku,
      ean: data.ean,
      categoryId: data.category_id || '',
      categoryName: data.category_name,
      brand: data.brand,
      description: data.description,
      price: Number(data.price),
      compareAtPrice: data.compare_at_price ? Number(data.compare_at_price) : undefined,
      currency: data.currency,
      stock: data.stock,
      imageUrl: data.image_url,
      imageVerified: data.image_verified,
      imageMatchStatus: data.image_match_status,
      active: data.active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Elimina un producto por ID
   */
  async deleteProduct(id: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('products').delete().eq('id', id);
    return !error;
  }

  /**
   * Obtiene categorías del workspace
   */
  async getCategories(workspaceId: string): Promise<Category[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (error) return [];
    return (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));
  }

  /**
   * Crea una categoría
   */
  async createCategory(workspaceId: string, name: string): Promise<Category> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase
      .from('categories')
      .insert({ workspace_id: workspaceId, name: name.trim() })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      description: data.description,
    };
  }

  /**
   * Obtiene los catálogos del workspace
   */
  async getCatalogs(workspaceId: string): Promise<Catalog[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('catalogs')
      .select('*, catalog_versions(*)')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    if (error) return [];

    return (data || []).map((row) => {
      const latestVersion = row.catalog_versions?.sort((a: any, b: any) => b.version - a.version)[0];
      return {
        id: row.id,
        internalName: row.internal_name,
        title: row.title,
        subtitle: row.subtitle,
        slug: row.slug,
        shareToken: row.share_token,
        description: row.description,
        status: row.status,
        version: row.version,
        itemsCount: row.items_count,
        coverImage: row.cover_image,
        logoUrl: row.logo_url,
        templateId: row.template_id,
        visualSettings: row.visual_settings || {},
        products: latestVersion?.snapshot_products || [],
        publishedAt: row.published_at,
        publishedUrl: row.published_url,
        publishedSnapshot: latestVersion
          ? {
              version: latestVersion.version,
              publishedAt: latestVersion.published_at,
              products: latestVersion.snapshot_products,
              visualSettings: latestVersion.visual_settings,
              templateId: latestVersion.template_id,
              publicUrl: latestVersion.public_url,
            }
          : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * Consulta pública de un catálogo por token o slug
   * Solo retorna catálogos en estado 'published'. Protegido por RLS en Supabase.
   */
  async getByShareToken(tokenOrSlug: string): Promise<Catalog | undefined> {
    if (!supabase) return undefined;
    const clean = tokenOrSlug.trim();

    const { data, error } = await supabase
      .from('catalogs')
      .select('*, catalog_versions(*)')
      .or(`share_token.eq.${clean},slug.eq.${clean}`)
      .eq('status', 'published')
      .single();

    if (error || !data) return undefined;

    const latestVersion = data.catalog_versions?.sort((a: any, b: any) => b.version - a.version)[0];

    return {
      id: data.id,
      internalName: data.internal_name,
      title: data.title,
      subtitle: data.subtitle,
      slug: data.slug,
      shareToken: data.share_token,
      description: data.description,
      status: data.status,
      version: data.version,
      itemsCount: data.items_count,
      coverImage: data.cover_image,
      logoUrl: data.logo_url,
      templateId: data.template_id,
      visualSettings: data.visual_settings || {},
      products: latestVersion?.snapshot_products || [],
      publishedAt: data.published_at,
      publishedUrl: data.published_url,
      publishedSnapshot: latestVersion
        ? {
            version: latestVersion.version,
            publishedAt: latestVersion.published_at,
            products: latestVersion.snapshot_products,
            visualSettings: latestVersion.visual_settings,
            templateId: latestVersion.template_id,
            publicUrl: latestVersion.public_url,
          }
        : undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Publica un catálogo creando una nueva versión inmutable
   */
  async publishCatalog(id: string, publishedData: Catalog): Promise<Catalog> {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const now = new Date().toISOString();
    const newVersion = (publishedData.version || 1) + 1;
    const token = publishedData.shareToken || `pub_${Math.random().toString(36).substring(2, 9)}${Date.now().toString(36).substring(2, 6)}`;
    const publicUrl = publishedData.publishedUrl || `https://yorcatalog.app/m/${token}`;

    // 1. Actualizar el catálogo en base de datos
    const { data: updatedCat, error: catError } = await supabase
      .from('catalogs')
      .update({
        status: 'published',
        version: newVersion,
        share_token: token,
        published_at: now,
        published_url: publicUrl,
        template_id: publishedData.templateId,
        visual_settings: publishedData.visualSettings,
        items_count: publishedData.products.length,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (catError) throw catError;

    // 2. Insertar snapshot inmutable en catalog_versions
    const { error: verError } = await supabase.from('catalog_versions').insert({
      catalog_id: id,
      workspace_id: updatedCat.workspace_id,
      version: newVersion,
      share_token: token,
      public_url: publicUrl,
      template_id: publishedData.templateId,
      visual_settings: publishedData.visualSettings,
      snapshot_products: publishedData.products,
      published_at: now,
    });

    if (verError) throw verError;

    return {
      ...publishedData,
      id,
      status: 'published',
      version: newVersion,
      shareToken: token,
      publishedAt: now,
      publishedUrl: publicUrl,
      publishedSnapshot: {
        version: newVersion,
        publishedAt: now,
        products: publishedData.products,
        visualSettings: publishedData.visualSettings,
        templateId: publishedData.templateId,
        publicUrl,
      },
    };
  }

  /**
   * Despublica un catálogo
   */
  async unpublishCatalog(id: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('catalogs')
      .update({
        status: 'draft',
        published_at: null,
        published_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return !error;
  }

  /**
   * Obtiene pedidos de un workspace
   */
  async getOrders(workspaceId: string): Promise<Order[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) return [];

    return (data || []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      catalogId: row.catalog_id,
      catalogTitle: row.catalog_title,
      catalogVersion: row.catalog_version,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerCity: row.customer_city,
      customerAddress: row.customer_address,
      notes: row.notes,
      itemsCount: row.items_count,
      totalAmount: Number(row.total_amount),
      currency: row.currency,
      status: row.status,
      whatsappUrl: row.whatsapp_url,
      items: (row.order_items || []).map((it: any) => ({
        productId: it.product_id,
        sku: it.sku,
        ean: it.ean,
        name: it.name,
        price: Number(it.price),
        compareAtPrice: it.compare_at_price ? Number(it.compare_at_price) : undefined,
        quantity: it.quantity,
        subtotal: Number(it.subtotal),
        imageUrl: it.image_url,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Crea un pedido (tanto público anónimo como desde backoffice)
   */
  async createOrder(
    order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>,
    workspaceId: string
  ): Promise<Order> {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `PED-${new Date().getFullYear()}-${randomSuffix}`;
    const now = new Date().toISOString();

    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        order_number: orderNumber,
        catalog_id: order.catalogId || null,
        catalog_title: order.catalogTitle,
        catalog_version: order.catalogVersion,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        customer_city: order.customerCity,
        customer_address: order.customerAddress,
        notes: order.notes,
        items_count: order.itemsCount,
        total_amount: order.totalAmount,
        currency: order.currency || 'COP',
        status: order.status || 'whatsapp_opened',
        whatsapp_url: order.whatsappUrl,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Insertar order_items del snapshot
    if (order.items && order.items.length > 0) {
      const itemsPayload = order.items.map((it) => ({
        order_id: orderData.id,
        product_id: it.productId || null,
        sku: it.sku,
        ean: it.ean,
        name: it.name,
        price: it.price,
        compare_at_price: it.compareAtPrice,
        quantity: it.quantity,
        subtotal: it.subtotal || it.price * it.quantity,
        image_url: it.imageUrl,
      }));

      await supabase.from('order_items').insert(itemsPayload);
    }

    return {
      ...order,
      id: orderData.id,
      orderNumber,
      createdAt: now,
    };
  }

  /**
   * Actualiza el estado de un pedido
   */
  async updateOrderStatus(id: string, status: OrderStatus): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    return !error;
  }

  /**
   * Sube una imagen al bucket de Supabase Storage
   */
  async uploadImage(
    file: File | Blob,
    bucket = 'catalog-images',
    fileName = `img_${Date.now()}`
  ): Promise<string> {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const ext = file.type.split('/')[1] || 'png';
    const filePath = `${fileName}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  }
}

export const supabaseDataService = new SupabaseDataService();
