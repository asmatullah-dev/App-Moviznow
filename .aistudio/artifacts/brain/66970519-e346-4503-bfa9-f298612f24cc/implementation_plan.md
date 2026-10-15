# Fix Manual Sync Failures & Solidify User Expiry Policies

Resolve the "Sync failed" errors triggered by the header and user profile menu refresh buttons for normal users, explain how "Lifetime" access originated on recent users, and guarantee consistent expiry rules (keeping new registrants blank until admin approval while preserving existing Lifetime access).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed with the user:
> - **Manual Sync Failure Scope**: Occurs on the home screen normal user refresh button in the header and within the user profile menu popup.
> - **New User Expiry Default**: Newly registered users will always have an empty/blank expiry field (`null` / `""`) and a `pending` status until manually reviewed and approved with an expiry date by an administrator.
> - **Existing Lifetime Users**: Existing non-admin accounts that currently have "Lifetime" expiry will remain completely untouched and valid, retaining their Lifetime access.

---

## 1. Overview & Root Cause Analysis

### A. Root Cause: Why Did Recent Users (2-3 Days Ago) Show "Lifetime"?
1. **Admin Bulk & Quick Actions**: In the Admin User Management panel (`UserManagement.tsx`), administrators have single-click quick action buttons (`👑 Lifetime Access`) in both the "Add User" and "Edit User" dialogs. When an administrator clicked "Lifetime" while setting up or approving users, the user's `expiryDate` was saved as `"Lifetime"`.
2. **Account Linking / Deduplication (`findMatches`)**: In `AuthContext.tsx` (`findMatches`), when an existing record is matched by phone or email during login/signup, the merge logic explicitly stated:
   ```ts
   // Expiry Date Logic: "Lifetime" wins, otherwise latest date
   if (data.expiryDate === "Lifetime" || acc.expiryDate === "Lifetime") {
     betterExpiry = "Lifetime";
   }
   ```
   If a matching record previously had Lifetime access, the newly linked account inherited Lifetime.
3. **Newer Registrations**: In contrast, newer users registering directly via the public email or phone signup forms were saved without an expiry date (blank), resulting in no expiry date shown until an admin takes action.

### B. Root Cause: Why Did the Manual Sync Buttons Show "Sync Failed"?
1. **Missing `uid` in `SyncUserDataManager.tsx` Batch Push**: When normal users trigger the manual refresh button from the header (`HeaderRefreshButton`) or user profile menu (`UserProfileMenu`), `RefreshAppDataManager` invokes `executeSyncUserData`. In `SyncUserDataManager.tsx`:
   - `updatesToPush` is constructed with local queues (favorites, watch later, timeSpent, etc.) but was missing `uid: currentUserUid`.
   - In Firestore security rules, if a document write is evaluated as `create` or requires identity assertion (`request.resource.data.uid == userId`), the batch commit fails with `permission-denied`.
2. **`undefined` Field Values in WriteBatch**: In Firestore JS SDK, if any property in an object passed to `batch.set(..., { merge: true })` contains `undefined` (e.g., `preferredTheme`, uninitialized phone, or partial pending profile fields), Firestore throws:
   `FirebaseError: Function WriteBatch.set() called with invalid data. Unsupported field value: undefined`.
   This immediately caused `executeSyncUserData` to catch an error and return `false`, which caused `RefreshAppDataManager` to dispatch `sync_status: { status: 'error', message: 'Sync failed. Please retry.' }`.
3. **Duplicate Concurrent Writes**: Both `AuthContext.tsx` (`refreshProfile`) and `SyncUserDataManager.tsx` were attempting simultaneous batch writes to `chunk_meta/versions` and `users/{uid}`, causing racing condition errors.

---

## 2. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   User Interaction                     │
│  [Header Refresh Button]   [User Profile Menu Refresh]  │
└───────────────────────────┬────────────────────────────┘
                            │ triggers
                            ▼
┌────────────────────────────────────────────────────────┐
│              RefreshAppDataManager.tsx                 │
│                                                        │
│  Step 1: Check chunk_meta version                      │
│          Refresh App Settings & Notifications          │
│          Refresh User Profile from Firestore           │
│                                                        │
│  Step 2: executeSyncUserData()                         │
│          • Strip all `undefined` values recursively    │
│          • Guarantee `uid` field in updatesToPush      │
│          • Safe fallback if chunk_meta version fails   │
│                                                        │
│  Step 3: Dispatch clean success status                 │
│          "Refresh & Sync completed" / "Data up-to-date"│
└───────────────────────────┬────────────────────────────┘
                            │ writes via sanitized batch
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Firestore / Cache                    │
│   • users/{uid} (sanitized, valid data only)           │
│   • chunk_meta/versions (synced)                       │
│   • safeStorage & localStorage (profile_cache)         │
└───────────────────────────┬────────────────────────────┘
```

---

## 3. Proposed Changes & Implementation Strategy

### 1. Robust Fix for Manual Refresh & Sync (`SyncUserDataManager.tsx` & `RefreshAppDataManager.tsx`)
- **Sanitize Write Payloads**: Introduce a strict recursive sanitization utility that strips all `undefined` fields and NaN values from `updatesToPush` before sending to Firestore.
- **Enforce Document UID**: Guarantee `updatesToPush.uid = currentUserUid` so security rule validation (`request.resource.data.uid == userId`) always passes.
- **Fault-Tolerant Version Update**: Wrap `chunk_meta/versions` update in a secondary safety net so that even if chunk metadata write faces transient throttles, the primary user data document write succeeds cleanly without showing a false "Sync failed" banner.
- **De-duplicate Concurrency**: Ensure `refreshProfile` and `executeSyncUserData` do not race to write duplicate payloads to `users/{uid}` during manual button triggers.
- **Accurate Feedback Banner**: Dispatch accurate progress states (`syncing` -> `success` / `up-to-date`) ensuring the user receives clear and reassuring feedback.

### 2. User Expiry Date Normalization & Policy Enforcement
- **Preserve Existing Lifetime Users**: In `normalizeUserStatusAndExpiry` (`src/contexts/UsersContext.tsx`) and `src/contexts/AuthContext.tsx`:
  - If a user's record has `expiryDate === 'Lifetime'`, leave it intact as active Lifetime access, whether the user is an owner, admin, or regular user.
- **Default for New Users**:
  - In all public registration flows (`signUpWithEmail`, `signUpWithPhoneAndPassword`, and Google Sign-In initial profile creation in `AuthContext.tsx`), ensure `expiryDate` defaults strictly to `null` and `status` to `'pending'` (unless the email belongs to the predefined owner/admin whitelist).
  - Newly registered users will display with a blank/empty expiry field in admin tables until an administrator approves them and assigns an expiry date.
- **Add User Modal Consistency**: In `UserManagement.tsx`, ensure the "Add User" form does not assign an unexpected default expiry date when an admin intends to create a pending user.

---

## 4. Verification Plan

### Automated Build & Syntax Verification
- Run `compile_applet` to verify TypeScript compilation, JSX syntax, and module imports.

### Functional Verification
1. **Manual Sync Button Verification**:
   - Verify that clicking the header refresh button transitions from spinning icon to success toast without throwing "Sync failed".
   - Verify that clicking the User Profile menu refresh option executes the same clean pipeline and shows success.
2. **Offline Handling**:
   - Verify offline warning toast displays properly when internet is disconnected, without corrupting local queues.
3. **Expiry Date Integrity**:
   - Verify that existing users with `expiryDate: "Lifetime"` retain their lifetime status and are not modified or expired.
   - Verify that new signups receive `expiryDate: null` and `status: "pending"` with clean blank input fields until admin approval.
