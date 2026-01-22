import { useState } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from '../store/useAppStore';
import { BackupEntry, GoogleProfile } from '../types';

export function useCloud() {
  const { 
    setIsDriveConnected, 
    setUserProfile, 
    isDriveConnected,
    setFeedback 
  } = useAppStore();

  const [zipping, setZipping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<BackupEntry[]>([]);

  const handleLogin = async () => {
    try {
      await invoke<string>("login_google_drive");
      const status = await invoke<boolean>("check_auth_status");
      setIsDriveConnected(status);

      if (status) {
        const profile = await invoke<GoogleProfile>("get_google_user");
        setUserProfile(profile);
        setFeedback({ 
          isOpen: true, 
          type: "success", 
          title: "Conectado!", 
          message: `Bem-vindo, ${profile.name}.` 
        });
      }
    } catch (e) {
      setFeedback({ 
        isOpen: true, 
        type: "error", 
        title: "Erro no Login", 
        message: String(e) 
      });
    }
  };

  const handleLogout = async () => {
    await invoke("logout_google");
    setUserProfile(null);
    setIsDriveConnected(false);
    setFeedback({ 
      isOpen: true, 
      type: "success", 
      title: "Desconectado", 
      message: "Você saiu da sua conta Google." 
    });
  };

  const loadBackups = async (gameName: string) => {
    try {
      const backups = await invoke<BackupEntry[]>("get_backups", { gameName });
      setCloudBackups(backups);
    } catch (e) {
      console.error("Erro ao carregar backups da nuvem:", e);
    }
  };

  const handleCreateZip = async (gameName: string, timestamp: string) => {
    setZipping(true);
    try {
      const res = await invoke<string>("create_zip_for_cloud", {
        gameName,
        timestamp: timestamp.toString(),
      });

      if (res.startsWith("Sucesso")) {
        await loadBackups(gameName);
        setFeedback({ 
          isOpen: true, 
          type: "success", 
          title: "Backup Comprimido", 
          message: "Arquivo ZIP criado com sucesso." 
        });
      }
    } catch (e) {
      setFeedback({ isOpen: true, type: "error", title: "Erro", message: String(e) });
    } finally {
      setZipping(false);
    }
  };

  const handleUpload = async (bkpPath: string, gameName: string) => {
    if (!isDriveConnected) return;
    setUploading(true);
    try {
      const zipPath = bkpPath + ".zip";
      const res = await invoke<string>("upload_to_drive", {
        filePath: zipPath,
        gameName,
      });
      setFeedback({ isOpen: true, type: "success", title: "Upload Concluído", message: res });
    } catch (e) {
      setFeedback({ isOpen: true, type: "error", title: "Falha no Upload", message: String(e) });
    } finally {
      setUploading(false);
    }
  };

  return {
    handleLogin,
    handleLogout,
    loadBackups,
    handleCreateZip,
    handleUpload,
    cloudBackups,
    zipping,
    uploading
  };
}