import React from 'react';

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function NavButton({ icon, label, active, onClick }: NavButtonProps) {
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