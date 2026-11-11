// Original sound-creature silhouettes. Broad shapes stay legible in tiny
// avatar dots; cut-outs take the surrounding palette colour automatically.
const SHAPES = [
  'M12 16C12 9 18 7 23 11L27 15 34 9C41 4 47 7 47 15L47 21 53 25C61 29 60 37 54 41L49 44 48 52C47 60 39 62 34 56L30 52 22 57C15 62 8 57 11 48L12 42 6 35C2 29 5 22 12 21Z',
  'M10 24C7 18 12 12 18 14L24 17 25 10C26 3 35 3 37 10L39 17 46 12C53 8 59 14 56 21L52 28 57 34C62 40 56 46 50 45L44 44 43 53C43 61 34 62 31 55L28 49 21 53C13 57 8 50 13 44L17 39 10 35C5 32 6 26 10 24Z',
  'M10 22C10 13 17 10 23 16C26 5 36 5 40 15C47 8 56 12 55 22L55 39C55 47 49 49 45 44C44 54 35 57 30 48C24 57 14 54 14 45C6 44 5 36 10 31Z',
];

function seedFor(name: string): number {
  let value = 2166136261;
  for (const letter of name.normalize('NFKC').trim().toLowerCase()) value = Math.imul(value ^ letter.codePointAt(0)!, 16777619);
  return value >>> 0;
}

const eye = (x: number, y: number, rx: number, ry: number) => `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;

export function Initial({ name, festive = false }: { name: string; festive?: boolean }) {
  const seed = seedFor(name);
  const tilt = (((seed >>> 4) % 5) - 2) * 3;
  const gaze = (((seed >>> 8) % 5) - 2) * 0.6;
  const leftY = 29 + (seed >>> 12) % 3, rightY = 29 + (seed >>> 16) % 3;
  const leftRx = 4.8 + ((seed >>> 20) % 3) * 0.6;
  const mouth = seed & 1 ? 'M28 41Q33 44 38 39Q35 46 29 43Z' : 'M29 41a3 2 0 1 0 6 0a3 2 0 1 0-6 0Z';
  return <svg className="davatar28" viewBox="0 0 64 64" aria-hidden="true" style={{ position: 'static', width: '70%', height: '70%', transform: 'none', stroke: 'none' }}>
    <g transform={`rotate(${tilt} 32 32)`}>
      <path fillRule="evenodd" d={SHAPES[seed % SHAPES.length] + eye(24, leftY, leftRx, 6.3) + eye(40, rightY, 4.8, 5.8) + mouth} style={{ fill: 'currentColor', stroke: 'none' }} />
      <circle cx={24 + gaze} cy={leftY + 0.7} r="2.1" style={{ fill: 'currentColor', stroke: 'none' }} />
      <circle cx={40 + gaze} cy={rightY + 0.7} r="2" style={{ fill: 'currentColor', stroke: 'none' }} />
      {festive && <g className="avatar33hat"><path d="M12 19Q20 -1 42 8L52 20 44 20Q36 10 27 16L18 23Z" style={{fill:'var(--pick)',stroke:'var(--cream)',strokeWidth:1.5}}/><path d="M13 20Q29 12 45 18L46 24Q29 18 14 26Z" style={{fill:'var(--cream)'}}/><circle cx="52" cy="20" r="5" style={{fill:'var(--cream)'}}/></g>}
    </g>
  </svg>;
}