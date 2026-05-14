import { getSupabaseAdmin, getSupabaseAnon, type Profile } from './supabase.js';

export type AuthedUser = {
  id: string;
  email?: string;
};

export function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length);
}

export async function requireUser(request: Request): Promise<AuthedUser> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return {
    id: data.user.id,
    email: data.user.email,
  };
}

export async function ensureProfile(userId: string): Promise<Profile> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (existing) {
    return existing as Profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}
