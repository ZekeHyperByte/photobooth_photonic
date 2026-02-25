/**
 * Camera Utility Functions
 *
 * Helper functions for camera operations with timeouts and error handling.
 */

import { cameraLogger } from "./logger";

/**
 * Execute an operation with a timeout.
 * This wraps blocking synchronous operations (like FFI calls) in a Promise
 * that will reject if the operation takes longer than the timeout.
 */
export async function withTimeout<T>(
  operation: () => T,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      // Run the operation in a setImmediate to allow the timeout to be set up first
      setImmediate(() => {
        try {
          const result = operation();
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Execute an async operation with a timeout.
 */
export async function withAsyncTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Async operation '${operationName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Retry an operation with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  operationName: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        cameraLogger.debug(`${operationName}: Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        cameraLogger.warn(`${operationName}: Attempt ${attempt + 1} failed, will retry`, {
          error: lastError.message,
        });
      }
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Execute an operation with both timeout and retry.
 */
export async function withTimeoutAndRetry<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  maxRetries: number,
  baseDelayMs: number,
  operationName: string
): Promise<T> {
  return withRetry(
    () => withAsyncTimeout(operation, timeoutMs, operationName),
    maxRetries,
    baseDelayMs,
    operationName
  );
}
