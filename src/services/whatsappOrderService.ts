/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SERVICIO DE FORMATEO Y GENERACIÓN DE PEDIDOS PARA WHATSAPP (FASE 4)
 * Maneja la normalización de números internacionales (E.164),
 * la codificación segura en URLs wa.me, la gestión de longitud y
 * el soporte estricto para flujos de cotización sin precios.
 */

import { CartItem, CustomerCheckoutData, Catalog } from '../types';

/**
 * Normaliza un número telefónico al estándar numérico de WhatsApp (E.164 sin signo '+').
 * Limpia caracteres especiales, espacios, guiones y asegura prefijo internacional.
 */
export function normalizeWhatsAppNumber(rawPhone: string, defaultCountryPrefix = '57'): string {
  if (!rawPhone) return '';
  
  // Eliminar cualquier caracter no numérico
  let digits = rawPhone.replace(/[^0-9]/g, '');

  // Eliminar ceros iniciales si los hubiera (ej. trunk prefix de algunos países)
  digits = digits.replace(/^0+/, '');

  // Si tiene 10 dígitos (típico celular en Colombia o México), anteponer prefijo de país si no lo tiene
  if (digits.length === 10 && !digits.startsWith(defaultCountryPrefix)) {
    digits = `${defaultCountryPrefix}${digits}`;
  }

  return digits;
}

/**
 * Formatea un valor monetario para inclusión legible en texto plano de WhatsApp.
 */
export function formatCurrencyForText(amount: number, currency = 'COP'): string {
  try {
    if (currency === 'COP') {
      const formatted = new Intl.NumberFormat('es-CO', {
        maximumFractionDigits: 0,
      }).format(amount);
      return `$ ${formatted} COP`;
    }
    return `$ ${amount.toLocaleString()} ${currency}`;
  } catch {
    return `$ ${amount} ${currency}`;
  }
}

export interface BuildMessageOptions {
  catalog: Pick<Catalog, 'title' | 'version' | 'visualSettings'>;
  items: CartItem[];
  customer: CustomerCheckoutData;
  businessName: string;
}

/**
 * Construye el cuerpo del mensaje estructurado de WhatsApp.
 * Sigue el formato exacto solicitado para Fase 4:
 * 
 * Hola, quiero realizar el siguiente pedido del catálogo [nombre]:
 * 1. Producto A
 *    EAN: 7701234567890
 *    Cantidad: 2
 *    Precio unitario: $35.000 COP
 * ...
 * Total de referencia: $90.000 COP
 * 
 * Cliente: [nombre]
 * Observaciones: [comentarios]
 */
export function buildWhatsAppOrderMessage(options: BuildMessageOptions): string {
  const { catalog, items, customer, businessName } = options;
  const showPrices = catalog.visualSettings?.showPrices !== false;
  const currency = items[0]?.currency || 'COP';

  const totalAmount = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);

  const lines: string[] = [];

  // Saludo inicial y presentación
  lines.push(`Hola, quiero realizar el siguiente pedido del catálogo *${catalog.title}*:`);
  lines.push('');

  // Lista de productos numerada
  items.forEach((item, index) => {
    lines.push(`${index + 1}. *${item.name}*`);
    if (item.ean) {
      lines.push(`   EAN: ${item.ean}`);
    }
    if (item.sku) {
      lines.push(`   SKU: ${item.sku}`);
    }
    lines.push(`   Cantidad: ${item.quantity}`);
    if (showPrices) {
      lines.push(`   Precio unitario: ${formatCurrencyForText(item.price, currency)}`);
      if (item.quantity > 1) {
        lines.push(`   Subtotal: ${formatCurrencyForText(item.price * item.quantity, currency)}`);
      }
    } else {
      lines.push(`   Precio unitario: _Solicitud de cotización_`);
    }
    lines.push('');
  });

  // Total de referencia
  if (showPrices) {
    lines.push(`*Total de referencia:* *${formatCurrencyForText(totalAmount, currency)}*`);
  } else {
    lines.push(`*Total de referencia:* _Cotización personalizada a definir con el negocio_`);
  }
  lines.push('');

  // Datos del cliente (Solo campos proporcionados por el cliente)
  if (customer.name && customer.name.trim()) {
    lines.push(`*Cliente:* ${customer.name.trim()}`);
  }
  if (customer.phone && customer.phone.trim()) {
    lines.push(`*Teléfono:* ${customer.phone.trim()}`);
  }
  if (customer.city && customer.city.trim()) {
    lines.push(`*Ciudad:* ${customer.city.trim()}`);
  }
  if (customer.address && customer.address.trim()) {
    lines.push(`*Dirección de entrega:* ${customer.address.trim()}`);
  }
  if (customer.notes && customer.notes.trim()) {
    lines.push(`*Observaciones:* ${customer.notes.trim()}`);
  }

  lines.push('');
  lines.push(`_Pedido generado desde Revista Virtual de ${businessName || 'YorCatalog'} (v${catalog.version})_`);

  return lines.join('\n');
}

/**
 * Genera el enlace wa.me completamente codificado.
 */
export function generateWhatsAppUrl(rawPhone: string, messageText: string, defaultCountry = '57'): string {
  const cleanPhone = normalizeWhatsAppNumber(rawPhone, defaultCountry);
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Comprueba si el mensaje excede el límite recomendado para enlaces wa.me en navegadores móviles.
 */
export function isWhatsAppMessageLong(messageText: string): boolean {
  // Las URLs con query params superiores a 2000 caracteres pueden ser truncadas en algunos clientes móviles
  return encodeURIComponent(messageText).length > 2000;
}
