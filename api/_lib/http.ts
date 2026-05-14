export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorResponse(error: unknown, fallback = 'Unexpected server error.') {
  if (error instanceof Response) {
    return error;
  }

  console.error(error);
  return json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
