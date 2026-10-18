export async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `Request failed (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}
