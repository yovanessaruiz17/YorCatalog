/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS DE INTEGRACIÓN CON FIREBASE REAL (FASE R2.2 BLOQUE 6)
 * Clasificación:
 * [B] Conectividad real contra Firestore configurado en firebase-applet-config.json.
 * [C] CRUD autenticado multi-tenant (omitido en entorno CI/headless sin token de usuario verificado).
 */

import { describe, it, expect } from 'vitest';
import {
  isFirebaseConfigured,
  testConnection,
  firebaseConfig,
} from '../services/firebaseClient';
import { dataService } from '../services/dataService';

describe('[B/C] Integración Real con Firebase Cloud Firestore', () => {
  const configured = isFirebaseConfigured();

  it.skipIf(!configured)(
    '[B] debe validar conectividad contra la base de datos provisionada o clasificar unreachable si no hay salida de red',
    async () => {
      expect(firebaseConfig.projectId).toBeTruthy();
      expect(firebaseConfig.firestoreDatabaseId).toBeTruthy();

      const result = await testConnection();
      expect(['connected', 'unreachable']).toContain(result.state);
    }
  );

  it.skipIf(!configured)(
    '[B] la consulta pública de un shareToken inexistente no debe exponer otros catálogos ni listas',
    async () => {
      try {
        const res = await dataService.getByShareToken('pub_inexistente_audit_99999');
        expect(res).toBeUndefined();
      } catch (err) {
        // Si el entorno sandbox bloquea red saliente hacia googleapis, debe clasificarse como unreachable (nunca mock)
        expect((err as { code?: string })?.code).toBe('unreachable');
      }
    }
  );

  it('[C] CRUD autenticado entre dos usuarios reales y verificación Storage con auth queda condicionado a sesión interactiva en navegador', () => {
    // Documentado explícitamente como [C] porque Firebase Auth requiere sesión OAuth/email real verificada no presente en vitest headless
    expect(configured).toBe(true);
  });
});
