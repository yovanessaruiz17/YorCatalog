/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BIBLIOTECA DE PLANTILLAS COMERCIALES Y EDITORIALES (FASE 3)
 * Define las 4 plantillas requeridas con configuraciones visuales diferenciadas:
 * A. Minimalista: Enfoque puro en fotografía y espacios en blanco.
 * B. Editorial: Diseño tipo revista de alta gama con tipografía serif y páginas folio.
 * C. Promocional: Énfasis en descuentos, precios tachados y etiquetas llamativas.
 * D. Catálogo por Categorías: Agrupación visual, separadores de sección y tablas técnicas.
 */

import { CatalogTemplate, CatalogVisualSettings } from '../types';

export const DEFAULT_VISUAL_SETTINGS: CatalogVisualSettings = {
  primaryColor: '#0f172a',    // Slate 900
  secondaryColor: '#059669',  // Emerald 600
  fontFamily: 'sans',
  gridColumns: 2,
  productsPerPage: 4,
  cardSpacing: 'normal',
  showDescription: true,
  showBrand: true,
  showSku: true,
  showEan: true,
  showPrices: true,
  showDiscounts: true,
  showPageNumbers: true,
  headerText: 'Catálogo Oficial de Productos',
  footerText: 'Pedidos directos por WhatsApp',
  groupByCategory: false,
  pageSize: 'a4',
  includeQrCode: true,
};

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
  {
    id: 'minimal',
    name: 'Minimalista Nórdico',
    category: 'Diseño Limpio & Galería',
    description: 'Elegancia pura con fondos blancos, bordes ultrafinos y absoluto protagonismo de la fotografía de producto.',
    badge: 'Popular',
    defaultSettings: {
      primaryColor: '#0f172a',
      secondaryColor: '#10b981',
      fontFamily: 'sans',
      gridColumns: 2,
      productsPerPage: 4,
      cardSpacing: 'relaxed',
      showDescription: true,
      showBrand: false,
      showSku: true,
      showEan: false,
      showPrices: true,
      showDiscounts: true,
      showPageNumbers: true,
      headerText: 'Colección de Especialidad',
      footerText: 'Disponibilidad sujeta a inventario',
      groupByCategory: false,
      pageSize: 'a4',
      includeQrCode: true,
    },
    features: [
      'Espacios en blanco generosos',
      'Fotografía protagonista sin distracciones',
      'Tipografía sans-serif limpia',
      'Precios sutiles y elegantes',
    ],
  },
  {
    id: 'editorial',
    name: 'Editorial Revista Luxe',
    category: 'Revista Comercial de Alta Gama',
    description: 'Composición editorial tipo Kinfolk/Vogue con tipografía serif, portada imponente y jerarquía de revista.',
    badge: 'Premium',
    defaultSettings: {
      primaryColor: '#1e1b4b', // Deep indigo
      secondaryColor: '#d97706', // Warm amber
      fontFamily: 'serif',
      gridColumns: 2,
      productsPerPage: 4,
      cardSpacing: 'relaxed',
      showDescription: true,
      showBrand: true,
      showSku: true,
      showEan: true,
      showPrices: true,
      showDiscounts: true,
      showPageNumbers: true,
      headerText: 'Edición Exclusiva de Selección',
      footerText: 'YorCatalog Folio Edition',
      groupByCategory: false,
      pageSize: 'a4',
      includeQrCode: true,
    },
    features: [
      'Tipografía serif con títulos refinados',
      'Diseño folio con numeración editorial',
      'Composición equilibrada de dos columnas',
      'Notas de producto y perfil de marca',
    ],
  },
  {
    id: 'promotional',
    name: 'Promocional & Ofertas',
    category: 'Comercial de Alto Impacto',
    description: 'Enfocado en conversión con insignias de porcentaje de descuento, precios destacados y etiquetas llamativas.',
    badge: 'Conversión',
    defaultSettings: {
      primaryColor: '#881337', // Deep rose
      secondaryColor: '#e11d48', // Bright rose
      fontFamily: 'sans',
      gridColumns: 3,
      productsPerPage: 6,
      cardSpacing: 'compact',
      showDescription: false,
      showBrand: true,
      showSku: true,
      showEan: true,
      showPrices: true,
      showDiscounts: true,
      showPageNumbers: true,
      headerText: '¡Oportunidades y Precios Especiales!',
      footerText: 'Promoción válida por tiempo limitado',
      groupByCategory: false,
      pageSize: 'a4',
      includeQrCode: true,
    },
    features: [
      'Badges dinámicos de ahorro (% OFF)',
      'Precios anteriores tachados en contraste',
      'Mayor densidad por página (6 productos)',
      'Llamados a la acción visualmente fuertes',
    ],
  },
  {
    id: 'category_grid',
    name: 'Catálogo por Categorías',
    category: 'Distribución B2B y Mayoristas',
    description: 'Organización modular agrupada por categoría con separadores de sección y fichas técnicas completas con EAN.',
    badge: 'B2B & Retail',
    defaultSettings: {
      primaryColor: '#0f766e', // Deep teal
      secondaryColor: '#0284c7', // Sky
      fontFamily: 'mono',
      gridColumns: 2,
      productsPerPage: 4,
      cardSpacing: 'normal',
      showDescription: true,
      showBrand: true,
      showSku: true,
      showEan: true,
      showPrices: true,
      showDiscounts: true,
      showPageNumbers: true,
      headerText: 'Catálogo Maestro Mayorista',
      footerText: 'Suministros y distribución autorizada',
      groupByCategory: true,
      pageSize: 'a4',
      includeQrCode: true,
    },
    features: [
      'Separadores visuales automáticos por categoría',
      'Códigos SKU y EAN en tipografía monoespaciada',
      'Estructura ideal para pedidos institucionales',
      'Resumen de inventario y referencias',
    ],
  },
];
