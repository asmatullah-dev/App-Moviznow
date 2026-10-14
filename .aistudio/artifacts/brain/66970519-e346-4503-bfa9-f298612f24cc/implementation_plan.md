# Network Request Optimization & Unnecessary Request Elimination

Eliminate redundant background network requests across MovizNow by removing preloaded Google Identity Services (GSI) from the initial page load, disabling Firebase Analytics `webConfig` requests, and stopping unnecessary background authentication token refresh loops.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed with the user in Phase 1:

- **Confirmed Decision 1 (Google Identity Services On-Demand Loading)**: Remove the static `<script src="https://accounts.google.com/gsi/client">` from `index.html`. The script will now load strictly on-demand only when a user initiates a Google OAuth flow (e.g. Google Contacts sync in Admin or Google Sign-In), eliminating `gsi/client` and Google API script fetches for normal page loads.
- **Confirmed Decision 2 (Disable Firebase Analytics)**: Completely disable Firebase Analytics initialization in `src/firebase.ts` to eliminate recurring `v1alpha/projects/.../webConfig` network polling and telemetry pings to Google logging servers.
- **Confirmed Decision 3 (Suppress Redundant Auth Token Refresh)**: Halt proactive background token refresh polling for idle sessions and guests, preventing recurring `securetoken.googleapis.com` network calls when token refresh is not actively required for pending operations.

---

## 1. Overview & Core Concept

- **What It Does**: Streamlines the application's network footprint by removing third-party script loading on initial page render, removing telemetry/analytics overhead, and suppressing automated background token refresh loops that fire when the application is idle.
- **Target Audience / Persona**: All MovizNow visitors, mobile users on metered connections, and administrators monitoring network inspection tools.
- **Key Value**: 
  1. Drastically cleaner browser DevTools network tab without stray external pings.
  2. Faster First Contentful Paint (FCP) and lower Time to Interactive (TTI) on initial startup.
  3. Zero unwanted third-party requests on app boot while preserving full login, streaming, and database functionality.

---

## 2. User Experience & Visual Design

### Key User Flows

#### Flow 1: Clean Application Boot (Guest & Normal Browsing)
1. User navigates to the app (`/`).
2. HTML loads without third-party Google GSI scripts or analytics trackers.
3. The app initializes local cache and Firebase Firestore directly without triggering:
   - `accounts.google.com/gsi/client`
   - `firebase.googleapis.com/.../webConfig`
   - `securetoken.googleapis.com/v1/token`
4. The user browses content instantly with a silent network profile.

#### Flow 2: On-Demand Google OAuth & Contacts Sync
1. An administrator accesses **Admin Settings** or **User Management** and triggers Google Contacts synchronization or Google login.
2. The existing dynamic script loader (`googleContactsService.ts` / `AdminSettings.tsx`) checks `window.google?.accounts`.
3. If not yet loaded, it injects the GSI script dynamically at that exact moment, executes the popup flow, and caches the script for the remainder of the session.
4. Normal users browsing movies never download or execute the GSI script.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Static GSI in `index.html` vs. Dynamic On-Demand Script Injection**
  - *Chosen Approach*: Remove `<script src="https://accounts.google.com/gsi/client" async defer></script>` from `index.html`. Both `googleContactsService.ts` and `AdminSettings.tsx` already feature helper methods that insert `<script id="google-gsi-script">` dynamically into `<head>` when required.
  - *Why*: Prevents every visitor on every page from downloading ~100KB+ of external Google Identity scripts and opening background telemetry iframes.
  - *Alternatives Considered*: Keeping it with `defer` — rejected because it still executes network calls on startup.

- **Decision 2: Disabling Firebase Analytics vs. Conditional Opt-In**
  - *Chosen Approach*: Replace `analyticsPromise` in `src/firebase.ts` with a no-op null provider, removing `isSupported()` and `getAnalytics(app)`.
  - *Why*: Eliminates the recurring `webConfig` network round-trip to `firebase.googleapis.com/v1alpha/projects/.../webConfig`.
  - *Alternatives Considered*: Only disabling for admins — rejected because the user specified disabling analytics to eliminate webConfig requests completely.

- **Decision 3: Suppressing Redundant Background Token Refresh**
  - *Chosen Approach*: Call `(auth as any)._stopProactiveTokenRefresh?.()` upon auth initialization, and ensure unauthenticated/guest sessions never initiate STS refresh requests.
  - *Why*: Eliminates unprompted `securetoken.googleapis.com` network calls when the user is idle or browsing cached media.
  - *Alternatives Considered*: Leaving default Firebase proactive token refresh — rejected per user confirmation.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MovizNow Clean Boot Flow                         │
└────────────────────────────────────────────────────────────────────────┘

    Initial Load (index.html)
        │
        ├── [X] REMOVED: accounts.google.com/gsi/client
        │
        ▼
    React Mount (main.tsx -> firebase.ts)
        │
        ├── [X] DISABLED: getAnalytics(app) (No webConfig network calls)
        ├── [X] SUPPRESSED: _stopProactiveTokenRefresh() (No idle STS pings)
        │
        ▼
    User Interactions
        │
        ├── Standard Browsing / Playback:
        │     └── Pure Firestore cached reads & TMDB/poster images
        │
        └── Explicit Google Auth / Contacts Sync:
              └── Dynamic Script Loader fetches GSI on-demand only
```

### Interactive Component & State Mapping

1. **`index.html`**:
   - Delete line 93 (`<script src="https://accounts.google.com/gsi/client" async defer></script>`).
2. **`src/firebase.ts`**:
   - Update `analyticsPromise` to resolve to `null` immediately without calling `isSupported()` or `getAnalytics(app)`.
   - After initializing `authInstance`, configure `_stopProactiveTokenRefresh?.()` to prevent automated token polling in background tabs.
3. **`src/services/googleContactsService.ts` & `src/pages/admin/AdminSettings.tsx`**:
   - Verify that on-demand script injection properly handles initial load and error fallbacks when Google Contacts OAuth is invoked.
