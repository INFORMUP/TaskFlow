import { config } from "@/config";

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
    "Content-Type": "application/json",
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

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw { status: res.status, ...error };
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}
