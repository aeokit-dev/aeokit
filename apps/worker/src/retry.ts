export interface RetryContext {
  attempt: number;
  maxAttempts: number;
}

export interface RetryOptions {
  maxAttempts: number;
  startingAttempt?: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onAttempt?: (context: RetryContext) => Promise<void> | void;
  sleep?: (delayMs: number) => Promise<void>;
}

export function retryDelay(
  failedAttempt: number,
  baseDelayMs: number,
  maxDelayMs = 30_000,
): number {
  return Math.min(
    baseDelayMs * 2 ** Math.max(0, failedAttempt - 1),
    maxDelayMs,
  );
}

export function isRetryableProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /not configured|credentials?|api[_ ]?key|unsupported|characters or fewer/i.test(
      message,
    )
  ) {
    return false;
  }

  const status = message.match(/failed \((\d{3})\)/)?.[1];
  if (status) {
    const code = Number(status);
    return (
      code === 408 ||
      code === 409 ||
      code === 425 ||
      code === 429 ||
      code >= 500
    );
  }
  return true;
}

export async function retryWithBackoff<T>(
  operation: (context: RetryContext) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let attempt = options.startingAttempt ?? 0;
  if (attempt >= options.maxAttempts) {
    throw new Error(`No attempts remain (${attempt}/${options.maxAttempts})`);
  }

  while (attempt < options.maxAttempts) {
    attempt += 1;
    const context = { attempt, maxAttempts: options.maxAttempts };
    await options.onAttempt?.(context);
    try {
      return await operation(context);
    } catch (error) {
      if (
        attempt >= options.maxAttempts ||
        options.shouldRetry?.(error) === false
      ) {
        throw error;
      }
      await sleep(
        retryDelay(attempt, options.baseDelayMs, options.maxDelayMs ?? 30_000),
      );
    }
  }

  throw new Error("Retry loop ended unexpectedly");
}
