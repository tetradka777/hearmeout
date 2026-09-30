// Placeholder feed events for the activity ticker (spec 3.8/7.9): "last 6
// friend events (first play, rating, disagreement), your own session,
// 'recap of week N is ready', a taste match highlight", most recent first.
// TODO: replace with a real selector once the Home activity-feed data model
// exists (spec section 8 "Feed events") — that same feed powers both Home
// and this ticker. Kept as its own hook so swapping the data source later
// doesn't touch the Ticker component itself.
export type TickerEvent = { id: string; name: string; text: string };

export function useTickerEvents(): TickerEvent[] {
  return [
    { id: 'ph-1', name: 'mira', text: 'rated Paper Weather 4.5' },
    { id: 'ph-2', name: 'ilya', text: 'played Mono Atlas for the first time' },
    { id: 'ph-3', name: 'you', text: 'and mira disagree on Night Drive' },
    { id: 'ph-4', name: 'noa', text: 'is on a 6-day streak' },
    { id: 'ph-5', name: 'you', text: 'listened for 42 minutes today' },
    { id: 'ph-6', name: 'sam', text: "'s week 39 recap is ready" },
  ];
}
