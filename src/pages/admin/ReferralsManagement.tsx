import { useState, useMemo, Fragment } from 'react';
import { useUsers } from '../../contexts/UsersContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  Users, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  User as UserIcon,
  Calendar,
  Gift,
  ExternalLink,
  Info,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, isAfter, startOfDay } from 'date-fns';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function ReferralsManagement() {
  const { users } = useUsers();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);

  // Calculate referrals
  const inviters = useMemo(() => {
    const referralMap = new Map<string, any[]>();
    
    users.forEach(user => {
      if (user.referredBy) {
        const inviterId = user.referredBy;
        if (!referralMap.has(inviterId)) {
          referralMap.set(inviterId, []);
        }
        referralMap.get(inviterId)?.push(user);
      }
    });

    return users
      .filter(user => referralMap.has(user.uid))
      .map(user => ({
        ...user,
        referredUsers: referralMap.get(user.uid) || []
      }))
      .sort((a, b) => b.referredUsers.length - a.referredUsers.length);
  }, [users]);

  const filteredInviters = useMemo(() => {
    return inviters.filter(u => 
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.referralCode?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [inviters, searchQuery]);

  const toggleExpand = (uid: string) => {
    setExpandedUsers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const growthData = useMemo(() => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const count = users.filter(u => 
        u.referredBy && 
        u.createdAt && 
        format(new Date(u.createdAt), 'yyyy-MM-dd') === dateStr
      ).length;

      data.push({
        name: format(date, 'MMM d'),
        referrals: count,
      });
    }
    return data;
  }, [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-500" />
            Referrals Management
          </h1>
          <p className="text-zinc-500 text-sm">Monitor user referral activity and rewards</p>
        </div>
      </div>

      {/* Growth Chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Referral Growth
            </h3>
            <p className="text-xs text-zinc-500">New referrals over the last 30 days</p>
          </div>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growthData}>
              <defs>
                <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                interval={4}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9ca3af' }}
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  borderRadius: '12px', 
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="referrals" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRef)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by email, name or referral code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-emerald-500">{inviters.length}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Active Inviters</span>
        </div>
      </div>

      {/* Inviters List */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">Inviter</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">Referral Code</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 text-center">Referrals</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredInviters.map((inviter) => (
                <Fragment key={inviter.uid}>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                          {inviter.photoURL ? (
                            <img src={inviter.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <UserIcon className="w-5 h-5 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{inviter.displayName || 'No Name'}</span>
                          <span className="text-xs text-zinc-500">{inviter.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-emerald-500 font-bold">
                      {inviter.referralCode}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-xs font-bold">
                        {inviter.referredUsers.length}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => toggleExpand(inviter.uid)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold"
                      >
                        {expandedUsers.includes(inviter.uid) ? (
                          <>Hide List <ChevronUp className="w-4 h-4" /></>
                        ) : (
                          <>Show List <ChevronDown className="w-4 h-4" /></>
                        )}
                      </button>
                    </td>
                  </tr>
                  
                  {/* Expanded Row */}
                  <AnimatePresence>
                    {expandedUsers.includes(inviter.uid) && (
                      <tr>
                        <td colSpan={4} className="px-6 py-0 bg-zinc-50/50 dark:bg-zinc-950/50">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="py-6 px-4 space-y-4">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Users Referred by {inviter.displayName || inviter.email}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {inviter.referredUsers.map((refUser) => (
                                  <div 
                                    key={refUser.uid}
                                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-2 shadow-sm"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                          <UserIcon className="w-4 h-4 text-zinc-400" />
                                        </div>
                                        <div className="flex items-center gap-1.5 group/info relative">
                                          <span className="text-xs font-bold truncate max-w-[120px]">{refUser.email}</span>
                                          <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
                                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover/info:block z-50 bg-zinc-900 text-white text-[10px] p-2 rounded-lg shadow-xl border border-zinc-700 w-40 pointer-events-none">
                                            <div className="space-y-1">
                                              <p><span className="text-zinc-400">Joined:</span> {refUser.createdAt ? format(new Date(refUser.createdAt), 'MMM d, yyyy') : 'N/A'}</p>
                                              <p><span className="text-zinc-400">Status:</span> <span className={refUser.status === 'active' ? 'text-emerald-400' : 'text-zinc-400'}>{refUser.status?.toUpperCase()}</span></p>
                                              <p><span className="text-zinc-400">Membership:</span> {refUser.role?.toUpperCase() || 'USER'}</p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                        refUser.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                      }`}>
                                        {refUser.status}
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                      <div className="flex items-center gap-1 text-zinc-400">
                                        <Calendar className="w-3 h-3" />
                                        <span className="text-[10px]">{refUser.createdAt ? format(new Date(refUser.createdAt), 'MMM d, yyyy') : 'N/A'}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        {refUser.signupRewardClaimed && (
                                          <div title="Signup Reward Given" className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                            <Gift className="w-3 h-3" />
                                          </div>
                                        )}
                                        {refUser.activationRewardClaimed && (
                                          <div title="Activation Reward Given" className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                            <ExternalLink className="w-3 h-3" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              ))}
              {filteredInviters.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-12 h-12 opacity-20" />
                      <p className="font-medium">No referral data found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
