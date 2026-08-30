export type AeokitClientOptions = {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  fetchFn?: typeof fetch;
};

export class AeokitApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class AeokitClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(options: AeokitClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:3000").replace(
      /\/$/,
      "",
    );
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const response = await this.fetchFn(`${this.baseUrl}${normalizedPath}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : `Aeokit request failed (${response.status})`;
      throw new AeokitApiError(message, response.status);
    }
    return payload as T;
  }
}

export function clientFromEnvironment(): AeokitClient {
  return new AeokitClient({
    baseUrl: process.env.AEOKIT_URL,
    apiKey: process.env.AEOKIT_API_KEY,
  });
}
