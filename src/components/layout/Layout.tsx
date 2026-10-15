import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Footer from './Footer';
import WhatsAppButton from '@/components/features/WhatsAppButton';
import CartSidebar from '@/components/features/CartSidebar';
import CountrySelector from '@/components/features/CountrySelector';
import { useAuthStore } from '@/stores/useStore';
import { useAppData } from '@/hooks/useAppData';

const Layout: React.FC = () => {
  const location = useLocation();
  const { init } = useAuthStore();
  const isFullPage = ['/login', '/register', '/forgot-password'].includes(location.pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useAppData();

  useEffect(() => {
    init();
  }, [init]);

  if (isFullPage) {
    return (
      <div className="min-h-screen bg-kitan-bg">
        <Outlet />
        <WhatsAppButton />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-kitan-bg">
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-72">
        <TopBar onMenuOpen={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
        <Footer />
      </div>
      <CartSidebar />
      <CountrySelector />
      <WhatsAppButton />
    </div>
  );
};

export default Layout;
