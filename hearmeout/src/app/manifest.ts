import type { MetadataRoute } from 'next';

// Web app manifest: lets phones install HearMeOut to the home screen (own
// icon, no browser bar). Colours are the default Cream-pop palette.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HearMeOut',
    short_name: 'HearMeOut',
    description: 'Rate albums, compare music taste with friends, weekly recaps.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Phones: upright only (an installed app really locks; in a browser tab
    // the layout shows a 'turn your phone' screen instead, see layout.tsx).
    orientation: 'portrait',
    background_color: '#F6EFE0',
    theme_color: '#F6EFE0',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
