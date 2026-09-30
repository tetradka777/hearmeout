import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
  var t = localStorage.getItem('hmo-theme');
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch (e) {}
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
  if (a && a.motionEnabled === false) root.dataset.motion = 'off';
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-design="cream-pop"
      data-mode="light"
      data-palette="lemons"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
