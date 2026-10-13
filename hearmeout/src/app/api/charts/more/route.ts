import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { chartPage, moreChartCountries } from '@/lib/appleCharts';

// The endless "Popular now" shelf (lib/appleCharts.chartPage): ?page=N is
// the Nth country's top 100 (your region first). `next` is null after the
// last country.
export async function GET(request: NextRequest) {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const countries = moreChartCountries(params.get('region'));
  const page = Math.max(0, Math.min(countries.length - 1, Number(params.get('page')) || 0));
  const albums = await chartPage(countries[page]).catch(() => []);
  return NextResponse.json({ albums, next: page + 1 < countries.length ? page + 1 : null });
}
