const PRODUCTION_ORIGIN = 'https://ai-vocal-remover.uulili.com';
const VERCEL_PRODUCTION_HOST = 'ai-vocal-remover-shisaqs-projects.vercel.app';

export function getCanonicalOrigin() {
  if (window.location.hostname === VERCEL_PRODUCTION_HOST) {
    return PRODUCTION_ORIGIN;
  }

  return window.location.origin;
}

export function redirectDefaultVercelHost() {
  if (window.location.hostname !== VERCEL_PRODUCTION_HOST) {
    return;
  }

  window.location.replace(`${PRODUCTION_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`);
}
