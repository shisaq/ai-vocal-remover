import { get } from '@vercel/blob';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathname = url.searchParams.get('pathname');
  const download = url.searchParams.get('download') === '1';

  if (!pathname) {
    return Response.json({ error: 'Missing pathname.' }, { status: 400 });
  }

  try {
    const result = await get(pathname, { access: 'private' });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json({ error: 'Blob not found.' }, { status: 404 });
    }

    const filename = pathname.split('/').pop() || 'audio.mp3';
    const headers = new Headers();
    headers.set('Content-Type', result.blob.contentType || 'audio/mpeg');
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/"/g, '')}"`,
    );

    if (result.blob.size) {
      headers.set('Content-Length', String(result.blob.size));
    }

    return new Response(result.stream, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to read private Blob audio.' },
      { status: 500 },
    );
  }
}
