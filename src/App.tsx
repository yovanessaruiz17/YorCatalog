/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { ImportPage } from './pages/ImportPage';
import { ImagesPage } from './pages/ImagesPage';
import { CatalogsPage } from './pages/CatalogsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { MagazinePage } from './pages/MagazinePage';
import { OrdersPage } from './pages/OrdersPage';
import { SettingsPage } from './pages/SettingsPage';

import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { PublicMagazinePage } from './pages/PublicMagazinePage';

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            {/* Rutas Públicas de Revista Virtual (Sin autenticación, sin sidebar) */}
            <Route path="/m/:shareToken" element={<PublicMagazinePage />} />
            <Route path="/c/:shareToken" element={<PublicMagazinePage />} />

            {/* Rutas de Autenticación */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Rutas Administrativas Protegidas con Guardia de Sesión y Multi-Tenant */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="images" element={<ImagesPage />} />
              <Route path="catalogs" element={<CatalogsPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="magazine" element={<MagazinePage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
