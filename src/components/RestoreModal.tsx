import { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { X, History, RotateCcw, AlertTriangle } from 'lucide-react';
import { GameInfo, BackupEntry } from '../types';
import { useAppStore } from '../store/useAppStore';

interface RestoreModalProps {
  game: GameInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export function RestoreModal({ game, onClose, onSuccess }: RestoreModalProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { setFeedback } = useAppStore();

  useEffect(() => {
    invoke<BackupEntry[]>("get_backups", { gameName: game.name })
      .then(setBackups)
      .catch(console.error);
  }, [game.name]);

  const handleRestore = async (timestamp: string) => {
    setLoading(true);
    try {
      const res = await invoke<string>("restore_backup", {
        gameId: game.id,
        gameName: game.name,
        timestamp,
      });
      if (res.startsWith("Sucesso")) {
        setFeedback({ isOpen: true, type: "success", title: "Restaurado!", message: "Seus arquivos foram revertidos." });
        onSuccess();
        onClose();
      }
    } catch (e) {
      setFeedback({ isOpen: true, type: "error", title: "Erro", message: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1b2838] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-5 border-b border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2 text-white"><History className="text-steam-light" /> Histórico</h3>
            <p className="text-xs text-gray-400 mt-1">{game.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {backups.map((bkp) => (
            <div key={bkp.name} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-steam-light/50 transition-all">
              <div className="flex flex-col">
                <span className="font-bold text-white text-sm">{bkp.name.replace("_", " ")}</span>
                <span className="text-xs text-gray-500">{bkp.size_mb}</span>
              </div>
              <button
                disabled={loading}
                onClick={() => setConfirming(bkp.name)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase bg-steam-blue/20 text-steam-light hover:bg-steam-light hover:text-white transition-all"
              >
                <RotateCcw size={14} className="inline mr-1" /> Restaurar
              </button>
            </div>
          ))}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4">
          <div className="bg-[#1b2838] border border-red-500/30 rounded-2xl p-6 max-w-sm text-center">
            <AlertTriangle className="text-red-500 w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Tem certeza?</h3>
            <p className="text-sm text-gray-400 mb-6">Isso substituirá seus saves atuais permanentemente.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(null)} className="flex-1 py-2 border border-white/10 rounded-lg text-gray-400">Cancelar</button>
              <button onClick={() => handleRestore(confirming)} className="flex-1 py-2 bg-red-600 rounded-lg font-bold">Sim, Restaurar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}