import { create } from 'zustand';
import { FeedbackState, GoogleProfile } from '../types';

interface AppState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userProfile: GoogleProfile | null;
  setUserProfile: (profile: GoogleProfile | null) => void;
  isDriveConnected: boolean;
  setIsDriveConnected: (status: boolean) => void;
  retentionLimit: number;
  setRetentionLimit: (limit: number) => void;
  feedback: FeedbackState;
  setFeedback: (f: FeedbackState) => void;
  closeFeedback: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),
  userProfile: null,
  setUserProfile: (profile) => set({ userProfile: profile }),
  isDriveConnected: false,
  setIsDriveConnected: (status) => set({ isDriveConnected: status }),
  retentionLimit: 10,
  setRetentionLimit: (limit) => set({ retentionLimit: limit }),
  feedback: { isOpen: false, type: "success", title: "", message: "" },
  setFeedback: (f) => set({ feedback: f }),
  closeFeedback: () => set((state) => ({ feedback: { ...state.feedback, isOpen: false } })),
}));