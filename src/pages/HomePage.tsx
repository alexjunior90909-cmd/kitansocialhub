import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Gift, Globe, Shield, Zap, Star, Package,
  TrendingUp, ChevronRight, FileText, Camera, Layout,
  Phone, Receipt, Wallet, MapPin, BarChart2,
} from 'lucide-react';
import ProductCard from '@/components/features/ProductCard';
import { REVIEWS, COUNTRIES } from '@/constants';
import { useCountryStore, useProductsStore } from '@/stores/useStore';
import { getStarArray } from '@/lib/utils';

// All platform services — equal representation
const ALL_SERVICES = [
  {
    icon: Gift,
    emoji: '🎁',
    title: 'Gift Items',
    desc: 'Deliver premium gifts to loved ones worldwide — flowers, cakes, jewellery, fashion and more with real-time tracking.',
    cta: 'Shop Gifts',
    href: '/gifts',
    color: 'from-kitan-teal/20 to-transparent',
    iconColor: 'text-kitan-teal',
    badge: 'Popular',
  },
  {
    icon: FileText,
    emoji: '📄',
    title: 'Documents',
    desc: 'Generate custom documents — work permits, visa letters, study applications and more. Fill a form and receive your document fast.',
    cta: 'Browse Documents',
    href: '/documents',
    color: 'from-blue-500/20 to-transparent',
    iconColor: 'text-blue-400',
  },
  {
    icon: Camera,
    emoji: '📸',
    title: 'Working Pictures',
    desc: 'Authentic professional photos and videos set in real work environments — offices, clinics, tech spaces. Ideal for LinkedIn & applications.',
    cta: 'View Pictures',
    href: '/working-pictures',
    color: 'from-purple-500/20 to-transparent',
    iconColor: 'text-purple-400',
  },
  {
    icon: Layout,
    emoji: '📁',
    title: 'Formats & Templates',
    desc: 'CV templates, visa letter bundles, business plan templates, SOP guides and more. Download and use immediately after purchase.',
    cta: 'Get Templates',
    href: '/formats',
    color: 'from-amber-500/20 to-transparent',
    iconColor: 'text-amber-400',
  },
  {
    icon: Phone,
    emoji: '📱',
    title: 'Virtual Numbers',
    desc: 'Rent disposable phone numbers for app registrations and OTP verification. Pay with your wallet — 15-minute countdown, instant SMS.',
    cta: 'Get a Number',
    href: '/virtual-numbers',
    color: 'from-green-500/20 to-transparent',
    iconColor: 'text-green-400',
  },
  {
    icon: Receipt,
    emoji: '🧾',
    title: 'Receipt Generator',
    desc: 'Create professional-looking receipts from top global brands. Choose a template, fill the form, export as PNG or PDF instantly.',
    cta: 'Generate Receipt',
    href: '/receipt-generator',
    color: 'from-rose-500/20 to-transparent',
    iconColor: 'text-rose-400',
  },
  {
    icon: TrendingUp,
    emoji: '📈',
    title: 'Account Boosting',
    desc: 'Professional account growth services for Instagram, Facebook, YouTube, TikTok, Telegram and more. Instant delivery, wallet checkout.',
    cta: 'Boost Account',
    href: '/account-boosting',
    color: 'from-indigo-500/20 to-transparent',
    iconColor: 'text-indigo-400',
    badge: 'New',
  },
  {
    icon: Wallet,
    emoji: '💳',
    title: 'Wallet & Top-Up',
    desc: 'Fund your wallet securely via Flutterwave and use your balance across every service on the platform. NGN-native, instant credit.',
    cta: 'View Wallet',
    href: '/wallet',
    color: 'from-cyan-500/20 to-transparent',
    iconColor: 'text-cyan-400',
  },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCountry } = useCountryStore();
  const { products, loadProducts } = useProductsStore();

  // Load products for featured gifts section
  useEffect(() => { loadProducts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const featuredProducts = products.filter(p => p.featured);

  return (
    <div className="space-y-16 pb-8">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 overflow-hidden min-h-[580px] flex items-center">
        {/* Layered gradient background */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #0f2940 40%, #0a1f2e 70%, #0f172a 100%)',
        }} />
        {/* Glow orbs */}
        <div className="absolute top-[-80px] right-[-80px] w-[480px] h-[480px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #14b8a6 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-120px] left-[-60px] w-[360px] h-[360px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="absolute top-[30%] left-[45%] w-[200px] h-[200px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }} />

        {/* Floating service icons grid — decorative */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden xl:grid grid-cols-3 gap-5 opacity-30 pointer-events-none select-none">
          {[Gift, FileText, Camera, Layout, Phone, Receipt, TrendingUp, Wallet, MapPin].map((Icon, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center backdrop-blur-sm"
              style={{ transform: `rotate(${(i % 3 - 1) * 4}deg)` }}>
              <Icon size={24} className="text-white/70" />
            </div>
          ))}
        </div>

        <div className="relative z-10 w-full px-6 md:px-12 lg:px-16 py-20">
          <div className="max-w-2xl">
            <div className="badge-teal inline-flex items-center gap-2 mb-6 animate-fade-in">
              <Zap size={12} />
              8 Premium Digital Services
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-kitan-off-white leading-tight mb-6 animate-fade-in">
              Everything You Need,
              <span className="gradient-text block">One Platform.</span>
            </h1>
            <p className="text-kitan-muted text-lg leading-relaxed mb-8 animate-fade-in max-w-xl">
              Gifts, documents, working pictures, formats, virtual numbers, receipt generation, account boosting, and wallet — all in one place, powered by NGN.
            </p>
            <div className="flex flex-wrap gap-4 animate-fade-in">
              <button
                onClick={() => navigate('/services')}
                className="btn-primary flex items-center gap-2 text-base px-8 py-4"
              >
                <BarChart2 size={20} />
                Explore Services
                <ArrowRight size={18} />
              </button>
            </div>

            {/* Service pills — quick links */}
            <div className="flex flex-wrap gap-2 mt-8">
              {[
                { icon: Gift,       label: 'Gifts',           href: '/gifts',             color: 'text-kitan-teal' },
                { icon: FileText,   label: 'Documents',       href: '/documents',         color: 'text-blue-400'  },
                { icon: Camera,     label: 'Pictures',        href: '/working-pictures',  color: 'text-purple-400'},
                { icon: Phone,      label: 'Virtual Numbers', href: '/virtual-numbers',   color: 'text-green-400' },
                { icon: Receipt,    label: 'Receipts',        href: '/receipt-generator', color: 'text-rose-400'  },
                { icon: TrendingUp, label: 'Boosting',        href: '/account-boosting',  color: 'text-indigo-400'},
              ].map(({ icon: Icon, label, href, color }) => (
                <button
                  key={label}
                  onClick={() => navigate(href)}
                  className="flex items-center gap-1.5 bg-kitan-bg/60 border border-kitan-border backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium text-kitan-muted hover:border-kitan-teal hover:text-kitan-off-white transition-all"
                >
                  <Icon size={11} className={color} />
                  {label}
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 mt-8">
              {[
                { label: 'Happy Customers', value: '2,400+' },
                { label: 'Services Available', value: '8' },
                { label: 'Countries Served', value: '5+' },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-kitan-teal font-display font-bold text-2xl">{stat.value}</p>
                  <p className="text-kitan-muted text-xs">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ALL SERVICES GRID ─────────────────────────────────────────────── */}
      <section>
        <div className="text-center mb-10">
          <h2 className="section-heading">Everything KITAN Offers</h2>
          <p className="text-kitan-muted text-sm mt-2 max-w-xl mx-auto">
            A complete digital services platform — choose what you need
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {ALL_SERVICES.map(({ icon: Icon, emoji, title, desc, cta, href, color, iconColor, badge }) => (
            <div
              key={title}
              className={`card-kitan p-6 relative overflow-hidden group hover:border-kitan-teal bg-gradient-to-b ${color} cursor-pointer`}
              onClick={() => navigate(href)}
            >
              {badge && (
                <span className={`absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full ${badge === 'New' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-kitan-teal/20 text-kitan-teal border border-kitan-teal/30'}`}>
                  {badge}
                </span>
              )}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{emoji}</span>
                <div className={`w-9 h-9 rounded-xl bg-kitan-surface border border-kitan-border flex items-center justify-center`}>
                  <Icon size={18} className={iconColor} />
                </div>
              </div>
              <h3 className="font-display font-bold text-kitan-off-white text-base mb-2">{title}</h3>
              <p className="text-kitan-muted text-sm leading-relaxed mb-4">{desc}</p>
              <span className={`text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all ${iconColor}`}>
                {cta} <ChevronRight size={14} />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURED GIFTS ────────────────────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="section-heading">Featured Gifts</h2>
              <p className="text-kitan-muted text-sm mt-1">Handpicked bestsellers your loved ones will adore</p>
            </div>
            <button onClick={() => navigate('/gifts')} className="btn-ghost text-sm flex items-center gap-1">
              Shop All <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} eager={i < 4} />
            ))}
          </div>
        </section>
      )}

      {/* ── GIFT DESTINATIONS ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="section-heading">Gift Destinations</h2>
            <p className="text-kitan-muted text-sm mt-1">Select your destination to see local pricing</p>
          </div>
          <button onClick={() => navigate('/gifts')} className="btn-ghost text-sm flex items-center gap-1">
            Shop Gifts <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {COUNTRIES.map(country => (
            <button
              key={country.code}
              onClick={() => { useCountryStore.getState().setCountry(country.code); navigate('/gifts'); }}
              className={`card-kitan p-4 text-center group transition-all ${
                selectedCountry === country.code ? 'border-kitan-teal bg-kitan-teal/5 shadow-teal-glow' : ''
              }`}
            >
              <span className="text-4xl block mb-2">{country.flag}</span>
              <p className="text-kitan-off-white text-sm font-semibold">{country.name}</p>
              <p className="text-kitan-subtle text-xs">{country.symbol} · {country.currency}</p>
              {selectedCountry === country.code && (
                <span className="badge-teal mt-2 inline-block text-xs">Selected</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="section-heading text-center mb-2">How KITAN Works</h2>
        <p className="text-kitan-muted text-center text-sm mb-10">Get started in minutes, no complexity</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '01', icon: Wallet,
              title: 'Fund Your Wallet',
              desc: 'Top up your NGN wallet securely via Flutterwave. Your balance is available instantly across all services.',
            },
            {
              step: '02', icon: BarChart2,
              title: 'Choose a Service',
              desc: 'Browse 8 service categories — gifts, documents, pictures, formats, virtual numbers, receipts, account boosting, and more.',
            },
            {
              step: '03', icon: Zap,
              title: 'Instant Delivery',
              desc: 'Pay from your wallet with one tap. Digital products unlock instantly; physical gifts are tracked and delivered.',
            },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="card-kitan p-6 relative overflow-hidden group hover:border-kitan-teal">
              <span className="absolute top-4 right-4 font-display font-bold text-5xl text-kitan-border/50 group-hover:text-kitan-teal/20 transition-colors">
                {step}
              </span>
              <div className="w-12 h-12 rounded-2xl bg-kitan-teal/10 border border-kitan-teal/30 flex items-center justify-center mb-4">
                <Icon size={24} className="text-kitan-teal" />
              </div>
              <h3 className="font-display font-bold text-kitan-off-white text-lg mb-2">{title}</h3>
              <p className="text-kitan-muted text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PLATFORM FEATURES ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Shield,     title: 'Secure Payments',   desc: 'Bank-grade wallet security with Flutterwave' },
          { icon: Zap,        title: 'Instant Delivery',  desc: 'Digital products unlocked immediately after payment' },
          { icon: Globe,      title: 'Global Reach',      desc: 'Services available across multiple countries' },
          { icon: Star,       title: '5-Star Reviews',    desc: 'Trusted by thousands of happy customers' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="glass-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-kitan-teal/10 flex items-center justify-center flex-shrink-0">
              <Icon size={20} className="text-kitan-teal" />
            </div>
            <div>
              <p className="text-kitan-off-white text-sm font-semibold">{title}</p>
              <p className="text-kitan-subtle text-xs">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── REVIEWS ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className="section-heading text-center mb-2">What Our Customers Say</h2>
        <p className="text-kitan-muted text-center text-sm mb-10">Real experiences from real customers</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {REVIEWS.map(review => {
            const stars = getStarArray(review.rating);
            return (
              <div key={review.id} className="card-kitan p-6 flex flex-col gap-4">
                <div className="flex items-center gap-1">
                  {stars.map((type, i) => (
                    <Star key={i} size={16} className={type === 'empty' ? 'text-kitan-border' : 'text-amber-400'} fill={type !== 'empty' ? '#F59E0B' : 'none'} />
                  ))}
                  <span className="text-kitan-subtle text-xs ml-1">{review.rating}.0</span>
                </div>
                <p className="text-kitan-muted text-sm leading-relaxed italic flex-1">"{review.text}"</p>
                <div className="border-t border-kitan-border pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-gradient flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{review.author.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-kitan-off-white text-sm font-semibold">{review.author}</p>
                      <p className="text-kitan-subtle text-xs">{review.location}</p>
                    </div>
                  </div>
                  <p className="text-kitan-subtle text-xs">{review.date}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-card-gradient border border-kitan-border p-8 md:p-12">
        <div className="hero-glow top-[-150px] right-[-100px] opacity-40" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-kitan-off-white mb-2">
              Ready to Get Started?
            </h2>
            <p className="text-kitan-muted">Fund your wallet and access all 8 services instantly.</p>
          </div>
          <div className="flex gap-3 flex-shrink-0 flex-wrap">
            <button onClick={() => navigate('/services')} className="btn-primary flex items-center gap-2">
              View All Services <ArrowRight size={16} />
            </button>
            <button onClick={() => navigate('/wallet')} className="btn-secondary flex items-center gap-2">
              <Wallet size={16} /> Top Up Wallet
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};

export default HomePage;
