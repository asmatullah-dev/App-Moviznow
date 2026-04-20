import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-6 transition-colors duration-300">
        <div className="flex flex-col items-center animate-pulse">
          <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-32 block dark:hidden" />
          <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-32 hidden dark:block" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    console.log('ProtectedRoute: No user, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile?.status === 'suspended') {
    console.log('ProtectedRoute: User is suspended, redirecting to login');
    return <Navigate to="/login" state={{ from: location, suspended: true }} replace />;
  }

  // If admin is required, we must wait for the profile to check roles
  if (requireAdmin) {
    if (loading || !profile) {
      return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-6 transition-colors duration-300">
          <div className="flex flex-col items-center animate-pulse">
            <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-32 block dark:hidden" />
            <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-32 hidden dark:block" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      );
    }
    if (profile.role !== 'admin' && profile.role !== 'content_manager' && profile.role !== 'user_manager' && profile.role !== 'manager' && profile.role !== 'owner') {
      console.log('ProtectedRoute: Admin required but user is not admin/manager/owner, redirecting to home');
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
