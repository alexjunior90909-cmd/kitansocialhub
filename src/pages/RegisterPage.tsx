import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, ArrowRight, Gift } from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { toast } from 'sonner';

const RegisterPage: React.FC = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', referral: '' });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Valid email is required';
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const success = await register(form.name, form.email, form.password, form.referral || undefined);
    if (success) {
      toast.success('Account created! Welcome to KITAN!');
      navigate('/');
    } else {
      setErrors({ email: 'Email already registered. Try signing in.' });
    }
  };

  const f = (k: string, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-kitan-bg">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow -top-20 -right-20 opacity-30" />
        <div className="hero-glow bottom-0 left-0 opacity-20" />
      </div>
      <div className="w-full max-w-md z-10 animate-fade-in">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-gradient flex items-center justify-center shadow-teal-glow">
              <span className="text-white font-display font-bold text-xl">K</span>
            </div>
            <div className="text-left">
              <h1 className="font-display font-bold text-kitan-off-white text-sm">KITAN SOCIAL HUB</h1>
              <p className="text-kitan-teal text-xs">Premium Global Gifting</p>
            </div>
          </Link>
          <h2 className="font-display text-2xl font-bold text-kitan-off-white">Create Account</h2>
          <p className="text-kitan-muted text-sm mt-1">Join thousands accessing global services & gifts</p>
        </div>

        <div className="card-kitan p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { key: 'name', label: 'Full Name', type: 'text', icon: User, placeholder: 'John Doe' },
              { key: 'email', label: 'Email Address', type: 'email', icon: Mail, placeholder: 'you@example.com' },
            ].map(({ key, label, type, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="text-kitan-muted text-sm mb-1.5 block">{label}</label>
                <div className="relative">
                  <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                  <input
                    type={type}
                    className={`input-kitan pl-9 ${errors[key] ? 'border-red-500' : ''}`}
                    placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={e => f(key, e.target.value)}
                  />
                </div>
                {errors[key] && <p className="text-red-400 text-xs mt-1">{errors[key]}</p>}
              </div>
            ))}

            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`input-kitan pl-9 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={e => f('password', e.target.value)}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle hover:text-kitan-muted">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Confirm Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                <input
                  type="password"
                  className={`input-kitan pl-9 ${errors.confirm ? 'border-red-500' : ''}`}
                  placeholder="Repeat password"
                  value={form.confirm}
                  onChange={e => f('confirm', e.target.value)}
                />
              </div>
              {errors.confirm && <p className="text-red-400 text-xs mt-1">{errors.confirm}</p>}
            </div>

            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Referral Code <span className="text-kitan-subtle">(optional · get $10 bonus)</span></label>
              <div className="relative">
                <Gift size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                <input
                  type="text"
                  className="input-kitan pl-9"
                  placeholder="KITAN-XXXX-XXXX"
                  value={form.referral}
                  onChange={e => f('referral', e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 mt-2">
              {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create Account <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-kitan-muted text-sm mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-kitan-teal hover:text-kitan-teal-bright font-semibold transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
