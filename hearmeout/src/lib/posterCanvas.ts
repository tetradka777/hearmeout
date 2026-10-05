import type { RecapData } from './types';


// Text-only by design — covers are loaded from Spotify's CDN, and drawing a
// cross-origin image onto a canvas without confirmed CORS headers taints it
// (toBlob/toDataURL then throws), which would make the download silently
// fail. Typography-only sidesteps that entirely and needs no server render.
export type StoryCardContent = {
  pill: string;
  lead: string;
  emphasis: string;
  numbers: { value: string; label: string }[];
  colors: { ink: string; cream: string; accent: string; pop: string };
};

// "Share as image" (spec 3.12 / 6.12): the recap's story card as a 4:5
// PNG (1080×1350) in the live palette — pill, the generated line with its
// last words emphasised, and the four numbers. Text-only for the same
// cross-origin reason as above.
export function drawStoryCard(canvas: HTMLCanvasElement, c: StoryCardContent) {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { ink, cream, accent, pop } = c.colors;

  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);

  ctx.font = '800 40px sans-serif';
  const pillW = ctx.measureText(c.pill).width + 64;
  ctx.fillStyle = pop;
  roundRect(ctx, 72, 72, pillW, 72, 36);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.fillText(c.pill, 104, 122);

  ctx.font = '800 112px sans-serif';
  ctx.fillStyle = cream;
  const y = wrapText(ctx, c.lead, 72, 380, W - 144, 112);
  ctx.fillStyle = pop;
  wrapText(ctx, c.emphasis, 72, y, W - 144, 112);

  const boxY = H - 330;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, 72, boxY, W - 144, 240, 48);
  ctx.fill();
  const colW = (W - 144 - 48) / c.numbers.length;
  c.numbers.forEach((n, i) => {
    const x = 72 + 24 + i * colW;
    ctx.fillStyle = cream;
    ctx.font = '800 72px sans-serif';
    ctx.fillText(n.value, x, boxY + 105);
    // Labels wrap inside their column: long ones ("новых артистов",
    // "средняя оценка") would otherwise run into the next column.
    ctx.font = '700 28px sans-serif';
    wrapText(ctx, n.label, x, boxY + 150, colW - 20, 32);
  });

  ctx.fillStyle = accent;
  ctx.font = '800 36px sans-serif';
  ctx.fillText('hearmeout', 72, H - 40);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBlendPoster(
  canvas: HTMLCanvasElement,
  dataA: RecapData, nameA: string,
  dataB: RecapData, nameB: string,
  matchPct: number | null
) {
  const W = 1080;
  const H = 1080;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#171410');
  grad.addColorStop(1, '#2b1f16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#d98a5f';
  ctx.font = '700 32px sans-serif';
  ctx.fillText('HearMeOut Blend', 64, 80);

  if (matchPct != null) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#efe6d9';
    ctx.font = '700 90px sans-serif';
    ctx.fillText(`${matchPct}%`, W / 2, 190);
    ctx.fillStyle = '#948b7d';
    ctx.font = '500 22px sans-serif';
    ctx.fillText('GENRE MATCH', W / 2, 224);
    ctx.textAlign = 'left';
  }

  const colY = 300;
  const colWidth = 420;
  const columns: [RecapData, string, number][] = [[dataA, nameA, 64], [dataB, nameB, W - 64 - colWidth]];
  const bGenres = new Set(dataB.topGenres.map((g) => g.genre));
  const sharedGenres = new Set(dataA.topGenres.filter((g) => bGenres.has(g.genre)).map((g) => g.genre));

  for (const [data, name, x] of columns) {
    let y = colY;
    ctx.fillStyle = '#efe6d9';
    ctx.font = '700 40px sans-serif';
    wrapText(ctx, name, x, y, colWidth, 48);
    y += 70;

    if (data.topArtists.length) {
      ctx.fillStyle = '#948b7d';
      ctx.font = '600 18px sans-serif';
      ctx.fillText('TOP ARTISTS', x, y);
      y += 36;
      ctx.fillStyle = '#efe6d9';
      ctx.font = '500 26px sans-serif';
      for (const a of data.topArtists.slice(0, 5)) {
        ctx.fillText(a.name, x, y);
        y += 38;
      }
    }

    y += 30;
    if (data.topGenres.length) {
      ctx.fillStyle = '#948b7d';
      ctx.font = '600 18px sans-serif';
      ctx.fillText('GENRES', x, y);
      y += 32;
      for (const g of data.topGenres) {
        ctx.fillStyle = sharedGenres.has(g.genre) ? '#d98a5f' : '#c07b52';
        ctx.font = sharedGenres.has(g.genre) ? '700 24px sans-serif' : '500 24px sans-serif';
        ctx.fillText(g.genre, x, y);
        y += 32;
      }
    }
  }

  ctx.strokeStyle = 'rgba(239,230,217,.14)';
  ctx.beginPath();
  ctx.moveTo(W / 2, colY - 40);
  ctx.lineTo(W / 2, H - 100);
  ctx.stroke();

  ctx.fillStyle = '#7a7266';
  ctx.font = '500 22px sans-serif';
  ctx.fillText('hearmeout', 64, H - 60);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, cy); cy += lineHeight; }
  return cy;
}
