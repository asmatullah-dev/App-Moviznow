import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Plus, Trash2, Loader2, UserCheck, Clock } from 'lucide-react';
import { Button } from './Button';
import { standardizePhone, parseWhitelistedEntry, useAuth } from '../contexts/AuthContext';

export function PhoneWhitelistManager() {
  const { whitelistPhoneNumber, unwhitelistPhoneNumber } = useAuth();
  const [phones, setPhones] = useState<string[]>([]);
  const [phoneToUid, setPhoneToUid] = useState<Record<string, string>>({});
  const [usersMap, setUsersMap] = useState<Record<string, { displayName?: string; email?: string }>>({});
  const [newPhone, setNewPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPhones = async () => {
    try {
      const docRef = doc(db, 'settings', 'whitelisted_phones');
      const snap = await getDoc(docRef);
      const list: string[] = [];
      let mapping: Record<string, string> = {};

      if (snap.exists()) {
        const data = snap.data();
        const rawList = Array.isArray(data.numbers) ? data.numbers : (Array.isArray(data.phones) ? data.phones : []);
        rawList.forEach((entry: any) => {
          const parsed = parseWhitelistedEntry(entry);
          if (parsed.phone) {
            list.push(parsed.phone);
            if (parsed.uid) {
              mapping[parsed.phone] = parsed.uid;
            }
          }
        });

        if (data.phoneToUid) {
          mapping = { ...data.phoneToUid, ...mapping };
        }
        setPhoneToUid(mapping);
      }

      setPhones(list);

      // Other user data is resolved directly from UID
      const resolvedUsers: Record<string, { displayName?: string; email?: string }> = {};
      try {
        const cachedAllStr = localStorage.getItem('cached_all_users') || sessionStorage.getItem('cached_all_users');
        if (cachedAllStr) {
          const allUsers = JSON.parse(cachedAllStr);
          if (Array.isArray(allUsers)) {
            allUsers.forEach((u: any) => {
              if (u && u.uid) {
                resolvedUsers[u.uid] = { displayName: u.displayName, email: u.email };
              }
            });
          }
        }
      } catch (e) {}

      // For any UID not in cache, fetch user doc
      const uidsToFetch = Array.from(new Set(Object.values(mapping))).filter(
        (uid) => uid && !uid.startsWith('pending_') && !resolvedUsers[uid]
      );

      if (uidsToFetch.length > 0) {
        await Promise.all(
          uidsToFetch.slice(0, 20).map(async (uid) => {
            try {
              const uSnap = await getDoc(doc(db, 'users', uid));
              if (uSnap.exists()) {
                const uData = uSnap.data();
                resolvedUsers[uid] = { displayName: uData.displayName, email: uData.email };
              }
            } catch (e) {}
          })
        );
      }

      setUsersMap(resolvedUsers);
    } catch (err) {
      console.error('Error fetching whitelisted phones:', err);
    }
  };

  useEffect(() => {
    fetchPhones();
  }, []);

  const handleAdd = async () => {
    if (!newPhone) return;
    setError(null);
    setLoading(true);
    try {
      const standardized = standardizePhone(newPhone);
      if (!standardized) {
        setError("Invalid WhatsApp number");
        setLoading(false);
        return;
      }

      const success = await whitelistPhoneNumber(standardized);
      if (success) {
        await fetchPhones();
        setNewPhone('');
      } else {
        setError("Failed to add WhatsApp number");
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to add phone");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (phone: string) => {
    try {
      const success = await unwhitelistPhoneNumber(phone);
      if (success) {
        await fetchPhones();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[60vh]">
      <div className="flex gap-2 mb-2 shrink-0">
        <input
          type="text"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Enter WhatsApp number (e.g. 03001234567)"
          className="flex-1 p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:border-emerald-500 text-sm"
        />
        <Button onClick={handleAdd} disabled={loading} variant="emerald">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </div>
      {error && <p className="text-red-500 text-sm mb-2 shrink-0">{error}</p>}
      <div className="overflow-y-auto flex-1 pr-2">
        <ul className="space-y-2">
          {phones.map((phone) => {
            const uid = phoneToUid[phone] || phoneToUid[phone.replace(/\D/g, '')];
            const userDetails = (uid && usersMap[uid]) || {};
            const isRegistered = Boolean(uid && !uid.startsWith('pending_'));

            return (
              <li
                key={phone}
                className="flex justify-between items-center p-3 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{phone}</span>
                    {isRegistered ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        <UserCheck className="w-3 h-3" /> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Pending Login
                      </span>
                    )}
                  </div>
                  {isRegistered && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                      {userDetails.displayName && <span className="font-medium text-zinc-700 dark:text-zinc-300">{userDetails.displayName}</span>}
                      {userDetails.email && <span className="opacity-80">({userDetails.email})</span>}
                      {uid && <span className="font-mono text-[10px] opacity-60">UID: {uid.slice(0, 12)}...</span>}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(phone)}
                  className="text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                  title="Remove from whitelist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
          {phones.length === 0 && (
            <li className="text-center text-zinc-500 dark:text-zinc-400 py-6 text-sm">
              No whitelisted WhatsApp numbers yet. Add one above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
