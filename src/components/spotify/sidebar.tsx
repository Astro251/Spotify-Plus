'use client';

import { BarChart3, Clock3, Heart, Home, Library, Plus, Search } from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { EqualizerBars } from '@/components/spotify/ui-bits/equalizer-bars';
import { CreatePlaylistDialog } from '@/components/spotify/ui-bits/create-playlist-dialog';
import { usePlaylists } from '@/hooks/queries';
import { SpotifyLogo } from '@/lib/icons';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import { cn } from '@/lib/utils';

function SideItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-4 rounded-md px-3 py-2.5 text-[0.95rem] font-bold transition-colors',
        active ? 'text-white' : 'text-subdued hover:text-white'
      )}
    >
      <Icon className="h-6 w-6 shrink-0" strokeWidth={active ? 2.5 : 2} />
      {label}
    </button>
  );
}

function SidePinRow({
  icon,
  iconBg,
  title,
  subtitle,
  active,
  playing,
  isPlaying,
  onClick,
  iconLabel,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  active: boolean;
  playing: boolean;
  isPlaying: boolean;
  onClick: () => void;
  iconLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={iconLabel}
      className={cn(
        'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-white/10',
        active && 'bg-white/10'
      )}
    >
      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded shadow-md', iconBg)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {playing && <EqualizerBars playing={isPlaying} className="h-3 w-3.5" />}
          <p className={cn('truncate text-sm font-medium', playing ? 'text-spotify' : 'text-white')}>{title}</p>
        </div>
        <p className="truncate text-xs text-subdued">{subtitle}</p>
      </div>
    </button>
  );
}

/** Desktop left sidebar: nav + library list (hidden on mobile). */
export function Sidebar() {
  const playlists = usePlaylists();
  const stack = useNav((s) => s.stack);
  const view = stack[stack.length - 1];
  const tab = useNav((s) => s.tab);
  const setTab = useNav((s) => s.setTab);
  const push = useNav((s) => s.push);
  const context = usePlayer((s) => s.context);
  const isPlaying = usePlayer((s) => s.isPlaying);

  const activePlaylistSlug = view.type === 'playlist' ? view.id : null;
  const likedIsPlaying = context?.id === 'liked' && isPlaying;

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col gap-2 md:flex lg:w-[300px]">
      <div className="rounded-lg bg-elevated pb-2 pt-4">
        <div className="mb-2 flex items-center gap-2 px-4">
          <SpotifyLogo className="h-8 w-8 text-white" />
          <span className="text-xl font-black tracking-tight text-white">Spotify</span>
        </div>
        <nav className="space-y-1 px-2">
          <SideItem icon={Home} label="Home" active={tab === 'home'} onClick={() => setTab('home')} />
          <SideItem icon={Search} label="Search" active={tab === 'search'} onClick={() => setTab('search')} />
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-elevated">
        <div className="flex items-center justify-between px-4 pt-4">
          <button
            type="button"
            onClick={() => setTab('library')}
            className={cn(
              'flex items-center gap-3 rounded-md px-1 py-1 text-[0.95rem] font-bold transition-colors',
              tab === 'library' ? 'text-white' : 'text-subdued hover:text-white'
            )}
          >
            <Library className="h-6 w-6" />
            Your Library
          </button>
          <CreatePlaylistDialog
            trigger={
              <button
                type="button"
                aria-label="Create playlist"
                suppressHydrationWarning
                className="flex h-8 w-8 items-center justify-center rounded-full text-subdued transition hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
            }
          />
        </div>

        <div className="scrollbar-thin mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {/* Liked songs pinned */}
          <SidePinRow
            icon={<Heart className="h-5 w-5 fill-white text-white" />}
            iconBg="bg-gradient-to-br from-[#4a1d96] to-[#a04bd8]"
            title="Liked Songs"
            subtitle="Playlist • You"
            active={view.type === 'liked'}
            playing={likedIsPlaying}
            isPlaying={isPlaying}
            onClick={() => push({ type: 'liked', title: 'Liked Songs' })}
            iconLabel="Liked Songs"
          />

          {/* Recently played pinned */}
          <SidePinRow
            icon={<Clock3 className="h-5 w-5 text-white" />}
            iconBg="bg-gradient-to-br from-[#1f5f4f] to-[#38b98c]"
            title="Recently played"
            subtitle="History"
            active={view.type === 'history'}
            playing={context?.id === 'history' && isPlaying}
            isPlaying={isPlaying}
            onClick={() => push({ type: 'history', title: 'Recently played' })}
            iconLabel="Recently played"
          />

          {/* Top played stats pinned */}
          <SidePinRow
            icon={<BarChart3 className="h-5 w-5 text-white" />}
            iconBg="bg-gradient-to-br from-[#a4133c] to-[#ff4d6d]"
            title="Top played"
            subtitle="Your listening stats"
            active={view.type === 'stats'}
            playing={context?.id === 'stats' && isPlaying}
            isPlaying={isPlaying}
            onClick={() => push({ type: 'stats', title: 'Top played' })}
            iconLabel="Top played"
          />

          {playlists.data?.map((p) => {
            const isActive = activePlaylistSlug === p.slug || activePlaylistSlug === p.id;
            const ctxId = context?.id;
            const isPlayingContext =
              (ctxId === `playlist:${p.slug}` || ctxId === `playlist:${p.id}`) && isPlaying;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => push({ type: 'playlist', id: p.slug, title: p.name })}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-white/10',
                  isActive && 'bg-white/10'
                )}
              >
                <Cover
                  src={p.cover}
                  from={p.coverFrom}
                  to={p.coverTo}
                  icon={p.icon}
                  mosaic={p.mosaic}
                  alt={`${p.name} cover`}
                  className="h-12 w-12 rounded"
                  iconClassName="h-5 w-5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isPlayingContext && <EqualizerBars playing={isPlaying} className="h-3 w-3.5" />}
                    <p className={cn('truncate text-sm font-medium', (isPlayingContext || ctxId === `playlist:${p.slug}` || ctxId === `playlist:${p.id}`) ? 'text-spotify' : 'text-white')}>
                      {p.name}
                    </p>
                  </div>
                  <p className="truncate text-xs text-subdued">
                    Playlist • {p.owner}
                  </p>
                </div>
              </button>
            );
          })}

          {playlists.isLoading && (
            <div className="space-y-2 px-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-12 w-12 animate-pulse rounded bg-highlight" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-highlight" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-highlight" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
