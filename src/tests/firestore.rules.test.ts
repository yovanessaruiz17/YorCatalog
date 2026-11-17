/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: CONTRATO DE REGLAS FIRESTORE Y BLUEPRINT MULTI-TENANT [A]
 * Verifica estáticamente que firestore.rules y firebase-blueprint.json mantienen paridad,
 * aislamiento por workspace, bloqueo de listado público (anti-enumeración) y estado obligatorio 'whatsapp_opened'.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('[A] Paridad y Contratos de Seguridad en firestore.rules y firebase-blueprint.json', () => {
  const rulesPath = resolve(process.cwd(), 'firestore.rules');
  const blueprintPath = resolve(process.cwd(), 'firebase-blueprint.json');
  const rules = readFileSync(rulesPath, 'utf-8');
  const blueprintRaw = readFileSync(blueprintPath, 'utf-8');
  const blueprint = JSON.parse(blueprintRaw);

  it('debe existir firestore.rules y firebase-blueprint.json válidos', () => {
    expect(existsSync(rulesPath)).toBe(true);
    expect(existsSync(blueprintPath)).toBe(true);
    expect(blueprint.entities).toBeDefined();
    expect(blueprint.firestore).toBeDefined();
  });

  it('debe tener deny-by-default global en la raíz de firestore.rules', () => {
    expect(rules).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  });

  it('debe exigir verificación de correo e identidad para acceder a colecciones privadas de workspace', () => {
    expect(rules).toContain('function isVerifiedUser()');
    expect(rules).toContain('request.auth.token.email_verified == true');
    expect(rules).toContain('function isWorkspaceMember(workspaceId)');
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
});
