import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { loadLanguage, pickLanguage, translate } from "@/lib/i18n";
import { previewLang, siteMetadata } from "@/lib/siteMeta";
import { ErrorReporter } from "@/components/ErrorReporter";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "@/styles/components.css";
import "@/styles/rev12.css";
import "@/styles/rev13.css";
import "@/styles/rev14.css";
import "@/styles/rev15.css";

// Title, description and link preview (lib/siteMeta.ts): Russian unless the
// request asks for another language first.
export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata(previewLang((await headers()).get("accept-language")));
}

// Pinch-zoom must stay available for low-vision users — every text input's
// font-size is now >=16px (the actual fix for iOS's auto-zoom-on-focus,
// which was previously worked around by blocking zoom outright).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The phone's status bar / browser chrome in the site's background colour.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6EFE0" },
    { media: "(prefers-color-scheme: dark)", color: "#15120F" },
  ],
};

const THEME_INIT_SCRIPT = `
try {
  var a = JSON.parse(localStorage.getItem('hmo-appearance') || 'null');
  var root = document.documentElement;
  if (a && a.design) root.dataset.design = a.design;
  if (a && a.palette) root.dataset.palette = a.palette;
  var mode = a && a.mode;
  if (mode === 'system' || !mode) {
    mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  // The album page is always dark (AppContext).
  if (/[?&]screen=rate(&|$)/.test(location.search)) mode = 'dark';
  root.dataset.mode = mode;
  var osReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (osReducedMotion || (a && a.motionEnabled === false)) root.dataset.motion = 'off';
} catch (e) {}
`;

// Dev only: Spotify accepts loopback redirect URIs only as 127.0.0.1 (not
// "localhost"), and cookies don't cross between the two hosts — signing in
// on localhost and coming back from Spotify on 127.0.0.1 lost both the
// session and the OAuth state, so connecting failed silently. Keep the
// whole dev session on 127.0.0.1.
const DEV_HOST_SCRIPT = `
if (location.hostname === 'localhost') {
  location.replace(location.href.replace('//localhost', '//127.0.0.1'));
}
`;

// <html lang> follows the visitor's language (Accept-Language) on the
// server; inside the app AppContext switches it to the account language.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = pickLanguage((await headers()).get("accept-language"));
  await loadLanguage(lang);
  return (
    <html
      lang={lang}
      data-design="cream-pop"
      data-mode="light"
      data-palette="lemons"
      suppressHydrationWarning
    >
      <head>
        {process.env.NODE_ENV === "development" && <script dangerouslySetInnerHTML={{ __html: DEV_HOST_SCRIPT }} />}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Covers and 30-second previews come from these hosts: the
            connection is opened while the page starts, not at the first
            picture or the first press of play. */}
        <link rel="preconnect" href="https://i.scdn.co" />
        <link rel="preconnect" href="https://cdnt-preview.dzcdn.net" />
        <link rel="dns-prefetch" href="https://is1-ssl.mzstatic.com" />
        <link rel="dns-prefetch" href="https://cdn-images.dzcdn.net" />
      </head>
      <body>
        <ErrorReporter />
        <ServiceWorkerRegister />
        {children}
        {/* A phone turned sideways: the site is made for upright only, and a
            browser tab can't lock the rotation (styles: rev15.css .rot19). */}
        <div className="rot19" aria-hidden="true">
          <i className="rot19i" />
          <b>{translate(lang, "rotate.title")}</b>
          <span>{translate(lang, "rotate.body")}</span>
        </div>
      </body>
    </html>
  );
}
