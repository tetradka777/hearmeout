type TickerMessage = { id: string; name: string; text: string };
export type TickerPosition = { id: string | null; elapsedMs: number };

// A refresh can insert news ahead of the current event. Keep the phrase
// already being read, including the time remaining after a pause.
export function syncTickerPosition(position: TickerPosition, events: readonly { id: string }[]): TickerPosition {
  return events.some((event) => event.id === position.id)
    ? position
    : { id: events[0]?.id ?? null, elapsedMs: 0 };
}

export function nextTickerPosition(position: TickerPosition, events: readonly { id: string }[]): TickerPosition {
  const index = events.findIndex((event) => event.id === position.id);
  return { id: events.length ? events[(index + 1) % events.length].id : null, elapsedMs: 0 };
}

export function tickerHoldMs(event: TickerMessage): number {
  const sentence = `${event.name} ${event.text}`.trim();
  // Word count covers prose; character count also covers long names and
  // titles with few spaces. Nothing needs clipping to fit a fixed slot.
  return Math.max(6000, sentence.split(/\s+/).length * 300, Array.from(sentence).length * 55);
}
