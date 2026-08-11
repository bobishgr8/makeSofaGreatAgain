import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
