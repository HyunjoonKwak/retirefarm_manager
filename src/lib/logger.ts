/**
 * Minimal server-side logger.
 * debug/info are suppressed in production unless LOG_VERBOSE=true.
 * warn/error always pass through.
 */

const verbose =
  process.env.NODE_ENV !== "production" || process.env.LOG_VERBOSE === "true";

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs): void => {
    if (verbose) console.debug(...args);
  },
  info: (...args: LogArgs): void => {
    if (verbose) console.info(...args);
  },
  warn: (...args: LogArgs): void => {
    console.warn(...args);
  },
  error: (...args: LogArgs): void => {
    console.error(...args);
  },
};
