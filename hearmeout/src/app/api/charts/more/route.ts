import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { chartPage, moreChartCountries } from '@/lib/appleCharts';
import { discoveryMarkets, mixedChartPage } from '@/lib/chartDiscovery';

// The endless "Popular now" shelf (lib/appleCharts.chartPage): ?page=N is
// the Nth country's top 100 (your region first). `next` is null after the
// last country.
export async function GET(request: NextRequest) {
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if (params.get('mode') === 'discovery') {
    try {
      return NextResponse.json(await mixedChartPage(Number(params.get('page')) || 0, discoveryMarkets(params.get('region')), chartPage));
    } catch {
      return NextResponse.json({ error: 'chart_unavailable' }, { status: 503 });
    }
  }
  const countries = moreChartCountries(params.get('region'));
  const page = Math.max(0, Math.min(countries.length - 1, Number(params.get('page')) || 0));
  const albums = await chartPage(countries[page]).catch(() => []);
  return NextResponse.json({ albums, next: page + 1 < countries.length ? page + 1 : null });
}
