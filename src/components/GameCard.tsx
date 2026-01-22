import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Gamepad2, CheckCircle2, History, Loader2 } from 'lucide-react';
import { useGames } from '../hooks/useGames';
import { GameInfo } from '../types';

interface GameCardProps {
  data: GameInfo;
  onRestore: () => void;
}

export function GameCard({ data, onRestore }: GameCardProps) {
  const { performBackup } = useGames();
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  
  const isDone = !!data.last_backup;
  const steamImage = `https://cdn.cloudflare.steamstatic.com/steam/apps/${data.id}/header.jpg`;

  useEffect(() => {
    let unlisten: any;
    
    async function setupListener() {
      unlisten = await listen<string>('backup-status', (event) => {
        if (isLocalLoading) {
          setStatusMessage(event.payload);
        }
      });
    }

    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, [isLocalLoading]);

  const handleBackupClick = async () => {
    setIsLocalLoading(true);
    setStatusMessage("Preparando...");
    try {
      await performBackup({ id: data.id, name: data.name });
    } catch (e) {
      console.error(e);
      setStatusMessage("Falha no backup");
    } finally {
      setTimeout(() => {
        setIsLocalLoading(false);
        setStatusMessage("");
      }, 1500);
    }
  };

  const formattedDate = data.last_backup
    ? data.last_backup.split("_")[0].split("-").reverse().join("/") +
      " " + data.last_backup.split("_")[1].replace(/-/g, ":").substring(0, 5)
    : "";

  return (
    <div className={`glass-card group flex flex-col h-full bg-[#1b2838] transition-all duration-300 border-white/5 hover:border-steam-light/30 overflow-hidden relative ${isDone ? "ring-1 ring-green-500/30" : ""}`}>
      <div className="h-32 w-full bg-gray-900 relative overflow-hidden">
        <img src={steamImage} alt={data.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1b2838] via-[#1b2838]/70 to-transparent z-10"></div>
        <div className="z-10 absolute top-2 right-2">
          {isDone && (
            <div className="bg-green-500 text-black p-1 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-in zoom-in">
              <CheckCircle2 size={12} strokeWidth={3} />
            </div>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1 relative z-20 -mt-2">
        <h4 className="font-bold text-base text-gray-100 leading-tight line-clamp-1 mb-1 group-hover:text-steam-light" title={data.name}>
          {data.name}
        </h4>

        <div className="flex items-center gap-2 mb-4">
          <div className={`w-1.5 h-1.5 rounded-full ${isDone ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "bg-gray-500"}`}></div>
          <p className={`text-[10px] font-medium uppercase tracking-wide ${isDone ? "text-green-400" : "text-gray-500"}`}>
            {isDone ? `Backup: ${formattedDate}` : "Nunca realizado"}
          </p>
        </div>

        <div className="mt-auto flex gap-2">
          <button
            onClick={handleBackupClick}
            disabled={isLocalLoading}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all border flex flex-col items-center justify-center min-h-[42px] ${
              isLocalLoading
                ? "bg-steam-blue/20 border-steam-blue/20 text-steam-blue cursor-wait"
                : isDone
                ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                : "bg-white/5 border-white/10 hover:bg-steam-light hover:text-white text-gray-300"
            }`}
          >
            {isLocalLoading ? (
              <>
                <Loader2 size={14} className="animate-spin mb-1" />
                <span className="text-[9px] lowercase animate-pulse">{statusMessage}</span>
              </>
            ) : isDone ? (
              "Novo Backup"
            ) : (
              "Backup"
            )}
          </button>
          <button onClick={onRestore} className="px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <History size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}