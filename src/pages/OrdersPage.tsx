/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PANEL DE RECEPCIÓN Y AUDITORÍA DE PEDIDOS POR WHATSAPP (FASE 4)
 * Permite al comercio monitorear los pedidos preparados por los clientes,
 * auditar el snapshot inmutable de precios y productos, cambiar el estado
 * comercial ('whatsapp_opened' -> 'confirmed' | 'cancelled') y abrir
 * directamente la conversación con el cliente.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  Phone,
  Send,
  AlertCircle,
  ExternalLink,
  Info,
  Search,
  Filter,
  Trash2,
  Check,
  X,
  MapPin,
  Calendar,
  Layers,
  ArrowUpDown,
  BookOpen,
  Copy,
  User,
  MessageSquare,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { mockDataService } from '../services/mockDataService';
import { Order, OrderStatus } from '../types';

export const OrdersPage: React.FC = () => {
  const { t, formatPrice, formatDate, settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catalogFilter, setCatalogFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const loadOrders = () => {
    mockDataService.getOrders().then(setOrders);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    await mockDataService.updateOrderStatus(orderId, newStatus);
    loadOrders();
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    await mockDataService.deleteOrder(orderToDelete);
    loadOrders();
    if (selectedOrder?.id === orderToDelete) {
      setSelectedOrder(null);
    }
    setOrderToDelete(null);
  };

  // Obtener lista única de catálogos representados en las órdenes
  const catalogsInOrders = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.catalogId && o.catalogTitle) {
        map.set(o.catalogId, o.catalogTitle);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [orders]);

  // Filtrado reactivo de pedidos
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }
      if (catalogFilter !== 'all' && o.catalogId !== catalogFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchNumber = o.orderNumber.toLowerCase().includes(q);
        const matchName = o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone ? o.customerPhone.includes(q) : false;
        const matchCatalog = o.catalogTitle ? o.catalogTitle.toLowerCase().includes(q) : false;
        if (!matchNumber && !matchName && !matchPhone && !matchCatalog) {
          return false;
        }
      }
      return true;
    });
  }, [orders, statusFilter, catalogFilter, searchTerm]);

  // Métricas de Pedidos
  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const whatsappOpened = orders.filter((o) => o.status === 'whatsapp_opened').length;
    const confirmed = orders.filter((o) => o.status === 'confirmed').length;
    const totalRevenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return { totalOrders, whatsappOpened, confirmed, totalRevenue };
  }, [orders]);

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'confirmed':
        return {
          label: 'Confirmado por Comercio',
          bg: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        };
      case 'whatsapp_opened':
        return {
          label: 'Enlace WhatsApp Abierto',
          bg: 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        };
      case 'prepared':
        return {
          label: 'Preparado en Borrador',
          bg: 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        };
      case 'cancelled':
        return {
          label: 'Cancelado / Descartado',
          bg: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700',
        };
      default:
        return {
          label: 'Pendiente',
          bg: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        };
    }
  };

  const getCustomerWhatsAppUrl = (order: Order) => {
    if (order.customerPhone) {
      const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(
        `¡Hola ${order.customerName}! Te contactamos de ${settings.businessName || 'YorCatalog'} en relación a tu pedido ${order.orderNumber}.`
      );
      return `https://wa.me/${cleanPhone}?text=${msg}`;
    }
    const storePhone = settings.whatsappNumber ? settings.whatsappNumber.replace(/[^0-9]/g, '') : '';
    return `https://wa.me/${storePhone}?text=${encodeURIComponent(
      `Consulta sobre Pedido ${order.orderNumber} a nombre de ${order.customerName}`
    )}`;
  };

  const copyOrderSummary = (order: Order) => {
    const lines = [
      `Pedido: ${order.orderNumber}`,
      `Catálogo: ${order.catalogTitle || 'General'} (v${order.catalogVersion || 1})`,
      `Cliente: ${order.customerName}`,
      order.customerPhone ? `Teléfono: ${order.customerPhone}` : '',
      order.customerAddress ? `Dirección: ${order.customerAddress}` : '',
      `Total: ${formatPrice(order.totalAmount)}`,
      '',
      'Artículos:',
      ...order.items.map((it) => `- ${it.quantity}x ${it.name} (${formatPrice(it.price * it.quantity)})`),
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-md">
              Fase 4 Activa
            </span>
            <span className="text-xs text-slate-400">Recepción & Auditoría de Pedidos</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t.orders.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Supervisa las órdenes armadas en las revistas virtuales y valida su confirmación comercial en WhatsApp.
          </p>
        </div>
      </div>

      {/* Banner de Transparencia del Flujo de Pedidos */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl flex items-start gap-3 text-xs text-blue-900 dark:text-blue-200">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <strong className="block font-bold">Transparencia en el Registro de Pedidos:</strong>
          <p>
            • <strong>Enlace WhatsApp abierto:</strong> Indica que el cliente armó su carrito en la revista y abrió WhatsApp con el mensaje codificado.
          </p>
          <p>
            • <strong>Confirmación Comercial:</strong> El pedido <em>no se asume confirmado automáticamente</em> por el sistema. Tu equipo comercial debe acordar el pago o la entrega con el cliente en WhatsApp y luego pulsar <strong>"Confirmar Pedido"</strong>.
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Pedidos</span>
            <ShoppingBag className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3 font-mono font-black text-2xl text-slate-900 dark:text-white">
            {metrics.totalOrders}
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">Registrados en backoffice</span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Abierto</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="mt-3 font-mono font-black text-2xl text-slate-900 dark:text-white">
            {metrics.whatsappOpened}
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">Pendientes de confirmación</span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Confirmados</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-3 font-mono font-black text-2xl text-slate-900 dark:text-white">
            {metrics.confirmed}
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">Ventas validadas</span>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Monto Liquidado</span>
            <span className="text-xs font-mono font-bold text-emerald-600">COP</span>
          </div>
          <div className="mt-3 font-mono font-black text-2xl text-slate-900 dark:text-white truncate">
            {formatPrice(metrics.totalRevenue)}
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">Órdenes activas</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, cliente, teléfono o catálogo..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por Catálogo */}
          {catalogsInOrders.length > 0 && (
            <select
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos los Catálogos</option>
              {catalogsInOrders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}

          {/* Filtro por Estado */}
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'whatsapp_opened', label: 'WhatsApp Abierto' },
              { id: 'confirmed', label: 'Confirmados' },
              { id: 'cancelled', label: 'Descartados' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de Pedidos */}
      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
          <ShoppingBag className="w-10 h-10 mx-auto text-slate-400 stroke-1" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            No se encontraron pedidos
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all' || catalogFilter !== 'all'
              ? 'Intenta ajustar los filtros de búsqueda.'
              : 'Los pedidos que los clientes armen desde la revista pública aparecerán aquí.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const badge = getStatusBadge(order.status);
            return (
              <div
                key={order.id}
                className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                {/* Cabecera del Pedido */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {order.orderNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                    {order.catalogTitle && (
                      <span className="hidden md:inline-flex text-[11px] text-slate-400">
                        Catálogo: {order.catalogTitle} (v{order.catalogVersion || 1}.0)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>

                {/* Cliente e Ítems del Snapshot */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Datos del Cliente */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Datos del Cliente
                    </span>
                    <p className="font-bold text-sm text-slate-900 dark:text-white">
                      {order.customerName}
                    </p>
                    {order.customerPhone && (
                      <p className="text-slate-600 dark:text-slate-300 font-mono flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{order.customerPhone}</span>
                      </p>
                    )}
                    {(order.customerCity || order.customerAddress) && (
                      <p className="text-slate-500 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {[order.customerAddress, order.customerCity].filter(Boolean).join(', ')}
                        </span>
                      </p>
                    )}
                    {order.notes && (
                      <p className="mt-2 text-xs italic text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        "{order.notes}"
                      </p>
                    )}
                  </div>

                  {/* Resumen de Productos */}
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Artículos ({order.itemsCount} unidades)
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                              {item.quantity}x {item.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              SKU: {item.sku} {item.ean && `| EAN: ${item.ean}`}
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white shrink-0">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer de Acciones y Cambio de Estado */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Total Liquidado:</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                      {formatPrice(order.totalAmount)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
                    >
                      Ver Detalle Completo
                    </button>

                    {order.status !== 'confirmed' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'confirmed')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirmar Pedido</span>
                      </button>
                    )}

                    {order.status !== 'cancelled' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:text-rose-600 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>
                    )}

                    {/* Enlace seguro a WhatsApp sin window.open */}
                    <a
                      href={getCustomerWhatsAppUrl(order)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Chat WhatsApp</span>
                    </a>

                    <button
                      onClick={() => setOrderToDelete(order.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition"
                      title="Eliminar del registro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ──────────────── MODAL DE DETALLE COMPLETO DEL PEDIDO ──────────────── */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {selectedOrder.orderNumber}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                    getStatusBadge(selectedOrder.status).bg
                  }`}
                >
                  {getStatusBadge(selectedOrder.status).label}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Origen del Catálogo */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Origen de la Orden
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {selectedOrder.catalogTitle || 'Catálogo General'}
                </p>
                <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                  <span>Versión: v{selectedOrder.catalogVersion || 1}.0</span>
                  <span>•</span>
                  <span>Fecha: {formatDate(selectedOrder.createdAt)}</span>
                </div>
              </div>

              {/* Datos del Cliente */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Datos de Contacto del Cliente
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Nombre:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{selectedOrder.customerName}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Teléfono:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {selectedOrder.customerPhone || 'No proporcionado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Ciudad:</span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {selectedOrder.customerCity || 'No especificada'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Dirección:</span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {selectedOrder.customerAddress || 'No especificada'}
                    </span>
                  </div>
                </div>
                {selectedOrder.notes && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 block">Observaciones:</span>
                    <p className="italic text-slate-700 dark:text-slate-300">"{selectedOrder.notes}"</p>
                  </div>
                )}
              </div>

              {/* Desglose de Productos */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Artículos del Snapshot Inmutable
                </span>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-900 dark:text-white block truncate">
                          {item.quantity}x {item.name}
                        </span>
                        <div className="text-[10px] font-mono text-slate-400">
                          SKU: {item.sku} {item.ean && `• EAN: ${item.ean}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {formatPrice(item.price)} c/u
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total y Resumen */}
              <div className="p-4 bg-slate-950 text-white rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Total Liquidado:</span>
                  <span className="text-xl font-extrabold font-mono text-emerald-400">
                    {formatPrice(selectedOrder.totalAmount)}
                  </span>
                </div>
                <button
                  onClick={() => copyOrderSummary(selectedOrder)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
                >
                  {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSummary ? 'Copiado' : 'Copiar Resumen'}</span>
                </button>
              </div>
            </div>

            {/* Acciones en Modal */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {selectedOrder.status !== 'confirmed' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'confirmed')}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
                  >
                    Confirmar Pedido
                  </button>
                )}
                {selectedOrder.status !== 'cancelled' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl hover:text-rose-600 transition"
                  >
                    Descartar
                  </button>
                )}
              </div>

              <a
                href={getCustomerWhatsAppUrl(selectedOrder)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Contactar en WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── DIÁLOGO DE CONFIRMACIÓN DE ELIMINACIÓN ──────────────── */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                ¿Eliminar este pedido del registro?
              </h3>
              <p className="text-xs text-slate-500">
                Esta acción eliminará el registro histórico del pedido de tu backoffice.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteOrder}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
