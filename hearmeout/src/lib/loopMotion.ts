import { loopPosition } from './homePresentation';

// Never interrupt native touch momentum. Rebase identical content only
// after scrollend, with a quiet-period fallback for older browsers.
export function createLoopMotion(read: () => { left: number; cycle: number }, write: (left: number) => void) {
  let touching = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { clearTimeout(timer); timer = undefined; };
  const settle = () => {
    stop();
    if (touching) return;
    const { left, cycle } = read();
    const next = loopPosition(left, cycle);
    if (Math.abs(next - left) > 1) write(next);
  };
  const scroll = () => { stop(); timer = setTimeout(settle, 220); };
  return { settle, scroll, stop, start: () => { touching = true; stop(); }, end: () => { if (!touching) return; touching = false; scroll(); } };
}
