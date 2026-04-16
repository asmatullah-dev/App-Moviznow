import React from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Film, Users } from 'lucide-react';
import { UserProfile } from '../types';

export const AdminButtons = React.memo(({ profile }: { profile: UserProfile | null }) => {
  if (!profile) return null;

  return (
    <div className="flex items-center gap-2">
      {(profile.role === 'admin' || profile.role === 'owner') && (
        <Link to="/admin" title="Admin" className="p-2 rounded-xl text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors">
          <LayoutDashboard className="w-5 h-5" />
        </Link>
      )}
      {(profile.role === 'manager' || profile.role === 'content_manager') && (
        <Link to="/admin/content" title="Content Management" className="p-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
          <Film className="w-5 h-5" />
        </Link>
      )}
      {(profile.role === 'user_manager' || profile.role === 'manager') && (
        <Link to="/admin/users" title="User Management" className="p-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
          <Users className="w-5 h-5" />
        </Link>
      )}
    </div>
  );
});
