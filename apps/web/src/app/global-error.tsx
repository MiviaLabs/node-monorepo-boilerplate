'use client';

/**
 * Global Error Boundary
 *
 * Catches errors that occur in the root layout and renders a fallback UI.
 */

export default function GlobalError({
  error: _error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold">Something went wrong!</h1>
            <p className="mt-4 text-muted-foreground">An unexpected error occurred.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded border border-[hsl(var(--primary-border)/0.58)] bg-[linear-gradient(124deg,hsl(var(--primary-gradient-from))_0%,hsl(var(--primary-gradient-via))_46%,hsl(var(--primary-gradient-to))_100%)] px-4 py-2 text-slate-950 shadow-[0_14px_30px_-18px_hsl(var(--primary)/0.72),inset_0_1px_0_hsl(0_0%_100%/0.34)] transition-all hover:brightness-105 dark:text-slate-50"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
