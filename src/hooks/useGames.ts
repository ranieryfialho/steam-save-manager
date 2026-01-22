import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from "@tauri-apps/api/core";
import { GameInfo } from '../types';

export function useGames() {
  const queryClient = useQueryClient();

  // Busca a lista de jogos instalados
  const gamesQuery = useQuery({
    queryKey: ['installed-games'],
    queryFn: () => invoke<GameInfo[]>("get_installed_games"),
  });

  // Mutação para realizar backup
  const backupMutation = useMutation({
    mutationFn: (game: { id: number; name: string }) => 
      invoke<string>("backup_game", { gameId: game.id, gameName: game.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-games'] });
    },
  });

  return {
    games: gamesQuery.data ?? [],
    isLoading: gamesQuery.isLoading,
    isRefetching: gamesQuery.isRefetching,
    performBackup: backupMutation.mutateAsync,
    isBackingUp: backupMutation.isPending,
  };
}