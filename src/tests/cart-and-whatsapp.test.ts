/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PRUEBAS AUTOMATIZADAS: CARRITO, WHATSAPP Y REGISTRO DE PEDIDOS (FASE 5)
 */

import { describe, it, expect } from 'vitest';
import {
  buildWhatsAppOrderMessage,
  normalizeWhatsAppNumber,
  generateWhatsAppUrl,
  isWhatsAppMessageLong,
} from '../services/whatsappOrderService';
import { CartItem, CustomerCheckoutData } from '../types';

describe('Carrito, Generador de WhatsApp y Registro de Pedidos', () => {
  const sampleItems: CartItem[] = [
    {
      productId: 'prod-001',
      sku: 'YOR-CAFE-01',
      ean: '0770200100456',
      name: 'Café Especial Geisha Huila 340g',
      price: 48000,
      quantity: 2,
      currency: 'COP',
    },
    {
      productId: 'prod-002',
      sku: 'YOR-ACC-02',
      ean: '0770200100789',
      name: 'Prensa Francesa Acero Mate 600ml',
      price: 89000,
      quantity: 1,
      currency: 'COP',
    },
  ];

  const sampleCustomer: CustomerCheckoutData = {
    name: 'Carolina Morales',
    phone: '3001234567',
    city: 'Bogotá D.C.',
    address: 'Calle 93 # 12-45',
    notes: 'Por favor empacar para regalo.',
  };

  it('debe normalizar números telefónicos a formato internacional E.164 sin signos', () => {
    expect(normalizeWhatsAppNumber('3001234567', '57')).toBe('573001234567');
    expect(normalizeWhatsAppNumber('+57 (300) 123-4567', '57')).toBe('573001234567');
    expect(normalizeWhatsAppNumber('573001234567', '57')).toBe('573001234567');
    expect(normalizeWhatsAppNumber('03001234567', '57')).toBe('573001234567');
  });

  it('debe construir el mensaje de WhatsApp con formato numerado, EAN, SKU y datos del cliente', () => {
    const message = buildWhatsAppOrderMessage({
      catalog: {
        title: 'Catálogo Temporada Fin de Año 2026',
        version: 2,
        visualSettings: { showPrices: true } as any,
      },
      items: sampleItems,
      customer: sampleCustomer,
      businessName: 'Café & Alquimia Gourmet',
    });

    expect(message).toContain('Hola, quiero realizar el siguiente pedido');
    expect(message).toContain('Café Especial Geisha Huila 340g');
    expect(message).toContain('EAN: 0770200100456');
    expect(message).toContain('SKU: YOR-CAFE-01');
    expect(message).toContain('Cantidad: 2');
    expect(message).toContain('Subtotal: $ 96.000 COP');
    expect(message).toContain('Prensa Francesa Acero Mate 600ml');
    expect(message).toContain('Total de referencia:');
    expect(message).toContain('Carolina Morales');
    expect(message).toContain('Calle 93 # 12-45');
    expect(message).toContain('Por favor empacar para regalo.');
  });

  it('debe manejar correctamente catálogos con precios ocultos mediante flujo de cotización', () => {
    const quoteMessage = buildWhatsAppOrderMessage({
      catalog: {
        title: 'Línea Institucional B2B',
        version: 1,
        visualSettings: { showPrices: false } as any,
      },
      items: sampleItems,
      customer: { name: 'Empresa XYZ' },
      businessName: 'Distribuciones S.A.S.',
    });

    expect(quoteMessage).toContain('Solicitud de cotización');
    expect(quoteMessage).toContain('Cotización personalizada a definir con el negocio');
    expect(quoteMessage).not.toContain('$ 48.000');
  });

  it('debe generar una URL wa.me válida y codificada', () => {
    const message = 'Hola, pedido de prueba';
    const url = generateWhatsAppUrl('3001234567', message, '57');

    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    expect(url).toContain(encodeURIComponent(message));
  });

  it('debe alertar cuando un mensaje de pedido es excesivamente largo (>2000 caracteres)', () => {
    const shortText = 'Pedido breve con 2 artículos';
    expect(isWhatsAppMessageLong(shortText)).toBe(false);

    const veryLongText = 'Artículo X '.repeat(300);
    expect(isWhatsAppMessageLong(veryLongText)).toBe(true);
  });
});
