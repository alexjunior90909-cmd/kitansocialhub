import React from 'react';
import { Link } from 'react-router-dom';
import { Gift, Mail, Phone, MapPin, Instagram, Twitter, Facebook, Youtube } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-kitan-surface border-t border-kitan-border mt-16">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-teal-gradient flex items-center justify-center shadow-teal-glow">
                <span className="text-white font-display font-bold text-lg">K</span>
              </div>
              <div>
                <h3 className="font-display font-bold text-kitan-off-white text-sm">KITAN SOCIAL HUB</h3>
                <p className="text-kitan-teal text-xs">Premium Global Gifting</p>
              </div>
            </div>
            <p className="text-kitan-muted text-sm leading-relaxed">
              Send premium gifts worldwide with love. From fresh flowers to luxury jewelry — delivered to doorsteps across US, UK, Canada, Australia, and Germany.
            </p>
            <div className="flex items-center gap-3 mt-4">
              {[Instagram, Twitter, Facebook, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-lg bg-kitan-card hover:bg-kitan-teal/20 hover:text-kitan-teal border border-kitan-border hover:border-kitan-teal flex items-center justify-center text-kitan-muted transition-all">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-kitan-off-white mb-4">Quick Links</h4>
            <ul className="space-y-2">
              {[
                { to: '/', label: 'Home' },
                { to: '/gifts', label: 'Gift Items' },
                { to: '/categories', label: 'Categories' },
                { to: '/track', label: 'Track Order' },
                { to: '/transactions', label: 'Payment History' },
                { to: '/refer', label: 'Refer & Earn' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-semibold text-kitan-off-white mb-4">Top Categories</h4>
            <ul className="space-y-2">
              {['Fresh Flowers', 'Cakes', 'Chocolate', 'Jewelry Set', 'Watches', 'Hoodies', 'Stuffed Animals', 'Mugs'].map(cat => (
                <li key={cat}>
                  <Link to={`/gifts?category=${encodeURIComponent(cat)}`} className="text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-kitan-off-white mb-4">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Phone size={15} className="text-kitan-teal mt-0.5 flex-shrink-0" />
                <a href="https://wa.me/9157385932" target="_blank" rel="noopener noreferrer" className="text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
                  +234 915 738 5932
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Mail size={15} className="text-kitan-teal mt-0.5 flex-shrink-0" />
                <a href="mailto:support@kitansocialhub.com" className="text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
                  support@kitansocialhub.com
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={15} className="text-kitan-teal mt-0.5 flex-shrink-0" />
                <span className="text-kitan-muted text-sm">Nigeria — Serving US, UK, CA, AU, DE</span>
              </li>
            </ul>
            <div className="mt-4 p-3 rounded-xl bg-kitan-bg border border-kitan-border">
              <p className="text-xs text-kitan-subtle mb-1">Payments</p>
              <p className="text-kitan-off-white text-sm font-semibold">Secured by Flutterwave</p>
              <p className="text-kitan-muted text-xs">NGN · Safe & Instant</p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-kitan-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-kitan-subtle text-sm">
            © {new Date().getFullYear()} KITAN SOCIAL HUB. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {['Privacy Policy', 'Terms of Service', 'FAQ'].map(link => (
              <Link key={link} to="/support" className="text-kitan-subtle hover:text-kitan-teal text-sm transition-colors">
                {link}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
