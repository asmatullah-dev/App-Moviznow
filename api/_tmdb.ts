import express from 'express';
import axios from 'axios';

export const tmdbRouter = express.Router();

const TMDB_API_KEY = process.env.TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// In-memory caching for TMDB responses to speed up repeated queries and minimize external traffic (0 Firestore cost)
const tmdbMemoryCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

tmdbRouter.get('/tmdb/*', async (req, res) => {
  try {
    // Extract the path after /api/tmdb
    const subPath = req.params[0] || '';
    if (!subPath) {
      return res.status(400).json({ error: 'Missing TMDB endpoint path' });
    }

    // Build query parameters, stripping any client-supplied api_key and attaching server key
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'api_key' && typeof value === 'string') {
        queryParams.set(key, value);
      }
    }
    queryParams.set('api_key', TMDB_API_KEY);

    const queryString = queryParams.toString();
    const targetUrl = `${TMDB_BASE}/${subPath}${queryString ? `?${queryString}` : ''}`;
    const cacheKey = `${subPath}?${queryString}`;

    const cached = tmdbMemoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return res.json(cached.data);
    }

    const response = await axios.get(targetUrl, {
      timeout: 8000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MovizNow/3.2.2'
      }
    });

    // Cache clean response
    if (response.status === 200 && response.data) {
      // Limit memory cache size to 500 items
      if (tmdbMemoryCache.size > 500) {
        const firstKey = tmdbMemoryCache.keys().next().value;
        if (firstKey) tmdbMemoryCache.delete(firstKey);
      }
      tmdbMemoryCache.set(cacheKey, {
        data: response.data,
        expiry: Date.now() + CACHE_TTL_MS
      });
    }

    return res.status(response.status).json(response.data);
  } catch (error: any) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data || { error: 'TMDB API error' });
    }
    return res.status(500).json({ error: 'Failed to fetch from TMDB API' });
  }
});

const OMDB_API_KEY = process.env.OMDB_API_KEY || '19daa310';
const OMDB_BASE = 'https://www.omdbapi.com/';

tmdbRouter.get('/omdb', async (req, res) => {
  try {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'apikey' && typeof value === 'string') {
        queryParams.set(key, value);
      }
    }
    queryParams.set('apikey', OMDB_API_KEY);

    const queryString = queryParams.toString();
    const targetUrl = `${OMDB_BASE}?${queryString}`;
    const cacheKey = `omdb_${queryString}`;

    const cached = tmdbMemoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return res.json(cached.data);
    }

    const response = await axios.get(targetUrl, {
      timeout: 8000,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 200 && response.data) {
      tmdbMemoryCache.set(cacheKey, {
        data: response.data,
        expiry: Date.now() + CACHE_TTL_MS
      });
    }

    return res.status(response.status).json(response.data);
  } catch (error: any) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data || { error: 'OMDB API error' });
    }
    return res.status(500).json({ error: 'Failed to fetch from OMDB API' });
  }
});

