import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  limit as firestoreLimit,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { useAuth } from './AuthContext';
import { AppNotification } from '../types';
import { safeStorage } from '../utils/safeStorage';

interface NotificationContextType {
  notifications: AppNotification[];
  loading: boolean;
  sendNotification: (notification: Omit<AppNotification, 'id' | 'createdAt'>) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const CHUNK_SIZE = 1000;
const CHUNK_PREFIX = 'notification_chunk_';
const NOTIFICATION_FETCH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const cached = safeStorage.getItem('cached_notifications_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch(e) {}
    return [];
  });
  const [loading, setLoading] = useState(notifications.length === 0);
  const latestChunkIdRef = useRef<string>('notification_chunk_0');

  const fetchNotifications = useCallback(async (force = false) => {
    try {
      const lastFetchStr = safeStorage.getItem('last_notifications_fetch_time');
      const lastFetchTime = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;
      const now = Date.now();
      const cachedData = safeStorage.getItem('cached_notifications_data');

      // If cached data exists and 24 hours haven't elapsed, use local storage
      if (!force && cachedData && (now - lastFetchTime < NOTIFICATION_FETCH_INTERVAL)) {
        try {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed)) {
            let filtered = parsed.filter(n => {
              const isTargeted = n.targetUserId || (n.targetUserIds && n.targetUserIds.length > 0);
              if (isTargeted) {
                if (!profile?.uid) return false;
                return n.targetUserId === profile.uid || n.targetUserIds?.includes(profile.uid);
              }
              return true;
            });
            setNotifications(filtered);
            setLoading(false);
            return;
          }
        } catch(e) {}
      }

      setLoading(true);

      let latestChunkId = 'notification_chunk_0';
      let serverVersion = '0';
      try {
        const { getChunkMeta } = await import('../utils/chunkMeta');
        const meta = await getChunkMeta();
        if (meta && meta.notifications) {
            if (meta.notifications.latestChunkId) latestChunkId = meta.notifications.latestChunkId;
            if (meta.notifications.version) serverVersion = meta.notifications.version.toString();
        }
      } catch (err) { }
      
      latestChunkIdRef.current = latestChunkId || 'notification_chunk_0';
      
      const notifMap = new Map<string, AppNotification>();
      
      // 1. Fetch specifically from notification_chunk_0 first via getDoc (once per 24 hours)
      try {
        const chunk0Doc = await runWithNetwork(() => getDoc(doc(db, 'notification_chunks', 'notification_chunk_0')));
        if (chunk0Doc.exists()) {
          const items = chunk0Doc.data().items || {};
          Object.values(items).forEach((item: any) => {
            if (item && item.id && item.title) {
              notifMap.set(item.id, item as AppNotification);
            }
          });
        }
      } catch (err) {
        console.error("Error reading notification_chunk_0:", err);
      }

      // 2. If latest chunk is different, get that chunk as well
      if (latestChunkId && latestChunkId !== 'notification_chunk_0') {
        try {
          const latestDoc = await runWithNetwork(() => getDoc(doc(db, 'notification_chunks', latestChunkId)));
          if (latestDoc.exists()) {
            const items = latestDoc.data().items || {};
            Object.values(items).forEach((item: any) => {
              if (item && item.id && item.title) {
                notifMap.set(item.id, item as AppNotification);
              }
            });
          }
        } catch (err) {}
      }

      const allNotifs = Array.from(notifMap.values());
      
      safeStorage.setItem('last_notifications_fetch_time', now.toString());
      safeStorage.setItem('cached_notifications_version', serverVersion !== '0' ? serverVersion : now.toString());
      safeStorage.setItem('cached_notifications_data', JSON.stringify(allNotifs));

      let filtered = allNotifs.filter(n => {
        const isTargeted = n.targetUserId || (n.targetUserIds && n.targetUserIds.length > 0);
        if (isTargeted) {
          if (!profile?.uid) return false;
          return n.targetUserId === profile.uid || n.targetUserIds?.includes(profile.uid);
        }
        return true;
      });

      const getNotifTime = (n: AppNotification) => {
        if (!n || !n.createdAt) return 0;
        if (typeof n.createdAt === 'object' && (n.createdAt as any)?.seconds) {
          return (n.createdAt as any).seconds * 1000;
        }
        const t = new Date(n.createdAt).getTime();
        return isNaN(t) ? 0 : t;
      };

      filtered.sort((a, b) => getNotifTime(b) - getNotifTime(a));
      setNotifications(filtered);
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    } finally {
      setLoading(false);
    }
  }, [profile?.uid]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const refreshNotifications = useCallback(async () => {
    await fetchNotifications(true);
  }, [fetchNotifications]);

  const sendNotification = async (notifData: Omit<AppNotification, 'id' | 'createdAt'>) => {
    const id = Math.random().toString(36).substring(2, 15);
    const newNotif: AppNotification = {
      ...notifData,
      id,
      createdAt: new Date().toISOString()
    };

    const isTargeted = newNotif.targetUserId || (newNotif.targetUserIds && newNotif.targetUserIds.length > 0);
    const shouldAddLocally = !isTargeted || newNotif.targetUserId === profile?.uid || newNotif.targetUserIds?.includes(profile?.uid || '');
    
    if (shouldAddLocally) {
      setNotifications(prev => [newNotif, ...prev]);
    }

    try {
        let cid = latestChunkIdRef.current;
        const chunkDoc = await getDoc(doc(db, 'notification_chunks', cid));
        let chunkItems = chunkDoc.exists() ? chunkDoc.data().items || {} : {};

        if (Object.keys(chunkItems).length >= CHUNK_SIZE) {
            const match = cid.match(/(\d+)$/);
            const nextIndex = match ? parseInt(match[1]) + 1 : 1;
            cid = CHUNK_PREFIX + nextIndex;
            latestChunkIdRef.current = cid;
            chunkItems = {};
        }

        const newChunkItems = { [id]: newNotif, ...chunkItems };
        const batch = writeBatch(db);
        
        // Update chunk
        batch.set(doc(db, 'notification_chunks', cid), {
            items: newChunkItems,
            updatedAt: serverTimestamp()
        });

        // Update meta
        batch.set(doc(db, 'chunk_meta', 'versions'), { 
            notifications: {
                version: Date.now(),
                latestChunkId: cid,
                updatedAt: serverTimestamp()
            },
            lastGlobalUpdate: serverTimestamp()
        }, { merge: true });

        await batch.commit();
        
        // Clear cached notifications version so fresh list is fetched on next load
        safeStorage.removeItem('cached_notifications_version');
        safeStorage.removeItem('cached_notifications_data');
        safeStorage.setItem('local_notif_chunk_' + cid, JSON.stringify(newChunkItems));
        
    } catch (e) {
        console.error("Failed to send notification:", e);
        throw e;
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    try {
        let foundChunkId: string | null = null;
        let chunkItems: any = null;

        const { getChunkMeta } = await import('../utils/chunkMeta');
        const versionsData = await getChunkMeta();
        let latestIndex = 0;
        if (versionsData) {
            const latestId = (versionsData.notifications && versionsData.notifications.latestChunkId) || 'notification_chunk_0';
            const match = latestId.match(/(\d+)$/);
            if (match) latestIndex = parseInt(match[1]);
        }

        for (let i = latestIndex; i >= 0; i--) {
            const cid = CHUNK_PREFIX + i;
            const cDoc = await getDoc(doc(db, 'notification_chunks', cid));
            if (cDoc.exists()) {
                const items = cDoc.data().items || {};
                if (items[id]) {
                    delete items[id];
                    foundChunkId = cid;
                    chunkItems = items;
                    break;
                }
            }
        }

        if (foundChunkId && chunkItems) {
            const batch = writeBatch(db);
            batch.set(doc(db, 'notification_chunks', foundChunkId), {
                items: chunkItems,
                updatedAt: serverTimestamp()
            });
            batch.set(doc(db, 'chunk_meta', 'versions'), { 
                notifications: {
                    version: Date.now(),
                    updatedAt: serverTimestamp()
                },
                lastGlobalUpdate: serverTimestamp()
            }, { merge: true });

            await batch.commit();
            safeStorage.setItem('local_notif_chunk_' + foundChunkId, JSON.stringify(chunkItems));
        } else {
            try {
                await deleteDoc(doc(db, 'notifications', id));
            } catch (e) {}
        }
    } catch (e) {
        console.error("Failed to delete notification:", e);
        throw e;
    }
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      loading,
      sendNotification,
      deleteNotification,
      refreshNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
