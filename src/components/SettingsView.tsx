import { useState, useEffect, useRef } from 'react';
import { Settings, ShieldCheck, Activity, FolderSearch, Loader2, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useGames } from '../hooks/useGames';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';

export function SettingsView() {
  const { games } = useGames();
  const { setFeedback, retentionLimit, setRetentionLimit } = useAppStore();
  
  const [activeWatchers, setActiveWatchers] = useState<Record<number, boolean>>({});
  const [loadingWatchers, setLoadingWatchers] = useState<Record<number, boolean>>({});
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRetentionChange = (val: number) => {
    const newVal = val < 1 ? 1 : val;
    setRetentionLimit(newVal);
    setSaveStatus('saving');

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await invoke("save_app_config", { retentionLimit: newVal });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {
        setSaveStatus('idle');
        console.error("Erro ao salvar config:", e);
      }
    }, 800);
  };

  const toggleWatcher = async (gameId: number, gameName: string, isEnabled: boolean) => {
    setLoadingWatchers(p => ({ ...p, [gameId]: true }));
    const newState = !isEnabled;
    try {
      await invoke("toggle_auto_backup", { gameId, gameName, enable: newState });
      setActiveWatchers(p => ({ ...p, [gameId]: newState }));
      setFeedback({
        isOpen: true,
        type: "success",
        title: newState ? "Monitoramento Ativado" : "Monitoramento Removido",
        message: newState ? `Vigiando saves de ${gameName}.` : `Auto-backup parado para ${gameName}.`
      });
    } catch (e) {
      setFeedback({ isOpen: true, type: "error", title: "Erro", message: String(e) });
    } finally {
      setLoadingWatchers(p => ({ ...p, [gameId]: false }));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-5 mb-10">
        <div className="p-4 rounded-2xl bg-steam-purple/10 border border-steam-purple/20 shadow-[0_0_20px_rgba(191,123,255,0.1)]">
          <Settings size={36} className="text-steam-purple" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Configurações Avançadas</h2>
          <p className="text-gray-400 font-medium">Personalize a automação e persistência do sistema.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* MONITORAMENTO */}
        <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6 bg-black/20">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <Activity className="text-steam-light" size={20} />
            <h3 className="font-bold text-lg text-white">Monitoramento em Tempo Real</h3>
          </div>
          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
            {games.map(game => {
              const isEn = activeWatchers[game.id] || false;
              const isL = loadingWatchers[game.id] || false;
              return (
                <div key={game.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-steam-light/30 transition-all">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200 group-hover:text-steam-light transition-colors">{game.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono tracking-wider">APPID: {game.id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {isL && <Loader2 size={16} className="text-steam-light animate-spin" />}
                    <button
                      disabled={isL}
                      onClick={() => toggleWatcher(game.id, game.name, isEn)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${isEn ? 'bg-steam-light' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${isEn ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* POLÍTICAS E DIRETÓRIOS */}
        <div className="space-y-6">
          <div className="glass-panel p-8 rounded-3xl border border-white/5 bg-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 pb-5 mb-6">
              <ShieldCheck className="text-green-400" size={24} />
              <h3 className="font-bold text-xl text-white">Política de Retenção</h3>
            </div>
            
            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">Limite de versões por jogo:</span>
                  <div className="flex items-center gap-4">
                    {/* FEEDBACK VISUAL DE SALVAMENTO */}
                    <div className="flex flex-col items-end">
                       <div className="flex items-center gap-3">
                          {saveStatus === 'saving' && <Loader2 size={16} className="text-steam-light animate-spin" />}
                          {saveStatus === 'saved' && <CheckCircle2 size={16} className="text-green-400 animate-in zoom-in" />}
                          <input 
                            type="number" 
                            min="1" 
                            max="100"
                            value={retentionLimit}
                            onChange={(e) => handleRetentionChange(parseInt(e.target.value) || 1)}
                            className="w-24 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-lg font-bold text-center text-steam-light focus:border-steam-light outline-none transition-all shadow-inner"
                          />
                       </div>
                       <span className={`text-[9px] mt-1 font-bold uppercase tracking-tighter transition-opacity ${saveStatus !== 'idle' ? 'opacity-100' : 'opacity-0'}`}>
                         {saveStatus === 'saving' ? 'Salvando...' : 'Configuração Salva'}
                       </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/5 bg-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 pb-5 mb-6">
              <FolderSearch className="text-steam-purple" size={24} />
              <h3 className="font-bold text-xl text-white">Armazenamento Local</h3>
            </div>
            <div className="p-4 bg-black/30 border border-white/5 rounded-2xl flex items-center justify-between">
              <code className="text-xs text-steam-light truncate">Documents/SaveManagerBackups</code>
              <ChevronRight size={16} className="text-gray-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}