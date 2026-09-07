import { AuthShell } from './auth-shell';

interface AuthPageShellProps {
  children: React.ReactNode;
}

export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <AuthShell
      title="Access your workspace."
      description="Manage organization workloads, team memberships, and security policies from a single surface."
    >
      {children}
    </AuthShell>
  );
}
