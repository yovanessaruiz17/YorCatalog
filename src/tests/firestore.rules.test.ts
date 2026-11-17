/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: CONTRATOS DE REGLAS FIRESTORE, STORAGE Y MULTI-TENANT [A]
 * Verifica estáticamente:
 * - firestore.rules y firebase-blueprint.json (membresías, invitaciones, roles owner/admin/member, email verificado).
 * - storage.rules (default deny, raster-only, anti-SVG, anti-enumeración, anti-sobrescritura, metadata).
 * - firebase.json y firestore.indexes.json (base dedicada e índices collectionGroup).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('[A] Paridad y Contratos de Seguridad en firestore.rules, storage.rules y firebase-blueprint.json', () => {
  const rulesPath = resolve(process.cwd(), 'firestore.rules');
  const storageRulesPath = resolve(process.cwd(), 'storage.rules');
  const firebaseJsonPath = resolve(process.cwd(), 'firebase.json');
  const indexesPath = resolve(process.cwd(), 'firestore.indexes.json');
  const blueprintPath = resolve(process.cwd(), 'firebase-blueprint.json');

  const rules = readFileSync(rulesPath, 'utf-8');
  const storageRules = readFileSync(storageRulesPath, 'utf-8');
  const firebaseJson = JSON.parse(readFileSync(firebaseJsonPath, 'utf-8'));
  const indexesJson = JSON.parse(readFileSync(indexesPath, 'utf-8'));
  const blueprint = JSON.parse(readFileSync(blueprintPath, 'utf-8'));

  it('deben existir firestore.rules, storage.rules, firebase.json, firestore.indexes.json y firebase-blueprint.json válidos', () => {
    expect(existsSync(rulesPath)).toBe(true);
    expect(existsSync(storageRulesPath)).toBe(true);
    expect(existsSync(firebaseJsonPath)).toBe(true);
    expect(existsSync(indexesPath)).toBe(true);
    expect(existsSync(blueprintPath)).toBe(true);

    expect(blueprint.entities.UserMembership).toBeDefined();
    expect(blueprint.entities.WorkspaceInvitation).toBeDefined();
    expect(blueprint.firestore['/users/{userId}/memberships/{workspaceId}']).toBeDefined();
    expect(blueprint.firestore['/workspaces/{workspaceId}/invitations/{invitationId}']).toBeDefined();

    expect(firebaseJson.firestore.rules).toBe('firestore.rules');
    expect(firebaseJson.firestore.database).toBeTruthy();
    expect(firebaseJson.storage.rules).toBe('storage.rules');
    expect(Array.isArray(indexesJson.indexes)).toBe(true);
  });

  it('debe tener deny-by-default global en la raíz de firestore.rules y storage.rules', () => {
    expect(rules).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
    expect(storageRules).toMatch(/match \/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;/);
  });

  it('debe exigir verificación de correo e identidad para acceder a colecciones privadas de workspace', () => {
    expect(rules).toContain('function isVerifiedUser()');
    expect(rules).toContain('request.auth.token.email_verified == true');
    expect(rules).toContain('function isWorkspaceMember(workspaceId)');
    expect(rules).toContain('function isWorkspaceAdmin(workspaceId)');
    expect(rules).toContain('function isWorkspaceOwner(workspaceId)');
  });

  it('debe soportar descubrimiento de workspaces colaborativos en /users/{userId}/memberships/{workspaceId} sin get() en allow list ni autoescalación', () => {
    expect(rules).toMatch(/match \/memberships\/\{workspaceId\}[\s\S]*allow list: if isOwner\(userId\);/);
    expect(rules).toContain('getAfter(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(userId)).data.role == incoming().role');
  });

  it('debe proteger el ciclo de invitaciones contra autoescalación y limitar la lectura por collectionGroup al correo verificado del destinatario', () => {
    expect(rules).toContain("data.role in ['admin', 'member']");
    expect(rules).toContain('hasVerifiedEmailMatch(existing().email)');
    expect(rules).toContain("existing().status == 'pending'");
    expect(rules).toContain("incoming().status == 'accepted'");
    expect(rules).toMatch(/match \/\{path=\*\*\/?\}?\/invitations\/\{invitationId\}/);
    expect(rules).toContain('resource.data.email == request.auth.token.email.lower()');
  });

  it('debe separar permisos entre owner, admin y member (settings, publicación, eliminación de catálogos/pedidos)', () => {
    expect(rules).toMatch(/match \/workspaces\/\{workspaceId\}[\s\S]*allow update: if isWorkspaceAdmin\(workspaceId\)/);
    expect(rules).toMatch(/match \/catalogs\/\{catalogId\}[\s\S]*allow delete: if isWorkspaceAdmin\(workspaceId\)/);
    expect(rules).toMatch(/match \/orders\/\{orderId\}[\s\S]*allow delete: if isWorkspaceAdmin\(workspaceId\)/);
    expect(rules).toMatch(/match \/publishedCatalogs\/\{shareToken\}[\s\S]*isWorkspaceAdmin\(incoming\(\)\.workspaceId\)/);
  });

  it('debe prohibir estrictamente el listado (allow list: if false) en /publishedCatalogs/{shareToken} y /users/{userId}', () => {
    expect(rules).toMatch(/match \/users\/\{userId\}[\s\S]*allow list: if false;/);
    expect(rules).toMatch(/match \/publishedCatalogs\/\{shareToken\}[\s\S]*allow list: if false;/);
  });

  it('debe permitir get público en /publishedCatalogs/{shareToken} únicamente cuando status == published', () => {
    expect(rules).toMatch(
      /match \/publishedCatalogs\/\{shareToken\}[\s\S]*allow get: if isValidId\(shareToken\) && resource != null && existing\(\)\.status == 'published';/
    );
  });

  it('debe restringir la creación pública de pedidos a estado whatsapp_opened ligado a un shareToken publicado válido', () => {
    expect(rules).toContain("incoming().status == 'whatsapp_opened'");
    expect(rules).toContain(
      'exists(/databases/$(database)/documents/publishedCatalogs/$(incoming().catalogShareToken))'
    );
    expect(rules).toContain(
      "get(/databases/$(database)/documents/publishedCatalogs/$(incoming().catalogShareToken)).data.status == 'published'"
    );
  });

  it('storage.rules debe aplicar defensa en profundidad Broker-First: bloquear escrituras/listados/lecturas privadas directas y permitir solo get en public-catalogs', () => {
    expect(storageRules).toContain('match /catalog-images/{workspaceId}/{fileName}');
    expect(storageRules).toContain('match /workspace-private/{workspaceId}/{fileName}');
    expect(storageRules).toContain('match /public-catalogs/{workspaceId}/{catalogId}/{fileName}');
    expect(storageRules).toContain('allow list: if false;');
    expect(storageRules).toContain('allow create, update, delete: if false;');
    expect(storageRules).toContain("fileName.matches('(?i).*\\\\.svg$')");
    expect(storageRules).toContain('isSafeImageFileName(fileName)');

    const storageRulesCodeOnly = storageRules.replace(/\/\/.*$/gm, '');
    // Prohibición explícita de regla permisiva global
    expect(storageRulesCodeOnly).not.toMatch(/allow\s+write:\s*if\s*request\.auth\s*!=\s*null/);
    // Lecturas y mutaciones directas de clientes bloqueadas en rutas privadas (solo vía Storage Broker V4 Signed URL)
    expect(storageRulesCodeOnly).toMatch(
      /match \/catalog-images\/\{workspaceId\}\/\{fileName\}[\s\S]*allow get, list: if false;\s*allow create, update, delete: if false;/
    );
    expect(storageRulesCodeOnly).toMatch(
      /match \/workspace-private\/\{workspaceId\}\/\{fileName\}[\s\S]*allow get, list: if false;\s*allow create, update, delete: if false;/
    );
    // Activos públicos: solo get individual sin list ni escrituras cliente
    expect(storageRulesCodeOnly).toMatch(
      /match \/public-catalogs\/\{workspaceId\}\/\{catalogId\}\/\{fileName\}[\s\S]*allow get: if isValidSegment\(workspaceId\) &&\s*isValidSegment\(catalogId\) &&\s*isSafeImageFileName\(fileName\);\s*allow list: if false;\s*allow create, update, delete: if false;/
    );
  });
});
