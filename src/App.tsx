import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LayoutDashboard,
  Gamepad2,
  Cloud,
  Settings,
  Search,
  Bell,
  Download,
  CheckCircle2,
  History,
  RotateCcw,
  X,
  AlertTriangle,
  XCircle,
  FileArchive,
  UploadCloud,
  LogIn,
  LogOut,
  Loader2,
  Database,
  ScanSearch,
  Wifi,
  WifiOff,
} from "lucide-react";

interface GameInfo {
  id: number;
  name: string;
  install_dir: string;
  last_backup?: string;
}

interface BackupEntry {
  name: String;
  path: String;
  has_zip: boolean;
  size_mb: string;
}

interface GoogleProfile {
  name: string;
  picture: string;
}

interface ConfirmState {
  isOpen: boolean;
  gameName: string;
  timestamp: string;
}

interface FeedbackState {
  isOpen: boolean;
  type: "success" | "error";
  title: string;
  message: string;
}

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(
    "Iniciando sistema..."
  );

  // Estados Nuvem
  const [selectedCloudGame, setSelectedCloudGame] = useState<GameInfo | null>(
    null
  );
  const [cloudBackups, setCloudBackups] = useState<BackupEntry[]>([]);
  const [zipping, setZipping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [userProfile, setUserProfile] = useState<GoogleProfile | null>(null);

  // Estados Restauração e Feedback
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedGameForRestore, setSelectedGameForRestore] =
    useState<GameInfo | null>(null);
  const [backupsList, setBackupsList] = useState<BackupEntry[]>([]);
  const [restoring, setRestoring] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmState>({
    isOpen: false,
    gameName: "",
    timestamp: "",
  });
  const [feedback, setFeedback] = useState<FeedbackState>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  // --- FUNÇÃO DE REFRESH (A MÁGICA ACONTECE AQUI) ---
  // Esta função relê o disco e atualiza a interface
  async function refreshLibrary() {
    try {
      const gamesFound = await invoke<GameInfo[]>("get_installed_games");
      setGames(gamesFound);
    } catch (e) {
      console.error("Erro ao atualizar biblioteca:", e);
    }
  }

  // --- INICIALIZAÇÃO DO SISTEMA ---
  useEffect(() => {
    async function initSystem() {
      try {
        setLoadingStatus("Sincronizando banco de dados (Manifesto)...");
        try {
          await invoke("update_manifest_db");
        } catch (e) {
          console.warn("Falha no manifesto:", e);
        }

        setLoadingStatus("Escaneando biblioteca de jogos instalados...");
        await new Promise((r) => setTimeout(r, 500));
        
        // Usa a função de refresh que criamos
        await refreshLibrary();

        setLoadingStatus("Verificando conexão com a nuvem...");
        const status = await invoke<boolean>("check_auth_status");
        setIsDriveConnected(status);

        if (status) {
          try {
            const profile = await invoke<GoogleProfile>("get_google_user");
            setUserProfile(profile);
          } catch (e) {
            console.error("Erro ao buscar perfil:", e);
          }
        }
      } catch (error) {
        console.error(error);
        showFeedback("error", "Erro de Inicialização", String(error));
      } finally {
        setLoadingStatus(null);
      }
    }
    initSystem();
  }, []);

  // --- LÓGICA DE NUVEM ---

  async function handleGoogleLogin() {
    try {
      await invoke<string>("login_google_drive");
      const status = await invoke<boolean>("check_auth_status");
      setIsDriveConnected(status);

      if (status) {
        const profile = await invoke<GoogleProfile>("get_google_user");
        setUserProfile(profile);
        showFeedback("success", "Conectado!", `Bem-vindo, ${profile.name}.`);
      }
    } catch (e) {
      showFeedback("error", "Erro no Login", String(e));
    }
  }

  async function handleLogout() {
    await invoke("logout_google");
    setUserProfile(null);
    setIsDriveConnected(false);
    showFeedback("success", "Desconectado", "Você saiu da sua conta Google.");
  }

  async function loadCloudBackups(game: GameInfo) {
    setSelectedCloudGame(game);
    try {
      const backups = await invoke<BackupEntry[]>("get_backups", {
        gameName: game.name,
      });
      setCloudBackups(backups);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateZip(timestamp: string) {
    if (!selectedCloudGame) return;
    setZipping(true);
    try {
      const res = await invoke<string>("create_zip_for_cloud", {
        gameName: selectedCloudGame.name,
        timestamp: timestamp.toString(),
      });

      if (res.startsWith("Sucesso")) {
        await loadCloudBackups(selectedCloudGame);
        showFeedback(
          "success",
          "Backup Comprimido",
          "Arquivo ZIP criado com sucesso."
        );
      } else {
        showFeedback("error", "Erro ao Comprimir", res);
      }
    } catch (e) {
      showFeedback("error", "Erro Crítico", String(e));
    } finally {
      setZipping(false);
    }
  }

  async function handleUpload(bkpPath: String) {
    if (!selectedCloudGame) return;
    if (!isDriveConnected) {
      showFeedback(
        "error",
        "Não Conectado",
        "Faça login no Google Drive primeiro."
      );
      return;
    }

    setUploading(true);
    try {
      const zipPath = bkpPath + ".zip";
      const res = await invoke<string>("upload_to_drive", {
        filePath: zipPath,
        gameName: selectedCloudGame.name,
      });

      showFeedback("success", "Upload Organizado!", res);
    } catch (e) {
      showFeedback("error", "Falha no Upload", String(e));
    } finally {
      setUploading(false);
    }
  }

  // --- LÓGICA DE RESTAURAÇÃO ---
  async function openRestoreModal(game: GameInfo) {
    setSelectedGameForRestore(game);
    setRestoreModalOpen(true);
    setBackupsList([]);
    try {
      const backups = await invoke<BackupEntry[]>("get_backups", {
        gameName: game.name,
      });
      setBackupsList(backups);
    } catch (e) {
      console.error(e);
    }
  }

  function requestRestore(timestamp: string) {
    if (!selectedGameForRestore) return;
    setConfirmAction({
      isOpen: true,
      gameName: selectedGameForRestore.name,
      timestamp: timestamp.toString(),
    });
  }

  async function executeRestore() {
    if (!selectedGameForRestore) return;
    setConfirmAction({ ...confirmAction, isOpen: false });
    setRestoring(true);
    try {
      const res = await invoke<string>("restore_backup", {
        gameId: selectedGameForRestore.id,
        gameName: selectedGameForRestore.name,
        timestamp: confirmAction.timestamp,
      });
      if (res.startsWith("Sucesso")) {
        setRestoreModalOpen(false);
        showFeedback(
          "success",
          "Restauração Concluída",
          "Arquivos revertidos com sucesso."
        );
      } else {
        showFeedback("error", "Falha na Restauração", res);
      }
    } catch (e) {
      showFeedback("error", "Erro Crítico", String(e));
    } finally {
      setRestoring(false);
    }
  }

  function showFeedback(
    type: "success" | "error",
    title: string,
    message: string
  ) {
    setFeedback({ isOpen: true, type, title, message });
  }

  const gamesWithBackupCount = games.filter((g) => g.last_backup).length;

  return (
    <div className="flex h-screen w-full font-sans selection:bg-steam-light selection:text-white bg-steam-bg text-white relative">
      {/* SIDEBAR */}
      <aside className="w-20 lg:w-64 flex-shrink-0 flex flex-col glass-panel border-r-0 border-r-white/5 z-20">
        <div className="h-24 flex items-center justify-center lg:justify-start lg:px-6 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-steam-purple to-steam-blue flex items-center justify-center shadow-lg shadow-steam-purple/20 ring-1 ring-white/10">
            <Gamepad2 className="text-white w-6 h-6" />
          </div>
          <span className="hidden lg:block font-bold text-xl tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Steam Save Manager
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
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 flex items-center justify-between px-8 glass-panel border-b border-b-white/5 z-10 mx-6 mt-4 rounded-2xl">
          <div className="relative group">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-steam-light transition-colors"
              size={18}
            />
            <input
              type="text"
              placeholder="Buscar save..."
              className="bg-black/20 border border-white/5 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-steam-light/50 w-64 text-gray-200"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors relative text-gray-400 hover:text-white">
              <Bell size={20} />
            </button>

            {userProfile ? (
              <div
                className="relative group cursor-pointer"
                onClick={handleLogout}
                title="Clique para sair"
              >
                <img
                  src={userProfile.picture}
                  alt={userProfile.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full border-2 border-green-500 shadow-lg object-cover"
                />
                <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border border-[#1b2838]"></div>
                <div className="absolute top-12 right-0 bg-black/90 px-3 py-1 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Sair de {userProfile.name}
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 border-2 border-white/10 shadow-lg flex items-center justify-center">
                <Cloud size={16} className="text-gray-400" />
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
          {loadingStatus ? (
            <div className="flex flex-col items-center justify-center h-[60vh] animate-in fade-in zoom-in duration-500">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-steam-light/20 blur-xl rounded-full"></div>
                <div className="relative bg-[#1b2838] p-6 rounded-full border border-white/10 shadow-2xl">
                  <Loader2
                    size={48}
                    className="text-steam-light animate-spin"
                  />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                Carregando Sistema
              </h2>
              <div className="flex items-center gap-2 text-gray-400 bg-black/20 px-4 py-2 rounded-full border border-white/5">
                {loadingStatus.includes("Manifesto") && (
                  <Database size={14} className="text-steam-purple" />
                )}
                {loadingStatus.includes("biblioteca") && (
                  <ScanSearch size={14} className="text-steam-blue" />
                )}
                {loadingStatus.includes("nuvem") && (
                  <Cloud size={14} className="text-green-400" />
                )}
                <span className="text-sm font-mono">{loadingStatus}</span>
              </div>
            </div>
          ) : (
            <>
              {/* PAINEL NUVEM */}
              {activeTab === "cloud" && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-4 rounded-2xl bg-steam-blue/10 border border-steam-blue/20">
                        <Cloud size={32} className="text-steam-blue" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-bold text-white">
                          Central da Nuvem
                        </h2>
                        <p className="text-gray-400">
                          Gerencie seus backups no Google Drive.
                        </p>
                      </div>
                    </div>

                    {userProfile ? (
                      <button
                        onClick={handleLogout}
                        className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                      >
                        <LogOut size={18} /> Desconectar
                      </button>
                    ) : (
                      <button
                        onClick={handleGoogleLogin}
                        className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg bg-white text-black hover:bg-gray-200"
                      >
                        <LogIn size={18} /> Conectar Google Drive
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Lista Jogos Nuvem */}
                    <div className="lg:col-span-1 space-y-3">
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Jogos com Backup
                      </h3>
                      {games
                        .filter((g) => g.last_backup)
                        .map((game) => (
                          <div
                            key={game.id}
                            onClick={() => loadCloudBackups(game)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              selectedCloudGame?.id === game.id
                                ? "bg-steam-blue/20 border-steam-blue/50 shadow-lg shadow-steam-blue/10"
                                : "bg-white/5 border-white/5 hover:bg-white/10"
                            }`}
                          >
                            <span className="font-bold text-sm truncate">
                              {game.name}
                            </span>
                            <Cloud
                              size={16}
                              className={
                                selectedCloudGame?.id === game.id
                                  ? "text-steam-light"
                                  : "text-gray-600"
                              }
                            />
                          </div>
                        ))}
                    </div>

                    {/* Detalhes Nuvem (Direita) */}
                    <div className="lg:col-span-2 bg-[#1b2838] border border-white/10 rounded-2xl p-6 min-h-[400px]">
                      {selectedCloudGame ? (
                        <>
                          <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                            <Gamepad2 className="text-steam-light" />
                            Gerenciar: {selectedCloudGame.name}
                          </h3>
                          <div className="space-y-3">
                            {cloudBackups.map((bkp) => {
                              const date = bkp.name
                                .toString()
                                .split("_")[0]
                                .split("-")
                                .reverse()
                                .join("/");
                              return (
                                <div
                                  key={bkp.name.toString()}
                                  className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
                                >
                                  <div>
                                    <p className="font-bold text-white">
                                      {date}
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-300">
                                        {bkp.size_mb}
                                      </span>
                                      {bkp.has_zip && (
                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/20">
                                          ZIP Pronto
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {bkp.has_zip ? (
                                    <button
                                      onClick={() => handleUpload(bkp.path)}
                                      disabled={uploading}
                                      className={`px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-colors shadow-lg
                                        ${
                                          uploading
                                            ? "bg-steam-purple/50 cursor-wait"
                                            : "bg-steam-purple hover:bg-steam-purple/80 shadow-steam-purple/20"
                                        }`}
                                    >
                                      {uploading ? (
                                        "Enviando..."
                                      ) : (
                                        <>
                                          <UploadCloud size={16} /> Upload
                                        </>
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      disabled={zipping}
                                      onClick={() =>
                                        handleCreateZip(bkp.name.toString())
                                      }
                                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-colors text-gray-300 hover:text-white"
                                    >
                                      {zipping ? (
                                        "..."
                                      ) : (
                                        <>
                                          <FileArchive size={16} /> Comprimir
                                        </>
                                      )}
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
                          <p>Selecione um jogo à esquerda para gerenciar.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* DASHBOARD & GAMES */}
              {activeTab !== "cloud" && (
                <>
                  {activeTab === "dashboard" && (
                    <div className="w-full h-64 rounded-2xl relative overflow-hidden group shadow-2xl shadow-black/50 ring-1 ring-white/10 mb-8">
                      <div className="absolute inset-0 bg-gradient-to-r from-steam-purple via-steam-blue to-steam-bg opacity-90 z-0"></div>
                      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070')] bg-cover bg-center mix-blend-overlay opacity-60 group-hover:scale-105 transition-transform duration-700 z-1"></div>
                      <div className="relative z-10 p-8 h-full flex flex-col justify-end">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-steam-light text-xs font-bold uppercase tracking-wider border border-white/10 w-fit backdrop-blur-md shadow-lg">
                          <CheckCircle2 size={12} /> Sistema Online
                        </span>
                        <h2 className="text-4xl font-bold text-white mt-4 mb-2 tracking-tight drop-shadow-xl">
                          Bem-vindo de volta
                        </h2>
                        <p className="text-gray-200 max-w-lg font-medium drop-shadow-md">
                          O Steam Save Manager está protegendo{" "}
                          <span className="text-steam-light font-bold">
                            {games.length} jogos
                          </span>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === "dashboard" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                      <StatusCard
                        label="Total de Jogos"
                        value={games.length.toString()}
                        icon={<Gamepad2 className="text-steam-light" />}
                        sub="Instalados"
                      />
                      <StatusCard
                        label="Backups Locais"
                        value={gamesWithBackupCount.toString()}
                        icon={<Download className="text-steam-purple" />}
                        sub="Jogos Salvos"
                      />
                      <StatusCard
                        label="Status da Nuvem"
                        value={isDriveConnected ? "Online" : "Offline"}
                        icon={
                          isDriveConnected ? (
                            <Wifi className="text-green-400" />
                          ) : (
                            <WifiOff className="text-gray-400" />
                          )
                        }
                        sub={isDriveConnected ? "Conectado" : "Desconectado"}
                      />
                      <StatusCard
                        label="Versão do App"
                        value="v0.1.0"
                        icon={<Settings className="text-gray-500" />}
                        sub="Beta / Dev"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {games.map((game) => (
                      <GameCard
                        key={game.id}
                        data={game}
                        onRestore={() => openRestoreModal(game)}
                        onBackupSuccess={refreshLibrary} // PASSA A FUNÇÃO DE REFRESH AQUI
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* --- MODAIS --- */}

      {!loadingStatus && restoreModalOpen && selectedGameForRestore && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#1b2838] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-steam-blue/20 to-transparent">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                  <History className="text-steam-light" size={20} /> Histórico
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedGameForRestore.name}
                </p>
              </div>
              <button
                onClick={() => setRestoreModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
              {backupsList.length === 0 ? (
                <div className="text-center py-10">
                  <History className="mx-auto text-gray-600 mb-3" size={32} />
                  <p className="text-gray-500">Nenhum backup encontrado.</p>
                </div>
              ) : (
                backupsList.map((bkp) => {
                  const datePart = bkp.name
                    .toString()
                    .split("_")[0]
                    .split("-")
                    .reverse()
                    .join("/");
                  const timePart = bkp.name
                    .toString()
                    .split("_")[1]
                    .replace(/-/g, ":")
                    .substring(0, 5);
                  return (
                    <div
                      key={bkp.name.toString()}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-steam-light/50 hover:bg-white/10 transition-all group"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-sm flex items-center gap-2">
                          {datePart}
                          <span className="text-xs font-normal text-gray-500 bg-black/30 px-1.5 rounded">
                            Local
                          </span>
                        </span>
                        <span className="text-xs text-gray-400 font-mono mt-0.5">
                          {timePart} • Restore Point
                        </span>
                      </div>
                      <button
                        disabled={restoring}
                        onClick={() => requestRestore(bkp.name.toString())}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase flex items-center gap-2 bg-steam-blue/20 text-steam-light hover:bg-steam-light hover:text-white border border-transparent hover:border-steam-light/20 transition-all"
                      >
                        {restoring ? (
                          "..."
                        ) : (
                          <>
                            <RotateCcw size={14} /> Restaurar
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAction.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in zoom-in duration-200">
          <div className="bg-[#1b2838] border border-red-500/30 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.2)] w-full max-w-md p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50"></div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                <AlertTriangle className="text-red-500 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Atenção! Ação Destrutiva
              </h3>
              <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                Você está prestes a restaurar um backup. Isso irá{" "}
                <span className="text-red-400 font-bold">
                  APAGAR PERMANENTEMENTE
                </span>{" "}
                o save atual.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() =>
                    setConfirmAction({ ...confirmAction, isOpen: false })
                  }
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeRestore}
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-600/20 transition-all"
                >
                  Sim, Restaurar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`bg-[#1b2838] border ${
              feedback.type === "success"
                ? "border-green-500/30"
                : "border-red-500/30"
            } rounded-2xl shadow-2xl w-full max-w-sm p-6 relative`}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 border ${
                  feedback.type === "success"
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 size={32} />
                ) : (
                  <XCircle size={32} />
                )}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {feedback.title}
              </h3>
              <p className="text-gray-400 text-sm mb-6">{feedback.message}</p>
              <button
                onClick={() => setFeedback({ ...feedback, isOpen: false })}
                className="w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SUB-COMPONENTES ---

function NavButton({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center lg:justify-start justify-center gap-4 p-3 rounded-xl transition-all duration-300 group relative overflow-hidden ${
        active
          ? "bg-gradient-to-r from-steam-blue to-steam-purple text-white border border-white/10"
          : "text-gray-400 hover:bg-white/5"
      }`}
    >
      <div className="relative z-10">{icon}</div>
      <span className="hidden lg:block font-medium relative z-10 text-sm">
        {label}
      </span>
      {active && (
        <div className="absolute inset-0 bg-white/10 mix-blend-overlay"></div>
      )}
    </button>
  );
}

function StatusCard({ label, value, icon, sub }: any) {
  const isOnline = value === "Online";
  const isOffline = value === "Offline";

  return (
    <div className="glass-card p-5 flex flex-col justify-between h-32 hover:-translate-y-1 transition-transform">
      <div className="flex justify-between items-start">
        <p className="text-[10px] text-gray-400 uppercase font-bold">
          {label}
        </p>
        <div
          className={`p-2 rounded-lg bg-white/5 border border-white/5 ${
            isOnline ? "bg-green-500/10" : ""
          }`}
        >
          {icon}
        </div>
      </div>
      <div>
        <p
          className={`text-3xl font-bold ${
            isOnline
              ? "text-green-400"
              : isOffline
              ? "text-gray-400"
              : "text-white"
          }`}
        >
          {value}
        </p>
        <p className="text-[10px] text-gray-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function GameCard({
  data,
  onRestore,
  onBackupSuccess, // Recebe a função de refresh
}: {
  data: GameInfo;
  onRestore: () => void;
  onBackupSuccess: () => void;
}) {
  const [lastBackup, setLastBackup] = useState<string | null>(
    data.last_backup || null
  );
  const [loading, setLoading] = useState(false);

  const steamImage = `https://cdn.cloudflare.steamstatic.com/steam/apps/${data.id}/header.jpg`;

  async function handleBackup() {
    setLoading(true);
    try {
      const result = await invoke<string>("backup_game", {
        gameId: data.id,
        gameName: data.name,
      });
      if (result.startsWith("Sucesso")) {
        setLastBackup(result.split(":")[1]); // Atualiza o Card localmente
        onBackupSuccess(); // Atualiza a tela inteira (incluindo dashboard)
      } else {
        alert(result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const isDone = !!lastBackup;
  const formattedDate = lastBackup
    ? lastBackup.split("_")[0].split("-").reverse().join("/") +
      " " +
      lastBackup.split("_")[1].replace(/-/g, ":").substring(0, 5)
    : "";

  return (
    <div
      className={`glass-card group flex flex-col h-full bg-[#1b2838] transition-all duration-300 border-white/5 hover:border-steam-light/30 overflow-hidden relative ${
        isDone ? "ring-1 ring-green-500/30" : ""
      }`}
    >
      {/* HEADER DA IMAGEM DO JOGO */}
      <div className="h-32 w-full bg-gray-900 relative overflow-hidden">
        {/* Imagem de Fundo (SEM ZOOM, APENAS OPACIDADE) */}
        <div className="absolute inset-0">
          <img
            src={steamImage}
            alt={data.name}
            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        {/* Ícone de Fallback */}
        <div className="absolute inset-0 flex items-center justify-center -z-10">
          <Gamepad2 className="text-white/10 w-12 h-12" />
        </div>

        {/* Gradiente Corrigido */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1b2838] via-[#1b2838]/70 to-transparent z-10"></div>

        {/* Status Check */}
        <div className="z-10 absolute top-2 right-2">
          {isDone && (
            <div className="bg-green-500 text-black p-1 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-in zoom-in duration-300">
              <CheckCircle2 size={12} strokeWidth={3} />
            </div>
          )}
        </div>
      </div>

      {/* CONTEÚDO DO CARD */}
      <div className="p-4 flex flex-col flex-1 relative z-20 -mt-2">
        <h4
          className="font-bold text-base text-gray-100 leading-tight line-clamp-1 mb-1 group-hover:text-steam-light transition-colors"
          title={data.name}
        >
          {data.name}
        </h4>

        <div className="flex items-center gap-2 mb-4">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isDone ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "bg-gray-500"
            }`}
          ></div>
          <p
            className={`text-[10px] font-medium uppercase tracking-wide ${
              isDone ? "text-green-400" : "text-gray-500"
            }`}
          >
            {isDone ? `Backup: ${formattedDate}` : "Nunca realizado"}
          </p>
        </div>

        <div className="mt-auto flex gap-2">
          <button
            onClick={handleBackup}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
              loading
                ? "bg-steam-blue/20 border-steam-blue/20 text-steam-blue cursor-wait"
                : isDone
                ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                : "bg-white/5 border-white/10 hover:bg-steam-light hover:text-white hover:border-steam-light hover:shadow-lg hover:shadow-steam-light/20 text-gray-300"
            }`}
          >
            {loading ? "..." : isDone ? "Novo Backup" : "Backup"}
          </button>
          <button
            onClick={onRestore}
            className="px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors"
            title="Histórico"
          >
            <History size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;