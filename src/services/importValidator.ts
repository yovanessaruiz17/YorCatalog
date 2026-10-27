/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * VALIDADOR DE IMPORTACIÓN CSV (FASE 2)
 * Valida tipos decimales, campos obligatorios, EAN como texto estricto con ceros a la izquierda,
 * duplicados internos en CSV y cruce con inventario existente.
 */

import {
  ColumnMapping,
  ParsedCSVResult,
  ParsedCSVRow,
  Product,
} from '../types';

/**
 * Cleanly parses price strings into float numbers, handling currency symbols and commas/dots.
 */
export function parseCleanPrice(val: string): number | null {
  if (!val || typeof val !== 'string') return null;

  // Remove currency symbols, spaces, letters
  let cleaned = val.replace(/[^0-9.,-]/g, '').trim();
  if (!cleaned) return null;

  // Handle formats like "48.000,00" (Latin America / Europe) vs "48,000.00" (US)
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  if (lastComma > lastDot) {
    if (lastDot === -1) {
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length === 3) {
        // Thousand separator, e.g. "48,000"
        cleaned = parts[0] + parts[1];
      } else if (parts.length > 2) {
        // Multiple commas e.g. "1,000,000"
        cleaned = cleaned.replace(/,/g, '');
      } else {
        // Decimal comma e.g. "48,50"
        cleaned = cleaned.replace(',', '.');
      }
    } else {
      // Dots are thousands, comma is decimal: "48.000,50"
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastDot > lastComma) {
    // If dot is decimal or thousand separator:
    // If there is a comma before dot, comma is thousands separator
    if (lastComma !== -1) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // e.g. "48.000" (Colombian pesos without decimals)
      // Check if after dot there are exactly 3 digits and no other dot
      const parts = cleaned.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        // Thousand separator
        cleaned = parts[0] + parts[1];
      } else if (parts.length > 2) {
        // Multiple dots => thousand separators
        cleaned = cleaned.replace(/\./g, '');
      }
    }
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

/**
 * Normalizes EAN as strict string without altering leading zeros.
 */
export function normalizeEanString(rawEan: string): string | null {
  if (!rawEan) return null;
  // Clean whitespace, tabs, quotes
  const trimmed = rawEan.replace(/["']/g, '').trim();
  if (!trimmed) return null;

  // If scientific notation e.g. 7.702E+12, warn or discard
  if (/e\+/i.test(trimmed)) {
    return trimmed; // Will fail digit format check with clear diagnostic
  }

  return trimmed;
}

/**
 * Validates mapped CSV rows against schema and existing products.
 */
export function validateCSVRows(
  records: Record<string, string>[],
  mappings: ColumnMapping[],
  existingProducts: Product[]
): ParsedCSVResult {
  const existingBySku = new Map<string, Product>();
  const existingByEan = new Map<string, Product>();

  for (const p of existingProducts) {
    existingBySku.set(p.sku.toLowerCase().trim(), p);
    if (p.ean) {
      existingByEan.set(p.ean.trim(), p);
    }
  }

  const seenSkusInCSV = new Map<string, number>();
  const seenEansInCSV = new Map<string, number>();

  const parsedRows: ParsedCSVRow[] = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let duplicatesCount = 0;
  let existingMatchCount = 0;

  for (let idx = 0; idx < records.length; idx++) {
    const raw = records[idx];
    const rowNumber = idx + 2; // +1 for 1-based, +1 for header line
    const mapped: ParsedCSVRow['mapped'] = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    // Map fields
    for (const mapping of mappings) {
      if (mapping.targetField === 'ignore') continue;
      const rawValue = (raw[mapping.csvHeader] || '').trim();

      switch (mapping.targetField) {
        case 'name':
          mapped.name = rawValue;
          break;
        case 'sku':
          mapped.sku = rawValue;
          break;
        case 'ean':
          mapped.ean = normalizeEanString(rawValue);
          break;
        case 'price':
          mapped.price = parseCleanPrice(rawValue) ?? undefined;
          break;
        case 'compareAtPrice':
          mapped.compareAtPrice = parseCleanPrice(rawValue) ?? undefined;
          break;
        case 'categoryId':
          mapped.category = rawValue;
          break;
        case 'brand':
          mapped.brand = rawValue;
          break;
        case 'stock':
          const parsedStock = parseInt(rawValue, 10);
          mapped.stock = isNaN(parsedStock) ? undefined : Math.max(0, parsedStock);
          break;
        case 'description':
          mapped.description = rawValue;
          break;
        case 'imageUrl':
          mapped.imageUrl = rawValue;
          break;
        case 'active':
          const actLower = rawValue.toLowerCase();
          mapped.active = actLower === 'true' || actLower === '1' || actLower === 'si' || actLower === 'yes';
          break;
      }
    }

    // Validation checks
    // 1. Name mandatory
    if (!mapped.name) {
      errors.push('El nombre del producto es obligatorio.');
    }

    // 2. SKU mandatory
    if (!mapped.sku) {
      errors.push('El SKU es obligatorio.');
    } else {
      const skuLower = mapped.sku.toLowerCase().trim();
      if (seenSkusInCSV.has(skuLower)) {
        errors.push(`SKU duplicado dentro del archivo CSV (fila ${seenSkusInCSV.get(skuLower)}).`);
        duplicatesCount++;
      } else {
        seenSkusInCSV.set(skuLower, rowNumber);
      }

      // Check against existing products
      if (existingBySku.has(skuLower)) {
        const existing = existingBySku.get(skuLower)!;
        warnings.push(`El SKU "${mapped.sku}" ya existe en el inventario ("${existing.name}").`);
        existingMatchCount++;
      }
    }

    // 3. Price validation
    if (mapped.price === undefined || mapped.price === null || isNaN(mapped.price)) {
      errors.push('El precio es obligatorio y debe ser un valor numérico válido.');
    } else if (mapped.price < 0) {
      errors.push('El precio no puede ser negativo.');
    }

    // 4. Compare at price validation
    if (mapped.compareAtPrice !== undefined && mapped.price !== undefined) {
      if (mapped.compareAtPrice < mapped.price) {
        warnings.push('El precio anterior es menor que el precio actual de venta.');
      }
    }

    // 5. EAN validation
    if (mapped.ean) {
      if (/e\+/i.test(mapped.ean)) {
        errors.push('El código EAN parece estar exportado en notación científica (ej. 7.7E+12). Corrija el CSV en Excel usando formato de Texto.');
      } else if (!/^[0-9]+$/.test(mapped.ean)) {
        warnings.push(`El EAN contiene caracteres no numéricos ("${mapped.ean}"). Se conservará como texto estricto.`);
      } else if (mapped.ean.length < 8 || mapped.ean.length > 14) {
        warnings.push(`El EAN tiene longitud atípica (${mapped.ean.length} dígitos; estándar suele ser 8, 12 o 13).`);
      }

      // Internal duplicate in CSV
      if (seenEansInCSV.has(mapped.ean)) {
        warnings.push(`Código EAN duplicado dentro del CSV (fila ${seenEansInCSV.get(mapped.ean)}).`);
      } else {
        seenEansInCSV.set(mapped.ean, rowNumber);
      }

      // Existing match in inventory
      if (existingByEan.has(mapped.ean)) {
        const existing = existingByEan.get(mapped.ean)!;
        if (!existingBySku.has((mapped.sku || '').toLowerCase().trim())) {
          warnings.push(`El EAN "${mapped.ean}" ya está asignado a otro producto: "${existing.name}" (SKU: ${existing.sku}).`);
        }
      }
    }

    // Determine row status
    let status: ParsedCSVRow['status'] = 'valid';
    if (errors.length > 0) {
      status = 'error';
      errorCount++;
    } else if (warnings.length > 0) {
      status = 'warning';
      warningCount++;
    } else {
      validCount++;
    }

    const skuKey = (mapped.sku || '').toLowerCase().trim();
    const existing = existingBySku.get(skuKey);

    parsedRows.push({
      rowNumber,
      raw,
      mapped,
      errors,
      warnings,
      status,
      isDuplicateInCSV: errors.some((e) => e.includes('duplicado dentro del archivo CSV')),
      existingProductId: existing?.id,
      action: existing ? 'update' : 'create',
    });
  }

  return {
    headers: mappings.map((m) => m.csvHeader),
    rows: parsedRows,
    totalRows: records.length,
    validRowsCount: validCount,
    warningRowsCount: warningCount,
    errorRowsCount: errorCount,
    duplicatesCount,
    existingMatchCount,
    delimiter: ',',
  };
}

/**
 * Generates downloadable CSV content of all errors and warnings for auditing.
 */
export function generateErrorReportCSV(rows: ParsedCSVRow[]): string {
  const errorRows = rows.filter((r) => r.status === 'error' || r.status === 'warning');
  const headers = ['Fila', 'SKU', 'Nombre', 'EAN', 'Tipo', 'Mensaje'];
  const csvLines: string[] = [headers.join(',')];

  for (const r of errorRows) {
    const sku = `"${(r.mapped.sku || '').replace(/"/g, '""')}"`;
    const name = `"${(r.mapped.name || '').replace(/"/g, '""')}"`;
    const ean = `"${(r.mapped.ean || '').replace(/"/g, '""')}"`;

    for (const err of r.errors) {
      csvLines.push([r.rowNumber, sku, name, ean, 'ERROR', `"${err.replace(/"/g, '""')}"`].join(','));
    }
    for (const warn of r.warnings) {
      csvLines.push([r.rowNumber, sku, name, ean, 'ADVERTENCIA', `"${warn.replace(/"/g, '""')}"`].join(','));
    }
  }

  return csvLines.join('\r\n');
}
