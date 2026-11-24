// In-memory cache for query results. The archive only changes when the loader
// adds a month, so feeds, threads and user pages can be served from memory
// instead of the archive disk. Memory only (nothing on disk), capped at
// QUERY_CACHE_MB (default 256; 0 turns it off), least recently used first out.
// Concurrent requests for the same key share one query, and when a refresh
// fails (busy, timed out) the expired result is served instead.

// Rough size of a cached value: its JSON length, doubled for JavaScript's
// two-byte strings and object overhead
export const sizeOf = (value) => 2 * (JSON.stringify(value)?.length || 0) + 64;

export function createCache({ maxBytes }) {
  const entries = new Map(); // key -> { value, expires, bytes }; Map order = least recently used first
  const inFlight = new Map();
  let bytes = 0;

  const remove = (key) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    bytes -= entry.bytes;
  };

  const store = (key, value, ttlMs) => {
    const size = sizeOf(value) + 2 * key.length;
    // One result may not take more than a tenth of the cache
    if (size > maxBytes / 10) return;
    remove(key);
    entries.set(key, { value, expires: Date.now() + ttlMs, bytes: size });
    bytes += size;
    for (const [oldest] of entries) {
      if (bytes <= maxBytes) break;
      remove(oldest);
    }
  };

  // ttl: milliseconds, or a function of the result giving them
  async function cached(key, ttl, load) {
    if (maxBytes <= 0) return load();
    const entry = entries.get(key);
    if (entry && entry.expires > Date.now()) {
      entries.delete(key); // move to the most recently used end
      entries.set(key, entry);
      return entry.value;
    }
    if (!inFlight.has(key)) {
      const query = Promise.resolve()
        .then(load)
        .then((value) => {
          store(key, value, typeof ttl === 'function' ? ttl(value) : ttl);
          return value;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, query);
    }
    try {
      return await inFlight.get(key);
    } catch (error) {
      if (entry) return entry.value;
      throw error;
    }
  }

  return {
    cached,
    stats: () => ({ entries: entries.size, bytes, maxBytes }),
    clear: () => {
      entries.clear();
      bytes = 0;
    },
  };
}

const configured = Number(process.env.QUERY_CACHE_MB ?? 256);
export const queryCache = createCache({ maxBytes: (Number.isFinite(configured) ? configured : 256) * 1024 * 1024 });
