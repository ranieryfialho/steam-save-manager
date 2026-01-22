import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from "@tauri-apps/api/core";
import { GameInfo } from '../types';
import { useAppStore } from '../store/useAppStore';

export function useGames() {
  const queryClient = useQueryClient();
  const { retentionLimit } = useAppStore();

  const gamesQuery = useQuery({
    queryKey: ['installed-games'],
    queryFn: () => invoke<GameInfo[]>("get_installed_games"),
  });

  const backupMutation = useMutation({
    mutationFn: (game: { id: number; name: string }) => 
      invoke<string>("backup_game", { 
        gameId: game.id, 
        gameName: game.name,
        retentionLimit 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-games'] });
    },
  });

  return {
    games: gamesQuery.data ?? [],
    isLoading: gamesQuery.isLoading,
    performBackup: backupMutation.mutateAsync,
  };
}