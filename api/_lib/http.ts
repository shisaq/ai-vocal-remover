export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorResponse(error: unknown, fallback = 'Unexpected server error.') {
  if (error instanceof Response) {
    return error;
  }

  console.error(error);
  if (process.env.SENTRY_DSN) {
    import('@sentry/node')
      .then((Sentry) => {
        Sentry.init({ dsn: process.env.SENTRY_DSN });
        Sentry.captureException(error);
      })
      .catch(() => undefined);
  }

  return json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
