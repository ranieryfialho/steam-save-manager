import { useState } from 'react';
import { Cloud, LogIn, LogOut, Gamepad2, FileArchive, UploadCloud } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useCloud } from '../hooks/useCloud';
import { GameInfo } from '../types';

interface CloudViewProps {
  games: GameInfo[];
}

export function CloudView({ games }: CloudViewProps) {
  const { userProfile, isDriveConnected } = useAppStore();
  const { 
    handleLogin, handleLogout, loadBackups, handleCreateZip, 
    handleUpload, cloudBackups, zipping, uploading 
  } = useCloud();

  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);

  const selectGame = (game: GameInfo) => {
    setSelectedGame(game);
    loadBackups(game.name);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-steam-blue/10 border border-steam-blue/20">
            <Cloud size={32} className="text-steam-blue" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">Central da Nuvem</h2>
            <p className="text-gray-400">Gerencie seus backups no Google Drive.</p>
          </div>
        </div>

        {userProfile ? (
          <button onClick={handleLogout} className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">
            <LogOut size={18} /> Desconectar
          </button>
        ) : (
          <button onClick={handleLogin} className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg bg-white text-black hover:bg-gray-200">
            <LogIn size={18} /> Conectar Google Drive
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Jogos com Backup</h3>
          {games.filter((g) => g.last_backup).map((game) => (
            <div
              key={game.id}
              onClick={() => selectGame(game)}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                selectedGame?.id === game.id ? "bg-steam-blue/20 border-steam-blue/50 shadow-lg" : "bg-white/5 border-white/5 hover:bg-white/10"
              }`}
            >
              <span className="font-bold text-sm truncate">{game.name}</span>
              <Cloud size={16} className={selectedGame?.id === game.id ? "text-steam-light" : "text-gray-600"} />
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 bg-[#1b2838] border border-white/10 rounded-2xl p-6 min-h-[400px]">
          {selectedGame ? (
            <>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <Gamepad2 className="text-steam-light" /> Gerenciar: {selectedGame.name}
              </h3>
              <div className="space-y-3">
                {cloudBackups.map((bkp) => {
                  const date = bkp.name.split("_")[0].split("-").reverse().join("/");
                  return (
                    <div key={bkp.name} className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
                      <div>
                        <p className="font-bold text-white">{date}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-300">{bkp.size_mb}</span>
                          {bkp.has_zip && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/20">ZIP Pronto</span>}
                        </div>
                      </div>

                      {bkp.has_zip ? (
                        <button
                          onClick={() => handleUpload(bkp.path, selectedGame.name)}
                          disabled={uploading}
                          className="px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 bg-steam-purple hover:bg-steam-purple/80 transition-colors"
                        >
                          <UploadCloud size={16} /> {uploading ? "Enviando..." : "Upload"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCreateZip(selectedGame.name, bkp.name)}
                          disabled={zipping}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-colors"
                        >
                          <FileArchive size={16} /> {zipping ? "..." : "Comprimir"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Cloud size={48} className="mb-4 opacity-20" />
              <p>Selecione um jogo à esquerda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}