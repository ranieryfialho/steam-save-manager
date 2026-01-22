import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LayoutDashboard,
  Gamepad2,
  Cloud,
  Search,
  Bell,
  Download,
  CheckCircle2,
  Loader2,
  Wifi,
  WifiOff,
  XCircle,
  LogIn,
  Settings,
  ShieldCheck
} from "lucide-react";

import { useAppStore } from "./store/useAppStore";
import { useGames } from "./hooks/useGames";
import { useCloud } from "./hooks/useCloud";

// Componentes Modulares
import { NavButton } from "./components/NavButton";
import { GameCard } from "./components/GameCard";
import { StatusCard } from "./components/StatusCard";
import { CloudView } from "./components/CloudView";
import { RestoreModal } from "./components/RestoreModal";
import { SettingsView } from "./components/SettingsView";
import { GameInfo } from "./types";

function App() {
  const { 
    activeTab, 
    setActiveTab, 
    feedback, 
    closeFeedback,
    isDriveConnected, 
    setIsDriveConnected, 
    userProfile, 
    setUserProfile,
    setFeedback
  } = useAppStore();

  const { games, isLoading: gamesLoading } = useGames();
  const { handleLogin, handleLogout } = useCloud();

  const [initStatus, setInitStatus] = useState<string | null>("Iniciando sistema...");
  const [selectedGameForRestore, setSelectedGameForRestore] = useState<GameInfo | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        setInitStatus("Sincronizando banco de dados...");
        await invoke("update_manifest_db");
        
        setInitStatus("Verificando conexão com a nuvem...");
        const authStatus = await invoke<boolean>("check_auth_status");
        setIsDriveConnected(authStatus);

        if (authStatus) {
          const profile = await invoke<any>("get_google_user");
          setUserProfile(profile);
        }
      } catch (error) {
        console.error("Falha na inicialização:", error);
      } finally {
        setInitStatus(null);
      }
    }
    initialize();
  }, [setIsDriveConnected, setUserProfile]);

  if (initStatus) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-steam-bg text-white">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-steam-light/20 blur-xl rounded-full"></div>
          <Loader2 size={48} className="relative text-steam-light animate-spin" />
        </div>
        <h2 className="text-xl font-bold mb-2 tracking-tight">Steam Save Manager</h2>
        <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">{initStatus}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-steam-bg text-white overflow-hidden selection:bg-steam-light/30">
      
      <aside className="w-20 lg:w-64 flex-shrink-0 flex flex-col glass-panel border-r border-white/5 z-20">
        <div className="h-24 flex items-center justify-center lg:justify-start lg:px-6 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-steam-purple to-steam-blue flex items-center justify-center shadow-lg shadow-steam-purple/20 ring-1 ring-white/10">
            <Gamepad2 className="text-white w-6 h-6" />
          </div>
          <span className="hidden lg:block font-bold text-xl tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            SSM Pro
          </span>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
          <NavButton 
            active={activeTab === "dashboard"} 
            onClick={() => setActiveTab("dashboard")} 
            icon={<LayoutDashboard size={22} />} 
            label="Dashboard" 
          />
          <NavButton 
            active={activeTab === "games"} 
            onClick={() => setActiveTab("games")} 
            icon={<Gamepad2 size={22} />} 
            label="Biblioteca" 
          />
          <NavButton 
            active={activeTab === "cloud"} 
            onClick={() => setActiveTab("cloud")} 
            icon={<Cloud size={22} />} 
            label="Nuvem" 
          />
        </nav>
        
        <div className="p-4 border-t border-white/5">
          <NavButton 
            active={activeTab === "settings"} 
            onClick={() => setActiveTab("settings")} 
            icon={<Settings size={22} />} 
            label="Configurações" 
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        <header className="h-20 flex items-center justify-between px-8 glass-panel border-b border-white/5 z-10 mx-6 mt-4 rounded-2xl">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-steam-light transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar jogo..." 
              className="bg-black/20 border border-white/5 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-steam-light/50 w-64 text-gray-200 transition-all"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-steam-light rounded-full border border-steam-bg"></span>
            </button>

            {userProfile ? (
              <div className="relative group cursor-pointer" onClick={handleLogout}>
                <img 
                  src={userProfile.picture} 
                  alt={userProfile.name} 
                  className="w-10 h-10 rounded-full border-2 border-green-500 shadow-lg object-cover" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-12 right-0 bg-black/90 px-3 py-1 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                  Sair de {userProfile.name}
                </div>
              </div>
            ) : (
              <button onClick={handleLogin} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-sm font-bold hover:scale-105 active:scale-95">
                <LogIn size={18} /> Login Google
              </button>
            )}
          </div>
        </header>

        {/* ÁREA DE RENDERIZAÇÃO DE ABAS */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          
          {/* DASHBOARD VIEW */}
          {activeTab === "dashboard" && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="w-full h-56 rounded-3xl relative overflow-hidden shadow-2xl ring-1 ring-white/10">
                <div className="absolute inset-0 bg-gradient-to-r from-steam-purple/90 via-steam-blue/80 to-transparent z-10"></div>
                <img 
                  src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070" 
                  className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40"
                  alt="Background"
                />
                <div className="relative z-20 p-10 h-full flex flex-col justify-end">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-steam-light text-xs font-bold uppercase tracking-wider border border-white/10 w-fit backdrop-blur-md mb-4 shadow-xl">
                    <ShieldCheck size={12} /> Monitoramento SSM Pro Ativo
                  </span>
                  <h2 className="text-4xl font-bold text-white mb-2 tracking-tight text-shadow-lg">Painel de Controle</h2>
                  <p className="text-gray-200 max-w-lg font-medium">
                    Sua biblioteca possui <span className="text-steam-light font-bold">{games.length} jogos</span> mapeados. 
                    Seus saves estão sendo protegidos e versionados automaticamente.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatusCard 
                  label="Total de Jogos" 
                  value={games.length.toString()} 
                  icon={<Gamepad2 className="text-steam-light" />} 
                  sub="Mapeados pela Steam" 
                />
                <StatusCard 
                  label="Status da Nuvem" 
                  value={isDriveConnected ? "Online" : "Offline"} 
                  icon={isDriveConnected ? <Wifi className="text-green-400" /> : <WifiOff className="text-gray-400" />} 
                  sub={isDriveConnected ? `Conectado como ${userProfile?.name}` : "Sincronização desativada"} 
                />
                <StatusCard 
                  label="Backups Locais" 
                  value={games.filter(g => g.last_backup).length.toString()} 
                  icon={<Download className="text-steam-purple" />} 
                  sub="Jogos com pontos de restauração" 
                />
              </div>
            </div>
          )}

          {activeTab === "games" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 animate-in slide-in-from-bottom-4 duration-300">
              {gamesLoading ? (
                <div className="col-span-full py-20 text-center text-gray-500">
                  <Loader2 className="mx-auto animate-spin mb-4 text-steam-light" size={32} />
                  <p className="font-mono text-sm uppercase">Escaneando diretórios da Steam...</p>
                </div>
              ) : (
                games.map(game => (
                  <GameCard 
                    key={game.id} 
                    data={game} 
                    onRestore={() => setSelectedGameForRestore(game)} 
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "cloud" && (
            <CloudView games={games} />
          )}

          {activeTab === "settings" && (
            <SettingsView />
          )}

        </div>
      </main>


      {selectedGameForRestore && (
        <RestoreModal 
          game={selectedGameForRestore} 
          onClose={() => setSelectedGameForRestore(null)}
          onSuccess={() => {}}
        />
      )}

      {feedback.isOpen && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-right-8 duration-300">
          <div className={`bg-[#1b2838]/95 border ${feedback.type === "success" ? "border-green-500/30 shadow-green-500/10" : "border-red-500/30 shadow-red-500/10"} rounded-2xl shadow-2xl p-6 w-85 relative overflow-hidden backdrop-blur-xl ring-1 ring-white/5`}>
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-full ${feedback.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {feedback.type === "success" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-sm tracking-tight">{feedback.title}</h3>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{feedback.message}</p>
              </div>
              <button onClick={closeFeedback} className="text-gray-500 hover:text-white transition-colors self-start p-1">
                <XCircle size={16} />
              </button>
            </div>
            <div className={`absolute bottom-0 left-0 h-1 w-full ${feedback.type === "success" ? "bg-green-500" : "bg-red-500"} opacity-20`}></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;