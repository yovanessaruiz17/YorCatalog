/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CSV PARSER DE ALTA ROBUSTEZ (RFC 4180)
 * Soporta comillas dobles, comas/puntos y comas internos, saltos de línea multilinea,
 * detección de delimitadores (, ; \t) y eliminación transparente de BOM UTF-8.
 */

import { ColumnMapping, ProductFieldKey } from '../types';

export interface RawParsedCSV {
  headers: string[];
  records: Record<string, string>[];
  delimiter: string;
}

/**
 * Detects the most probable delimiter (, or ;) by analyzing the first lines.
 */
export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r\n|\n|\r/).slice(0, 5).join('\n');
  const commaCount = (firstLines.match(/,/g) || []).length;
  const semicolonCount = (firstLines.match(/;/g) || []).length;
  const tabCount = (firstLines.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  return ',';
}

/**
 * Parses raw CSV string according to RFC 4180.
 */
export function parseCSVString(csvText: string, forcedDelimiter?: string): RawParsedCSV {
  // Strip UTF-8 Byte Order Mark (BOM) if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  const delimiter = forcedDelimiter || detectDelimiter(cleanText);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : '';

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }

      if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      }

      if (char === '\r') {
        if (nextChar === '\n') {
          i++; // skip \r, next loop will process \n
        }
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      }

      if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      }

      currentField += char;
      i++;
    }
  }

  // Push last field and row if any
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], records: [], delimiter };
  }

  // Headers are the first row
  const rawHeaders = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const records: Record<string, string>[] = [];
  for (const row of dataRows) {
    const record: Record<string, string> = {};
    for (let h = 0; h < rawHeaders.length; h++) {
      const header = rawHeaders[h] || `col_${h + 1}`;
      record[header] = row[h] !== undefined ? row[h] : '';
    }
    records.push(record);
  }

  return {
    headers: rawHeaders,
    records,
    delimiter,
  };
}

/**
 * Suggests target product field based on column name in Spanish or English.
 */
export function guessFieldMapping(header: string): ProductFieldKey | 'ignore' {
  const norm = header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9_]/g, '');

  if (/^(nombre|name|producto|product|item|title|titulo)$/.test(norm)) return 'name';
  if (/^(sku|referencia|ref|codigo|code|cod_producto|id_prod)$/.test(norm)) return 'sku';
  if (/^(ean|ean13|barcode|codigo_barras|cod_barras|upc)$/.test(norm)) return 'ean';
  if (/^(precio|price|precio_venta|pvp|valor|precio_actual)$/.test(norm)) return 'price';
  if (/^(precio_comparacion|compare_at_price|precio_anterior|old_price|pvp_anterior)$/.test(norm))
    return 'compareAtPrice';
  if (/^(categoria|category|categoryId|linea|grupo|departamento)$/.test(norm)) return 'categoryId';
  if (/^(marca|brand|fabricante|manufacturer)$/.test(norm)) return 'brand';
  if (/^(stock|cantidad|qty|quantity|existencias|inventario)$/.test(norm)) return 'stock';
  if (/^(descripcion|description|desc|detalle|detalles)$/.test(norm)) return 'description';
  if (/^(imagen|image|image_url|url_imagen|foto|photo|picture|img)$/.test(norm)) return 'imageUrl';
  if (/^(activo|active|habilitado|enabled|status|estado)$/.test(norm)) return 'active';

  return 'ignore';
}

/**
 * Builds initial column mapping suggestions with sample values.
 */
export function buildColumnMappings(
  headers: string[],
  records: Record<string, string>[]
): ColumnMapping[] {
  return headers.map((header) => {
    const samples = records
      .slice(0, 3)
      .map((r) => r[header] || '')
      .filter(Boolean);

    return {
      csvHeader: header,
      targetField: guessFieldMapping(header),
      sampleValues: samples,
    };
  });
}
