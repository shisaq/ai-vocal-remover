import { put } from '@vercel/blob';
import { getBearerToken, ensureProfile, requireUser } from './_lib/auth';
import { PLAN_LIMITS } from './_lib/plans';

const SERVER_UPLOAD_LIMIT_BYTES = 4_500_000;

function createSafeBlobPathname(filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  const rawBase = dotIndex === -1 ? filename : filename.slice(0, dotIndex);
  const rawExtension = dotIndex === -1 ? 'mp3' : filename.slice(dotIndex + 1);
  const base = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'audio';
  const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp3';

  return `sources/${crypto.randomUUID()}-${base}.${extension}`;
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const user = token ? await requireUser(request) : null;
  const profile = user ? await ensureProfile(user.id) : null;
  const maxUploadBytes = profile
    ? PLAN_LIMITS[profile.plan === 'pro_monthly' || profile.plan === 'pro_yearly' ? profile.plan : 'free'].maxUploadBytes
    : PLAN_LIMITS.free.maxUploadBytes;
  const encodedFilename = request.headers.get('x-file-name') || 'audio.mp3';
  const filename = decodeURIComponent(encodedFilename);
  const contentType = request.headers.get('content-type') || 'audio/mpeg';
  const body = await request.arrayBuffer();

  if (body.byteLength > SERVER_UPLOAD_LIMIT_BYTES) {
    return Response.json(
      { error: 'Server fallback upload only supports files up to about 4.5MB.' },
      { status: 413 },
    );
  }

  if (body.byteLength > maxUploadBytes) {
    return Response.json(
      { error: '当前套餐不支持这个文件大小。' },
      { status: 413 },
    );
  }

  try {
    console.log('Using server Blob upload fallback:', filename, body.byteLength);

    const blob = await put(createSafeBlobPathname(filename), Buffer.from(body), {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });

    return Response.json(blob);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to upload source audio to Blob.' },
      { status: 500 },
    );
  }
}
