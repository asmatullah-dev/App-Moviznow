import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from './AuthContext';
import { safeStorage } from '../utils/safeStorage';

interface UsersContextType {
  users: UserProfile[];
  loading: boolean;
  error: string | null;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>(() => {
    const cached = safeStorage.getItem('cached_all_users');
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch users if the current user is an admin, owner, manager, or user_manager
    const isPrivilegedUser = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
    
    if (!isPrivilegedUser) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'users'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id
      })) as UserProfile[];
      
      setUsers(usersData);
      safeStorage.setItem('cached_all_users', JSON.stringify(usersData));
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Error fetching users:', err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile?.role]);

  return (
    <UsersContext.Provider value={{ users, loading, error }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (context === undefined) {
    throw new Error('useUsers must be used within a UsersProvider');
  }
  return context;
}
