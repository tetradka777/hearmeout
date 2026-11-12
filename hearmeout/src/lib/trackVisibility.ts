// Observe matching controls once: IntersectionObserver accounts for both
// viewport and ancestor clipping (horizontal shelves / album tracklist).
export function watchTrackVisibility(key: string, changed: (visible: boolean) => void): () => void {
  const controls = new Map<Element, boolean>();
  let mobile = window.innerWidth < 900;
  let last: boolean | undefined;
  const publish = () => {
    const visible = [...controls.values()].some(Boolean);
    if (visible !== last) { last = visible; changed(visible); }
  };
  const makeObserver = () => new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (controls.has(entry.target)) controls.set(entry.target, entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0);
    }
    publish();
  }, { rootMargin: `0px 0px ${mobile ? '-90px' : '0px'} 0px`, threshold: 0.000001 });
  let observer = makeObserver();
  const consider = (el: Element) => {
    const matches = el.getAttribute('data-pl') === key && !el.closest('#plhost');
    if (!matches && controls.has(el)) { controls.delete(el); observer.unobserve(el); }
    else if (matches && !controls.has(el)) { controls.set(el, false); observer.observe(el); }
  };
  const scan = (root: Element | Document) => {
    if (root instanceof Element) consider(root);
    root.querySelectorAll('[data-pl]').forEach(consider);
  };
  scan(document);
  const mutations = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') consider(record.target as Element);
      else for (const node of record.addedNodes) if (node instanceof Element) scan(node);
    }
    for (const el of controls.keys()) if (!el.isConnected || el.closest('#plhost')) { controls.delete(el); observer.unobserve(el); }
    publish();
  });
  // Ring animations change style every frame: don't observe those attributes.
  // Display/position changes are already reported by IntersectionObserver.
  mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pl'] });
  const resize = () => {
    const nextMobile = window.innerWidth < 900;
    if (nextMobile === mobile) return;
    mobile = nextMobile;
    observer.disconnect(); observer = makeObserver();
    for (const el of controls.keys()) { controls.set(el, false); observer.observe(el); }
    publish();
  };
  window.addEventListener('resize', resize);
  publish();
  return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', resize); };
}
