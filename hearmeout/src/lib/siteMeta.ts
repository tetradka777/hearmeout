import type { Metadata } from 'next';

// Link preview (Open Graph / Twitter) for the site: ready-made 1200×630
// images in public/ (og-ru.png, og-en.png). Russian is the default, also
// for the bots that build previews (Telegram, VK, Discord usually fetch
// without an Accept-Language); English when the request's first language
// is anything else.

export const SITE_URL = 'https://hearmeoutt.art';

export type PreviewLang = 'ru' | 'en';

const COPY = {
  ru: {
    title: 'HearMeOut — оценивай альбомы и сравнивай вкус с друзьями',
    description: 'Оценки альбомов, группы друзей, совпадение вкуса и список «послушать позже».',
    alt: 'HearMeOut: оцени альбом, сравни вкус с друзьями',
    image: '/og-ru.png',
    locale: 'ru_RU',
  },
  en: {
    title: 'HearMeOut — rate albums and compare taste with friends',
    description: 'Rate albums, compare music taste with friends, and keep a listen-later list.',
    alt: 'HearMeOut: rate albums, compare taste with friends',
    image: '/og-en.png',
    locale: 'en_US',
  },
} as const;

// The first language in Accept-Language decides; none at all means Russian.
export function previewLang(acceptLanguage: string | null): PreviewLang {
  const first = (acceptLanguage || '').split(',')[0].trim().toLowerCase();
  if (!first || first === '*' || /^(ru|uk|be|kk)\b/.test(first)) return 'ru';
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
