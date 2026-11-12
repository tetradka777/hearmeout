// Audio position changes independently of the player controls/track. Only
// the elapsed label and the current track's rings need these notifications.
export function createPlayerProgress() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (next: number) => {
      const clamped = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 0;
      if (clamped === value) return;
      value = clamped;
      listeners.forEach(listener => listener());
    },
  };
}
