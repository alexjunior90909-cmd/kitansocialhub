import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import MaintenanceGuard from '@/components/features/MaintenanceGuard';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Layout from '@/components/layout/Layout';
import { Loader2 } from 'lucide-react';

// ── Lazy-loaded pages (code splitting for faster initial load) ──────────────
const HomePage = lazy(() => import('@/pages/HomePage'));
const GiftItemsPage = lazy(() => import('@/pages/GiftItemsPage'));
const ProductDetailPage = lazy(() => import('@/pages/ProductDetailPage'));
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage'));
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const ReferEarnPage = lazy(() => import('@/pages/ReferEarnPage'));
const TransactionHistoryPage = lazy(() => import('@/pages/TransactionHistoryPage'));
const TrackOrderPage = lazy(() => import('@/pages/TrackOrderPage'));
const WishlistPage = lazy(() => import('@/pages/WishlistPage'));
const OrderHistoryPage = lazy(() => import('@/pages/OrderHistoryPage'));
const SupportPage = lazy(() => import('@/pages/SupportPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const OrderContentPage = lazy(() => import('@/pages/OrderContentPage'));
const PaymentReturnPage = lazy(() => import('@/pages/PaymentReturnPage'));
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage'));
const DocumentDetailPage = lazy(() => import('@/pages/DocumentDetailPage'));
const WorkingPicturesPage = lazy(() => import('@/pages/WorkingPicturesPage'));
const WorkingPictureDetailPage = lazy(() => import('@/pages/WorkingPictureDetailPage'));
const FormatsPage = lazy(() => import('@/pages/FormatsPage'));
const FormatDetailPage = lazy(() => import('@/pages/FormatDetailPage'));
const WalletPage = lazy(() => import('@/pages/WalletPage'));
const PaymentFailedPage = lazy(() => import('@/pages/PaymentFailedPage'));
const VirtualNumbersPage = lazy(() => import('@/pages/VirtualNumbersPage'));
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage'));
const ReceiptGeneratorPage = lazy(() => import('@/pages/ReceiptGeneratorPage'));
const AccountBoostingPage = lazy(() => import('@/pages/AccountBoostingPage'));
const ServicesPage = lazy(() => import('@/pages/ServicesPage'));
const WebsitePage = lazy(() => import('@/pages/WebsitePage'));
const WebsiteDetailPage = lazy(() => import('@/pages/WebsiteDetailPage'));
const PlansPage = lazy(() => import('@/pages/PlansPage'));
const MyPlanPage = lazy(() => import('@/pages/MyPlanPage'));
const SocialAccountsPage = lazy(() => import('@/pages/SocialAccountsPage'));
const SocialAccountOrderPage = lazy(() => import('@/pages/SocialAccountOrderPage'));

// ── Page loading fallback ────────────────────────────────────────────────────
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 size={28} className="text-kitan-teal animate-spin" />
  </div>
);

/**
 * Smart scroll restoration:
 * - POP (back/forward): restore saved scroll position
 * - PUSH/REPLACE (new navigation): scroll to top
 *
 * Scroll positions are saved in sessionStorage keyed by location key.
 */
const ScrollManager: React.FC = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const prevKeyRef = useRef<string | null>(null);

  // Save scroll position before leaving a page
  useEffect(() => {
    const saveScroll = () => {
      if (prevKeyRef.current) {
        sessionStorage.setItem(`scroll_${prevKeyRef.current}`, String(window.scrollY));
      }
    };

    // Listen for before-navigation scroll save
    window.addEventListener('beforeunload', saveScroll);
    return () => {
      saveScroll();
      window.removeEventListener('beforeunload', saveScroll);
    };
  }, [location.key]);

  useEffect(() => {
    if (navType === 'POP') {
      // Back/Forward: restore scroll position
      const saved = sessionStorage.getItem(`scroll_${location.key}`);
      if (saved !== null) {
        // Delay to allow content to render before restoring
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: Number(saved), left: 0, behavior: 'instant' });
          });
        });
      }
    } else {
      // New page navigation: scroll to top
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }

    prevKeyRef.current = location.key;
  }, [location.key, navType]);

  return null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 min cache — avoid refetching on every navigation
      gcTime: 10 * 60 * 1000,         // 10 min garbage collection
      retry: 2,
      refetchOnWindowFocus: false,    // No refetch on tab switch
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollManager />
        <Suspense fallback={<PageLoader />}>
          <MaintenanceGuard>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/gifts" element={<GiftItemsPage />} />
              <Route path="/gifts/:id" element={<ProductDetailPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/refer" element={<ReferEarnPage />} />
              <Route path="/transactions" element={<TransactionHistoryPage />} />
              <Route path="/track" element={<TrackOrderPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/orders" element={<OrderHistoryPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/documents/:id" element={<DocumentDetailPage />} />
              <Route path="/working-pictures" element={<WorkingPicturesPage />} />
              <Route path="/working-pictures/:id" element={<WorkingPictureDetailPage />} />
              <Route path="/formats" element={<FormatsPage />} />
              <Route path="/formats/:id" element={<FormatDetailPage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/order-content/:type/:productId" element={<OrderContentPage />} />
              <Route path="/payment/return" element={<PaymentReturnPage />} />
              <Route path="/payment/failed" element={<PaymentFailedPage />} />
              <Route path="/virtual-numbers" element={<VirtualNumbersPage />} />
              <Route path="/receipt-generator" element={<ReceiptGeneratorPage />} />
              <Route path="/account-boosting" element={<AccountBoostingPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/website" element={<WebsitePage />} />
              <Route path="/website/:id" element={<WebsiteDetailPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/my-plan" element={<MyPlanPage />} />
              <Route path="/social-accounts" element={<SocialAccountsPage />} />
              <Route path="/social-accounts/order/:accountId" element={<SocialAccountOrderPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </MaintenanceGuard>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#334155',
            border: '1px solid #475569',
            color: '#F8FAFC',
          },
          classNames: {
            success: 'border-kitan-teal/50',
            error: 'border-red-500/50',
          },
        }}
      />
    </QueryClientProvider>
  );
};

export default App;
