/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PRUEBAS AUTOMATIZADAS: IMPORTACIÓN CSV Y EAN (FASE 5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseCSVString, buildColumnMappings } from '../services/csvParser';
import { validateCSVRows, normalizeEanString, parseCleanPrice } from '../services/importValidator';
import { MockDataService } from '../services/mockDataService';
import { ParsedCSVRow, ImportOptions } from '../types';

describe('Importación CSV y Preservación de EAN', () => {
  let mockService: MockDataService;

  beforeEach(() => {
    mockService = new MockDataService();
  });

  it('debe preservar ceros a la izquierda en códigos de barras EAN', () => {
    // Prueba de la función normalizadora estricta
    const normalized = normalizeEanString('007701234567');
    expect(normalized).toBe('007701234567');
    expect(typeof normalized).toBe('string');
    expect(normalized?.startsWith('00')).toBe(true);

    // Prueba en flujo completo de parser
    const csvContent = `sku,ean,name,price,category\nYOR-01,007701234567,Café Premium con EAN Ceros,45000,Gourmet`;
    const parsed = parseCSVString(csvContent);
    const mappings = buildColumnMappings(parsed.headers, parsed.records.slice(0, 5));
    const result = validateCSVRows(parsed.records, mappings, []);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].mapped.ean).toBe('007701234567');
    expect(typeof result.rows[0].mapped.ean).toBe('string');
  });

  it('debe detectar y marcar filas inválidas (sin SKU o sin nombre)', () => {
    const csvInvalid = `sku,name,price\n,Producto Sin SKU,35000\nSKU-02,,25000\nSKU-03,Producto Valido,15000`;
    const parsed = parseCSVString(csvInvalid);
    const mappings = buildColumnMappings(parsed.headers, parsed.records);
    const result = validateCSVRows(parsed.records, mappings, []);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].status).toBe('error'); // Falta SKU
    expect(result.rows[1].status).toBe('error'); // Falta Nombre
    expect(result.rows[2].status).toBe('valid'); // Válido
  });

  it('debe limpiar y convertir correctamente precios numéricos con formatos variados', () => {
    expect(parseCleanPrice('$ 48.000')).toBe(48000);
    expect(parseCleanPrice('48,000 COP')).toBe(48000);
    expect(parseCleanPrice('12500.50')).toBe(12500.5);
    expect(parseCleanPrice('invalid')).toBeNull();
  });

  it('debe resolver conflictos con estrategia update_existing', async () => {
    const existingProducts = await mockService.getAll();
    const targetProduct = existingProducts[0];

    const rowToImport: ParsedCSVRow = {
      rowNumber: 1,
      raw: {},
      mapped: {
        sku: targetProduct.sku,
        name: 'Nombre Actualizado por CSV',
        price: 99999,
        category: 'Gourmet',
      },
      errors: [],
      warnings: [],
      status: 'valid',
    };

    const options: ImportOptions = {
      conflictResolution: 'update_existing',
      updatePrices: true,
      updateImages: false,
      updateStock: true,
      defaultCategory: 'General',
    };

    const record = await mockService.importProducts([rowToImport], options, 'test_update.csv');
    expect(record.updatedCount).toBe(1);

    const updated = await mockService.getById(targetProduct.id);
    expect(updated?.name).toBe('Nombre Actualizado por CSV');
    expect(updated?.price).toBe(99999);
  });

  it('debe resolver conflictos con estrategia skip_existing', async () => {
    const existingProducts = await mockService.getAll();
    const targetProduct = existingProducts[0];
    const originalPrice = targetProduct.price;

    const rowToImport: ParsedCSVRow = {
      rowNumber: 1,
      raw: {},
      mapped: {
        sku: targetProduct.sku,
        name: 'Intento de Cambio Ignorado',
        price: 11111,
      },
      errors: [],
      warnings: [],
      status: 'valid',
    };

    const options: ImportOptions = {
      conflictResolution: 'skip_existing',
      updatePrices: true,
      updateImages: true,
      updateStock: true,
      defaultCategory: 'General',
    };

    const record = await mockService.importProducts([rowToImport], options, 'test_skip.csv');
    expect(record.skippedCount).toBe(1);

    const check = await mockService.getById(targetProduct.id);
    expect(check?.price).toBe(originalPrice);
  });
});
