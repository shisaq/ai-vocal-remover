type SeparateStatusRequest = {
  jobId: string;
};

function getStatusEndpoint(jobId: string) {
  if (!process.env.MODAL_WEBHOOK_URL) {
    throw new Error('Missing MODAL_WEBHOOK_URL.');
  }

  const baseUrl = process.env.MODAL_WEBHOOK_URL.replace(/\/separate\/?$/, '');
  return `${baseUrl}/separate-blob/status/${encodeURIComponent(jobId)}`;
}

export async function POST(request: Request) {
  const { jobId } = (await request.json()) as SeparateStatusRequest;

  if (!jobId) {
    return Response.json({ error: 'Missing jobId.' }, { status: 400 });
  }

  const modalAuthToken = process.env.MODAL_AUTH_TOKEN;
  if (!modalAuthToken) {
    return Response.json(
      { error: 'Missing MODAL_AUTH_TOKEN in Vercel environment variables.' },
      { status: 500 },
    );
  }

  try {
    const modalResponse = await fetch(getStatusEndpoint(jobId), {
      headers: {
        Authorization: `Bearer ${modalAuthToken}`,
      },
    });

    const data = await modalResponse.json();

    if (!modalResponse.ok) {
      return Response.json(
        { error: data.detail || data.error || 'Failed to fetch Modal job status.' },
        { status: modalResponse.status },
      );
    }

    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Modal job status.' },
      { status: 500 },
    );
  }
}
