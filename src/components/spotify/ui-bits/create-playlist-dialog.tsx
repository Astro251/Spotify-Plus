'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreatePlaylist } from '@/hooks/queries';
import { useNav } from '@/lib/store/navigation';

interface CreatePlaylistDialogProps {
  trigger: React.ReactNode;
}

export function CreatePlaylistDialog({ trigger }: CreatePlaylistDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreatePlaylist();
  const push = useNav((s) => s.push);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, description: description.trim() || undefined },
      {
        onSuccess: (playlist) => {
          setOpen(false);
          setName('');
          setDescription('');
          push({ type: 'playlist', id: playlist.id, title: playlist.name });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-white/10 bg-[#282828] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create playlist</DialogTitle>
          <DialogDescription className="text-subdued">
            Give your playlist a name and a vibe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="playlist-name" className="text-sm font-semibold text-white">
              Name
            </label>
            <Input
              id="playlist-name"
              autoFocus
              placeholder="My Playlist #1"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className="h-11 border-white/20 bg-highlight text-white placeholder:text-subdued/70"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="playlist-desc" className="text-sm font-semibold text-white">
              Description <span className="font-normal text-subdued">(optional)</span>
            </label>
            <Textarea
              id="playlist-desc"
              placeholder="Add an optional description"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] border-white/20 bg-highlight text-white placeholder:text-subdued/70"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={!name.trim() || create.isPending}
            className="h-10 rounded-full bg-spotify px-8 font-bold text-black hover:bg-[#1fdf64] hover:text-black"
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
