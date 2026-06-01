const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";

export const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
