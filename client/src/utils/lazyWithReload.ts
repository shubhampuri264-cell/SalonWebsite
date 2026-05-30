import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Guard key prefix for the one-shot reload. We reload at most once per path
// per browser session so a genuinely missing/broken asset surfaces to the
// ErrorBoundary instead of reloading forever.
const RELOAD_GUARD_PREFIX = 'chunk-reload:';

/**
 * Drop-in replacement for React.lazy that survives redeploys.
 *
 * Pages are split into hash-named chunks (e.g. Book-gaHj9FHN.js). When a new
 * build ships, those filenames change and the old ones are deleted from the
 * server. A visitor whose tab still holds the previous index.html then clicks
 * a link, the browser fetches a chunk that no longer exists, and the dynamic
 * import rejects with "Failed to fetch dynamically imported module".
 *
 * On that failure we reload once: the fresh index.html references the new
 * chunk names, so the navigation that just failed now succeeds. The reload is
 * guarded per-path in sessionStorage — if the import still fails after
 * reloading (a truly broken asset, not a stale one) we rethrow and let the
 * ErrorBoundary show its fallback rather than loop.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const key = RELOAD_GUARD_PREFIX + window.location.pathname;
    try {
      const mod = await factory();
      // Recovered (or loaded cleanly) — clear the guard so a future stale
      // chunk on this path can reload again.
      sessionStorage.removeItem(key);
      return mod;
    } catch (err) {
      if (sessionStorage.getItem(key)) {
        // Already reloaded once for this path and it still failed — the asset
        // is genuinely unavailable. Let the ErrorBoundary handle it.
        throw err;
      }
      sessionStorage.setItem(key, '1');
      console.warn('[lazyWithReload] dynamic import failed, reloading once:', err);
      window.location.reload();
      // Keep the Suspense fallback showing during the brief moment before the
      // reload tears down the page; never resolve.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
