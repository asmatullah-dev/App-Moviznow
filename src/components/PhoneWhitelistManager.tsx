import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, getDocs } from 'firebase/firestore';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { standardizePhone } from '../contexts/AuthContext';

export function PhoneWhitelistManager() {
  const [phones, setPhones] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPhones = async () => {
      try {
        const docRef = doc(db, 'settings', 'whitelisted_phones');
        const snap = await getDoc(docRef);
        let list: string[] = [];

        if (snap.exists()) {
          const data = snap.data();
          list = Array.isArray(data.numbers) ? data.numbers : (Array.isArray(data.phones) ? data.phones : []);
        }

        if (isMounted) {
          setPhones(list);
        }
      } catch (err) {
        console.error('Error fetching whitelisted phones:', err);
      }
    };
    fetchPhones();
    return () => {
      isMounted = false;
    };
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

      const docRef = doc(db, 'settings', 'whitelisted_phones');

      if (!phones.includes(standardized)) {
        const updated = [...phones, standardized];
        await setDoc(docRef, { numbers: updated, updatedAt: new Date().toISOString() });
        setPhones(updated);
      }
      setNewPhone('');
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to add phone");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (phone: string) => {
    try {
      const docRef = doc(db, 'settings', 'whitelisted_phones');
      const updated = phones.filter(p => p !== phone);
      await setDoc(docRef, { numbers: updated, updatedAt: new Date().toISOString() });
      setPhones(updated);
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
          placeholder="Enter WhatsApp number"
          className="flex-1 p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:border-emerald-500"
        />
        <Button onClick={handleAdd} disabled={loading} variant="emerald">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </div>
      {error && <p className="text-red-500 text-sm mb-2 shrink-0">{error}</p>}
      <div className="overflow-y-auto flex-1 pr-2">
        <ul className="space-y-2">
          {phones.map(phone => (
            <li key={phone} className="flex justify-between items-center p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <span className="font-mono text-sm">{phone}</span>
              <button onClick={() => handleRemove(phone)} className="text-red-500 hover:text-red-700 transition-colors p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {phones.length === 0 && (
            <li className="text-center text-zinc-500 dark:text-zinc-400 py-4">
              No whitelisted numbers yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
