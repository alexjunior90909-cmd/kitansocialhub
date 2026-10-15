/**
 * ForgotPasswordPage — request a secure password reset email via Supabase Auth.
 * Always shows a success message (never reveals whether an email is registered).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err && !/rate|too many/i.test(err.message)) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
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
          <h2 className="font-display text-2xl font-bold text-kitan-off-white">Reset Password</h2>
          <p className="text-kitan-muted text-sm mt-1">Enter your email and we'll send you a secure reset link</p>
        </div>

        <div className="card-kitan p-8">
          {sent ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 size={40} className="text-kitan-teal mx-auto" />
              <p className="text-kitan-off-white font-semibold">Check your inbox</p>
              <p className="text-kitan-muted text-sm leading-relaxed">
                If an account exists for <span className="text-kitan-teal">{email}</span>, a password
                reset link is on its way. The link expires in one hour.
              </p>
              <button onClick={() => setSent(false)} className="btn-secondary text-sm">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 mb-2">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                  <input
                    type="email"
                    required
                    className="input-kitan pl-9"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
                {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Send Reset Link <ArrowRight size={16} /></>}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-kitan-muted text-sm mt-5">
          Remembered it?{' '}
          <Link to="/login" className="text-kitan-teal hover:text-kitan-teal-bright font-semibold transition-colors">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
