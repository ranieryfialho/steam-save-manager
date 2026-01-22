import React from 'react';

interface StatusCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub: string;
}

export function StatusCard({ label, value, icon, sub }: StatusCardProps) {
  const isOnline = value === "Online";

  return (
    <div className="glass-card p-5 flex flex-col justify-between h-32 hover:-translate-y-1 transition-transform">
      <div className="flex justify-between items-start">
        <p className="text-[10px] text-gray-400 uppercase font-bold">{label}</p>
        <div className={`p-2 rounded-lg bg-white/5 border border-white/5 ${isOnline ? "bg-green-500/10" : ""}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className={`text-3xl font-bold ${isOnline ? "text-green-400" : "text-white"}`}>
          {value}
        </p>
        <p className="text-[10px] text-gray-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}