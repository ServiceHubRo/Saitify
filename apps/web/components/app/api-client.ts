export type ApiErrorBody = { code: string; message: string; fields?: Record<string, string>; retryAfterSec?: number; details?: Record<string, unknown> };
export type ApiResult<T = Record<string, unknown>> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody };

const NETWORK: ApiErrorBody = { code: 'network', message: 'We could not reach Saitlify. Check your connection and try again.' };

/** One place that turns every failure (offline, HTML error page, bad JSON) into a friendly, typed error. */
export async function call<T = Record<string, unknown>>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  try {
    const method = init.method ?? 'POST';
    const sendsJson = method === 'POST' || method === 'PATCH' || method === 'PUT' || init.body !== undefined;
    const res = await fetch(url, {
      method,
      headers: sendsJson ? { 'Content-Type': 'application/json' } : undefined,
      body: sendsJson ? JSON.stringify(init.body ?? {}) : undefined,
      credentials: 'same-origin',
      signal: init.signal,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (res.ok) return { ok: true, status: res.status, data: (data ?? {}) as T };
    const err = (data as { error?: ApiErrorBody } | null)?.error;
    return { ok: false, status: res.status, error: err ?? { code: 'server_error', message: 'Something went wrong. Please try again.' } };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { ok: false, status: 0, error: NETWORK };
  }
}
