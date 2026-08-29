const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  enumerable: true,
  get() {
    return async (...args) => {
      console.log("Intercepted fetch");
    }
  }
});
globalThis.fetch();
