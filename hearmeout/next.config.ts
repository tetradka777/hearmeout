import type { NextConfig } from "next";

// Security headers on every response: no framing by other sites
// (clickjacking), no MIME sniffing, a referrer that doesn't leak full URLs
// to other sites, no camera/microphone/location access, and HTTPS only
// (the site is served over HTTPS on Render). A full Content-Security-Policy
// is left out: the layout's inline theme script would need a nonce first.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Spotify's OAuth redirect_uri only allows http:// on the 127.0.0.1
  // loopback address (not localhost) since April 2025, so local dev is
  // driven from that origin — the dev server needs to trust it too.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The service worker must never be served stale from a cache.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
