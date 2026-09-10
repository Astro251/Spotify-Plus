import { AppShell } from '@/components/spotify/app-shell';
import { Providers } from '@/components/spotify/providers';

export default function Page() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
