/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: IMPORTACIÓN CSV Y PRESERVACIÓN DE EAN [A]
 */

import { describe, it, expect } from 'vitest';
import { parseCSVString, buildColumnMappings } from '../services/csvParser';
import { validateCSVRows, normalizeEanString, parseCleanPrice } from '../services/importValidator';
import { Product } from '../types';

describe('[A] Importación CSV, Preservación de EAN y Detección de Conflictos', () => {
  const existingInventory: Product[] = [
    {
      id: 'prod-existing-1',
      name: 'Café Especial Existente',
      sku: 'YOR-01',
      ean: '007701234567',
      categoryId: 'cat-gourmet',
      categoryName: 'Gourmet',
      price: 42000,
      currency: 'COP',
      active: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  it('debe preservar ceros a la izquierda en códigos de barras EAN como texto estricto', () => {
    const normalized = normalizeEanString('007701234567');
    expect(normalized).toBe('007701234567');
    expect(typeof normalized).toBe('string');
    expect(normalized?.startsWith('00')).toBe(true);

    const csvContent = `sku,ean,name,price,category\nYOR-99,007701234999,Café Premium con EAN Ceros,45000,Gourmet`;
    const parsed = parseCSVString(csvContent);
    const mappings = buildColumnMappings(parsed.headers, parsed.records.slice(0, 5));
    const result = validateCSVRows(parsed.records, mappings, []);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].mapped.ean).toBe('007701234999');
    expect(typeof result.rows[0].mapped.ean).toBe('string');
  });

  it('debe detectar y marcar filas inválidas (sin SKU, sin nombre o con EAN en notación científica)', () => {
    const csvInvalid = [
      'sku,ean,name,price',
      ',7701234567890,Producto Sin SKU,35000',
      'SKU-02,7701234567891,,25000',
      'SKU-03,7.70E+12,EAN Notacion Cientifica,15000',
      'SKU-04,0770123456789,Producto Valido,15000',
    ].join('\n');

    const parsed = parseCSVString(csvInvalid);
    const mappings = buildColumnMappings(parsed.headers, parsed.records);
    const result = validateCSVRows(parsed.records, mappings, []);

    expect(result.rows.length).toBe(4);
    expect(result.rows[0].status).toBe('error');
    expect(result.rows[1].status).toBe('error');
    expect(result.rows[2].status).toBe('error');
    expect(result.rows[3].status).toBe('valid');
  });

  it('debe limpiar y convertir correctamente precios numéricos con formatos variados', () => {
    expect(parseCleanPrice('$ 48.000')).toBe(48000);
    expect(parseCleanPrice('48,000 COP')).toBe(48000);
    expect(parseCleanPrice('12500.50')).toBe(12500.5);
    expect(parseCleanPrice('invalid')).toBeNull();
  });

  it('debe detectar SKU existente en inventario y proponer acción update conservando existingProductId', () => {
    const csvContent = `sku,ean,name,price,category\nYOR-01,007701234567,Café Especial Actualizado,48000,Gourmet\nYOR-NEW,007709998887,Café Nuevo,55000,Gourmet`;
    const parsed = parseCSVString(csvContent);
    const mappings = buildColumnMappings(parsed.headers, parsed.records);
    const result = validateCSVRows(parsed.records, mappings, existingInventory);

    expect(result.existingMatchCount).toBe(1);
    expect(result.rows[0].existingProductId).toBe('prod-existing-1');
    expect(result.rows[0].action).toBe('update');
    expect(result.rows[0].status).toBe('warning');

    expect(result.rows[1].existingProductId).toBeUndefined();
    expect(result.rows[1].action).toBe('create');
    expect(result.rows[1].status).toBe('valid');
  });

  it('debe detectar SKUs duplicados dentro del mismo archivo CSV como error bloqueante', () => {
    const csvDup = `sku,name,price\nDUP-01,Producto Uno,10000\nDUP-01,Producto Dos,20000`;
    const parsed = parseCSVString(csvDup);
    const mappings = buildColumnMappings(parsed.headers, parsed.records);
    const result = validateCSVRows(parsed.records, mappings, []);

    expect(result.duplicatesCount).toBe(1);
    expect(result.rows[1].status).toBe('error');
    expect(result.rows[1].isDuplicateInCSV).toBe(true);
  });
});
