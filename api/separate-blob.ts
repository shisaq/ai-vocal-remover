import { del, head } from '@vercel/blob';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

type SeparateBlobRequest = {
  sourceUrl: string;
  sourcePathname?: string;
  filename?: string;
};

function getBlobEndpoint() {
  if (!process.env.MODAL_WEBHOOK_URL) {
    throw new Error('Missing MODAL_WEBHOOK_URL.');
  }

  return process.env.MODAL_WEBHOOK_URL.replace(/\/separate\/?$/, '/separate-blob');
}

export async function POST(request: Request) {
  const payload = (await request.json()) as SeparateBlobRequest;

  if (!payload.sourceUrl) {
    return Response.json({ error: 'Missing sourceUrl.' }, { status: 400 });
  }

  try {
    console.log('Preparing Modal Blob separation:', payload.sourcePathname || payload.sourceUrl);

    const source = await head(payload.sourcePathname || payload.sourceUrl);
    console.log('Blob source ready:', source.pathname, source.size);

    if (source.size > MAX_AUDIO_BYTES) {
      await del(payload.sourcePathname || payload.sourceUrl);
      return Response.json({ error: 'Audio file is too large. Maximum size is 10MB.' }, { status: 413 });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (process.env.MODAL_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${process.env.MODAL_AUTH_TOKEN}`;
    }

    const modalResponse = await fetch(getBlobEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    console.log('Modal Blob response status:', modalResponse.status);

    const data = await modalResponse.json();

    if (!modalResponse.ok) {
      await del(payload.sourcePathname || payload.sourceUrl);
      return Response.json(
        { error: data.detail || data.error || 'Modal processing failed.' },
        { status: modalResponse.status },
      );
    }

    return Response.json(data);
  } catch (error) {
    await del(payload.sourcePathname || payload.sourceUrl).catch(() => undefined);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to process Blob audio.' },
      { status: 500 },
    );
  }
}
