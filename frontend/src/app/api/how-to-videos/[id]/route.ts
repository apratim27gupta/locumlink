import { NextResponse } from 'next/server';
import { getHowToVideoById, signHowToVideoUrl } from '@/lib/howToVideosGcs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Redirects to a GCS V4 signed URL for the demo MP4.
 * Same-origin /api/how-to-videos/{id} keeps <video src> stable while the bucket
 * stays private (public access prevention).
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const video = getHowToVideoById(id);
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const url = await signHowToVideoUrl(video);
  if (!url) {
    return NextResponse.json(
      { error: 'Unable to sign video URL. Check GCS credentials and bucket access.' },
      { status: 503 },
    );
  }

  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      // Hint browsers they may reuse this redirect briefly; the signed target caches via GCS.
      'Cache-Control': 'private, max-age=300',
    },
  });
}
