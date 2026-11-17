/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ASOCIACIÓN MASIVA DE IMÁGENES POR EAN (FASE 2)
 * Implementa 4 métodos:
 * - Método A: Nombres por EAN exacto (7701234567890.jpg, .png, .webp).
 * - Método B: Carga múltiple o archivo ZIP (extracción cliente segura con JSZip).
 * - Método C: Mapeo por columna de imagen o URL.
 * - Método D: Asociación manual interactiva lado a lado.
 */

import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Archive,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Eye,
  Trash2,
  Check,
  Search,
  Filter,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  X,
  Sparkles,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { dataService } from '../services/dataService';
import { isFirebaseConfigured, formatCloudErrorForUser } from '../services/firebaseClient';
import { QueryStateAlert, QueryErrorState } from '../components/common/QueryStateAlert';
import {
  processImageFile,
  extractImagesFromZip,
  matchImagesWithProducts,
} from '../services/imageService';
import { useAuth } from '../context/AuthContext';
import { CandidateImage, ImageMatchStatus, Product } from '../types';

export const ImagesPage: React.FC = () => {
  const { t, formatPrice } = useSettings();
  const { currentWorkspace } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [candidates, setCandidates] = useState<CandidateImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [queryError, setQueryError] = useState<QueryErrorState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ImageMatchStatus>('all');
  const [manualModalCandidate, setManualModalCandidate] = useState<CandidateImage | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  const loadProducts = async () => {
    const wsId = currentWorkspace?.id;
    setQueryError(null);
    if (!wsId) {
      setProducts([]);
      setLoadingInventory(false);
      return;
    }

    setLoadingInventory(true);
    try {
      const prods = await dataService.getAll(wsId);
      setProducts(prods);
    } catch (err) {
      setQueryError(formatCloudErrorForUser(err, 'No se pudo cargar el inventario para asociar imágenes.'));
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    setProducts([]);
    setCandidates([]);
    setManualModalCandidate(null);
    setActionError(null);
    void loadProducts();
  }, [currentWorkspace?.id]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Handle standard multiple image upload
  const handleMultipleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setActionError(null);
    setLoading(true);

    try {
      const newCandidates: CandidateImage[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.zip')) {
          const zipExtracted = await extractImagesFromZip(file);
          newCandidates.push(...zipExtracted);
        } else {
          const processed = await processImageFile(file);
          if (processed) newCandidates.push(processed);
        }
      }

      const matched = matchImagesWithProducts(newCandidates, products);
      setCandidates((prev) => [...prev, ...matched]);
      showNotification(`Se cargaron y analizaron ${matched.length} imágenes.`);
    } catch (e) {
      setActionError(formatCloudErrorForUser(e, 'Error procesando archivos de imagen o ZIP.').message);
    } finally {
      setLoading(false);
    }
  };

  // Confirm single association
  const handleConfirmCandidate = async (candidate: CandidateImage) => {
    if (!candidate.matchedProductId) return;
    setActionError(null);
    try {
      await dataService.associateImages([candidate], currentWorkspace?.id);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, matchStatus: 'confirmed' } : c))
      );
      await loadProducts();
      showNotification(`Asociación confirmada para "${candidate.filename}".`);
    } catch (err) {
      setActionError(formatCloudErrorForUser(err, 'No se pudo subir y asociar la imagen en Firebase Storage.').message);
    }
  };

  // Confirm all exact matches in one click
  const handleConfirmAllExact = async () => {
    const exactMatches = candidates.filter(
      (c) => c.matchStatus === 'exact_match' && c.matchedProductId
    );
    if (exactMatches.length === 0) {
      setActionError('No hay coincidencias exactas pendientes por confirmar.');
      return;
    }

    setActionError(null);
    try {
      const { updated } = await dataService.associateImages(exactMatches, currentWorkspace?.id);
      setCandidates((prev) =>
        prev.map((c) =>
          c.matchStatus === 'exact_match' ? { ...c, matchStatus: 'confirmed' } : c
        )
      );
      await loadProducts();
      showNotification(`Se confirmaron ${updated} asociaciones de imagen en Firebase Storage.`);
    } catch (err) {
      setActionError(formatCloudErrorForUser(err, 'Error al asociar las imágenes en lote en Firebase Storage.').message);
    }
  };

  // Remove candidate
  const handleRemoveCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  // Manual association modal handler
  const handleAssignManualProduct = async (productId: string) => {
    if (!manualModalCandidate) return;

    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const updatedCandidate: CandidateImage = {
      ...manualModalCandidate,
      matchedProductId: prod.id,
      matchStatus: 'confirmed',
    };

    setActionError(null);
    try {
      await dataService.associateImages([updatedCandidate], currentWorkspace?.id);
      setCandidates((prev) =>
        prev.map((c) => (c.id === manualModalCandidate.id ? updatedCandidate : c))
      );
      setManualModalCandidate(null);
      await loadProducts();
      showNotification(`Imagen vinculada manualmente a "${prod.name}".`);
    } catch (err) {
      setActionError(formatCloudErrorForUser(err, 'No se pudo asociar la imagen en Firebase Storage.').message);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    if (statusFilter === 'all') return true;
    return c.matchStatus === statusFilter;
  });

  const exactCount = candidates.filter((c) => c.matchStatus === 'exact_match').length;
  const pendingCount = candidates.filter((c) => c.matchStatus === 'pending_review').length;
  const confirmedCount = candidates.filter((c) => c.matchStatus === 'confirmed').length;
  const unlinkedCount = candidates.filter((c) => c.matchStatus === 'no_image' || c.matchStatus === 'invalid_image').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-md">
              Fase 2 Activa
            </span>
            <span className="text-xs text-slate-400 font-mono">Motor de Coincidencia EAN</span>
            {isFirebaseConfigured() ? (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 rounded-md flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Firebase Storage (catalog-images)
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 rounded-md flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Firebase Storage no configurado
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.images.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Vinculación masiva de fotografías mediante código de barras EAN o archivo ZIP con verificación visual.
            {!isFirebaseConfigured() && (
              <span className="block mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                Cloud-Only: las cargas están bloqueadas hasta configurar Firebase Storage.
              </span>
            )}
          </p>
        </div>

        {notification && (
          <div className="px-3.5 py-1.5 bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {actionError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="font-bold">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {queryError && (
        <QueryStateAlert error={queryError} onRetry={() => void loadProducts()} />
      )}

      {/* Upload Zones: Single / Multi / ZIP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Box 1: File / Folder / ZIP Dropzone */}
        <div className="p-6 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-2xl">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Carga Masiva o Archivo ZIP
              </h3>
              <p className="text-xs text-slate-500">
                Sube múltiples imágenes (.jpg, .png, .webp) o un paquete ZIP con nombres EAN.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl cursor-pointer shadow-xs transition">
              <Upload className="w-3.5 h-3.5" />
              <span>{loading ? 'Analizando archivos...' : 'Seleccionar Imágenes o ZIP'}</span>
              <input
                type="file"
                multiple
                disabled={loading || !isFirebaseConfigured()}
                accept=".jpg,.jpeg,.png,.webp,.zip"
                className="hidden"
                onChange={(e) => handleMultipleFiles(e.target.files)}
              />
            </label>
          </div>
        </div>

        {/* Box 2: Rules of Matching */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Reglas de Coincidencia Estricta:</span>
          </div>
          <ul className="space-y-1.5 list-disc list-inside">
            <li><strong>7701234567890.jpg:</strong> Coincidencia directa con producto que tenga ese EAN.</li>
            <li><strong>7701234567890_front.png:</strong> Soporta sufijos separados por guión bajo o medio.</li>
            <li><strong>Sin coincidencias aproximadas:</strong> Para evitar asignaciones erróneas en inventarios masivos.</li>
            <li><strong>Verificación humana:</strong> Cada imagen puede ser confirmada, reemplazada o desvinculada.</li>
          </ul>
        </div>
      </div>

      {/* Candidates Work Area */}
      {candidates.length > 0 && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Bandeja de Imágenes Procesadas ({candidates.length})
              </h2>
              <div className="flex flex-wrap gap-2 text-xs mt-1 text-slate-500">
                <span className="text-emerald-600 font-semibold">{exactCount} coincidencia exacta</span>
                <span>•</span>
                <span className="text-blue-600 font-semibold">{confirmedCount} confirmadas</span>
                <span>•</span>
                <span className="text-amber-600 font-semibold">{unlinkedCount} sin EAN coincidente</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {exactCount > 0 && (
                <button
                  onClick={handleConfirmAllExact}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar Todas las Coincidencias ({exactCount})</span>
                </button>
              )}

              <button
                onClick={() => setCandidates([])}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                title="Limpiar bandeja"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Cards of Candidates */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCandidates.map((cand) => {
              const matchedProduct = products.find((p) => p.id === cand.matchedProductId);

              return (
                <div
                  key={cand.id}
                  className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3 flex flex-col justify-between"
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="w-20 h-20 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                      <img
                        src={cand.dataUrl}
                        alt={cand.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1 text-xs">
                      <span className="font-mono font-bold text-slate-900 dark:text-white truncate block">
                        {cand.filename}
                      </span>
                      <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                        EAN extraído:{' '}
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {cand.eanExtracted || 'No detectado'}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div className="mt-2">
                        {cand.matchStatus === 'exact_match' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 rounded-md">
                            <CheckCircle2 className="w-3 h-3" />
                            Coincidencia exacta
                          </span>
                        )}
                        {cand.matchStatus === 'confirmed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-blue-800 bg-blue-100 dark:bg-blue-950/80 dark:text-blue-300 rounded-md">
                            <Check className="w-3 h-3" />
                            Asociación confirmada
                          </span>
                        )}
                        {cand.matchStatus === 'pending_review' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/80 dark:text-amber-300 rounded-md">
                            <AlertCircle className="w-3 h-3" />
                            Pendiente revisión
                          </span>
                        )}
                        {(cand.matchStatus === 'no_image' || cand.matchStatus === 'invalid_image') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-slate-600 bg-slate-200 dark:bg-slate-700 rounded-md">
                            <HelpCircle className="w-3 h-3" />
                            Sin producto coincidente
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Matched Product Details */}
                  {matchedProduct ? (
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Producto Vinculado:</span>
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {matchedProduct.name}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-0.5">
                        <span>SKU: {matchedProduct.sku}</span>
                        <span>{formatPrice(matchedProduct.price)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900/60 rounded-xl text-xs text-slate-500 italic">
                      No se encontró ningún producto con este EAN en el inventario.
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      onClick={() => setManualModalCandidate(cand)}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {matchedProduct ? 'Cambiar Producto' : 'Asociar Manualmente'}
                    </button>

                    <div className="flex items-center gap-2">
                      {cand.matchStatus === 'exact_match' && (
                        <button
                          onClick={() => handleConfirmCandidate(cand)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 rounded-lg shadow-xs transition"
                        >
                          Confirmar
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveCandidate(cand.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        title="Descartar de la bandeja"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Association Modal (Método D) */}
      {manualModalCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Asociar Imagen Manualmente
              </h3>
              <button
                onClick={() => setManualModalCandidate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                <img
                  src={manualModalCandidate.dataUrl}
                  alt={manualModalCandidate.filename}
                  className="w-14 h-14 object-cover rounded-xl"
                />
                <div className="text-xs">
                  <span className="font-mono font-bold text-slate-900 dark:text-white block">
                    {manualModalCandidate.filename}
                  </span>
                  <span className="text-slate-500">
                    EAN extraído: {manualModalCandidate.eanExtracted || 'Ninguno'}
                  </span>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto por nombre, SKU o EAN..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              {/* Product picker list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                {products
                  .filter((p) => {
                    if (!productSearch) return true;
                    const q = productSearch.toLowerCase();
                    return (
                      p.name.toLowerCase().includes(q) ||
                      p.sku.toLowerCase().includes(q) ||
                      (p.ean && p.ean.toLowerCase().includes(q))
                    );
                  })
                  .map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleAssignManualProduct(p.id)}
                      className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {p.name}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                          <span>SKU: {p.sku}</span>
                          <span>•</span>
                          <span>EAN: {p.ean || 'Sin EAN'}</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Seleccionar →
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setManualModalCandidate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Inventory Image Status Table */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
            Auditoría de Imágenes en el Inventario General
          </h3>
          <span className="text-xs text-slate-500">
            {products.filter((p) => p.imageUrl && p.imageVerified).length} de {products.length} verificadas
          </span>
        </div>

        {loadingInventory ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-900 dark:border-emerald-500 border-t-transparent" />
          </div>
        ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {products.map((p) => (
            <div
              key={p.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    {p.name}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                    <span>SKU: {p.sku}</span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      EAN: {p.ean || 'Sin EAN'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                {p.imageUrl ? (
                  p.imageVerified ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/70 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verificada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/70 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Pendiente verificación
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Sin imagen asociada
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};
