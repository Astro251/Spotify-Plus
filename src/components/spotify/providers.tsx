'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { PlayerEngine } from '@/components/spotify/player-engine';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" forcedTheme="dark" defaultTheme="dark">
        <TooltipProvider delayDuration={300}>
          {children}
          <PlayerEngine />
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#282828',
                color: '#fff',
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              },
              duration: 2600,
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
