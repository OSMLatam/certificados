import { failureFromBody } from "./form-feedback";

export type Me = {
  id: string;
  role: "admin" | "editor" | null;
  osmUsername: string;
  isActive: boolean;
  contactEmail?: string;
  instance?: "osm_lat" | "ac3";
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    throw failureFromBody(await response.json().catch(() => null), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
