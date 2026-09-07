/**
 * Session Info Card Component
 *
 * Server component that displays session information from server-side session data
 */

import { format } from 'date-fns';
import { Clock } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { enterpriseCardVariants } from '../ui/enterprise-styles';

interface SessionInfoCardProps {
  session: {
    authenticated: boolean;
    createdAt: Date | null;
    expiresAt: Date | null;
  };
}

/**
 * Session Information Card
 *
 * Displays current session details (creation time, expiration, auth status)
 */
export function SessionInfoCard({ session }: SessionInfoCardProps) {
  const sessionCreatedAt = session.createdAt ? format(session.createdAt, 'PPpp') : 'N/A';
  const tokenExpiresAt = session.expiresAt ? format(session.expiresAt, 'PPpp') : 'N/A';

  return (
    <Card
      className={`${enterpriseCardVariants()} transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-border/70 hover:bg-card hover:shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)]`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Clock className="h-5 w-5" />
          Active Session Details
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Real-time authenticated state and lifecycle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border border-border bg-muted/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Session Created</p>
            <p className="text-right text-sm text-foreground">{sessionCreatedAt}</p>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Token Expires</p>
            <p className="text-right text-sm text-foreground">{tokenExpiresAt}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Authentication</p>
          <div className="pt-1">
            <Badge variant={session.authenticated ? 'default' : 'secondary'}>
              {session.authenticated ? 'Authenticated' : 'Not authenticated'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
