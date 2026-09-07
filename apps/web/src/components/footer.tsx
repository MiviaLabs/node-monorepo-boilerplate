import Link from 'next/link';

import { ThemeToggle } from './theme-toggle';

export function Footer() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'MiviaLabs';
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/70 bg-background/70 backdrop-blur-xs">
      <div className="container py-4">
        <div className="flex min-h-14 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs tracking-wide text-muted-foreground">
            <span className="font-medium text-foreground">{appName}</span>
            <span aria-hidden="true" className="text-muted-foreground/60">
              /
            </span>
            <span>Enterprise Workspace Platform</span>
            <span aria-hidden="true" className="text-muted-foreground/60">
              ·
            </span>
            <span>© {year}</span>
          </div>
          <div className="flex items-center gap-4">
            <nav
              aria-label="Footer links"
              className="flex items-center gap-3 text-xs text-muted-foreground sm:gap-4"
            >
              <Link
                href="/terms"
                className="transition-[color,transform] duration-200 hover:-translate-y-0.5 hover:text-foreground"
              >
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                className="transition-[color,transform] duration-200 hover:-translate-y-0.5 hover:text-foreground"
              >
                Privacy Policy
              </Link>
              <Link
                href="/login"
                className="transition-[color,transform] duration-200 hover:-translate-y-0.5 hover:text-foreground"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="transition-[color,transform] duration-200 hover:-translate-y-0.5 hover:text-foreground"
              >
                Create Account
              </Link>
            </nav>
            <ThemeToggle compact />
          </div>
        </div>
      </div>
    </footer>
  );
}
