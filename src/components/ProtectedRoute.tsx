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
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-4 transition-colors duration-300">
        <img src="/logo.svg" alt="MovizNow" className="w-32 h-32 animate-pulse" />
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500 dark:text-zinc-400" />
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
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-4 transition-colors duration-300">
          <img src="/logo.svg" alt="MovizNow" className="w-32 h-32 animate-pulse" />
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500 dark:text-zinc-400" />
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
