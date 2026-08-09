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

function canDevAutoLogin(): boolean {
  return process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN === 'true';
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    throw new ApiError('Login failed', res.status, await res.json().catch(() => undefined));
  }

  const data = (await res.json()) as { token: string };
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TOKEN_KEY, data.token);
  }
  return data.token;
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_KEY);
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
    sessionStorage.removeItem(TOKEN_KEY);
  }

  // Opt-in only — never hardcode credentials into production builds by default.
  if (canDevAutoLogin()) {
    return login('admin@minecraft-admin.local', 'admin');
  }

  redirectToLogin();
  throw new ApiError('Not authenticated. Sign in via /login.', 401);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await ensureAuthenticated();
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !canDevAutoLogin()) {
      logout();
      redirectToLogin();
    }
    const body = await res.json().catch(() => undefined);
    throw new ApiError(
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: string }).message)
        : `Request failed (${res.status})`,
      res.status,
      body
    );
  }

  return res.json() as Promise<T>;
}
