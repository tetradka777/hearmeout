import type { Metadata, Viewport } from "next";
import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "@/styles/components.css";

// The live URL — used to build absolute Open Graph/Twitter image URLs.
const SITE_URL = "https://hearmeoutt.art";
const SITE_DESCRIPTION = "Rate albums, compare music taste with friends, and find what to listen to next.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "HearMeOut",
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "HearMeOut",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "HearMeOut",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HearMeOut",
    description: SITE_DESCRIPTION,
  },
};

// Pinch-zoom must stay available for low-vision users — every text input's
// font-size is now >=16px (the actual fix for iOS's auto-zoom-on-focus,
// which was previously worked around by blocking zoom outright).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
  root.dataset.mode = mode;
  var osReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (osReducedMotion || (a && a.motionEnabled === false)) root.dataset.motion = 'off';
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-design="cream-pop"
      data-mode="light"
      data-palette="lemons"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
