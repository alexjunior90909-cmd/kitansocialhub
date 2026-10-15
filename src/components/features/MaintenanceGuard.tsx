/**
 * MaintenanceGuard — checks website_settings for maintenance_mode.
 * If enabled, non-admin users are redirected to /maintenance.
 * Admins pass through normally.
 */
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useStore';

interface Props {
  children: React.ReactNode;
}

const MaintenanceGuard: React.FC<Props> = ({ children }) => {
  const { user } = useAuthStore();
  const location = useLocation();
  const [maintenanceMode, setMaintenanceMode] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('website_settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single();
        if (error) throw error;
        setMaintenanceMode(data?.value === 'true');
      } catch {
        setMaintenanceMode(false);
      }
    })();
  }, []);

  // While loading, render children (avoid flash)
  if (maintenanceMode === null) return <>{children}</>;

  // Already on maintenance page — always allow
  if (location.pathname === '/maintenance') return <>{children}</>;

  // Admin always bypass
  if (user?.role === 'admin') return <>{children}</>;

  // Maintenance active → redirect non-admins
  if (maintenanceMode) {
    return <Navigate to="/maintenance" replace />;
  }

  return <>{children}</>;
};

export default MaintenanceGuard;
