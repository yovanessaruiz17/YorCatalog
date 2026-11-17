# Security Specification — YorCatalog Firestore Rules (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every workspace subcollection (`/categories`, `/products`, `/importJobs`, `/catalogs`, `/orders`) is strictly bound to an active membership in `/workspaces/{workspaceId}/members/{uid}` or workspace `ownerId`.
2. **PII Isolation**: User profiles (`/users/{userId}`) and customer orders (`/workspaces/{workspaceId}/orders/{orderId}`) cannot be read (`get` or `list`) by unauthenticated clients or users belonging to other workspaces.
3. **Anti-Enumeration of Public Catalogs**: `/publishedCatalogs/{shareToken}` strictly prohibits `list` queries (`allow list: if false;`) and allows single-document `get` ONLY when `resource.data.status == 'published'`.
4. **Validated Public Order Submission (`submit_public_order`)**: Unauthenticated customers can `create` an order in `/workspaces/{workspaceId}/orders/{orderId}` ONLY if the payload references an existing `published` catalog in `/publishedCatalogs/{catalogShareToken}` whose `workspaceId` matches `{workspaceId}` and whose initial `status` is `'whatsapp_opened'`. They can never `read`, `update`, or `delete` orders.
5. **Temporal Integrity & Path Hardening**: All document IDs are validated against `^[a-zA-Z0-9_\-]+$` (`<= 128` chars) and `createdAt`/`updatedAt` timestamps must match `request.time` (`serverTimestamp()`).
6. **Zero Shadow Fields**: All `create` operations enforce `keys().hasAll(...)` and `keys().hasOnly(...)`; all `update` operations enforce `affectedKeys().hasOnly(...)` and preserve immutable fields (`id`, `workspaceId`, `ownerId`, `createdAt`).
7. **Collaborator Workspace Discovery (`/users/{userId}/memberships/{workspaceId}`)**: Verified users may list ONLY their own membership index (`/users/{uid}/memberships`) with zero `get()` inside `allow list`. Creating or updating a membership index is atomically coupled (`existsAfter`/`getAfter`) to `/workspaces/{workspaceId}/members/{uid}` or workspace `ownerId`.
8. **Validated Invitation Lifecycle (`/workspaces/{workspaceId}/invitations/{invitationId}`)**: Only `owner` (for `admin`/`member`) or `admin` (for `member` only) may create or revoke invitations (`role: 'owner'` is strictly forbidden). Verified invitees can list only their own pending invitations and accept them atomically via a 3-document batch ensuring role equality (`member.role == invitation.role`).
9. **Role Separation (`owner`, `admin`, `member`) & Verified Auth Gate**: Unverified email users (`email_verified == false`) are denied private Firestore & Storage operations; `member` collaborators can operate inventory/drafts/order fulfillment but cannot alter workspace settings, publish/unpublish/delete catalogs, manage team members, or delete orders.

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
13. **Unverified Email Access**: Signed-in user with `email_verified == false` attempts to read/write `/users/{uid}` or `/workspaces/{wsId}/products`.
14. **Forged Membership Index Injection**: Attacker writes `/users/{attackerUid}/memberships/{victimWsId}` without an authorized `/workspaces/{victimWsId}/members/{attackerUid}` write.
15. **Invitation Role Escalation**: Invited user accepts an invitation for `'member'` while trying to set `role: 'admin'` or `'owner'` in `/workspaces/{wsId}/members/{uid}`.
16. **Member Privilege Abuse**: Collaborator with role `'member'` attempts to update workspace settings, publish/delete a catalog, or delete an order.

