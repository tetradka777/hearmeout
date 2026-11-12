// Shared, one-shot visibility subscriptions. Horizontal shelves must first
// approach the viewport; only then do their individual cards preload.
const distance = 800;
type Watcher = { observer: IntersectionObserver; waiting: Map<Element, Set<() => void>> };
const watchers = new Map<Element | null, Watcher>();

function watch(root: Element | null, element: Element, callback: () => void): () => void {
  let watcher = watchers.get(root);
  if (!watcher) {
    const waiting = new Map<Element, Set<() => void>>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const callbacks = waiting.get(entry.target);
        waiting.delete(entry.target);
        observer.unobserve(entry.target);
        callbacks?.forEach(fn => fn());
      }
      if (!waiting.size) { observer.disconnect(); watchers.delete(root); }
    }, { root, rootMargin: root ? `0px ${distance}px` : `${distance}px 0px` });
    watcher = { observer, waiting };
    watchers.set(root, watcher);
  }
  const current = watcher;
  const callbacks = current.waiting.get(element) ?? new Set();
  callbacks.add(callback);
  current.waiting.set(element, callbacks);
  current.observer.observe(element);
  return () => {
    const callbacks = current.waiting.get(element);
    callbacks?.delete(callback);
    if (callbacks && !callbacks.size) {
      current.waiting.delete(element);
      current.observer.unobserve(element);
    }
    if (!current.waiting.size) {
      current.observer.disconnect();
      if (watchers.get(root) === current) watchers.delete(root);
    }
  };
}

export function whenNear(element: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { callback(); return () => {}; }
  const row = element.parentElement?.closest('.hrow') ?? null;
  if (!row) return watch(null, element, callback);
  let cancel = watch(null, row, () => { cancel = watch(row, element, callback); });
  return () => cancel();
}
