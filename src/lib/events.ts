import type { Session } from '@supabase/supabase-js';

export function trackEvent(session: Session | null, name: string, properties: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  fetch('/api/events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, properties }),
    keepalive: true,
  }).catch(() => undefined);
}
