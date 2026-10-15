/**
 * ServicesPage — Central directory of all platform services.
 * Clicking any service card navigates to its dedicated page.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gift, FileText, Camera, Layout, Phone, Receipt, TrendingUp, Wallet, Globe,
  ArrowRight, Zap, Shield, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServiceDef {
  icon: React.ElementType;
  emoji: string;
  title: string;
  subtitle: string;
  desc: string;
  cta: string;
  href: string;
  accentColor: string;
  iconBg: string;
  badge?: string;
  highlights: string[];
}

const SERVICES: ServiceDef[] = [
  {
    icon: Gift,
    emoji: '🎁',
    title: 'Gift Items',
    subtitle: 'Send gifts worldwide',
    desc: 'Deliver premium gifts to loved ones in USA, UK, Canada, Australia and Germany. Flowers, cakes, jewellery, fashion and more — with real-time tracking.',
    cta: 'Shop Gifts',
    href: '/gifts',
    accentColor: 'border-kitan-teal/40 hover:border-kitan-teal',
    iconBg: 'bg-kitan-teal/10 border-kitan-teal/20',
    badge: 'Popular',
    highlights: ['26+ categories', '5 countries', 'Real-time tracking'],
  },
  {
    icon: FileText,
    emoji: '📄',
    title: 'Documents',
    subtitle: 'Custom document generation',
    desc: 'Generate and purchase custom documents — work permits, visa letters, PR applications, study visas and more. Fill a form, get your document instantly.',
    cta: 'Browse Documents',
    href: '/documents',
    accentColor: 'border-blue-500/30 hover:border-blue-400',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    highlights: ['Instant delivery', 'Multiple categories', 'Form-based'],
  },
  {
    icon: Camera,
    emoji: '📸',
    title: 'Working Pictures',
    subtitle: 'Professional photos & videos',
    desc: 'Authentic professional photos and videos in real work environments — offices, clinics, tech spaces. Perfect for LinkedIn, job applications and more.',
    cta: 'View Pictures',
    href: '/working-pictures',
    accentColor: 'border-purple-500/30 hover:border-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
    highlights: ['HD quality', 'Multiple settings', 'Instant access'],
  },
  {
    icon: Layout,
    emoji: '📁',
    title: 'Formats & Templates',
    subtitle: 'Ready-made professional templates',
    desc: 'CV templates, visa letter bundles, business plan templates, SOP guides and more. Download and use immediately after purchase.',
    cta: 'Get Templates',
    href: '/formats',
    accentColor: 'border-amber-500/30 hover:border-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    highlights: ['PDF & DOCX', 'Instant download', 'Editable templates'],
  },
  {
    icon: Phone,
    emoji: '📱',
    title: 'Virtual Numbers',
    subtitle: 'OTP & verification numbers',
    desc: 'Rent disposable phone numbers for app registrations and OTP verification. Pay with your wallet — 15-minute countdown, instant SMS polling.',
    cta: 'Get a Number',
    href: '/virtual-numbers',
    accentColor: 'border-green-500/30 hover:border-green-400',
    iconBg: 'bg-green-500/10 border-green-500/20',
    highlights: ['Instant activation', '15-min timer', 'Wallet checkout'],
  },
  {
    icon: Receipt,
    emoji: '🧾',
    title: 'Receipt Generator',
    subtitle: 'Branded receipt creation',
    desc: 'Create professional receipts from top global brands — PayPal, Stripe, Cash App, Venmo and more. Fill the form, export as PNG or PDF instantly.',
    cta: 'Generate Receipt',
    href: '/receipt-generator',
    accentColor: 'border-rose-500/30 hover:border-rose-400',
    iconBg: 'bg-rose-500/10 border-rose-500/20',
    highlights: ['12+ brand templates', 'PNG & PDF export', 'Instant generation'],
  },
  {
    icon: TrendingUp,
    emoji: '📈',
    title: 'Account Boosting',
    subtitle: 'Social media growth services',
    desc: 'Professional account growth services for Instagram, Facebook, YouTube, TikTok, Telegram, Discord and many more platforms. Instant delivery.',
    cta: 'Boost Account',
    href: '/account-boosting',
    accentColor: 'border-indigo-500/30 hover:border-indigo-400',
    iconBg: 'bg-indigo-500/10 border-indigo-500/20',
    badge: 'New',
    highlights: ['946+ services', '25+ platforms', 'Auto-processing'],
  },
  {
    icon: Globe,
    emoji: '🌐',
    title: 'Website Services',
    subtitle: 'Professional website creation',
    desc: 'Get a professionally designed website for your business, brand, or portfolio. Browse packages or contact support for a custom build.',
    cta: 'View Packages',
    href: '/website',
    accentColor: 'border-purple-500/30 hover:border-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
    badge: 'Premium',
    highlights: ['Custom design', 'Fast delivery', 'Wallet checkout'],
  },
  {
    icon: Wallet,
    emoji: '💳',
    title: 'Wallet',
    subtitle: 'NGN-native wallet system',
    desc: 'Fund your KITAN wallet securely via Flutterwave and use your balance to pay for every service on the platform. View full transaction history.',
    cta: 'Open Wallet',
    href: '/wallet',
    accentColor: 'border-cyan-500/30 hover:border-cyan-400',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
    highlights: ['NGN balance', 'Secure top-up', 'Full history'],
  },
];

const ServicesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-10 pb-10">

      {/* Header */}
      <div className="space-y-2">
        <div className="badge-teal inline-flex items-center gap-2">
          <Zap size={12} /> Platform Services
        </div>
        <h1 className="section-heading text-3xl">All Services</h1>
        <p className="text-kitan-muted max-w-xl leading-relaxed">
          Everything KITAN offers in one place. Fund your wallet once and access any service below instantly.
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {SERVICES.map(({ icon: Icon, emoji, title, subtitle, desc, cta, href, accentColor, iconBg, badge, highlights }) => (
          <div
            key={href}
            onClick={() => navigate(href)}
            className={cn(
              'card-kitan p-6 relative overflow-hidden cursor-pointer group transition-all duration-200',
              accentColor,
            )}
          >
            {badge && (
              <span className={cn(
                'absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full border',
                badge === 'New'
                  ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                  : 'bg-kitan-teal/15 text-kitan-teal border-kitan-teal/30',
              )}>
                {badge}
              </span>
            )}

            {/* Icon */}
            <div className="flex items-center gap-3 mb-4">
              <div className={cn('w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform', iconBg)}>
                <Icon size={20} className="text-kitan-off-white" />
              </div>
              <span className="text-2xl">{emoji}</span>
            </div>

            {/* Text */}
            <h3 className="font-display font-bold text-kitan-off-white text-base mb-0.5">{title}</h3>
            <p className="text-kitan-subtle text-xs mb-3">{subtitle}</p>
            <p className="text-kitan-muted text-sm leading-relaxed mb-4 line-clamp-3">{desc}</p>

            {/* Highlights */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {highlights.map(h => (
                <span key={h} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-kitan-surface border border-kitan-border text-kitan-subtle">
                  {h}
                </span>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-kitan-teal group-hover:text-kitan-teal-bright flex items-center gap-1 group-hover:gap-2 transition-all">
                {cta} <ChevronRight size={14} />
              </span>
              <ArrowRight size={14} className="text-kitan-subtle group-hover:text-kitan-teal transition-colors" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick access banner */}
      <div className="relative overflow-hidden rounded-3xl border border-kitan-teal/20 p-7 md:p-10"
        style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(15,23,42,0) 100%)' }}>
        <div className="absolute top-[-60px] right-[-60px] w-[220px] h-[220px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #14b8a6 0%, transparent 70%)' }} />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-kitan-teal" />
              <span className="text-kitan-teal text-sm font-semibold">Wallet-Powered Platform</span>
            </div>
            <p className="text-kitan-off-white font-display font-bold text-xl">One wallet. Every service.</p>
            <p className="text-kitan-muted text-sm mt-1">Fund your NGN wallet once and access all 8 services without re-entering payment details.</p>
          </div>
          <button
            onClick={() => navigate('/wallet')}
            className="btn-primary flex items-center gap-2 flex-shrink-0"
          >
            <Wallet size={16} /> Fund Wallet
          </button>
        </div>
      </div>

    </div>
  );
};

export default ServicesPage;
