/**
 * SocialAccountsPage — Browse and purchase social media & digital accounts.
 * Categories: Facebook, Instagram, X (Twitter), TikTok, Gmail, VPN, Other.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, ShoppingCart, Loader2, AlertCircle,
  Facebook, Instagram, Twitter, Wallet, ChevronRight,
  Shield, Zap, Lock, MessageSquare,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { dbWallet } from '@/lib/db';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const formatNGN = (n: number) =>
  `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface SocialAccount {
  id: string;
  title: string;
  category: string;
  price: number;
  description: string;
  notes: string;
  available: boolean;
  stock: number;
  pinned: boolean;
}

const CATEGORIES = [
  'All',
  'Facebook',
  'Instagram',
  'X (Twitter)',
  'TikTok',
  'Gmail',
  'VPN',
  'Other',
];

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  'Facebook':   <Facebook size={16} className="text-blue-400" />,
  'Instagram':  <Instagram size={16} className="text-pink-400" />,
  'X (Twitter)':<Twitter size={16} className="text-sky-400" />,
  'TikTok':     <span className="text-base">🎵</span>,
  'Gmail':      <span className="text-base">📧</span>,
  'VPN':        <Lock size={16} className="text-green-400" />,
  'Other':      <Users size={16} className="text-kitan-teal" />,
};

const CATEGORY_COLOR: Record<string, string> = {
  'Facebook':    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Instagram':   'text-pink-400 bg-pink-500/10 border-pink-500/20',
  'X (Twitter)': 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  'TikTok':      'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Gmail':       'text-red-400 bg-red-500/10 border-red-500/20',
  'VPN':         'text-green-400 bg-green-500/10 border-green-500/20',
  'Other':       'text-kitan-teal bg-kitan-teal/10 border-kitan-teal/20',
};

const SocialAccountsPage: React.FC = () => {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const { wallet, loadWallet } = useWalletStore();

  const [accounts,   setAccounts]   = useState<SocialAccount[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [category,   setCategory]   = useState('All');
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('social_accounts')
        .select('id, title, category, price, description, notes, available, stock, pinned, pin_position')
        .eq('available', true)
        .order('pin_position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (!error && data) setAccounts(data as SocialAccount[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (user && !wallet) loadWallet(user.id);
  }, [user]);

  const filtered = accounts.filter(a => {
    const matchCat = category === 'All' || a.category === category;
    const matchQ   = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const handleBuy = async (account: SocialAccount) => {
    if (!user) { toast.error('Please sign in to purchase'); navigate('/login'); return; }
    if (account.stock <= 0) { toast.error('Out of stock'); return; }

    setPurchasing(account.id);
    try {
      const balance = await dbWallet.getBalance(user.id);
      if (balance < account.price) {
        toast.error(`Insufficient balance — need ${formatNGN(account.price)}, have ${formatNGN(balance)}`);
        navigate(`/wallet?need=${account.price}`);
        setPurchasing(null);
        return;
      }

      const ref = `sac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await dbWallet.deduct(
        user.id, account.price,
        `Social Account Purchase: ${account.title}`,
        ref, account.id, 'social_account',
      );

      // Record the order
      const orderId = `sao_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from('social_account_orders').insert({
        id: orderId, account_id: account.id, app_user_id: user.id,
        amount: account.price, reference: ref, status: 'completed',
      });

      // Decrement stock
      await supabase.from('social_accounts')
        .update({ stock: Math.max(0, account.stock - 1) })
        .eq('id', account.id);

      toast.success('Purchase successful! Opening order details…');
      navigate(`/social-accounts/order/${account.id}?ref=${ref}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purchase failed. Please try again.');
    }
    setPurchasing(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-8">
        <div className="hero-glow top-[-80px] right-[-60px] opacity-20" />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-4">
            <Users size={12} /> Social Media Accounts
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Premium <span className="gradient-text">Digital Accounts</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed">
            Browse verified social media accounts, Gmail accounts, VPN subscriptions and more.
            Pay with your wallet and receive access details instantly.
          </p>
          {user && wallet && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20">
              <Wallet size={14} className="text-kitan-teal" />
              <span className="text-kitan-teal text-sm font-semibold">
                Balance: {formatNGN(wallet.balance)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
        <input
          type="text"
          placeholder="Search accounts by name, category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-kitan pl-10 text-sm"
        />
      </div>

      {/* Category tabs */}
      <div className="flex overflow-x-auto gap-2 scrollbar-hide pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              category === cat
                ? 'bg-kitan-teal text-white border-kitan-teal shadow-teal-glow'
                : 'bg-kitan-surface text-kitan-muted border-kitan-border hover:border-kitan-teal/40 hover:text-kitan-off-white',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 size={24} className="text-kitan-teal animate-spin" />
          <span className="text-kitan-muted">Loading accounts…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="card-kitan p-16 text-center">
          <Users size={48} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold mb-2">No accounts found</p>
          <p className="text-kitan-muted text-sm">
            {search || category !== 'All' ? 'Try adjusting your search or category filter' : 'Check back soon — accounts are being added'}
          </p>
        </div>
      )}

      {/* Account grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(account => {
            const catColor = CATEGORY_COLOR[account.category] || CATEGORY_COLOR.Other;
            const catIcon  = CATEGORY_ICON[account.category] || CATEGORY_ICON.Other;
            const isBuying = purchasing === account.id;
            const outOfStock = account.stock <= 0;

            return (
              <div
                key={account.id}
                className={cn(
                  'card-kitan p-5 flex flex-col gap-4 transition-all group hover:border-kitan-teal',
                  account.pinned && 'border-amber-500/30 bg-amber-500/3',
                )}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold', catColor)}>
                    {catIcon}
                    {account.category}
                  </div>
                  {outOfStock ? (
                    <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-full font-semibold">
                      Out of Stock
                    </span>
                  ) : account.stock <= 5 ? (
                    <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full font-semibold">
                      {account.stock} left
                    </span>
                  ) : null}
                </div>

                {/* Title + description */}
                <div className="flex-1">
                  <h3 className="font-display font-bold text-kitan-off-white text-base mb-2 group-hover:text-kitan-teal transition-colors leading-snug">
                    {account.title}
                  </h3>
                  {account.description && (
                    <p className="text-kitan-muted text-sm leading-relaxed line-clamp-3">
                      {account.description}
                    </p>
                  )}
                </div>

                {/* Price + Buy */}
                <div className="space-y-3 pt-2 border-t border-kitan-border">
                  <div className="flex items-center justify-between">
                    <p className="text-kitan-teal font-display font-bold text-xl">
                      {formatNGN(account.price)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Shield size={12} className="text-kitan-subtle" />
                      <span className="text-kitan-subtle text-xs">Wallet checkout</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuy(account)}
                    disabled={isBuying || outOfStock}
                    className={cn(
                      'w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                      outOfStock
                        ? 'bg-kitan-surface text-kitan-subtle cursor-not-allowed border border-kitan-border'
                        : 'btn-primary',
                    )}
                  >
                    {isBuying ? (
                      <><Loader2 size={15} className="animate-spin" /> Processing…</>
                    ) : outOfStock ? (
                      <><AlertCircle size={15} /> Out of Stock</>
                    ) : (
                      <><ShoppingCart size={15} /> Buy Now — {formatNGN(account.price)}</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trust section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
        {[
          { icon: Wallet,       title: 'Wallet Checkout',    desc: 'Instant deduction, no hidden fees' },
          { icon: Zap,         title: 'Instant Delivery',   desc: 'Access details shown immediately after purchase' },
          { icon: MessageSquare, title: 'Support Available', desc: 'WhatsApp support if you need help' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card-kitan p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center flex-shrink-0">
              <Icon size={16} className="text-kitan-teal" />
            </div>
            <div>
              <p className="text-kitan-off-white text-sm font-semibold">{title}</p>
              <p className="text-kitan-subtle text-xs">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SocialAccountsPage;
