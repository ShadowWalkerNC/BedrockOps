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

async function readJsonSafe(res: Response): Promise<unknown> {
  return res.json().catch(() => undefined);
}

export async function login(email: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
  } catch {
    throw new ApiError(
      'Cannot reach the API (is apps/api running on port 4000?). Start it with: PORT=4000 pnpm --filter @mc-admin/api dev',
      0
    );
  }

  if (!res.ok) {
    const body = await readJsonSafe(res);
    throw new ApiError('Login failed — check email/password, or that the API JWT_SECRET matches this session.', res.status, body);
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
    try {
      const me = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${existing}` }
      });
      if (me.ok) {
        return existing;
      }
    } catch {
      throw new ApiError(
        'Cannot reach the API through the web proxy. Start the API on :4000 (PORT=4000) and retry.',
        0
      );
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
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    throw new ApiError(
      `Network error calling /api/v1${path}. Is the API running on port 4000?`,
      0
    );
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !canDevAutoLogin()) {
      logout();
      redirectToLogin();
    }
    const body = await readJsonSafe(res);
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
