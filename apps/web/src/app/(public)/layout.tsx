import { AppLayout } from '~/components/app-layout';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background">
      <AppLayout>{children}</AppLayout>
    </div>
  );
}
