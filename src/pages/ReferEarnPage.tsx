import React, { useState } from 'react';
import { Users, Copy, CheckCircle, Gift, TrendingUp, Share2 } from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { toast } from 'sonner';

const ReferEarnPage: React.FC = () => {
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const referralCode = user?.referralCode || 'KITAN-XXXX';
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const copyCode = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="section-heading">Refer & Earn</h1>
        <p className="text-kitan-muted text-sm mt-1">Share KITAN with friends and earn wallet credits for every referral</p>
      </div>

      {/* Hero card */}
      <div className="relative overflow-hidden rounded-3xl bg-teal-gradient p-8 shadow-teal-glow-lg">
        <div className="hero-glow -top-20 -right-20 opacity-40" />
        <div className="relative z-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <Gift size={32} className="text-white" />
          </div>
          <h2 className="font-display text-3xl font-bold text-white mb-2">Earn $10 Per Referral</h2>
          <p className="text-white/80 text-sm">For every friend who signs up and places their first order, you both get $10 wallet credit!</p>
        </div>
      </div>

      {/* How it works */}
      <div className="card-kitan p-6">
        <h2 className="font-display font-bold text-kitan-off-white mb-5">How It Works</h2>
        <div className="space-y-4">
          {[
            { step: 1, title: 'Share Your Code', desc: 'Copy your unique referral code or link and share with friends.' },
            { step: 2, title: 'Friend Signs Up', desc: 'Your friend creates an account using your referral code.' },
            { step: 3, title: 'Both Earn $10', desc: 'When they place their first order, you both receive $10 wallet credit!' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex items-start gap-4 p-4 rounded-xl bg-kitan-bg border border-kitan-border">
              <div className="w-9 h-9 rounded-full bg-kitan-teal flex items-center justify-center flex-shrink-0 shadow-teal-glow">
                <span className="text-white font-bold text-sm">{step}</span>
              </div>
              <div>
                <p className="text-kitan-off-white font-semibold text-sm">{title}</p>
                <p className="text-kitan-muted text-sm mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Referral code */}
      {user ? (
        <div className="card-kitan p-6 space-y-4">
          <h2 className="font-display font-bold text-kitan-off-white">Your Referral Code</h2>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-kitan-bg border-2 border-kitan-teal/40">
            <span className="font-mono font-bold text-kitan-teal text-xl tracking-widest flex-1">{referralCode}</span>
            <button
              onClick={() => copyCode(referralCode, 'Referral code')}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${copied ? 'bg-kitan-teal/20 text-kitan-teal' : 'bg-kitan-card text-kitan-subtle hover:text-kitan-teal hover:bg-kitan-teal/10'}`}
            >
              {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
            </button>
          </div>

          <div>
            <p className="text-kitan-subtle text-xs mb-2">Or share your referral link:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={referralLink}
                className="input-kitan text-xs flex-1 truncate"
              />
              <button
                onClick={() => copyCode(referralLink, 'Referral link')}
                className="btn-secondary text-sm px-4 py-3 flex-shrink-0 flex items-center gap-2"
              >
                <Share2 size={14} /> Copy
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-kitan p-6 text-center">
          <Users size={32} className="text-kitan-subtle mx-auto mb-3" />
          <p className="text-kitan-off-white font-semibold mb-2">Sign in to get your referral code</p>
          <a href="/login" className="btn-primary text-sm inline-block mt-2">Sign In</a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Referrals', value: '0', icon: Users },
          { label: 'Earnings', value: '$0', icon: TrendingUp },
          { label: 'Pending', value: '$0', icon: Gift },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="card-kitan p-4 text-center">
            <Icon size={20} className="text-kitan-teal mx-auto mb-2" />
            <p className="text-kitan-off-white font-bold text-2xl">{value}</p>
            <p className="text-kitan-subtle text-xs">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReferEarnPage;
