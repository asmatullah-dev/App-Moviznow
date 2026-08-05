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
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { AppNotification } from '../types';
import { safeStorage } from '../utils/safeStorage';

interface NotificationContextType {
  notifications: AppNotification[];
  loading: boolean;
  sendNotification: (notification: Omit<AppNotification, 'id' | 'createdAt'>) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const CHUNK_SIZE = 1000;
const CHUNK_PREFIX = 'notification_chunk_';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const latestChunkIdRef = useRef<string>('notification_chunk_0');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
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
      
      const cachedVersion = safeStorage.getItem('cached_notifications_version') || '0';
      const cachedData = safeStorage.getItem('cached_notifications_data');
      
      let allNotifs: AppNotification[] = [];
      let usedCache = false;
      
      if (cachedVersion && serverVersion && cachedVersion === serverVersion && cachedVersion !== '0' && cachedData) {
         try {
             const parsed = JSON.parse(cachedData);
             if (Array.isArray(parsed) && parsed.length > 0) {
               allNotifs = parsed;
               usedCache = true;
             }
         } catch(e) {}
      }
      
      if (!usedCache) {
        const notifMap = new Map<string, AppNotification>();
        
        // 1. Fetch specifically from notification_chunk_0 first
        try {
          const chunk0Doc = await getDoc(doc(db, 'notification_chunks', 'notification_chunk_0'));
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

        // 2. Fetch all notification_chunks collection documents
        try {
          const chunksSnap = await getDocs(collection(db, 'notification_chunks'));
          chunksSnap.docs.forEach(cDoc => {
            const items = cDoc.data().items || {};
            Object.values(items).forEach((item: any) => {
              if (item && item.id && item.title) {
                notifMap.set(item.id, item as AppNotification);
              }
            });
          });
        } catch (err) { }

        // 3. Fallback check for standalone notifications collection if any exist
        try {
          const notifsSnap = await getDocs(query(collection(db, 'notifications'), firestoreLimit(50)));
          notifsSnap.docs.forEach(nDoc => {
            const data = nDoc.data();
            if (data && data.title) {
              const item = { id: nDoc.id, ...data } as AppNotification;
              notifMap.set(item.id, item);
            }
          });
        } catch (err) { }

        allNotifs = Array.from(notifMap.values());
        
        if (allNotifs.length > 0 || serverVersion !== '0') {
          safeStorage.setItem('cached_notifications_version', serverVersion !== '0' ? serverVersion : Date.now().toString());
          safeStorage.setItem('cached_notifications_data', JSON.stringify(allNotifs));
        }
      }

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

    const unsubscribe = onSnapshot(doc(db, 'notification_chunks', 'notification_chunk_0'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const items = data.items || {};
        const chunkNotifs: AppNotification[] = Object.values(items);
        if (chunkNotifs.length > 0) {
          setNotifications(prev => {
            const map = new Map<string, AppNotification>();
            chunkNotifs.forEach(n => {
              if (n && n.id) map.set(n.id, n);
            });
            prev.forEach(n => {
              if (n && n.id && !map.has(n.id)) map.set(n.id, n);
            });
            const merged = Array.from(map.values());
            const filtered = merged.filter(n => {
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
            return filtered;
          });
        }
      }
    }, (err) => {
      console.warn("Realtime notification snapshot listener error:", err);
    });

    return () => unsubscribe();
  }, [fetchNotifications, profile?.uid]);

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
      deleteNotification
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
