/**
 * Dev-only logger utility
 * In production builds, these calls will be stripped by terser (drop_console)
 * In dev mode, logs are displayed normally for debugging
 */

const isDev = import.meta.env.DEV;

/**
 * Log messages only in development mode
 */
export const devLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log(...args);
  }
};

/**
 * Log warnings only in development mode
 */
export const devWarn = (...args: unknown[]): void => {
  if (isDev) {
    console.warn(...args);
  }
};

/**
 * Log errors only in development mode
 * Note: You may want to keep some error logs in production for monitoring
 */
export const devError = (...args: unknown[]): void => {
  if (isDev) {
    console.error(...args);
  }
};
