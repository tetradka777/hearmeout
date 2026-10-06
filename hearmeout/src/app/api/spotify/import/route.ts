import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { importStreamingHistory } from '@/lib/streamingHistoryImport';
import { enrichListeningHistoryCovers } from '@/lib/enrichListeningHistory';

const MAX_FILES = 50;
// Spotify's real "Extended streaming history" export splits into files by
// year/volume, not by size — a single file for an active multi-year
// listener regularly runs past 6MB. 6MB was rejecting genuine exports.
const MAX_FILE_BYTES = 40 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const form = await request.formData();
  const fileEntries = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!fileEntries.length) return NextResponse.json({ error: 'no_files' }, { status: 400 });
  if (fileEntries.length > MAX_FILES) return NextResponse.json({ error: 'too_many_files' }, { status: 400 });

  const files: { name: string; text: string }[] = [];
  for (const f of fileEntries) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'file_too_large', file: f.name }, { status: 400 });
    }
    files.push({ name: f.name, text: await f.text() });
  }

  try {
    const admin = supabaseAdmin();
    const result = await importStreamingHistory(admin, userId, files);
    // Fire-and-forget: the raw export has real track ids but no cover art,
    // and looking up thousands of them one at a time shouldn't hold up the
    // "imported N plays" response. Runs on after this request returns.
    enrichListeningHistoryCovers(admin, userId).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    return upstreamErrorResponse(err, '/api/spotify/import');
  }
}
