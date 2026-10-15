import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Gift, FileText, Camera, Layout, Phone, Receipt, TrendingUp,
  Wallet, Clock, MapPin, ShoppingBag, HeadphonesIcon, User, LogOut,
  Grid3X3, X, ChevronLeft, ChevronRight, Globe, Crown, Zap, Star, Shield,
  Sparkles, Users,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// Flat ordered nav — no section grouping
const NAV_ITEMS = [
  { to: '/',                   icon: Home,            label: 'Home',              end: true  },
  { to: '/gifts',              icon: Gift,            label: 'Gift Items',        end: false },
  { to: '/documents',          icon: FileText,        label: 'Documents',         end: false },
  { to: '/working-pictures',   icon: Camera,          label: 'Working Pictures',  end: false },
  { to: '/formats',            icon: Layout,          label: 'Formats',           end: false },
  { to: '/virtual-numbers',    icon: Phone,           label: 'Virtual Numbers',   end: false },
  { to: '/receipt-generator',  icon: Receipt,         label: 'Receipt Generator', end: false },
  { to: '/account-boosting',   icon: TrendingUp,      label: 'Account Boosting',  end: false },
  { to: '/social-accounts',    icon: Users,           label: 'Social Accounts',   end: false },
  { to: '/website',            icon: Globe,           label: 'Website',           end: false },
  { to: '/wallet',             icon: Wallet,          label: 'My Wallet',         end: false },
  { to: '/transactions',       icon: Clock,           label: 'Payment History',   end: false },
  { to: '/track',              icon: MapPin,          label: 'Track Your Order',  end: false },
  { to: '/orders',             icon: ShoppingBag,     label: 'Order History',     end: false },
  { to: '/support',            icon: HeadphonesIcon,  label: 'Support',           end: false },
  { to: '/profile',            icon: User,            label: 'Profile',           end: false },
];

// Plan visual config
const PLAN_THEME: Record<string, {
  label: string; icon: React.ElementType; iconColor: string;
  bg: string; border: string; textColor: string;
}> = {
  Starter:  { label: 'Starter',  icon: Zap,    iconColor: 'text-kitan-teal',  bg: 'bg-kitan-teal/10',  border: 'border-kitan-teal/30',  textColor: 'text-kitan-teal'  },
  Basic:    { label: 'Basic',    icon: Shield, iconColor: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    textColor: 'text-blue-400'    },
  Standard: { label: 'Standard', icon: Star,   iconColor: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  textColor: 'text-purple-400'  },
  Premium:  { label: 'Premium',  icon: Crown,  iconColor: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   textColor: 'text-amber-400'   },
};

function getPlanTheme(name: string) {
  return PLAN_THEME[name] ?? PLAN_THEME.Starter;
}

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const [collapsed,     setCollapsed]     = useState(false);
  const [activePlanName, setActivePlanName] = useState<string | null>(null);
  const [planDaysLeft,   setPlanDaysLeft]   = useState<number | null>(null);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const closeMobile = () => setMobileOpen(false);

  // Load active subscription
  const loadActivePlan = useCallback(async () => {
    if (!user) { setActivePlanName(null); return; }
    const { data } = await supabase
      .from('user_subscriptions')
      .select('plan_name, expires_at')
      .eq('app_user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data) {
      setActivePlanName(data.plan_name);
      const days = Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      setPlanDaysLeft(days);
    } else {
      setActivePlanName(null);
      setPlanDaysLeft(null);
    }
  }, [user]);

  useEffect(() => { loadActivePlan(); }, [loadActivePlan]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    closeMobile();
  };

  // ── Shared inner content ──────────────────────────────────────────────────
  const SidebarContent = () => {
    const planTheme = activePlanName ? getPlanTheme(activePlanName) : null;
    const PlanIcon  = planTheme?.icon ?? Crown;

    return (
      <div className="flex flex-col h-full">

        {/* Desktop-only logo strip */}
        <div className={cn(
          'hidden lg:flex items-center gap-3 px-4 py-5 border-b border-kitan-border flex-shrink-0',
          collapsed && 'lg:justify-center',
        )}>
          <div className="w-9 h-9 rounded-xl bg-teal-gradient flex items-center justify-center flex-shrink-0 shadow-teal-glow">
            <span className="text-white font-display font-bold text-lg">K</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display font-bold text-kitan-off-white text-sm leading-tight">KITAN</h1>
              <p className="text-kitan-teal text-xs font-semibold">SOCIAL HUB</p>
            </div>
          )}
        </div>

        {/* Mobile top row: ALL SERVICES + X */}
        <div className="lg:hidden flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <span className="font-display font-black text-kitan-off-white text-sm tracking-widest uppercase bg-kitan-teal/15 border border-kitan-teal/30 px-3 py-1.5 rounded-xl text-kitan-teal">
            ALL SERVICES
          </span>
          <button
            onClick={closeMobile}
            className="w-8 h-8 rounded-lg bg-kitan-card flex items-center justify-center text-kitan-muted hover:text-kitan-off-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav list */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-hide">
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={closeMobile}
                className={({ isActive }) =>
                  cn(
                    isActive ? 'nav-link-active' : 'nav-link',
                    collapsed && 'lg:justify-center lg:px-2',
                  )
                }
              >
                <Icon size={20} className="flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{label}</span>}
                {/* Premium badge for Website */}
                {!collapsed && to === '/website' && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase">
                    PRO
                  </span>
                )}
              </NavLink>
            ))}

            {/* Plans link */}
            <NavLink
              to="/plans"
              onClick={closeMobile}
              className={({ isActive }) =>
                cn(
                  isActive ? 'nav-link-active' : 'nav-link',
                  collapsed && 'lg:justify-center lg:px-2',
                )
              }
            >
              <Sparkles size={20} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">Subscription Plans</span>}
            </NavLink>

            {/* Admin Panel — only for admins */}
            {user?.role === 'admin' && (
              <NavLink
                to="/admin"
                onClick={closeMobile}
                className={({ isActive }) =>
                  cn(
                    isActive ? 'nav-link-active' : 'nav-link',
                    'border border-kitan-teal/30 mt-2',
                    collapsed && 'lg:justify-center lg:px-2',
                  )
                }
              >
                <Grid3X3 size={20} className="flex-shrink-0 text-kitan-teal" />
                {!collapsed && <span className="text-sm font-medium text-kitan-teal">Admin Panel</span>}
              </NavLink>
            )}
          </div>
        </nav>

        {/* Footer — plan status + user info + logout */}
        <div className={cn(
          'px-3 py-4 border-t border-kitan-border space-y-2 flex-shrink-0',
          collapsed && 'lg:flex lg:flex-col lg:items-center',
        )}>

          {/* Plan status chip */}
          {!collapsed && (
            <button
              onClick={() => { navigate(activePlanName ? '/my-plan' : '/plans'); closeMobile(); }}
              className={cn(
                'w-full flex items-center gap-2.5 p-3 rounded-xl border transition-all hover:opacity-90',
                planTheme ? `${planTheme.bg} ${planTheme.border}` : 'bg-kitan-bg border-kitan-border hover:border-kitan-teal/40',
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border',
                planTheme ? `${planTheme.bg} ${planTheme.border}` : 'bg-kitan-surface border-kitan-border',
              )}>
                <PlanIcon size={14} className={planTheme ? planTheme.iconColor : 'text-kitan-subtle'} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-bold leading-tight', planTheme ? planTheme.textColor : 'text-kitan-subtle')}>
                  {activePlanName ? `${activePlanName} Plan` : 'No Plan'}
                </p>
                <p className="text-kitan-subtle text-[10px]">
                  {activePlanName
                    ? `${planDaysLeft}d remaining · tap to manage`
                    : 'Choose Plan →'}
                </p>
              </div>
              {activePlanName === 'Premium' && (
                <Crown size={13} className="text-amber-400 flex-shrink-0" />
              )}
            </button>
          )}

          {user && (
            <div className={cn(
              'flex items-center gap-3 p-3 rounded-xl bg-kitan-surface',
              collapsed && 'lg:justify-center lg:p-2',
            )}>
              <div className="w-8 h-8 rounded-full bg-teal-gradient flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{user.name.charAt(0).toUpperCase()}</span>
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-kitan-off-white text-sm font-semibold truncate">{user.name}</p>
                  <p className="text-kitan-subtle text-xs truncate">{user.email}</p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              'nav-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10',
              collapsed && 'lg:justify-center lg:px-2',
            )}
          >
            <LogOut size={18} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm">Logout</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className={cn(
        'hidden lg:flex flex-col fixed inset-y-0 left-0 bg-kitan-surface border-r border-kitan-border z-40 transition-all duration-300',
        collapsed ? 'w-16' : 'w-72',
      )}>
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-kitan-teal text-white flex items-center justify-center shadow-teal-glow hover:bg-kitan-teal-bright transition-colors z-50"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* ── Mobile drawer ────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMobile}
          />
          <aside
            className="relative w-72 max-w-[80vw] bg-kitan-surface border-r border-kitan-border animate-slide-in-left flex flex-col"
            style={{ height: '100dvh', overflowY: 'auto', overflowX: 'hidden' }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
