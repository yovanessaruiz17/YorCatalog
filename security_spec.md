# Security Specification — YorCatalog Firestore Rules (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every workspace subcollection (`/categories`, `/products`, `/importJobs`, `/catalogs`, `/orders`) is strictly bound to an active membership in `/workspaces/{workspaceId}/members/{uid}` or workspace `ownerId`.
2. **PII Isolation**: User profiles (`/users/{userId}`) and customer orders (`/workspaces/{workspaceId}/orders/{orderId}`) cannot be read (`get` or `list`) by unauthenticated clients or users belonging to other workspaces.
3. **Anti-Enumeration of Public Catalogs**: `/publishedCatalogs/{shareToken}` strictly prohibits `list` queries (`allow list: if false;`) and allows single-document `get` ONLY when `resource.data.status == 'published'`.
4. **Validated Public Order Submission (`submit_public_order`)**: Unauthenticated customers can `create` an order in `/workspaces/{workspaceId}/orders/{orderId}` ONLY if the payload references an existing `published` catalog in `/publishedCatalogs/{catalogShareToken}` whose `workspaceId` matches `{workspaceId}` and whose initial `status` is `'whatsapp_opened'`. They can never `read`, `update`, or `delete` orders.
5. **Temporal Integrity & Path Hardening**: All document IDs are validated against `^[a-zA-Z0-9_\-]+$` (`<= 128` chars) and `createdAt`/`updatedAt` timestamps must match `request.time` (`serverTimestamp()`).
6. **Zero Shadow Fields**: All `create` operations enforce `keys().hasAll(...)` and `keys().hasOnly(...)`; all `update` operations enforce `affectedKeys().hasOnly(...)` and preserve immutable fields (`id`, `workspaceId`, `ownerId`, `createdAt`).

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Cross-Tenant Read**: Tenant A attempts `get`/`list` on `/workspaces/ws-tenant-B/products`.
2. **Cross-Tenant Write**: Tenant A attempts `create`/`update`/`delete` on `/workspaces/ws-tenant-B/products/prod-1`.
3. **Shadow Field Injection (Ghost Field)**: Authenticated user creates a product or member including extra field `isAdmin: true` or `shadowRole: 'super'`.
4. **Role Self-Escalation**: Non-owner member attempts to update `/workspaces/{wsId}/members/{uid}` changing `role` from `'member'` to `'owner'`.
5. **Unauthenticated PII Read**: Anonymous client attempts `get` or `list` on `/users/{uid}` or `/workspaces/{wsId}/orders`.
6. **Public Catalog Enumeration**: Anonymous client attempts `list` query on `/publishedCatalogs`.
7. **Draft Catalog Leakage**: Anonymous client attempts `get` on `/publishedCatalogs/{token}` where `status == 'draft'`.
8. **Fake Public Order Injection**: Anonymous client submits order with `status: 'confirmed'` instead of `'whatsapp_opened'`, or referencing a non-existent/draft `catalogShareToken`, or mismatched `workspaceId`.
9. **Path Variable Poisoning**: Client attempts to create document with 2KB ID or `../evil` path traversal string.
10. **Payload Size Poisoning (Denial of Wallet)**: Client submits product with 50KB `name` (> 200 chars) or > 500 items array in catalog/order.
11. **Timestamp Forgery**: Client creates/updates document with backdated client timestamp instead of `request.time`.
12. **Immutable Ownership Hijack**: Client attempts to update `workspaceId` or `ownerId` or `createdAt` on an existing catalog/workspace.
