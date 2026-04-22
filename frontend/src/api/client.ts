import { config } from "@/config";

function handleAuthExpired(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem("accessToken", data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let token = localStorage.getItem("accessToken");

  const headers: Record<string, string> = {
    ...(options.body != null ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  // Try refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${config.apiBaseUrl}${path}`, {
        ...options,
        headers,
      });
    }
  }

  if (res.status === 401 && token) {
    handleAuthExpired();
    throw { status: 401, error: { message: "Session expired" } };
  }

  if (!res.ok) {
    const raw = await res.json().catch(() => null);
    const message =
      raw?.error?.message ??
      raw?.message ??
      res.statusText ??
      `HTTP ${res.status}`;
    const code =
      raw?.error?.code ??
      raw?.code ??
      `HTTP_${res.status}`;
    throw { status: res.status, error: { code, message }, raw };
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}
