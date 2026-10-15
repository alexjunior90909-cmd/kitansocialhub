import React, { useState } from 'react';
import { MessageCircle, Mail, Phone, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { toast } from 'sonner';
import { WHATSAPP_URL } from '@/constants';

const faqs = [
  { q: 'How do I track my order?', a: 'Go to "Track Your Order" page, enter your 20-digit tracking code and recipient email address to see real-time delivery updates.' },
  { q: 'How do I top up my wallet?', a: 'Transfer any amount to our PalmPay account (9157385932 – Nafiu Mukaila), then send your payment receipt via WhatsApp for confirmation. Your balance is updated within minutes.' },
  { q: 'What countries do you deliver to?', a: 'We currently deliver to USA, United Kingdom, Canada, Australia, and Germany. Each country has specific products and pricing.' },
  { q: 'Can I send a customized gift?', a: 'Yes! Check our "Customized Items" category for personalised gifts. You can also contact us via WhatsApp with your specific customization request.' },
  { q: 'What happens if I have insufficient wallet balance?', a: 'You will be notified at checkout. Simply top up your wallet and retry your order. Your cart items are saved.' },
  { q: 'How long does delivery take?', a: 'Delivery time depends on the destination country and product type. Typically 2-7 business days. Track your order for real-time updates.' },
  { q: 'Can I cancel or modify my order?', a: 'Contact us immediately via WhatsApp after placing your order. We will do our best to accommodate changes before processing begins.' },
  { q: 'How does the referral system work?', a: 'Share your unique referral code. When a friend signs up and places their first order, you both earn $10 wallet credit.' },
];

const SupportPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    await new Promise(r => setTimeout(r, 1500));
    setSending(false);
    toast.success('Message sent! We will respond within 24 hours.');
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <div>
        <h1 className="section-heading">Support Center</h1>
        <p className="text-kitan-muted text-sm mt-1">We're here to help — 24/7</p>
      </div>

      {/* Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: MessageCircle, title: 'WhatsApp Chat', desc: 'Instant response via WhatsApp', action: 'Chat Now', href: WHATSAPP_URL, color: '#25D366' },
          { icon: Mail, title: 'Email Support', desc: 'support@kitansocialhub.com', action: 'Send Email', href: 'mailto:support@kitansocialhub.com', color: '#14B8A6' },
          { icon: Phone, title: 'Phone', desc: '+234 915 738 5932', action: 'Call Us', href: 'tel:+2349157385932', color: '#2DD4BF' },
        ].map(({ icon: Icon, title, desc, action, href, color }) => (
          <a key={title} href={href} target="_blank" rel="noopener noreferrer" className="card-kitan p-5 flex flex-col items-center text-center gap-3 hover:border-kitan-teal group">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
              <Icon size={24} style={{ color }} />
            </div>
            <div>
              <p className="text-kitan-off-white font-semibold text-sm">{title}</p>
              <p className="text-kitan-subtle text-xs mt-0.5">{desc}</p>
            </div>
            <span className="text-xs font-semibold" style={{ color }}>{action} →</span>
          </a>
        ))}
      </div>

      {/* Contact Form */}
      <div className="card-kitan p-6">
        <h2 className="font-display font-bold text-kitan-off-white text-lg mb-5">Send a Message</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Your Name</label>
              <input type="text" required className="input-kitan" placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Email Address</label>
              <input type="email" required className="input-kitan" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-kitan-muted text-sm mb-1.5 block">Message</label>
            <textarea required rows={5} className="input-kitan resize-none" placeholder="Describe your issue or question..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          </div>
          <button type="submit" disabled={sending} className="btn-primary flex items-center gap-2">
            {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={16} /> Send Message</>}
          </button>
        </form>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="font-display font-bold text-kitan-off-white text-xl mb-5">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="card-kitan overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left hover:bg-kitan-bg/30 transition-colors">
                <span className="text-kitan-off-white font-medium text-sm pr-4">{faq.q}</span>
                {openFaq === i ? <ChevronUp size={18} className="text-kitan-teal flex-shrink-0" /> : <ChevronDown size={18} className="text-kitan-subtle flex-shrink-0" />}
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 animate-fade-in">
                  <p className="text-kitan-muted text-sm leading-relaxed border-t border-kitan-border pt-4">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
