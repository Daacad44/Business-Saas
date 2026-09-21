export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface ApiEnvelope<T> {
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const json = (await res.json()) as ApiEnvelope<T>;

  if (!res.ok || json.error) {
    throw new ApiError(
      json.error?.code ?? "REQUEST_FAILED",
      json.error?.message ?? "Request failed",
      res.status,
      json.error?.details,
    );
  }

  return json;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await request<T>(path, init);
  return json.data;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export async function apiPaginated<T>(path: string, init?: RequestInit): Promise<PaginatedResult<T>> {
  const json = await request<T[]>(path, init);
  const meta = json.meta as PaginationMeta | undefined;
  return {
    items: json.data,
    meta: meta ?? { page: 1, pageSize: json.data.length, total: json.data.length, totalPages: 1 },
  };
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
