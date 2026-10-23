import type { Metadata } from 'next';

// Link preview (Open Graph / Twitter) for the site: ready-made 1200×630
// image in public/ (og-en.png), in English: the site is English-only.

export const SITE_URL = 'https://hearmeoutt.art';

export type PreviewLang = 'en';

const COPY = {
  en: {
    title: 'HearMeOut — rate albums and compare taste with friends',
    description: 'Rate albums, compare music taste with friends, and keep a listen-later list.',
    alt: 'HearMeOut: rate albums, compare taste with friends',
    image: '/og-en.png',
    locale: 'en_US',
  },
} as const;

export function previewLang(_acceptLanguage: string | null): PreviewLang {
  return 'en';
}

export function previewImages(lang: PreviewLang) {
  const c = COPY[lang];
  return {
    og: [{ url: c.image, width: 1200, height: 630, alt: c.alt, type: 'image/png' }],
    twitter: [{ url: c.image, alt: c.alt }],
  };
}

export function siteMetadata(lang: PreviewLang): Metadata {
  const c = COPY[lang];
  const images = previewImages(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: c.title,
    description: c.description,
    // Installed to an iPhone home screen: opens full-screen like an app.
    appleWebApp: { capable: true, title: 'HearMeOut', statusBarStyle: 'default' },
    openGraph: {
      type: 'website',
      url: SITE_URL,
      siteName: 'HearMeOut',
      title: c.title,
      description: c.description,
      locale: c.locale,
      images: images.og,
    },
    twitter: {
      card: 'summary_large_image',
      title: c.title,
      description: c.description,
      images: images.twitter,
    },
  };
}
