// In-memory store that resets on page refresh but persists across React Router navigations (SPA)
export const memoryStore = new Map<string, any>();
