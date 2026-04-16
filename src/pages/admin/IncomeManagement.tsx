import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { Income } from '../../types';
import { Plus, Trash2, DollarSign, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { useModalBehavior } from '../../hooks/useModalBehavior';

export default function IncomeManagement() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [userName, setUserName] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });

  useModalBehavior(isAdding, () => setIsAdding(false));
  useModalBehavior(!!deleteId, () => setDeleteId(null));
  useModalBehavior(alertConfig.isOpen, () => setAlertConfig(prev => ({ ...prev, isOpen: false })));

  useEffect(() => {
    const fetchIncome = async () => {
      try {
        const q = query(collection(db, 'income'), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        setIncomes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Income)));
      } catch (error) {
        console.error("Income fetch error:", error);
        handleFirestoreError(error, OperationType.LIST, 'income');
      }
    };
    fetchIncome();
  }, []);

  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !date) return;
    setProcessing(prev => ({ ...prev, add: true }));

    try {
      await addDoc(collection(db, 'income'), {
        amount: parseFloat(amount),
        description,
        date: new Date(date).toISOString(),
        userName: userName || 'Anonymous',
      });
      setIsAdding(false);
      setAmount('');
      setDescription('');
      setDate(new Date().toISOString().split('T')[0]);
      setUserName('');
      // Refresh incomes
      const q = query(collection(db, 'income'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      setIncomes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Income)));
    } catch (error) {
      console.error('Error adding income:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to add income' });
    } finally {
      setProcessing(prev => ({ ...prev, add: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setProcessing(prev => ({ ...prev, delete: true }));
    try {
      await deleteDoc(doc(db, 'income', deleteId));
      setIncomes(incomes.filter(i => i.id !== deleteId));
    } catch (error) {
      console.error('Error deleting income:', error);
    } finally {
      setProcessing(prev => ({ ...prev, delete: false }));
    }
  };

  const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const thisMonthIncome = incomes.filter(inc => {
    const incDate = new Date(inc.date);
    const now = new Date();
    return incDate.getMonth() === now.getMonth() && incDate.getFullYear() === now.getFullYear();
  }).reduce((sum, inc) => sum + inc.amount, 0);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-emerald-500" />
          Income / Earnings
        </h1>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Income
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
            <DollarSign className="w-8 h-8" />
          </div>
          <div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">Total Earnings</p>
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">${totalIncome.toFixed(2)}</h2>
          </div>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
            <TrendingUp className="w-8 h-8" />
          </div>
          <div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">This Month</p>
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">${thisMonthIncome.toFixed(2)}</h2>
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
              <tr>
                <th className="px-6 py-4 whitespace-nowrap">Date</th>
                <th className="px-6 py-4 whitespace-nowrap">User / Source</th>
                <th className="px-6 py-4 whitespace-nowrap">Description</th>
                <th className="px-6 py-4 whitespace-nowrap">Amount</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {incomes.map((income) => (
                <tr key={income.id} className="hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-zinc-500" />
                      {format(new Date(income.date), 'MMM dd, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white">{income.userName}</td>
                  <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">{income.description}</td>
                  <td className="px-6 py-4 font-bold text-emerald-400">${income.amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setDeleteId(income.id)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {incomes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No income records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-bold">Add Income Record</h2>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">User / Source Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Description</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. 1 Month Subscription"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-between gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  disabled={processing.add}
                  className="px-5 py-2.5 text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing.add}
                  className="px-5 py-2.5 text-sm bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing.add && <Loader2 className="w-4 h-4 animate-spin" />}
                  {processing.add ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Income Record"
        message="Are you sure you want to delete this income record? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <AlertModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />
    </div>
  );
}
