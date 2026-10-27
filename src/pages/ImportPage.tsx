/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ASISTENTE DE IMPORTACIÓN CSV EN 5 PASOS (FASE 2)
 * Paso A: Selección y validación de archivo.
 * Paso B: Detección y mapeo interactivo de columnas.
 * Paso C: Validación profunda por fila, preservación de ceros en EAN y reporte de errores.
 * Paso D: Política explícita de resolución de conflictos e impacto proyectado.
 * Paso E: Ejecución con progreso en tiempo real y registro de auditoría.
 */

import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Clock,
  Layers,
  FileText,
  X,
  Database,
  Check,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { mockDataService } from '../services/mockDataService';
import {
  parseCSVString,
  buildColumnMappings,
} from '../services/csvParser';
import {
  validateCSVRows,
  generateErrorReportCSV,
} from '../services/importValidator';
import {
  ColumnMapping,
  ImportConflictResolution,
  ImportOptions,
  ImportRecord,
  ParsedCSVResult,
  Product,
  ProductFieldKey,
} from '../types';
import { Link } from 'react-router-dom';

type Step = 'select' | 'mapping' | 'validate' | 'conflicts' | 'importing';

const AVAILABLE_FIELDS: { key: ProductFieldKey | 'ignore'; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Nombre del producto', required: true },
  { key: 'sku', label: 'SKU (Código único)', required: true },
  { key: 'ean', label: 'Código EAN / Barras (Texto estricto)' },
  { key: 'price', label: 'Precio de venta', required: true },
  { key: 'compareAtPrice', label: 'Precio anterior / comparación' },
  { key: 'categoryId', label: 'Categoría' },
  { key: 'brand', label: 'Marca / Fabricante' },
  { key: 'stock', label: 'Cantidad en Stock' },
  { key: 'description', label: 'Descripción' },
  { key: 'imageUrl', label: 'URL de Imagen' },
  { key: 'active', label: 'Estado Activo (true/false)' },
  { key: 'ignore', label: '— Omitir esta columna —' },
];

export const ImportPage: React.FC = () => {
  const { t, formatDate, formatPrice } = useSettings();
  const [currentStep, setCurrentStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rawRecords, setRawRecords] = useState<Record<string, string>[]>([]);
  const [validationResult, setValidationResult] = useState<ParsedCSVResult | null>(null);
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<ImportRecord[]>([]);

  // Import options
  const [options, setOptions] = useState<ImportOptions>({
    conflictResolution: 'update_existing',
    updatePrices: true,
    updateImages: true,
    updateStock: true,
    defaultCategory: 'General',
  });

  // Import execution state
  const [progress, setProgress] = useState<number>(0);
  const [importSummary, setImportSummary] = useState<ImportRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationFilter, setValidationFilter] = useState<'all' | 'error' | 'warning' | 'valid'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [prods, hist] = await Promise.all([
      mockDataService.getAll(),
      mockDataService.getHistory(),
    ]);
    setExistingProducts(prods);
    setHistory(hist);
  };

  // Step A: Handle file selection
  const handleFileChange = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.txt')) {
      alert('Por favor selecciona un archivo con formato .csv o .txt válido.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      alert('El archivo supera el límite de seguridad de 10 MB.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRawText(content);
      const parsed = parseCSVString(content);
      setRawRecords(parsed.records);
      const initialMappings = buildColumnMappings(parsed.headers, parsed.records);
      setMappings(initialMappings);
      setCurrentStep('mapping');
    };
    reader.readAsText(selectedFile, 'UTF-8');
  };

  // Preset sample test generator
  const loadPresetSample = (type: 'valid' | 'conflicts') => {
    let sample = '';
    if (type === 'valid') {
      sample =
        'sku,ean,nombre,precio,categoria,marca,stock,descripcion\n' +
        'YOR-SPECIAL-10,0770200109001,Café Bourbon Rosado Pitalito 340g,52000,Gourmet,Finca La Esperanza,20,Notas complejas a grosella roja y caramelo\n' +
        'YOR-KETTLE-11,0770200109002,Tetera Cuello de Cisne Control Térmico,145000,Accesorios,Barista Lab,10,Termómetro analógico y vertido de alta precisión\n' +
        'YOR-MATCHA-12,0770200109003,Té Matcha Ceremonial Uji 50g,68000,Infusiones,Tea Master,30,Grado ceremonial 100% orgánico de primera cosecha\n';
    } else {
      // Conflicts sample: duplicate SKU within CSV, existing SKU, leading zero EAN
      sample =
        'sku,ean,nombre,precio,categoria,stock\n' +
        'YOR-CAFE-01,0770200100456,Café Geisha Huila Actualizado,49500,Gourmet,25\n' + // Existing product
        'YOR-SAMPLE-DUP,0770200109881,Producto Prueba Duplicado A,25000,General,10\n' +
        'YOR-SAMPLE-DUP,0770200109881,Producto Prueba Duplicado B,27000,General,15\n' + // Duplicate SKU inside CSV
        'YOR-ERR-01,0770200109882,Producto Precio Invalido,PRECIO_MALO,General,5\n'; // Invalid price
    }

    const testFile = new File([sample], type === 'valid' ? 'catalogo_nuevos_productos.csv' : 'catalogo_con_conflictos.csv', {
      type: 'text/csv',
    });
    handleFileChange(testFile);
  };

  // Step B: Update mapping for a specific header
  const updateMapping = (header: string, field: ProductFieldKey | 'ignore') => {
    setMappings((prev) =>
      prev.map((m) => (m.csvHeader === header ? { ...m, targetField: field } : m))
    );
  };

  // Step B -> C: Run validation
  const handleProceedToValidation = () => {
    // Check that at least name, sku, and price are mapped
    const mappedFields = new Set(mappings.map((m) => m.targetField));
    if (!mappedFields.has('name') || !mappedFields.has('sku') || !mappedFields.has('price')) {
      alert('Debes mapear obligatoriamente las columnas de Nombre, SKU y Precio.');
      return;
    }

    const result = validateCSVRows(rawRecords, mappings, existingProducts);
    setValidationResult(result);
    setCurrentStep('validate');
  };

  // Step C: Download error report
  const handleDownloadErrorReport = () => {
    if (!validationResult) return;
    const csvContent = generateErrorReportCSV(validationResult.rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_errores_${file?.name || 'importacion'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Step D -> E: Execute Import
  const handleExecuteImport = async () => {
    if (!validationResult || !file) return;

    setCurrentStep('importing');
    setIsProcessing(true);
    setProgress(10);

    try {
      const record = await mockDataService.importProducts(
        validationResult.rows,
        options,
        file.name,
        (pct) => setProgress(pct)
      );

      setImportSummary(record);
      await loadData();
    } catch (e: any) {
      alert(`Error durante la importación: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered rows for Step C
  const filteredRows = validationResult?.rows.filter((r) => {
    if (validationFilter === 'all') return true;
    return r.status === validationFilter;
  }) || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-md">
              Fase 2 Activa
            </span>
            <span className="text-xs text-slate-400 font-mono">Motor CSV RFC 4180</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.import.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Asistente de 5 pasos para carga masiva, validación de EAN y resolución de duplicados
          </p>
        </div>

        {currentStep !== 'select' && currentStep !== 'importing' && (
          <button
            onClick={() => {
              if (confirm('¿Deseas reiniciar el proceso de importación?')) {
                setCurrentStep('select');
                setFile(null);
                setValidationResult(null);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reiniciar Asistente</span>
          </button>
        )}
      </div>

      {/* Step Indicator Progress Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {[
            { id: 'select', num: '1', title: 'Archivo CSV' },
            { id: 'mapping', num: '2', title: 'Mapear Columnas' },
            { id: 'validate', num: '3', title: 'Validar Datos' },
            { id: 'conflicts', num: '4', title: 'Conflictos' },
            { id: 'importing', num: '5', title: 'Resultado' },
          ].map((st, i) => {
            const isActive = currentStep === st.id;
            const isCompleted =
              (currentStep === 'mapping' && i < 1) ||
              (currentStep === 'validate' && i < 2) ||
              (currentStep === 'conflicts' && i < 3) ||
              (currentStep === 'importing' && i < 4);

            return (
              <div key={st.id} className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs mb-1 transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white ring-4 ring-emerald-500/20'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : st.num}
                </div>
                <span
                  className={`text-[11px] truncate max-w-full ${
                    isActive ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-400'
                  }`}
                >
                  {st.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP A: Select File */}
      {currentStep === 'select' && (
        <div className="space-y-6">
          <div className="p-8 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl text-center space-y-4 shadow-xs hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Upload className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Arrastra tu archivo CSV aquí o selecciona desde tu equipo
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Archivos compatibles: <code>.csv</code> y <code>.txt</code> delimitados por coma o punto y coma. Codificación UTF-8 recomendada. Máximo 10 MB.
              </p>
            </div>

            <div>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs cursor-pointer transition">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Explorar Archivos</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Quick preset tests for immediate verification */}
          <div className="p-6 bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Pruebas Rápidas de Ejemplo (Sin archivo externo)</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Usa estos archivos generados en memoria para verificar al instante el flujo de importación:
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={() => loadPresetSample('valid')}
                className="px-4 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500 text-slate-800 dark:text-slate-200 transition"
              >
                ✓ Cargar CSV de Prueba Válido (3 productos nuevos con EAN)
              </button>
              <button
                onClick={() => loadPresetSample('conflicts')}
                className="px-4 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-500 dark:hover:border-amber-500 text-slate-800 dark:text-slate-200 transition"
              >
                ⚠ Cargar CSV con Conflictos y Duplicados (Para auditar validador)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP B: Map Columns */}
      {currentStep === 'mapping' && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Mapeo de Columnas ({file?.name})
              </h2>
              <p className="text-xs text-slate-500">
                Se detectaron {mappings.length} columnas en el archivo. Asocia cada encabezado al campo del producto correspondiente.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {rawRecords.length} filas detectadas
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {mappings.map((mapping) => (
              <div
                key={mapping.csvHeader}
                className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 md:w-1/3">
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    {mapping.csvHeader}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    Ejemplos: {mapping.sampleValues.join(', ') || '—'}
                  </div>
                </div>

                <div className="md:w-1/3 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />
                  <select
                    value={mapping.targetField}
                    onChange={(e) =>
                      updateMapping(mapping.csvHeader, e.target.value as ProductFieldKey | 'ignore')
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
                  >
                    {AVAILABLE_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} {f.required ? '(Obligatorio)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setCurrentStep('select')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Atrás</span>
            </button>

            <button
              onClick={handleProceedToValidation}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
            >
              <span>Validar Registros</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP C: Validate Data */}
      {currentStep === 'validate' && validationResult && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Filas</span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {validationResult.totalRows}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Válidas</span>
              <div className="mt-1 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {validationResult.validRowsCount}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Advertencias</span>
              <div className="mt-1 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {validationResult.warningRowsCount}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/60 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Errores</span>
              <div className="mt-1 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {validationResult.errorRowsCount}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/60 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Coincidencias</span>
              <div className="mt-1 text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {validationResult.existingMatchCount}
              </div>
            </div>
          </div>

          {/* Diagnostic Table */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Filtrar filas:</span>
                <div className="flex gap-1">
                  {(['all', 'error', 'warning', 'valid'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setValidationFilter(filterKey)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                        validationFilter === filterKey
                          ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {filterKey === 'all' && 'Todas'}
                      {filterKey === 'error' && 'Con Error'}
                      {filterKey === 'warning' && 'Con Advertencia'}
                      {filterKey === 'valid' && 'Válidas'}
                    </button>
                  ))}
                </div>
              </div>

              {validationResult.errorRowsCount > 0 && (
                <button
                  onClick={handleDownloadErrorReport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-100 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Reporte de Errores CSV</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Fila</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Nombre</th>
                    <th className="py-2.5 px-3">EAN (Texto)</th>
                    <th className="py-2.5 px-3 text-right">Precio</th>
                    <th className="py-2.5 px-3">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={
                        r.status === 'error'
                          ? 'bg-rose-50/40 dark:bg-rose-950/20'
                          : r.status === 'warning'
                          ? 'bg-amber-50/40 dark:bg-amber-950/20'
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                        #{r.rowNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-white">
                        {r.mapped.sku || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {r.mapped.name || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {r.mapped.ean || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {r.mapped.price !== undefined ? formatPrice(r.mapped.price) : 'Inválido'}
                      </td>
                      <td className="py-2.5 px-3">
                        {r.errors.length > 0 ? (
                          <div className="space-y-0.5">
                            {r.errors.map((err, i) => (
                              <span key={i} className="inline-block text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                ❌ {err}
                              </span>
                            ))}
                          </div>
                        ) : r.warnings.length > 0 ? (
                          <div className="space-y-0.5">
                            {r.warnings.map((w, i) => (
                              <span key={i} className="inline-block text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                ⚠️ {w}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            <Check className="w-3.5 h-3.5" />
                            Correcto
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setCurrentStep('mapping')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a Mapeo</span>
              </button>

              <button
                onClick={() => setCurrentStep('conflicts')}
                disabled={validationResult.validRowsCount === 0 && validationResult.warningRowsCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition disabled:opacity-50"
              >
                <span>Configurar Conflictos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP D: Resolve Conflicts */}
      {currentStep === 'conflicts' && validationResult && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-6">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Política de Resolución de Conflictos y Duplicados
            </h2>
            <p className="text-xs text-slate-500">
              Define explícitamente cómo actuar cuando un SKU ya exista en el inventario.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                id: 'update_existing' as ImportConflictResolution,
                title: 'Actualizar productos existentes',
                desc: 'Sobrescribe los datos del producto existente manteniendo su ID e historial de catálogos.',
              },
              {
                id: 'skip_existing' as ImportConflictResolution,
                title: 'Omitir productos existentes',
                desc: 'Conserva el producto que ya está en inventario sin modificarlo. Solo importa productos con SKU nuevo.',
              },
              {
                id: 'create_new_sku' as ImportConflictResolution,
                title: 'Crear como nuevo (SKU derivado)',
                desc: 'Genera una copia agregando el sufijo "-N" al SKU para evitar colisiones.',
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition ${
                  options.conflictResolution === opt.id
                    ? 'border-slate-900 dark:border-emerald-500 bg-slate-50 dark:bg-slate-800/60 font-semibold'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="conflict"
                  checked={options.conflictResolution === opt.id}
                  onChange={() => setOptions({ ...options, conflictResolution: opt.id })}
                  className="mt-1 w-4 h-4 text-emerald-600 focus:ring-0"
                />
                <div className="text-xs">
                  <span className="text-slate-900 dark:text-white font-bold block">{opt.title}</span>
                  <span className="text-slate-500 dark:text-slate-400 font-normal">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>

          {/* Granular Update Protections */}
          {options.conflictResolution === 'update_existing' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Protección de Campos al Actualizar
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.updatePrices}
                    onChange={(e) => setOptions({ ...options, updatePrices: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                  />
                  <span>Actualizar precios</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.updateImages}
                    onChange={(e) => setOptions({ ...options, updateImages: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                  />
                  <span>Actualizar imágenes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.updateStock}
                    onChange={(e) => setOptions({ ...options, updateStock: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                  />
                  <span>Actualizar stock</span>
                </label>
              </div>
            </div>
          )}

          {/* Projected Impact Statement */}
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl text-xs text-emerald-950 dark:text-emerald-200">
            <span className="font-bold text-sm block mb-1">Impacto Proyectado de la Operación:</span>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <strong>Nuevos productos a crear:</strong>{' '}
                {validationResult.rows.filter((r) => r.status !== 'error' && !r.existingProductId).length}
              </li>
              <li>
                <strong>Productos existentes a {options.conflictResolution === 'skip_existing' ? 'omitir' : 'actualizar'}:</strong>{' '}
                {validationResult.existingMatchCount}
              </li>
              <li>
                <strong>Filas bloqueadas por errores que no se importarán:</strong>{' '}
                {validationResult.errorRowsCount}
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setCurrentStep('validate')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Validación</span>
            </button>

            <button
              onClick={handleExecuteImport}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar e Importar Ahora</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP E: Importing Progress & Final Summary */}
      {currentStep === 'importing' && (
        <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-6 text-center">
          {isProcessing ? (
            <div className="space-y-4 max-w-md mx-auto py-6">
              <div className="w-12 h-12 mx-auto rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-emerald-600 animate-spin" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Procesando e importando productos... ({progress}%)
              </h2>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                Verificando unicidad, actualizando categorías y registrando auditoría.
              </p>
            </div>
          ) : importSummary ? (
            <div className="space-y-6 max-w-lg mx-auto py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  ¡Importación Completada con Éxito!
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Archivo: <strong>{importSummary.fileName}</strong> • {formatDate(importSummary.createdAt)}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Nuevos</span>
                  <span className="text-lg font-bold font-mono text-emerald-600">{importSummary.importedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Actualizados</span>
                  <span className="text-lg font-bold font-mono text-blue-600">{importSummary.updatedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Omitidos</span>
                  <span className="text-lg font-bold font-mono text-slate-600 dark:text-slate-300">{importSummary.skippedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Errores</span>
                  <span className="text-lg font-bold font-mono text-rose-600">{importSummary.errorsCount}</span>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setCurrentStep('select');
                    setFile(null);
                    setValidationResult(null);
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
                >
                  Importar Otro Archivo
                </button>

                <Link
                  to="/products"
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
                >
                  Ver Productos en Inventario →
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Audit History Card */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
            Historial de Auditoría de Importaciones
          </h3>
        </div>

        <div className="space-y-3">
          {history.map((record) => (
            <div
              key={record.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {record.fileName}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                      record.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                    }`}
                  >
                    {record.status === 'completed' ? 'Completado' : 'Con errores'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{record.importedCount} creados</span>
                  <span>•</span>
                  <span>{record.updatedCount || 0} actualizados</span>
                  <span>•</span>
                  <span>{record.skippedCount || 0} omitidos</span>
                  <span>•</span>
                  <span>{record.errorsCount} fallos</span>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {formatDate(record.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
