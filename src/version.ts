import pkg from '../package.json';

// Single source of truth for the application version across the entire frontend.
// Changing "version" in package.json will automatically update everywhere in the application.
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
declare const __VERSION_UPDATED_AT__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : (pkg.version || '0.0.0');

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== 'undefined'
    ? __BUILD_ID__
    : (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || APP_VERSION);

export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined'
    ? __BUILD_TIME__
    : new Date().toISOString();

// Timestamp in Pakistan Standard Time (PKT) generated during GitHub workflow / version bump
export const VERSION_UPDATED_AT: string =
  typeof __VERSION_UPDATED_AT__ !== 'undefined'
    ? __VERSION_UPDATED_AT__
    : ((pkg as any).versionUpdatedAt || 'Oct 03, 2026, 05:52 AM (PKT)');

export const APP_NAME = 'MovizNow';
