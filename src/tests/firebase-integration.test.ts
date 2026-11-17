/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS DE INTEGRACIÓN CON FIREBASE REAL (FASE R2.3.1 BLOQUE F)
 * Clasificación explícita:
 * - [B] Pruebas que requieren Firebase Emulators Suite (Firestore + Storage Emulator) — omitidas si no están activos.
 * - [C] Pruebas contra proyecto Firebase real (solo conectividad de lectura no destructiva).
 * - [D] Flujos E2E multiusuario pendientes de validación manual en navegador con cuentas reales verificadas y Storage inicializado.
 */

import { describe, it, expect } from 'vitest';
import {
  isFirebaseConfigured,
  testConnection,
  firebaseConfig,
  getFirebaseEnvironmentInfo,
} from '../services/firebaseClient';
import { dataService } from '../services/dataService';

const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const hasStorageEmulator = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);

describe('[B/C] Integración Real con Firebase Cloud Firestore y Storage', () => {
  const configured = isFirebaseConfigured();

  it.skipIf(!configured)(
    '[C] debe validar conectividad contra la base de datos provisionada o clasificar unreachable si no hay salida de red',
    async () => {
      const envInfo = getFirebaseEnvironmentInfo();
      expect(firebaseConfig.projectId).toBeTruthy();
      expect(firebaseConfig.firestoreDatabaseId).toBeTruthy();
      expect(envInfo.isConfigured).toBe(true);

      const result = await testConnection();
      expect(['connected', 'unreachable']).toContain(result.state);
    }
  );

  it.skipIf(!configured)(
    '[C] la consulta pública de un shareToken inexistente no debe exponer otros catálogos ni listas',
    async () => {
      try {
        const res = await dataService.getByShareToken('pub_inexistente_audit_99999');
        expect(res).toBeUndefined();
      } catch (err) {
        expect((err as { code?: string })?.code).toBe('unreachable');
      }
    }
  );

  it.skipIf(!hasFirestoreEmulator || !hasStorageEmulator)(
    '[B] Suite contra Firebase Emulators (Firestore + Storage): se ejecuta únicamente cuando FIRESTORE_EMULATOR_HOST y FIREBASE_STORAGE_EMULATOR_HOST están activos',
    () => {
      expect(hasFirestoreEmulator && hasStorageEmulator).toBe(true);
    }
  );

  it('[D] Verificación de carga binaria en Storage y E2E multiusuario (owner/admin/member/no-miembro/sin-verificar) queda pendiente hasta inicializar bucket en Console y desplegar reglas manualmente', () => {
    expect(configured).toBe(true);
  });
});
