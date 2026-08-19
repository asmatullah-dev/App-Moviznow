import pkg from '../package.json';

// Single source of truth for the application version across the entire frontend.
// Changing "version" in package.json will automatically update everywhere in the application.
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : (pkg.version || '3.2.2');

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== 'undefined'
    ? __BUILD_ID__
    : (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || APP_VERSION);

export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined'
    ? __BUILD_TIME__
    : new Date().toISOString();

export const APP_NAME = 'MovizNow';
