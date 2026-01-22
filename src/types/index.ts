export interface GameInfo {
  id: number;
  name: string;
  install_dir: string;
  last_backup?: string;
}

export interface BackupEntry {
  name: string;
  path: string;
  has_zip: boolean;
  size_mb: string;
}

export interface GoogleProfile {
  name: string;
  picture: string;
}

export interface FeedbackState {
  isOpen: boolean;
  type: "success" | "error";
  title: string;
  message: string;
}