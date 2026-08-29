export const CLOUD_RUN_URL = 'https://ais-pre-ztgr34s3xe3g6vxljx3ldl-684080073915.asia-southeast1.run.app';

export const getApiBaseUrl = (): string => {
  // 1. Check for explicit environment variable first
  const envUrl = import.meta.env.VITE_CLOUD_RUN_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. If on Vercel or external host, use the default Cloud Run URL
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const isDevelopmentHost = hostname === 'localhost' || 
                              hostname === '127.0.0.1';
    
    if (!isDevelopmentHost) {
      return CLOUD_RUN_URL;
    }
  }

  // 3. Fallback to local if in development/preview environment
  return '';
};
