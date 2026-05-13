import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        console.log('Preparing Blob upload:', pathname, clientPayload);

        return {
          allowedContentTypes: ['audio/*'],
          maximumSizeInBytes: MAX_AUDIO_BYTES,
          addRandomSuffix: true,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Blob upload completed:', blob.pathname);
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to prepare Blob upload.' },
      { status: 400 },
    );
  }
}
