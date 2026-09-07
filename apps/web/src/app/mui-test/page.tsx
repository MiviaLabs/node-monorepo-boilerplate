import { CheckCircle2, Palette, PanelsTopLeft } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export default function MuiTestPage() {
  return (
    <div className="container py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="space-y-1 border-b border-border/70 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            DESIGN QA
          </p>
          <h1 className="text-[1.7rem] font-semibold tracking-tight text-foreground">
            Converted workspace surface
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            This route now verifies the active admin-aligned design system instead of the old
            MUI/Flexy theme stack.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-primary">
                <Palette className="h-5 w-5" />
              </div>
              <CardTitle className="pt-3">Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                Shared blue-gray semantic tokens now drive both web and admin surfaces.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-primary">
                <PanelsTopLeft className="h-5 w-5" />
              </div>
              <CardTitle className="pt-3">Shell</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                Public, auth, and protected layouts now use the same compact shell language.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <CardTitle className="pt-3">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                The active runtime no longer depends on the previous MUI provider path.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
