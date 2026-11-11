// Only resources this page has already downloaded are candidates. The
// worker validates the public/immutable response again before storing it.
export function loadedStaticAssetUrls(names: readonly string[], origin: string): string[] {
  const urls = new Set<string>();
  for (const name of names) {
    try {
      const url = new URL(name, origin);
      if (url.origin !== origin || !url.pathname.startsWith('/_next/static/') ||
        !/\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname)) continue;
      url.hash = '';
      urls.add(url.href);
      if (urls.size === 48) break;
    } catch { /* A malformed resource entry isn't a warmup candidate. */ }
  }
  return [...urls];
}
