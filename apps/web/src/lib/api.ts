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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const json = (await res.json()) as {
    data: T;
    error: { code: string; message: string; details?: unknown } | null;
  };

  if (!res.ok || json.error) {
    throw new ApiError(
      json.error?.code ?? "REQUEST_FAILED",
      json.error?.message ?? "Request failed",
      res.status,
      json.error?.details,
    );
  }

  return json.data;
}
