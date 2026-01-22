import { getToken } from "./auth";

function handleRedirectForStatus(status: number) {
  if (typeof window === "undefined") return;
  if (![401, 403, 404].includes(status)) return;
  const token = getToken();
  if (!token) {
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?redirect=${redirect}`;
    return;
  }
  if (window.location.pathname !== "/home") {
    window.location.href = "/home";
  }
}


const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function api<T>(
  path: string,
  opts: { method?: HttpMethod; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    handleRedirectForStatus(res.status);
    // 응답 바디가 json일 수도 있고 아닐 수도 있어 안전하게 처리
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function apiForm<T>(
  path: string,
  form: FormData,
  opts: { method?: HttpMethod; headers?: Record<string, string> } = {}
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
      // ⚠️ Content-Type 절대 직접 넣지 말기 (브라우저가 boundary 포함해서 자동 설정함)
    },
    body: form,
  });

  if (!res.ok) {
    handleRedirectForStatus(res.status);
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}
