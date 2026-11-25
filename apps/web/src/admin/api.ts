export type Me = {
  id: string;
  role: "admin" | "editor" | null;
  osmUsername: string;
  isActive: boolean;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { details?: { message: string }[] } | null;
    const message =
      body?.details?.[0]?.message ??
      (response.status === 401 ? "Inicia sesión para usar el panel." : response.status === 403 ? "Tu sesión no tiene acceso." : "No se pudo completar.");
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
