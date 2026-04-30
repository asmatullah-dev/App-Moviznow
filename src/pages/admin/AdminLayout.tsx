import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { Film, Users, Tags, Languages, Clock, LogOut, Menu, X, MonitorPlay, BarChart3, DollarSign, AlertTriangle, Bell, MessageCircle, Settings, LayoutDashboard, RefreshCw, Layers } from 'lucide-react';
import { clsx } from 'clsx';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useModalBehavior } from '../../hooks/useModalBehavior';

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [reportedLinksCount, setReportedLinksCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  useModalBehavior(isLogoutModalOpen, () => setIsLogoutModalOpen(false));
  useModalBehavior(isMobileMenuOpen, () => setIsMobileMenuOpen(false));

  useEffect(() => {
    if (profile?.role !== 'admin' && profile?.role !== 'owner' && profile?.role !== 'content_manager' && profile?.role !== 'manager') return;

    const qReported = query(collection(db, 'reported_links'), where('status', '==', 'pending'));
    const qOrders = query(collection(db, 'orders'), where('status', '==', 'pending'));
    
    let isMounted = true;
    
    const fetchCounts = async () => {
      try {
        const [reportedSnap, ordersSnap] = await Promise.all([
          getDocs(qReported),
          getDocs(qOrders)
        ]);
        if (isMounted) {
          setReportedLinksCount(reportedSnap.size);
          setPendingOrdersCount(ordersSnap.size);
        }
      } catch (error) {
        console.error("Error fetching admin counts:", error);
      }
    };

    fetchCounts();
    const intervalId = setInterval(fetchCounts, 5 * 60 * 1000); // 5 mins

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [profile]);

  const allNavItems = [
    { id: 'Dashboard', path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'Analytics', path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'Orders', path: '/admin/orders', label: `Orders${pendingOrdersCount > 0 ? ` (${pendingOrdersCount})` : ''}`, icon: DollarSign },
    { id: 'Content', path: '/admin/content', label: 'Movies & Series', icon: Film },
    { id: 'Collections', path: '/admin/collections', label: 'Collections', icon: Layers },
    { id: 'Users', path: '/admin/users', label: 'Membership', icon: Users },
    { id: 'UserManagers', path: '/admin/user-managers', label: 'User Managers', icon: Users },
    { id: 'SelectedContent', path: '/admin/selected-content', label: 'Selected Content Only', icon: Film },
    { id: 'Income', path: '/admin/income', label: 'Income / Earn', icon: DollarSign },
    { id: 'ErrorLinks', path: '/admin/error-links', label: 'Error Links', icon: AlertTriangle },
    { id: 'ReportedLinks', path: '/admin/reported-links', label: `Reported Links${reportedLinksCount > 0 ? ` (${reportedLinksCount})` : ''}`, icon: AlertTriangle },
    { id: 'Notifications', path: '/admin/notifications', label: 'Notifications', icon: Bell },
    { id: 'Requests', path: '/admin/requests', label: 'Movie Requests', icon: MessageCircle },
    { id: 'Sync', path: '/admin/sync', label: 'Content Sync', icon: RefreshCw },
  ];

  let navItems = allNavItems;
  
  // Filter based on role
  if (profile?.role === 'content_manager') {
    navItems = allNavItems.filter(item => ['/admin/content'].includes(item.path));
  } else if (profile?.role === 'user_manager') {
    navItems = allNavItems.filter(item => ['/admin/users'].includes(item.path));
  } else if (profile?.role === 'manager') {
    navItems = allNavItems.filter(item => ['/admin/content', '/admin/users'].includes(item.path));
  }

  // Filter based on hiddenAdminTabs (only for non-owners)
  if (profile?.role !== 'owner' && settings?.hiddenAdminTabs) {
    navItems = navItems.filter(item => !settings.hiddenAdminTabs?.includes(item.id));
  }

  // Sort nav items based on settings.adminTabsOrder
  const sortedNavItems = [...navItems].sort((a, b) => {
    const order = settings?.adminTabsOrder || [];
    const indexA = order.indexOf(a.id);
    const indexB = order.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  // Access restriction: check if current path is allowed
  const isPathAllowed = (path: string) => {
    if (profile?.role === 'owner') return true;
    if (path === '/admin/settings') return false; // Only owner can access settings anyway
    
    // Check if path is in navItems
    const allowedPaths = navItems.map(item => item.path);
    // Exact match or sub-path match
    return allowedPaths.some(allowedPath => path === allowedPath || path.startsWith(allowedPath + '/'));
  };

  if (!isPathAllowed(location.pathname)) {
    // Redirect to the first allowed tab or dashboard
    const redirectPath = navItems.length > 0 ? navItems[0].path : '/';
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col md:flex-row transition-colors duration-300">
      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-40 h-16 flex items-center justify-between p-4 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <Link to="/" className="flex items-center gap-2">
          <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-8 block dark:hidden" />
          <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-8 hidden dark:block" />
          <span className="ml-2 text-sm font-bold text-emerald-500 tracking-tighter whitespace-nowrap">
            {settings?.headerText || 'MovizNow'}
          </span>
          <span className="ml-2 text-xs font-normal text-zinc-500 uppercase tracking-widest whitespace-nowrap">
            {profile?.role === 'user_manager' ? 'User Manager' : 
             profile?.role === 'content_manager' ? 'Content Manager' : 
             profile?.role === 'manager' ? 'Manager' : 
             profile?.role === 'owner' ? 'Owner' : 'Admin'}
          </span>
        </Link>
        {(profile?.role === 'admin' || profile?.role === 'owner') ? (
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        ) : (
          <button 
            onClick={() => navigate('/')}
            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Sidebar */}
      <aside className={clsx(
        "fixed md:sticky top-0 inset-y-0 left-0 z-50 w-64 h-screen bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transform transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 hidden md:block">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-8 block dark:hidden" />
              <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-8 hidden dark:block" />
              <span className="text-xl font-bold text-emerald-500 tracking-tight whitespace-nowrap">
                {settings?.headerText || 'MovizNow'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 uppercase tracking-wider font-semibold">
              {profile?.role === 'user_manager' ? 'User Manager' : 
               profile?.role === 'content_manager' ? 'Content Manager' : 
               profile?.role === 'manager' ? 'Manager' : 
               profile?.role === 'owner' ? 'Owner Panel' : 'Admin Panel'}
            </p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 md:py-0 space-y-2 overflow-y-auto">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-emerald-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 mb-4 border border-emerald-500/20"
          >
            <Film className="w-5 h-5" />
            Back to App
          </Link>
          
          {sortedNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium',
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-500' 
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 mt-auto flex items-center justify-around">
          {profile?.role === 'owner' && (
            <Link
              to="/admin/settings"
              onClick={() => setIsMobileMenuOpen(false)}
              className={clsx(
                'p-2 rounded-xl transition-colors',
                location.pathname === '/admin/settings'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
              )}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
          )}
          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        onConfirm={logout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </div>
  );
}
