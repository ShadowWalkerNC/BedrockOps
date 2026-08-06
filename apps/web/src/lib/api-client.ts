const TOKEN_KEY = 'bedrockops_token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function ensureAuthenticated(): Promise<string> {
  if (typeof window === 'undefined') {
    return '';
  }

  const existing = sessionStorage.getItem(TOKEN_KEY);
  if (existing) {
    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${existing}` }
    });
    if (me.ok) {
      return existing;
    }
  }

  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@minecraft-admin.local',
      password: 'admin'
    })
  });

  if (!res.ok) {
    throw new ApiError('Dev login failed — is apps/api running on port 4000?', res.status);
  }

  const data = (await res.json()) as { token: string };
  sessionStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await ensureAuthenticated();
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body as { message?: string }).message ||
      (body as { error?: string }).error ||
      res.statusText;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}
