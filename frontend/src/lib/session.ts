// Session boundary: auth is an httpOnly cookie the backend owns; the frontend's one
// duty is wiping the react-query cache so one account's data never renders for the next.
import { queryClient } from "./queryClient";
import { apiPost } from "./api";

// Call after every successful login/signup.
export function beginSession(): void {
  queryClient.clear();
}

// Call from every sign-out control; the hard redirect resets all in-memory state.
export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } finally {
    queryClient.clear();
    window.location.assign(redirectTo);
  }
}

// Uploads bypass the Vercel proxy on purpose. Vercel rejects request bodies over ~4.5 MB
// with FUNCTION_PAYLOAD_TOO_LARGE, and blueprint sets routinely exceed that. JSON calls
// stay on the relative /api prefix (small bodies, cached by Vercel); file uploads go
// straight to the backend. In dev, the env var is unset and we fall back to /api so the
// Vite proxy keeps working locally.
const UPLOAD_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

// Multipart upload — the typed JSON helpers in lib/api.ts can't carry a FormData body.
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const url = UPLOAD_BASE ? `${UPLOAD_BASE}/api${path}` : `/api${path}`;
  const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  }
  return (await res.json()) as T;
}