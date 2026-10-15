"use client";
export interface AuthContext {
  setupRequired: boolean;
  emailRecoveryEnabled?: boolean;
  csrfToken: string;
}
export async function authContext(signal?: AbortSignal): Promise<AuthContext> {
  const response = await fetch("/api/auth/context", {
    cache: "no-store",
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Layanan login belum siap.");
  return body;
}
export async function authPost(
  action: string,
  input: unknown,
  csrfToken: string,
) {
  if (["bootstrap", "login", "recovery", "reset"].includes(action)) {
    // Tabs and idle login pages may carry a stale token. Refresh before any credential submission.
    csrfToken = (await authContext()).csrfToken;
  }
  const response = await fetch("/api/auth/" + action, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Permintaan gagal.");
  return body as { message?: string; redirectTo?: string };
}
