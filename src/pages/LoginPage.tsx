import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { toast } from 'sonner';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = await login(email, password);
    if (success) {
      toast.success('Welcome back!');
      navigate('/');
    } else {
      setError('Invalid email or password. Please check your credentials and try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-kitan-bg">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-0 left-0 opacity-30" />
        <div className="hero-glow bottom-0 right-0 opacity-20" />
      </div>

      <div className="w-full max-w-md z-10 animate-fade-in">
        {/* Logo */}
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
          <h2 className="font-display text-2xl font-bold text-kitan-off-white">Welcome Back</h2>
          <p className="text-kitan-muted text-sm mt-1">Sign in to access gifts, documents, pictures & formats</p>
        </div>

        <div className="card-kitan p-8">
          {error && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 mb-5">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  className="input-kitan pl-9 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle hover:text-kitan-muted">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-kitan-teal text-sm hover:text-kitan-teal-bright transition-colors">
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
              {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Sign In <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-kitan-muted text-sm mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="text-kitan-teal hover:text-kitan-teal-bright font-semibold transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
