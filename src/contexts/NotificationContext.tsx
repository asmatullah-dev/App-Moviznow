import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit as firestoreLimit,
  writeBatch,
  serverTimestamp
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
    if (!profile) return;
    setLoading(true);
    try {
      let latestChunkId = 'notification_chunk_0';
      try {
        const { getChunkMeta } = await import('../utils/chunkMeta');
        const meta = await getChunkMeta();
        if (meta && meta.notifications && meta.notifications.latestChunkId) {
            latestChunkId = meta.notifications.latestChunkId;
        }
      } catch (err) { }
      
      latestChunkIdRef.current = latestChunkId;

      const chunkDoc = await getDoc(doc(db, 'notification_chunks', latestChunkId));
      let allNotifs: AppNotification[] = [];
      
      if (chunkDoc.exists()) {
        const items = chunkDoc.data().items || {};
        allNotifs = Object.values(items) as AppNotification[];
      }

      let filtered = allNotifs.filter(n => {
        const isTargeted = n.targetUserId || (n.targetUserIds && n.targetUserIds.length > 0);
        if (isTargeted) {
          return n.targetUserId === profile.uid || n.targetUserIds?.includes(profile.uid);
        }
        return true;
      });

      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(filtered);
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10 * 60 * 1000);
    return () => clearInterval(interval);
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
        
        // Also update local cache for consistency if user refreshes immediately
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
