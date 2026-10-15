/**
 * WalletPage — restructured flow:
 * 1. Balance Display
 * 2. Select Amount
 * 3. Custom Amount Input
 * 4. Top Up Button  ← always visible before instructions
 * 5. How To Top Up (instructions)
 * 6. Transaction History
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Wallet, ArrowUpCircle, ArrowDownCircle, Plus, Loader2,
  CheckCircle, RefreshCw, CreditCard, Info,
  TrendingUp, TrendingDown, Clock, ChevronDown
} from 'lucide-react';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TOPUP_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000, 50000];

const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { wallet, transactions, loading, loadWallet, refreshBalance } = useWalletStore();

  const [topupAmount, setTopupAmount] = useState<number | ''>('');
  const [customAmount, setCustomAmount] = useState('');
  const [initiating, setInitiating] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'topup' | 'deduction'>('all');
  const [showInstructions, setShowInstructions] = useState(false);

  // Pre-fill required top-up amount from ?need=<amount> param
  const needAmount = Number(searchParams.get('need') ?? 0);
  const walletShortfall = needAmount > 0 ? Math.max(0, needAmount - (wallet?.balance ?? 0)) : 0;

  // Load wallet on mount
  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadWallet(user.id);
  }, [user]);

  // Handle successful top-up redirect
  useEffect(() => {
    if (searchParams.get('topup') === 'success') {
      toast.success('Wallet topped up successfully!');
      if (user) refreshBalance(user.id);
      window.history.replaceState({}, '', '/wallet');
    }
  }, [searchParams, user]);

  // Pre-select suggested top-up amount when redirected from a purchase page
  useEffect(() => {
    if (walletShortfall > 0) {
      const suggested = Math.ceil(walletShortfall / 100) * 100;
      setTopupAmount(suggested);
      setCustomAmount('');
      toast.info(`You need ${formatNGN(walletShortfall)} more. Top-up amount pre-selected.`);
    }
  }, [walletShortfall]);

  const effectiveAmount = topupAmount !== '' ? topupAmount : Number(customAmount) || 0;

  const handleTopUp = useCallback(async () => {
    if (!user) { navigate('/login'); return; }
    if (effectiveAmount < 100) {
      toast.error('Minimum top-up amount is ₦100');
      return;
    }

    setInitiating(true);
    try {
      const returnUrl = `${window.location.origin}/payment/return`;

      const { data, error } = await supabase.functions.invoke('flw-initiate', {
        body: {
          productId: `wallet_${user.id}`,
          productType: 'wallet_topup',
          appUserId: user.id,
          amountNGN: effectiveAmount,
          customerEmail: user.email,
          customerName: user.name,
          redirectUrl: returnUrl,
          metadata: { purpose: 'wallet_topup', userId: user.id },
        },
      });

      let errorMsg = '';
      if (error) {
        if (error instanceof FunctionsHttpError) {
          try { errorMsg = await error.context.text(); } catch { errorMsg = error.message; }
        } else {
          errorMsg = error.message;
        }
      }

      if (errorMsg || !data?.paymentUrl) {
        toast.error(errorMsg || 'Failed to initiate payment. Please try again.');
        setInitiating(false);
        return;
      }

      window.location.href = data.paymentUrl;
    } catch (err) {
      console.error('[wallet] topup error:', err);
      toast.error('Unexpected error. Please try again.');
      setInitiating(false);
    }
  }, [user, effectiveAmount, navigate]);

  const filteredTx = transactions.filter(tx => {
    if (activeTab === 'all') return true;
    if (activeTab === 'topup') return tx.type === 'topup' || tx.type === 'refund';
    if (activeTab === 'deduction') return tx.type === 'deduction';
    return true;
  });

  const totalTopups = transactions.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0);
  const totalSpent = transactions.filter(t => t.type === 'deduction').reduce((s, t) => s + t.amount, 0);

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-8">

      {/* ===== 1. BALANCE DISPLAY ===== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-6 sm:p-8">
        <div className="hero-glow top-[-80px] right-[-60px] opacity-25" />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-3">
            <Wallet size={12} /> My Wallet
          </div>
          <p className="text-kitan-muted text-sm mb-1">Available Balance</p>
          {loading ? (
            <div className="flex items-center gap-2 mt-1">
              <Loader2 size={20} className="text-kitan-teal animate-spin" />
              <span className="text-kitan-muted text-sm">Loading...</span>
            </div>
          ) : (
            <p className="font-display text-4xl sm:text-5xl font-bold text-kitan-teal">
              {formatNGN(wallet?.balance ?? 0)}
            </p>
          )}

          {/* Stats row */}
          <div className="flex gap-4 mt-5 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp size={13} className="text-green-400" />
              </div>
              <div>
                <p className="text-kitan-subtle text-xs">Topped Up</p>
                <p className="text-green-400 font-bold text-sm">{formatNGN(totalTopups)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                <TrendingDown size={13} className="text-red-400" />
              </div>
              <div>
                <p className="text-kitan-subtle text-xs">Total Spent</p>
                <p className="text-red-400 font-bold text-sm">{formatNGN(totalSpent)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 2. SELECT AMOUNT ===== */}
      <div className="card-kitan p-5 space-y-4">
        <h2 className="font-display font-bold text-kitan-off-white text-base flex items-center gap-2">
          <Plus size={16} className="text-kitan-teal" /> Top Up Wallet
        </h2>

        <div>
          <p className="text-kitan-muted text-xs mb-2.5 font-medium">Select Amount</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {TOPUP_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => { setTopupAmount(amt); setCustomAmount(''); }}
                className={cn(
                  'py-2 rounded-xl text-xs font-semibold border transition-all',
                  topupAmount === amt
                    ? 'bg-kitan-teal text-white border-kitan-teal shadow-teal-glow'
                    : 'bg-kitan-surface text-kitan-muted border-kitan-border hover:border-kitan-teal hover:text-kitan-off-white'
                )}
              >
                {formatNGN(amt)}
              </button>
            ))}
          </div>
        </div>

        {/* ===== 3. CUSTOM AMOUNT ===== */}
        <div>
          <label className="text-kitan-muted text-xs mb-1.5 block font-medium">Or Enter Custom Amount (₦)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold text-sm">₦</span>
            <input
              type="number"
              min={100}
              step={100}
              placeholder="e.g. 3500"
              value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setTopupAmount(''); }}
              className="input-kitan pl-8 text-sm"
            />
          </div>
        </div>

        {/* Selected amount preview */}
        {effectiveAmount > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-kitan-teal/5 border border-kitan-teal/20">
            <CheckCircle size={14} className="text-kitan-teal flex-shrink-0" />
            <p className="text-kitan-off-white text-xs">
              Charging <span className="text-kitan-teal font-bold">{formatNGN(effectiveAmount)}</span> — credited to wallet instantly after payment.
            </p>
          </div>
        )}

        {/* ===== 4. TOP UP BUTTON ===== */}
        <button
          onClick={handleTopUp}
          disabled={initiating || effectiveAmount < 100}
          className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50"
        >
          {initiating ? (
            <><Loader2 size={16} className="animate-spin" /> Redirecting to Flutterwave...</>
          ) : (
            <><CreditCard size={16} /> Top Up {effectiveAmount > 0 ? formatNGN(effectiveAmount) : 'Now'}</>
          )}
        </button>

        {/* ===== 5. HOW TO TOP UP (collapsible) ===== */}
        <div className="border border-kitan-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowInstructions(v => !v)}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-kitan-surface/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info size={14} className="text-blue-400" />
              <span className="text-blue-300 text-xs font-semibold">How to Top Up</span>
            </div>
            <ChevronDown size={14} className={cn('text-kitan-subtle transition-transform', showInstructions && 'rotate-180')} />
          </button>
          {showInstructions && (
            <div className="px-4 pb-4 pt-1 bg-blue-500/5">
              <ol className="text-blue-300/80 text-xs space-y-1.5 ml-4 list-decimal leading-relaxed">
                <li>Select a preset amount or enter a custom amount above.</li>
                <li>Click <strong>"Top Up Now"</strong> — you'll be redirected to Flutterwave's secure checkout.</li>
                <li>Complete your card or bank transfer payment on Flutterwave.</li>
                <li>After payment, you're automatically returned and your balance is credited instantly.</li>
                <li>Use your wallet balance to pay for any product — no extra steps.</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* ===== 6. TRANSACTION HISTORY ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-display font-bold text-kitan-off-white text-base flex items-center gap-2">
            <Clock size={16} className="text-kitan-teal" /> Transaction History
          </h2>
          <button
            onClick={() => user && refreshBalance(user.id)}
            className="flex items-center gap-1.5 text-kitan-muted hover:text-kitan-teal text-xs transition-colors"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'topup', 'deduction'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                activeTab === tab
                  ? 'bg-kitan-teal text-white border-kitan-teal shadow-teal-glow'
                  : 'bg-kitan-surface text-kitan-muted border-kitan-border hover:border-kitan-teal hover:text-kitan-off-white'
              )}
            >
              {tab === 'topup' ? 'Top-Ups' : tab === 'deduction' ? 'Payments' : 'All'}
              <span className="ml-1 opacity-60">
                ({tab === 'all' ? transactions.length : transactions.filter(t =>
                  tab === 'topup' ? (t.type === 'topup' || t.type === 'refund') : t.type === tab
                ).length})
              </span>
            </button>
          ))}
        </div>

        {/* Transaction list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="text-kitan-teal animate-spin" />
          </div>
        ) : filteredTx.length === 0 ? (
          <div className="card-kitan p-8 text-center">
            <Wallet size={32} className="text-kitan-subtle mx-auto mb-3" />
            <p className="text-kitan-off-white font-semibold text-sm mb-1">No transactions yet</p>
            <p className="text-kitan-muted text-xs">
              {activeTab === 'all' ? 'Top up your wallet to get started.' : `No ${activeTab} transactions found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTx.map(tx => {
              const isCredit = tx.type === 'topup' || tx.type === 'refund';
              return (
                <div key={tx.id} className="card-kitan p-4 flex items-center gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                    isCredit ? 'bg-green-500/10' : 'bg-red-500/10'
                  )}>
                    {isCredit
                      ? <ArrowUpCircle size={18} className="text-green-400" />
                      : <ArrowDownCircle size={18} className="text-red-400" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-kitan-off-white text-xs font-semibold truncate">
                      {tx.description || (isCredit ? 'Wallet Top-Up' : 'Payment Deduction')}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-kitan-subtle text-xs">
                        {new Date(tx.createdAt).toLocaleDateString('en-NG', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      {tx.reference && (
                        <span className="text-kitan-subtle text-xs font-mono truncate max-w-[100px]">
                          {tx.reference.slice(0, 16)}…
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className={cn('font-bold text-sm', isCredit ? 'text-green-400' : 'text-red-400')}>
                      {isCredit ? '+' : '-'}{formatNGN(tx.amount)}
                    </p>
                    <p className="text-kitan-subtle text-xs">Bal: {formatNGN(tx.balanceAfter)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletPage;
