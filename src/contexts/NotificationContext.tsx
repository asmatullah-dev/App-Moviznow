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
import { getChunkMeta, getUtcVersion, parseVersionTime } from '../utils/chunkMeta';

interface NotificationContextType {
  notifications: AppNotification[];
  loading: boolean;
  sendNotification: (notification: Omit<AppNotification, 'id' | 'createdAt'>) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const CHUNK_SIZE = 1000;
const NOTIFICATION_FETCH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
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

  const fetchNotifications = useCallback(async (force = false) => {
    try {
      const lastFetchStr = safeStorage.getItem('last_notifications_fetch_time');
      const lastFetchTime = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;
      const now = Date.now();
      const cachedData = safeStorage.getItem('cached_notifications_data');

      // For guest mode (unauthenticated users), do not fetch notification chunks from Firestore
      if (!profile?.uid && !user?.uid) {
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed)) {
              setNotifications(parsed.filter(n => !n.targetUserId && (!n.targetUserIds || n.targetUserIds.length === 0)));
            }
          } catch(e) {}
        } else {
          setNotifications([]);
        }
        setLoading(false);
        return;
      }

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

      const chunksToFetch = new Set<string>();
      let serverVersionTime = 0;
      let effectiveServerVersion = '1';

      try {
        const meta = await getChunkMeta(force);
        if (meta && meta.notifications) {
          if (Array.isArray(meta.notifications.chunks)) {
            meta.notifications.chunks.forEach((c: string) => { if (c) chunksToFetch.add(c); });
          }
          if (Array.isArray(meta.notifications.chunkIds)) {
            meta.notifications.chunkIds.forEach((c: string) => { if (c) chunksToFetch.add(c); });
          }
          if (meta.notifications.latestAppChunkId) chunksToFetch.add(meta.notifications.latestAppChunkId);
          if (meta.notifications.latestPushChunkId) chunksToFetch.add(meta.notifications.latestPushChunkId);
          if (meta.notifications.latestEmailChunkId) chunksToFetch.add(meta.notifications.latestEmailChunkId);
          if (meta.notifications.latestChunkId) chunksToFetch.add(meta.notifications.latestChunkId);
          
          serverVersionTime = parseVersionTime(meta.notifications);
          effectiveServerVersion = typeof meta.notifications === 'object' ? (meta.notifications.updatedAt || meta.notifications.version || '1').toString() : meta.notifications.toString();
        }
      } catch (err) { }

      if (chunksToFetch.size === 0) {
        chunksToFetch.add('notification_chunk_0');
      }
      
      const cachedVersion = safeStorage.getItem('cached_notifications_version');
      const cachedVersionTime = parseVersionTime(cachedVersion);
      const isVersionMatch = (serverVersionTime > 0 && cachedVersionTime === serverVersionTime) || (cachedVersion === effectiveServerVersion);

      if (!force && cachedData && (isVersionMatch || (now - lastFetchTime < NOTIFICATION_FETCH_INTERVAL))) {
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

      const notifMap = new Map<string, AppNotification>();
      
      await Promise.all(
        Array.from(chunksToFetch).map(async (chunkId) => {
          try {
            const chunkDoc = await runWithNetwork(() => getDoc(doc(db, 'notification_chunks', chunkId)));
            if (chunkDoc.exists()) {
              const items = chunkDoc.data().items || {};
              Object.values(items).forEach((item: any) => {
                if (item && item.id && item.title) {
                  notifMap.set(item.id, item as AppNotification);
                }
              });
            }
          } catch (err) {
            console.error(`Error reading ${chunkId}:`, err);
          }
        })
      );

      const allNotifs = Array.from(notifMap.values());
      
      safeStorage.setItem('last_notifications_fetch_time', now.toString());
      safeStorage.setItem('cached_notifications_version', effectiveServerVersion);
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

  const saveToChunk = async (
    batch: any,
    prefix: 'app_chunk_' | 'push_chunk_' | 'Email_chunk_',
    notifId: string,
    newNotif: AppNotification,
    notifMeta: any
  ) => {
    const metaKey = prefix === 'app_chunk_' ? 'latestAppChunkId' : prefix === 'push_chunk_' ? 'latestPushChunkId' : 'latestEmailChunkId';
    let cid = notifMeta[metaKey] || (prefix + '0');

    const chunkDoc = await getDoc(doc(db, 'notification_chunks', cid));
    let chunkItems = chunkDoc.exists() ? chunkDoc.data().items || {} : {};

    if (Object.keys(chunkItems).length >= CHUNK_SIZE) {
      const match = cid.match(/(\d+)$/);
      const nextIndex = match ? parseInt(match[1]) + 1 : 1;
      cid = prefix + nextIndex;
      chunkItems = {};
    }

    const newChunkItems = { [notifId]: newNotif, ...chunkItems };
    batch.set(doc(db, 'notification_chunks', cid), {
      items: newChunkItems,
      updatedAt: serverTimestamp()
    });

    notifMeta[metaKey] = cid;
    notifMeta.latestChunkId = cid;
  };

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
      const { getChunkMeta } = await import('../utils/chunkMeta');
      const meta = await getChunkMeta();
      const notifMeta = (meta && meta.notifications) ? { ...meta.notifications } : {};

      const batch = writeBatch(db);

      // Save to app_chunk_
      await saveToChunk(batch, 'app_chunk_', id, newNotif, notifMeta);

      // Save to push_chunk_ if sendFcm is enabled
      if (notifData.sendFcm) {
        await saveToChunk(batch, 'push_chunk_', id, newNotif, notifMeta);
      }

      // Save to Email_chunk_ if sendEmail is enabled
      if (notifData.sendEmail) {
        await saveToChunk(batch, 'Email_chunk_', id, newNotif, notifMeta);
      }

      // Update chunk_meta
      const utcNow = getUtcVersion();
      batch.set(doc(db, 'chunk_meta', 'versions'), { 
        notifications: {
          ...notifMeta,
          version: utcNow,
          updatedAt: utcNow
        },
        lastGlobalUpdate: serverTimestamp()
      }, { merge: true });

      await batch.commit();
      
      safeStorage.removeItem('cached_notifications_version');
      safeStorage.removeItem('cached_notifications_data');
    } catch (e) {
      console.error("Failed to send notification:", e);
      throw e;
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    try {
      const { getChunkMeta } = await import('../utils/chunkMeta');
      const versionsData = await getChunkMeta();
      const notifMeta = (versionsData && versionsData.notifications) ? { ...versionsData.notifications } : {};

      const prefixes = ['app_chunk_', 'push_chunk_', 'Email_chunk_', 'notification_chunk_'];
      const batch = writeBatch(db);
      let foundAny = false;

      for (const prefix of prefixes) {
        let latestIndex = 0;
        const metaKey = prefix === 'app_chunk_' ? 'latestAppChunkId' : prefix === 'push_chunk_' ? 'latestPushChunkId' : prefix === 'Email_chunk_' ? 'latestEmailChunkId' : 'latestChunkId';
        const latestId = notifMeta[metaKey] || (prefix + '0');
        const match = latestId.match(/(\d+)$/);
        if (match) latestIndex = parseInt(match[1]);

        for (let i = latestIndex; i >= 0; i--) {
          const cid = prefix + i;
          const cDoc = await getDoc(doc(db, 'notification_chunks', cid));
          if (cDoc.exists()) {
            const items = cDoc.data().items || {};
            if (items[id]) {
              delete items[id];
              batch.set(doc(db, 'notification_chunks', cid), {
                items,
                updatedAt: serverTimestamp()
              });
              foundAny = true;
              break;
            }
          }
        }
      }

      if (foundAny) {
        const utcNow = getUtcVersion();
        batch.set(doc(db, 'chunk_meta', 'versions'), { 
          notifications: {
            ...notifMeta,
            version: utcNow,
            updatedAt: utcNow
          },
          lastGlobalUpdate: serverTimestamp()
        }, { merge: true });

        await batch.commit();
        safeStorage.removeItem('cached_notifications_version');
        safeStorage.removeItem('cached_notifications_data');
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
