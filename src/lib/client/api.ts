export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    let message = 'Request failed';
    try {
      const payload = await res.json();
      message = payload?.error?.message ?? message;
    } catch (error) {
      // ignore
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
