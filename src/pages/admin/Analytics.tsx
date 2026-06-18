import { useState, useEffect } from 'react';
import { UserProfile } from '../../types';
import { BarChart3, Users, Clock, ExternalLink, Info, Film, Link, PlayCircle } from 'lucide-react';
import { useUsers } from '../../contexts/UsersContext';

export default function Analytics() {
  const { users: allUsers, loading: usersLoading } = useUsers();
  const [topUsersBySessions, setTopUsersBySessions] = useState<UserProfile[]>([]);
  const [topUsersByTime, setTopUsersByTime] = useState<UserProfile[]>([]);
  const [topClickedContent, setTopClickedContent] = useState<{ id: string, title: string, clicks: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (usersLoading) return;
    
    setLoading(true);
    try {
      // Sort in memory instead of querying
      const sortedBySessions = [...allUsers].sort((a, b) => (b.sessionsCount || 0) - (a.sessionsCount || 0)).slice(0, 10);
      setTopUsersBySessions(sortedBySessions);

      const sortedByTime = [...allUsers].sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0)).slice(0, 10);
      setTopUsersByTime(sortedByTime);
      
      const contentCounts: Record<string, { id: string, title: string, clicks: number }> = {};
      
      allUsers.forEach(user => {
         if (user.clickHistory && Array.isArray(user.clickHistory)) {
             user.clickHistory.forEach((entry: any) => {
                 let title = '';
                 let count = 0;
                 let id = 'unknown';
                 let label = '';
                 
                 if (typeof entry === 'string') {
                     label = entry;
                 } else if (entry && typeof entry === 'object') {
                     id = entry.id || 'unknown';
                     label = entry.label || '';
                 }
                 
                 if (label) {
                     const parts = label.split(' - ');
                     title = parts[0] || 'Unknown';
                     const matched = label.match(/(\d+) time/);
                     if (matched) {
                         count = parseInt(matched[1]);
                     } else {
                         // Some entries might have links but no time suffix clearly matching, just count as 1
                         count = 1;
                     }
                     
                     if (title) {
                         if (!contentCounts[title]) {
                             contentCounts[title] = { id, title, clicks: 0 };
                         }
                         contentCounts[title].clicks += count;
                         // Update ID if we found a real one over an unknown one
                         if (contentCounts[title].id === 'unknown' && id !== 'unknown') {
                             contentCounts[title].id = id;
                         }
                     }
                 }
             });
         }
      });
      
      const sortedTopContent = Object.values(contentCounts).sort((a, b) => b.clicks - a.clicks).slice(0, 10);
      setTopClickedContent(sortedTopContent);
      
    } catch (error) {
      console.error('Error processing analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [allUsers, usersLoading]);

  if (loading || usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-3 transition-colors duration-300">
            <BarChart3 className="w-8 h-8 text-emerald-500" />
            Analytics Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 transition-colors duration-300">Track usage, content popularity, and user engagement.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Clicked Content */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 transition-colors duration-300 lg:col-span-2">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2 transition-colors duration-300">
            <PlayCircle className="w-5 h-5 text-emerald-500" />
            Most Clicked Content
          </h2>
          <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
            {topClickedContent.length > 0 ? topClickedContent.map((content, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-500 dark:text-zinc-600 w-6 transition-colors duration-300">{index + 1}</span>
                  <div className="flex flex-col">
                    <p className="font-medium text-zinc-900 dark:text-white transition-colors duration-300">{content.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 transition-colors duration-300 font-mono">ID: {content.id}</p>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {content.clicks} click{content.clicks !== 1 ? 's' : ''}
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 dark:text-zinc-400 text-center py-4 transition-colors duration-300">No content click data available.</p>
            )}
          </div>
        </div>

        {/* Top Users by Sessions */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 transition-colors duration-300">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2 transition-colors duration-300">
            <Users className="w-5 h-5 text-emerald-500" />
            Most Active Users (Lifetime Sessions)
          </h2>
          <div className="space-y-4">
            {topUsersBySessions.filter(u => (u.sessionsCount || 0) > 0).length > 0 ? topUsersBySessions.filter(u => (u.sessionsCount || 0) > 0).map((user, index) => (
              <div key={user.uid} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-500 dark:text-zinc-400 dark:text-zinc-600 w-6 transition-colors duration-300">{index + 1}</span>
                  <div className="flex items-center gap-3">
                    {user.photoURL && user.photoURL.trim() !== "" ? (
                      <img src={user.photoURL} alt={user.displayName || "User Avatar"} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold transition-colors duration-300">
                        {user.email[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white transition-colors duration-300">{user.displayName || 'Anonymous'}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 transition-colors duration-300 flex items-center gap-1.5 flex-wrap">
                        <span className="truncate max-w-[120px] sm:max-w-[150px]">{user.email}</span>
                        <span className="shrink-0 w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span> 
                        <span className="capitalize shrink-0 truncate">{String(user.role || 'user').replace('_', ' ')}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {user.sessionsCount} sessions
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 dark:text-zinc-400 text-center py-4 transition-colors duration-300">No user session data available.</p>
            )}
          </div>
        </div>

        {/* Top Users by Time */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 transition-colors duration-300">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2 transition-colors duration-300">
            <Clock className="w-5 h-5 text-emerald-500" />
            Most Active Users (Lifetime Time Spent)
          </h2>
          <div className="space-y-4">
            {topUsersByTime.filter(u => (u.timeSpent || 0) > 0).length > 0 ? topUsersByTime.filter(u => (u.timeSpent || 0) > 0).map((user, index) => (
              <div key={user.uid} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-500 dark:text-zinc-400 dark:text-zinc-600 w-6 transition-colors duration-300">{index + 1}</span>
                  <div className="flex items-center gap-3">
                    {user.photoURL && user.photoURL.trim() !== "" ? (
                      <img src={user.photoURL} alt={user.displayName || "User Avatar"} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold transition-colors duration-300">
                        {user.email[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white transition-colors duration-300">{user.displayName || 'Anonymous'}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 transition-colors duration-300 flex items-center gap-1.5 flex-wrap">
                        <span className="truncate max-w-[120px] sm:max-w-[150px]">{user.email}</span>
                        <span className="shrink-0 w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span> 
                        <span className="capitalize shrink-0 truncate">{String(user.role || 'user').replace('_', ' ')}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {Math.floor((user.timeSpent || 0) / 60)}m {(user.timeSpent || 0) % 60}s
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 dark:text-zinc-400 text-center py-4 transition-colors duration-300">No user time data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
