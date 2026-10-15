import React, { useState } from 'react';
import { User, Mail, Phone, Shield, Edit3, Save, X, Copy, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });

  if (!user) {
    return (
      <div className="text-center py-20">
        <User size={48} className="text-kitan-subtle mx-auto mb-4" />
        <p className="text-kitan-muted">Please sign in to view your profile.</p>
      </div>
    );
  }

  const handleSave = () => {
    updateUser({ name: form.name, phone: form.phone });
    setEditing(false);
    toast.success('Profile updated!');
  };

  const copyReferral = async () => {
    await navigator.clipboard.writeText(user.referralCode);
    toast.success('Referral code copied!');
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="section-heading">My Profile</h1>

      {/* Avatar & Name */}
      <div className="card-kitan p-6 flex items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-teal-gradient flex items-center justify-center shadow-teal-glow flex-shrink-0">
          <span className="text-white font-display font-bold text-3xl">{user.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1">
          <h2 className="font-display font-bold text-kitan-off-white text-xl">{user.name}</h2>
          <p className="text-kitan-muted text-sm">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs px-2 py-1 rounded-full border capitalize ${user.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-400/30' : 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30'}`}>
              {user.role}
            </span>
            {user.emailVerified && (
              <span className="text-xs px-2 py-1 rounded-full bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/30 flex items-center gap-1">
                <Shield size={10} /> Verified
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => { setEditing(!editing); setForm({ name: user.name, phone: user.phone || '' }); }}
          className="btn-ghost p-2"
        >
          {editing ? <X size={18} /> : <Edit3 size={18} />}
        </button>
      </div>

      {/* Payment History Quick Link */}
      <button
        onClick={() => navigate('/transactions')}
        className="card-kitan p-5 flex items-center gap-4 w-full text-left hover:border-kitan-teal transition-colors group"
      >
        <div className="w-12 h-12 rounded-2xl bg-kitan-teal/10 flex items-center justify-center flex-shrink-0">
          <CreditCard size={24} className="text-kitan-teal" />
        </div>
        <div className="flex-1">
          <p className="text-kitan-off-white font-semibold text-sm">Payment History</p>
          <p className="text-kitan-subtle text-xs mt-0.5">View all your Flutterwave transactions and access purchased content</p>
        </div>
        <span className="text-kitan-subtle group-hover:text-kitan-teal transition-colors text-xs font-semibold">View →</span>
      </button>

      {/* Edit Form */}
      {editing && (
        <div className="card-kitan p-6 space-y-4 animate-fade-in">
          <h3 className="font-semibold text-kitan-off-white">Edit Profile</h3>
          <div>
            <label className="text-kitan-muted text-sm mb-1.5 block">Full Name</label>
            <input type="text" className="input-kitan" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-kitan-muted text-sm mb-1.5 block">Phone Number</label>
            <input type="tel" className="input-kitan" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+234 800 000 0000" />
          </div>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={16} /> Save Changes
          </button>
        </div>
      )}

      {/* Details */}
      <div className="card-kitan p-6 space-y-4">
        <h3 className="font-semibold text-kitan-off-white mb-1">Account Details</h3>
        {[
          { icon: User, label: 'Full Name', value: user.name },
          { icon: Mail, label: 'Email', value: user.email },
          { icon: Phone, label: 'Phone', value: user.phone || 'Not set' },
          { icon: Shield, label: 'Member Since', value: formatDate(user.createdAt) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-4 p-3 rounded-xl bg-kitan-bg border border-kitan-border">
            <div className="w-9 h-9 rounded-xl bg-kitan-surface flex items-center justify-center flex-shrink-0">
              <Icon size={16} className="text-kitan-teal" />
            </div>
            <div>
              <p className="text-kitan-subtle text-xs">{label}</p>
              <p className="text-kitan-off-white text-sm font-medium">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Referral */}
      <div className="card-kitan p-6">
        <h3 className="font-semibold text-kitan-off-white mb-3">Your Referral Code</h3>
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-kitan-bg border-2 border-kitan-teal/40">
          <span className="font-mono font-bold text-kitan-teal text-lg flex-1 tracking-widest">{user.referralCode}</span>
          <button onClick={copyReferral} className="w-9 h-9 rounded-xl bg-kitan-card flex items-center justify-center text-kitan-subtle hover:text-kitan-teal hover:bg-kitan-teal/10 transition-all">
            <Copy size={16} />
          </button>
        </div>
        <p className="text-kitan-subtle text-xs mt-2">Share this code to earn rewards per referral</p>
      </div>
    </div>
  );
};

export default ProfilePage;
