# Strictly Enforce HubCloud Links & Completely Remove cabdownload.php

Completely eliminate ephemeral and expiring `cabdownload.php` URLs and non-HubCloud fallbacks across all extraction endpoints, ensuring that only verified, permanent HubCloud mirror links are extracted and delivered to users.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed User Choices**:
>   - **Strictly HubCloud**: The extractor will strictly require verified HubCloud links (e.g. `hubcloud.ist`, `hubcloud.club`, `vcloud.live`, `hubdrive`) and will no longer accept fallback direct links like `cabdownload.php`, `r2.dev`, or `gofile.io`.
>   - **Complete cabdownload.php Removal**: `cabdownload.php` will be permanently excluded and blacklisted across all scraping, gate-resolving, and extraction routes because of its short-lived tokens and session expirations.

---

## 1. Overview & Core Concept

- **Problem**: When a FilesDL page does not contain a HubCloud link, the resolver previously fell back to matching `cabdownload.php` ("Instant Download Link"). Because `cabdownload.php` uses short-lived, IP/session-bound tokens, opening the link displays `"Oops! This Download Link Has Expired or the File Has Been Deleted"`.
- **Solution**:
  - Remove all fallbacks that extract `cabdownload.php` or non-HubCloud direct mirrors.
  - Blacklist `cabdownload.php` from all URL matchers and gate-hop filters.
  - If a FilesDL release does not have a HubCloud link, the resolver will reject expired gate URLs and only return valid, permanent HubCloud mirrors.

---

## 2. Technical Architecture & Data Strategy

```
FilesDL Page Received
         │
         ▼
Extract Available Links
         │
         ├────────────────────────────────────────┐
         │                                        │
         ▼                                        ▼
HubCloud Mirrors Detected?               Non-HubCloud / cabdownload.php
         │                                        │
        Yes ───────► Return HubCloud Mirrors      ▼
         │                               [BLOCKED / DISCARDED]
         │                               Never return expiring
         ▼                               cabdownload.php links
Normalizes Domain & Returns
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Eliminate `directMatches` Fallback in `resolveFilmyGoLink`**
  - *Chosen Approach*: Remove lines 3140–3184 in `api/index.ts` that matched `cabdownload.php`, `.r2.dev`, and `gofile.io` when no HubCloud mirrors were present.
  - *Why*: Prevents users from receiving broken or expiring download links.
  - *Alternative Considered*: Keep `cabdownload.php` as a fallback — rejected per user directive because it leads to expired-link errors.

- **Decision 2: Strict `isValidFilmyHitUrl` Validation**
  - *Chosen Approach*: Simplify `isValidFilmyHitUrl` in `api/index.ts` to strictly require `isHubCloudUrl(u) === true` and reject `cabdownload.php`.
  - *Why*: Guarantees that any link returned under download options is a permanent HubCloud mirror.

- **Decision 3: Global Blacklist for `cabdownload.php`**
  - *Chosen Approach*: Add `cabdownload.php` to all exclusion filters in URL parsers, regex extractors, and nested candidate discoverers.

---

## 4. Implementation Steps

1. **Update `isValidFilmyHitUrl` (`api/index.ts`)**:
   - Reject any URL containing `cabdownload.php`.
   - Require `isHubCloudUrl(u)`.

2. **Refactor `resolveFilmyGoLink` (`api/index.ts`)**:
   - Remove the `directMatches` block that captures `cabdownload.php` and non-HubCloud URLs.
   - Ensure the resolver only constructs results from verified `hubMatches`.
   - Explicitly blacklist `cabdownload.php` in anchor parsing and nested branch traversal.

3. **Clean Up Fallbacks in Secondary Gate Extractors**:
   - Remove `download.php` / `cabdownload.php` from fallback matching in `api/index.ts` (e.g. line 3690).

4. **Verify & Test**:
   - Compile the applet with `compile_applet`.
   - Validate TypeScript types with `lint_applet`.
   - Test extraction against sample FilesDL and FilmyCab links to verify 0 `cabdownload.php` occurrences.
