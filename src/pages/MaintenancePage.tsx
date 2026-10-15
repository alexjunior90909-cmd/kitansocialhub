import React from 'react';
import { Settings, Clock, Wrench } from 'lucide-react';
import logoUrl from '@/assets/logo.png';

const MaintenancePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-kitan-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-kitan-teal/5 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-kitan-teal/5 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-md w-full">
        {/* Glassmorphism card */}
        <div className="bg-kitan-surface/80 backdrop-blur-xl border border-kitan-border rounded-3xl p-8 md:p-12 text-center shadow-2xl">

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-gradient flex items-center justify-center shadow-teal-glow">
                <span className="text-white font-display font-bold text-2xl">K</span>
              </div>
              <div className="text-left">
                <p className="font-display font-bold text-kitan-off-white text-xl leading-tight">KITAN</p>
                <p className="text-kitan-teal text-sm font-semibold">SOCIAL HUB</p>
              </div>
            </div>
          </div>

          {/* Animated maintenance icon */}
          <div className="relative flex items-center justify-center mb-8">
            {/* Outer rotating ring */}
            <div className="absolute w-28 h-28 rounded-full border-2 border-dashed border-kitan-teal/30 animate-spin" style={{ animationDuration: '8s' }} />
            {/* Middle pulsing ring */}
            <div className="absolute w-20 h-20 rounded-full border border-kitan-teal/20 animate-pulse" />
            {/* Center icon */}
            <div className="w-16 h-16 rounded-2xl bg-kitan-teal/10 border border-kitan-teal/30 flex items-center justify-center">
              <Wrench size={28} className="text-kitan-teal animate-bounce" style={{ animationDuration: '2s' }} />
            </div>
            {/* Orbiting dots */}
            <div className="absolute w-2 h-2 rounded-full bg-kitan-teal shadow-teal-glow"
              style={{
                top: '50%', left: '50%',
                transform: 'translateX(-50%) translateY(-50%)',
                animation: 'orbit 4s linear infinite',
                marginTop: '-56px',
              }}
            />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-kitan-teal/60"
              style={{
                top: '50%', left: '50%',
                transform: 'translateX(-50%) translateY(-50%)',
                animation: 'orbit 6s linear infinite reverse',
                marginTop: '56px',
              }}
            />
          </div>

          {/* Title */}
          <h1 className="font-display font-bold text-kitan-off-white text-2xl md:text-3xl mb-3">
            Under Maintenance
          </h1>

          {/* Divider */}
          <div className="w-16 h-0.5 bg-kitan-teal/40 rounded-full mx-auto mb-4" />

          {/* Message */}
          <p className="text-kitan-muted text-base leading-relaxed mb-8">
            Website is currently under maintenance.
            <br />
            <span className="text-kitan-teal font-medium">Please check back later.</span>
          </p>

          {/* Status chips */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-kitan-bg border border-kitan-border rounded-full px-4 py-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-kitan-muted text-xs font-medium">Maintenance in progress</span>
            </div>
            <div className="flex items-center gap-2 bg-kitan-bg border border-kitan-border rounded-full px-4 py-2">
              <Clock size={12} className="text-kitan-teal" />
              <span className="text-kitan-muted text-xs font-medium">Be right back</span>
            </div>
          </div>

          {/* Footer */}
          <p className="text-kitan-subtle text-xs mt-8">
            © {new Date().getFullYear()} Kitan Social Hub. All rights reserved.
          </p>
        </div>
      </div>

      {/* CSS for orbit animation */}
      <style>{`
        @keyframes orbit {
          from { transform: translateX(-50%) translateY(-56px) rotate(0deg) translateX(56px) rotate(0deg); }
          to   { transform: translateX(-50%) translateY(-56px) rotate(360deg) translateX(56px) rotate(-360deg); }
        }
      `}</style>
    </div>
  );
};

export default MaintenancePage;
