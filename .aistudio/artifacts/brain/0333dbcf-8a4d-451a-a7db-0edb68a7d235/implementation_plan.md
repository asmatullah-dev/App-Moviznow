# Implementation Plan: Decouple Versioning from Catalog Exports & Standardize SemVer (5.4.0)

## Problem & Objectives
Previously, the application version followed a `Major.Minor.Catalog` format (e.g., `5.4.30`), where every run of the GitHub Actions daily content export workflow bumped the patch number using `scripts/bumpVersion.cjs`.

The user wants to:
1. Stop bumping the application version via the GitHub workflow.
2. Remove the catalog export counter from the application version.
3. Transition to standard Semantic Versioning (`Major.Minor.Patch`) with clean baseline `5.4.0`.
4. Keep updating timestamps (`versionUpdatedAt` / `versionTimestamp`) during catalog exports without altering the version number.
5. Update the UI in `VersionInfoModal.tsx` and throughout the app so the 3-part breakdown reflects `Major.Minor.Patch`.

---

## Proposed Changes

### 1. `package.json`
- Set `"version": "5.4.0"`.
- Keep `"versionUpdatedAt"` and `"versionTimestamp"`.

### 2. Version Script (`scripts/bumpVersion.cjs`)
- Refactor the script (or rename to update timestamp only):
  - Do **NOT** bump `pkg.version` (preserves `5.4.0` or whatever SemVer is set).
  - Update `pkg.versionUpdatedAt` with current PKT formatted time (`Oct 17, 2026, ... (PKT)`).
  - Update `pkg.versionTimestamp` with `Date.now()`.
  - Save `package.json`.

### 3. GitHub Workflow (`.github/workflows/daily-export.yml`)
- Update step name from `Bump Version (+0.0.01)` to `Update Catalog Export Timestamp`.
- Keep git commit message clean: `chore: update content catalog export and timestamp [skip ci]`.

### 4. Version Display Modal (`src/components/VersionInfoModal.tsx`)
- Update version format label from `Major.Minor.Content` to `Major.Minor.Patch`.
- Update breakdown items:
  - **Major (`5`)**: Core architecture, major redesigns, and breaking platform updates.
  - **Minor (`4`)**: New features, interface enhancements, and section updates.
  - **Patch (`0`)**: Bug fixes, performance optimizations, and stability patches.
- Remove references to "Catalog Export" from the 3rd version digit badge, replacing with "Patch / Fixes".

### 5. `src/version.ts`
- Verify comment and fallback values reflect the new `5.4.0` standard.

---

## Verification Plan
1. **Compilation Check**: Run `compile_applet` to ensure TypeScript compilation passes.
2. **Lint Check**: Run `lint_applet` to confirm zero lint errors.
3. **Script Verification**: Run `node scripts/bumpVersion.cjs` to confirm `package.json` version remains `5.4.0` while `versionUpdatedAt` is updated accurately.
4. **Build & Dev Server**: Verify dev server and bundle build with the clean `v5.4.0` display.
