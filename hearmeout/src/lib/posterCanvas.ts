import type { RecapData } from './types';

// Text-only by design — covers are loaded from Spotify's CDN, and drawing a
// cross-origin image onto a canvas without confirmed CORS headers taints it
// (toBlob/toDataURL then throws), which would make the download silently
// fail. Typography-only sidesteps that entirely and needs no server render.
export function drawRecapPoster(canvas: HTMLCanvasElement, data: RecapData, name: string, periodLabel: string) {
  const W = 1080;
  const H = 1350;
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
  ctx.fillText('HearMeOut', 64, 100);

  ctx.fillStyle = '#948b7d';
  ctx.font = '500 26px sans-serif';
  ctx.fillText(periodLabel.toUpperCase(), 64, 150);

  ctx.fillStyle = '#efe6d9';
  ctx.font = '700 64px sans-serif';
  wrapText(ctx, name, 64, 240, W - 128, 70);

  ctx.fillStyle = '#d98a5f';
  ctx.font = '700 100px sans-serif';
  ctx.fillText(String(data.minutes), 64, 400);
  ctx.fillStyle = '#948b7d';
  ctx.font = '500 28px sans-serif';
  ctx.fillText('minutes listened', 64, 440);

  let y = 540;
  if (data.topArtists.length) {
    ctx.fillStyle = '#948b7d';
    ctx.font = '600 22px sans-serif';
    ctx.fillText('TOP ARTISTS', 64, y);
    y += 46;
    ctx.fillStyle = '#efe6d9';
    ctx.font = '600 40px sans-serif';
    for (const a of data.topArtists.slice(0, 5)) {
      ctx.fillText(a.name, 64, y);
      y += 56;
    }
  }

  y += 40;
  if (data.topGenres.length) {
    ctx.fillStyle = '#948b7d';
    ctx.font = '600 22px sans-serif';
    ctx.fillText('GENRES', 64, y);
    y += 40;
    ctx.fillStyle = '#c07b52';
    ctx.font = '500 30px sans-serif';
    ctx.fillText(data.topGenres.map((g) => g.genre).join(' · '), 64, y);
  }

  ctx.fillStyle = '#7a7266';
  ctx.font = '500 22px sans-serif';
  ctx.fillText('hearmeout', 64, H - 60);
}

// Two-column "Blend" card for a pair of users — separate from
// drawRecapPoster rather than bolted onto it: that function's layout math
// (sequential y-positions for one person's lists) has no concept of a
// second person anywhere in its body, so a real two-column card needed its
// own function rather than parameterizing that one. Same text-only
// approach (no cover images -> no CORS-taints-canvas risk).
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
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
  if (line) ctx.fillText(line, x, cy);
}
