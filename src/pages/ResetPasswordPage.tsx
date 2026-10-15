/**
 * ResetPasswordPage — landed on from the password-reset email link.
 * Supabase exchanges the link for a recovery session automatically
 * (PASSWORD_RECOVERY event); the user then sets a new password.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // The email link can arrive in either form:
    //  1. ConfirmationURL → supabase-js exchanges it automatically and fires
    //     PASSWORD_RECOVERY with a session.
    //  2. Token link (?token=…&type=recovery) → verify explicitly.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) setRecoveryReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true);
    }).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token && params.get('type') === 'recovery') {
      supabase.auth.verifyOtp({ type: 'recovery', token_hash: token })
        .then(({ data }) => { if (data.session) setRecoveryReady(true); })
        .catch(() => undefined);
    }
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      setDone(true);
      toast.success('Password updated! Please sign in with your new password.');
      setTimeout(() => { void supabase.auth.signOut(); navigate('/login'); }, 2200);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-kitan-bg">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-0 left-0 opacity-30" />
        <div className="hero-glow bottom-0 right-0 opacity-20" />
      </div>

      <div className="w-full max-w-md z-10 animate-fade-in">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-gradient flex items-center justify-center shadow-teal-glow">
              <span className="text-white font-display font-bold text-xl">K</span>
            </div>
            <div className="text-left">
              <h1 className="font-display font-bold text-kitan-off-white text-sm">KITAN SOCIAL HUB</h1>
              <p className="text-kitan-teal text-xs">Premium Global Services</p>
            </div>
          </Link>
          <h2 className="font-display text-2xl font-bold text-kitan-off-white">Set New Password</h2>
          <p className="text-kitan-muted text-sm mt-1">Choose a new password for your account</p>
        </div>

        <div className="card-kitan p-8">
          {done ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 size={40} className="text-kitan-teal mx-auto" />
              <p className="text-kitan-off-white font-semibold">Password updated</p>
              <p className="text-kitan-muted text-sm">Redirecting you to sign in…</p>
            </div>
          ) : !recoveryReady ? (
            <div className="space-y-4 text-center">
              <AlertCircle size={40} className="text-amber-400 mx-auto" />
              <p className="text-kitan-off-white font-semibold">Waiting for reset link…</p>
              <p className="text-kitan-muted text-sm leading-relaxed">
                Open this page only through the link in your reset email. If your link has expired,
                request a new one.
              </p>
              <Link to="/forgot-password" className="btn-secondary text-sm inline-block">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 mb-2">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}
              {[
                { label: 'New Password', value: password, set: setPassword, ph: 'At least 6 characters' },
                { label: 'Confirm Password', value: confirm, set: setConfirm, ph: 'Repeat your new password' },
              ].map(({ label, value, set, ph }) => (
                <div key={label}>
                  <label className="text-kitan-muted text-sm mb-1.5 block">{label}</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      className="input-kitan pl-9 pr-10"
                      placeholder={ph}
                      value={value}
                      onChange={e => set(e.target.value)}
                    />
                    {label === 'Confirm Password' && (
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle hover:text-kitan-muted">
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="submit" disabled={saving} className="btn-primary w-full py-3.5">
                {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-kitan-muted text-sm mt-5">
          <Link to="/login" className="text-kitan-teal hover:text-kitan-teal-bright font-semibold transition-colors">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
