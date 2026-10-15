import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, ShoppingCart, Search, Globe, X, ChevronDown, Menu } from 'lucide-react';
import { useAuthStore, useCartStore, useNotificationsStore, useCountryStore } from '@/stores/useStore';
import { COUNTRIES } from '@/constants';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onMenuOpen?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onMenuOpen }) => {
  const { user } = useAuthStore();
  const { itemCount, toggleCart } = useCartStore();
  const { notifications, unreadCount, markAllRead } = useNotificationsStore();
  const { selectedCountry, setShowSelector } = useCountryStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const countryInfo = COUNTRIES.find(c => c.code === selectedCountry);
  const count = itemCount();
  const notifCount = unreadCount();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/gifts?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-kitan-surface/95 backdrop-blur-md border-b border-kitan-border px-3 md:px-6 py-3">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Hamburger — inline, always visible on mobile */}
        <button
          onClick={onMenuOpen}
          className="lg:hidden flex-shrink-0 w-10 h-10 rounded-xl bg-kitan-card border border-kitan-border flex items-center justify-center text-kitan-off-white hover:border-kitan-teal transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex-1 min-w-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
            <input
              type="text"
              placeholder="Search gifts, categories..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-kitan-bg border border-kitan-border text-kitan-off-white placeholder-kitan-subtle rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-kitan-teal focus:border-kitan-teal transition-all"
            />
          </div>
        </form>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Country selector */}
          <button
            onClick={() => setShowSelector(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-kitan-bg border border-kitan-border hover:border-kitan-teal text-sm text-kitan-muted hover:text-kitan-teal transition-all"
          >
            <Globe size={15} />
            <span>{countryInfo ? `${countryInfo.flag} ${countryInfo.code}` : '🌍 Select'}</span>
            <ChevronDown size={13} />
          </button>

          {/* Cart */}
          <button
            onClick={toggleCart}
            className="relative w-10 h-10 rounded-xl bg-kitan-bg border border-kitan-border hover:border-kitan-teal flex items-center justify-center text-kitan-muted hover:text-kitan-teal transition-all"
          >
            <ShoppingCart size={18} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-kitan-teal text-white text-xs rounded-full flex items-center justify-center font-bold">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
              className="relative w-10 h-10 rounded-xl bg-kitan-bg border border-kitan-border hover:border-kitan-teal flex items-center justify-center text-kitan-muted hover:text-kitan-teal transition-all"
            >
              <Bell size={18} />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {notifCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-12 w-80 bg-kitan-surface border border-kitan-border rounded-2xl shadow-card-shadow z-50 overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-kitan-border">
                  <h3 className="font-semibold text-kitan-off-white text-sm">Notifications</h3>
                  <button onClick={() => setShowNotifications(false)} className="text-kitan-subtle hover:text-kitan-off-white">
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto scrollbar-hide">
                  {notifications.length === 0 ? (
                    <p className="text-kitan-subtle text-sm text-center py-6">No notifications</p>
                  ) : (
                    notifications.slice(0, 8).map(n => (
                      <div key={n.id} className={cn('px-4 py-3 border-b border-kitan-border/50 hover:bg-kitan-bg/50', !n.read && 'bg-kitan-teal/5')}>
                        <p className="text-kitan-off-white text-sm font-medium">{n.title}</p>
                        <p className="text-kitan-muted text-xs mt-0.5">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          {user ? (
            <Link to="/profile" className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center shadow-teal-glow hover:shadow-teal-glow-lg transition-all flex-shrink-0">
              <span className="text-white font-bold text-sm">{user.name.charAt(0).toUpperCase()}</span>
            </Link>
          ) : (
            <Link to="/login" className="btn-primary text-sm px-3 py-2">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
