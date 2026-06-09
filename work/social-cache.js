const fs = require("node:fs");
const path = require("node:path");

const CACHE_PATH = path.join(__dirname, "social-cache.json");
const DEFAULT_STORE = {
  byHandle: {},
};

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return structuredClone(DEFAULT_STORE);
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STORE),
      ...parsed,
      byHandle: parsed?.byHandle || {},
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

function writeCache(store) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(store, null, 2));
}

function getCachedSocial(handle) {
  const store = readCache();
  return store.byHandle[handle.toLowerCase()] || null;
}

function setCachedSocial(handle, payload) {
  const store = readCache();
  store.byHandle[handle.toLowerCase()] = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  writeCache(store);
  return store.byHandle[handle.toLowerCase()];
}

module.exports = {
  getCachedSocial,
  setCachedSocial,
};
