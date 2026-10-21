const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Starts browser error reporting to GlitchTip/Sentry; a no-op without a DSN. */
export function initBrowserMonitoring() {
  if (!dsn) return;
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
    }),
  );
}

/** Reports an error caught by an error boundary. */
export function reportError(error: unknown) {
  if (!dsn) return;
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.captureException(error),
  );
}
