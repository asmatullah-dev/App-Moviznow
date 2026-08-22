import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { safeStorage } from '../../utils/safeStorage';
import { collection, query, orderBy, doc, updateDoc, getDoc, setDoc, arrayUnion, deleteDoc, writeBatch } from 'firebase/firestore';
import { Order, UserProfile } from '../../types';
import { Check, X, Clock, Search, Filter, Eye, Loader2, Trash2, Zap, Sparkles, CheckCircle2, AlertCircle, Image as ImageIcon, ExternalLink, ShieldCheck, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import ConfirmModal from '../../components/ConfirmModal';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers, isUserExpired } from '../../contexts/UsersContext';

const CACHE_KEY = 'admin_orders_cache';
const PHONES_CACHE_KEY = 'admin_user_phones_cache';

export default function OrdersManagement() {
  const { profile } = useAuth();
  const { users: allUsers, updateUserFields } = useUsers();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>(() => {
    const cached = safeStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [filter, setFilter] = useState<string>(() => sessionStorage.getItem('orders_mgmt_filter') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState(() => sessionStorage.getItem('orders_mgmt_search') || '');

  useEffect(() => {
    sessionStorage.setItem('orders_mgmt_filter', filter);
    sessionStorage.setItem('orders_mgmt_search', search);
  }, [filter, search]);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [aiVerifyingId, setAiVerifyingId] = useState<string | null>(null);
  const [aiResultToast, setAiResultToast] = useState<{
    show: boolean;
    success: boolean;
    title: string;
    message: string;
  } | null>(null);

  const [selectedUserPhone, setSelectedUserPhone] = useState<string | null>(null);
  const [selectedUserExpiry, setSelectedUserExpiry] = useState<string | null>(null);
  const [userPhones, setUserPhones] = useState<Record<string, string>>(() => {
    const cached = safeStorage.getItem(PHONES_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  });

  useEffect(() => {
    safeStorage.setItem(PHONES_CACHE_KEY, JSON.stringify(userPhones));
  }, [userPhones]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useModalBehavior(!!selectedOrder || !!previewImageUrl, () => {
    if (previewImageUrl) {
      setPreviewImageUrl(null);
    } else {
      setSelectedOrder(null);
      setSelectedUserPhone(null);
      setSelectedUserExpiry(null);
    }
  });

  const [userExpiries, setUserExpiries] = useState<Record<string, string>>(() => {
    const cached = safeStorage.getItem('user_expiries_cache');
    return cached ? JSON.parse(cached) : {};
  });

  useEffect(() => {
    safeStorage.setItem('user_expiries_cache', JSON.stringify(userExpiries));
  }, [userExpiries]);

  useEffect(() => {
    if (orders.length > 0) {
      const newPhones: Record<string, string> = { ...userPhones };
      const newExpiries: Record<string, string> = { ...userExpiries };
      
      orders.forEach(order => {
        const user = allUsers.find(u => u.uid === order.userId);
        if (user) {
          newPhones[order.userId] = user.phone || '';
          newExpiries[order.userId] = user.expiryDate || '';
        }
      });
      
      setUserPhones(newPhones);
      setUserExpiries(newExpiries);
    }
  }, [orders, allUsers]);

  useEffect(() => {
    if (selectedOrder) {
      setSelectedUserPhone(userPhones[selectedOrder.userId] || null);
      setSelectedUserExpiry(userExpiries[selectedOrder.userId] || null);
    }
  }, [selectedOrder, userPhones, userExpiries]);

  const isIBAN = (value: string) => {
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/i.test(value.replace(/\s/g, ''));
  };

  const getPaymentDetailsString = () => {
    if (settings?.isPaymentEnabled === false) return '';
    if (settings?.paymentDetails) return settings.paymentDetails;
    
    if (settings?.bankAccounts && settings.bankAccounts.length > 0) {
      return settings.bankAccounts.map(b => {
        const type = b.accountNumber && isIBAN(b.accountNumber) ? 'IBAN' : 'Account Number';
        const accNo = b.accountNumber || settings?.accountNumber || '03416286423';
        const accTitle = b.accountTitle || settings?.accountTitle || 'Asmat Ullah';
        return `*${b.name}*\n*${type}:* ${accNo}\n*Title:* ${accTitle}`;
      }).join('\n');
    }
    
    return `*Banks :* Easypaisa, Jazzcash, NayaPay, SadaPay \n*Account Number :* ${settings?.accountNumber || '03416286423'}\n*Account Title :* ${settings?.accountTitle || 'Asmat Ullah'}`;
  };

  useEffect(() => {
    const allOrders = allUsers.flatMap(u => u.orders || []);
    allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    safeStorage.setItem(CACHE_KEY, JSON.stringify(allOrders));
    setOrders(allOrders);
    setLoading(false);
  }, [allUsers]);

  // Separate effect for auto-deletion
  useEffect(() => {
    if (loading || orders.length === 0) return;

    const runAutoDelete = async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const batch = writeBatch(db);
      let changesMade = false;

      allUsers.forEach(user => {
        if (!user.orders || user.orders.length === 0) return;
        
        let changed = false;
        const keptOrders = user.orders.filter(order => {
          const createdAt = (order.createdAt as any)?.seconds 
            ? new Date((order.createdAt as any).seconds * 1000) 
            : new Date(order.createdAt);
          
          if (order.status === 'pending' && createdAt < sevenDaysAgo) { changed = true; return false; }
          if (order.status === 'cancelled' && createdAt < twentyFourHoursAgo) { changed = true; return false; }
          return true;
        });

        if (changed) {
          batch.update(doc(db, 'users', user.uid), { orders: keptOrders });
          updateUserFields(user.uid, { orders: keptOrders });
          changesMade = true;
        }
      });

      if (changesMade) {
        try {
          await batch.commit();
          console.log(`Auto-deleted old orders`);
        } catch (err) {
          console.error("Failed to commit auto-delete batch:", err);
        }
      }
    };

    const timer = setTimeout(runAutoDelete, 5000); // Wait 5s after load/change
    return () => clearTimeout(timer);
  }, [orders, loading]);

  const handleApprove = async (order: Order) => {
    setProcessingId(order.id);
    try {
      const userData = allUsers.find(u => u.uid === order.userId);
      
      if (!userData) {
        console.error('User not found');
        setProcessingId(null);
        return;
      }

      const updates: any = {};

      if (order.type === 'membership') {
        const months = order.months || 1;
        
        let baseDate = new Date();
        if (userData.expiryDate && userData.expiryDate !== 'Lifetime' && !isUserExpired(userData.expiryDate)) {
          const parts = userData.expiryDate.split('T')[0].split('-');
          if (parts.length === 3) {
            baseDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59, 999);
          }
        }
        baseDate.setMonth(baseDate.getMonth() + months);
        const dateStr = baseDate.toISOString().split('T')[0];

        const targetRole = order.planRole || (order.planName?.toLowerCase().includes('basic') ? 'basic' : 'vip');
        updates.role = targetRole;
        updates.status = 'active';
        updates.expiryDate = `${dateStr}T23:59:59.999Z`;
      } else if (order.type === 'content' && order.items) {
        const contentIds = order.items.map(item => 
          item.type === 'season' ? `${item.contentId}:${item.seasonId}` : item.contentId
        );

        updates.assignedContent = Array.from(new Set([...(userData.assignedContent || []), ...contentIds]));
        
        if (['user', 'trial', 'basic', 'selected_content', ''].includes(userData.role || '')) {
          updates.role = 'vip';
        }
      }

      const updatedOrders = userData.orders?.map(o => o.id === order.id ? { ...o, status: 'approved' } : o) || [];
      updates.orders = updatedOrders;

      updateUserFields(order.userId, updates);

      // Send Order Approved Notification
      fetch('/api/notifications/notify-order-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: order.userId,
          orderId: order.id,
          orderType: order.type,
          newExpiryDate: order.type === 'membership' ? updates.expiryDate : undefined,
        })
      }).catch(err => console.warn('Failed to send order approval notification:', err));

      // Record in Income Management (single document: income/data)
      try {
        const incomeDocRef = doc(db, 'income', 'data');
        const incomeSnap = await getDoc(incomeDocRef);
        let currentIncome: any[] = [];
        if (incomeSnap.exists()) {
          const data = incomeSnap.data();
          currentIncome = Array.isArray(data.records) ? data.records : [];
        }
        const newIncomeRecord = {
          id: 'inc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          amount: order.amount,
          description: `${order.type === 'membership' ? 'Membership Renewal' : 'Content Purchase'} (${order.id})`,
          date: new Date().toISOString(),
          userName: order.userName || 'Unknown User'
        };
        const updatedIncome = [newIncomeRecord, ...currentIncome];
        await setDoc(incomeDocRef, { records: updatedIncome, updatedAt: new Date().toISOString() });
      } catch (incErr) {
        console.error('Error recording income:', incErr);
      }

      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...selectedOrder, status: 'approved' });
      }
    } catch (error) {
      console.error('Error approving order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      const orderUser = allUsers.find(u => u.orders?.some(o => o.id === orderId));
      if (!orderUser) throw new Error("User not found");

      const updatedOrders = orderUser.orders!.map(o => o.id === orderId ? { ...o, status: 'declined' as const } : o);
      updateUserFields(orderUser.uid, { orders: updatedOrders });
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: 'declined' });
      }
    } catch (error) {
      console.error('Error declining order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      const orderUser = allUsers.find(u => u.orders?.some(o => o.id === orderId));
      if (!orderUser) throw new Error("User not found");

      const updatedOrders = orderUser.orders!.filter(o => o.id !== orderId);
      updateUserFields(orderUser.uid, { orders: updatedOrders });
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (error) {
      console.error('Error deleting order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  // Trigger Gemini AI Re-Verification against Gmail bank notifications
  const handleAiReVerify = async (order: Order) => {
    setAiVerifyingId(order.id);
    try {
      const res = await fetch('/api/orders/admin-verify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          userId: order.userId,
        }),
      });

      const data = await res.json();

      if (data.matched && data.autoApproved) {
        setAiResultToast({
          show: true,
          success: true,
          title: '⚡ Order Auto-Approved by Gemini AI!',
          message: `Bank notification matched for Rs. ${order.amount} (TID: ${order.trxId || 'Verified'}). User account updated!`,
        });
        if (selectedOrder?.id === order.id && data.order) {
          setSelectedOrder(data.order);
        }
      } else {
        setAiResultToast({
          show: true,
          success: false,
          title: 'AI Verification Result: Not Matched',
          message: data.verdict?.reason || data.reason || data.error || 'No matching bank notification found in recent Gmail notifications.',
        });
      }
    } catch (error: any) {
      setAiResultToast({
        show: true,
        success: false,
        title: 'Verification Failed',
        message: error.message || 'Could not verify order with AI.',
      });
    } finally {
      setAiVerifyingId(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter !== 'all' && order.userRole !== filter) return false;
    
    if (statusFilter === 'pending' && order.status !== 'pending') return false;
    if (statusFilter === 'approved' && order.status !== 'approved') return false;
    if (statusFilter === 'declined' && order.status !== 'declined') return false;
    if (statusFilter === 'ai_approved' && !(order.verifiedBy?.includes('AI') || (order as any).aiVerified)) return false;

    if (search) {
      const searchLower = search.toLowerCase();
      return (
        order.userName?.toLowerCase().includes(searchLower) || 
        order.userEmail?.toLowerCase().includes(searchLower) ||
        order.id?.toLowerCase().includes(searchLower) ||
        (order as any).trxId?.toLowerCase().includes(searchLower) ||
        (order as any).accountTitle?.toLowerCase().includes(searchLower) ||
        (order as any).accountNumberLast4?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* AI Toast notification */}
      <AnimatePresence>
        {aiResultToast?.show && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={clsx(
              "p-4 rounded-2xl border shadow-xl flex items-start justify-between gap-3 text-sm",
              aiResultToast.success 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200" 
                : "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
            )}
          >
            <div className="flex items-start gap-3">
              {aiResultToast.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className="font-bold">{aiResultToast.title}</h4>
                <p className="text-xs opacity-90 mt-0.5">{aiResultToast.message}</p>
              </div>
            </div>
            <button
              onClick={() => setAiResultToast(null)}
              className="p-1 rounded-lg hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Orders Management</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold border border-emerald-500/20">
              <Sparkles className="w-3 h-3" />
              AI Auto-Approval Active
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Orders are matched automatically via Gemini 2.5 Flash against recent bank notifications from asmatullah9327@gmail.com
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by ID, Name, TID, Acc..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Only</option>
              <option value="ai_approved">⚡ AI Auto-Approved</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </select>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white font-medium"
            >
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="trial">Trial</option>
              <option value="selected_content">Selected Content</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-500 dark:text-zinc-400">
            <thead className="bg-white/50 dark:bg-zinc-950/50 text-xs uppercase font-semibold text-zinc-600 dark:text-zinc-300">
              <tr>
                <th className="px-3 py-4 whitespace-nowrap">Order Info</th>
                <th className="px-3 py-4 whitespace-nowrap">User</th>
                <th className="px-3 py-4 whitespace-nowrap">Status & Verification</th>
                <th className="px-3 py-4 whitespace-nowrap">Details & Trx</th>
                <th className="px-3 py-4 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isAiApproved = order.verifiedBy?.includes('AI') || (order as any).aiVerified;
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-4">
                        <div className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-0.5">#{order.id}</div>
                        <div className="text-xs text-zinc-500">
                          {order.createdAt ? format(new Date((order.createdAt as any).seconds ? (order.createdAt as any).seconds * 1000 : order.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                        </div>
                        {(order as any).paymentScreenshotUrl && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                            <ImageIcon className="w-3 h-3" /> Screenshot Attached
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 max-w-[150px] md:max-w-[200px]">
                        <div className="font-medium text-zinc-900 dark:text-white truncate" title={order.userName}>{order.userName}</div>
                        <div className="text-xs text-zinc-500 truncate" title={userPhones[order.userId] || order.userEmail}>{userPhones[order.userId] || order.userEmail}</div>
                        <div className="text-[10px] uppercase tracking-wider mt-1 text-emerald-500 truncate font-bold">{order.userRole}</div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className={clsx(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider w-fit",
                            order.status === 'pending' && "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
                            order.status === 'approved' && "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
                            order.status === 'declined' && "bg-red-500/10 text-red-500 border border-red-500/20"
                          )}>
                            {order.status}
                          </span>

                          {isAiApproved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-extrabold border border-purple-500/20">
                              <Sparkles className="w-2.5 h-2.5" /> AI Approved
                            </span>
                          ) : (
                            <span className={clsx(
                              "text-[10px] font-bold uppercase tracking-wider opacity-60",
                              order.type === 'membership' ? "text-blue-400" : "text-purple-400"
                            )}>
                              {order.type}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-col">
                          <span className="text-zinc-600 dark:text-zinc-300 text-xs font-medium">
                            {order.type === 'membership' ? `${order.months} Month(s)` : `${order.items?.length || 0} Items`}
                          </span>
                          <span className="text-emerald-500 font-extrabold text-sm">
                            Rs {order.amount}
                          </span>
                          {(order as any).trxId && (
                            <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[120px]" title={(order as any).trxId}>
                              TID: {(order as any).trxId}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {order.status === 'pending' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAiReVerify(order);
                                }}
                                disabled={aiVerifyingId === order.id}
                                className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1 text-xs font-bold"
                                title="Run AI Re-Verification with Gmail"
                              >
                                {aiVerifyingId === order.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Zap className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'Approve Order',
                                    message: 'Are you sure you want to approve this order?',
                                    onConfirm: () => handleApprove(order),
                                    confirmText: 'Approve'
                                  });
                                }}
                                disabled={processingId === order.id}
                                className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-xl transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                {processingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'Decline Order',
                                    message: 'Are you sure you want to decline this order?',
                                    onConfirm: () => handleDecline(order.id),
                                    confirmText: 'Decline'
                                  });
                                }}
                                disabled={processingId === order.id}
                                className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors disabled:opacity-50"
                                title="Decline"
                              >
                                {processingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Order',
                                message: 'Are you sure you want to delete this order permanently? This will remove it from all records.',
                                onConfirm: () => handleDelete(order.id),
                                confirmText: 'Delete'
                              });
                            }}
                            disabled={processingId === order.id}
                            className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors disabled:opacity-50"
                            title="Delete Permanently"
                          >
                            {processingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 dark:text-white">Order #{selectedOrder.id}</h2>
                  <p className="text-xs text-zinc-500">Review payment proofs and AI verification audit trail</p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Status & Amount summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Status</p>
                    <span className={clsx(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase",
                      selectedOrder.status === 'pending' && "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20",
                      selectedOrder.status === 'approved' && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                      selectedOrder.status === 'declined' && "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                    )}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Amount</p>
                    <p className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">Rs {selectedOrder.amount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Type</p>
                    <p className="text-xs font-extrabold capitalize text-zinc-800 dark:text-zinc-200">{selectedOrder.type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Date</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                      {selectedOrder.createdAt ? format(new Date((selectedOrder.createdAt as any).seconds ? (selectedOrder.createdAt as any).seconds * 1000 : selectedOrder.createdAt), 'MMM dd, HH:mm') : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* AI Verification Report */}
                {((selectedOrder as any).verifiedBy || (selectedOrder as any).aiVerificationReason || (selectedOrder as any).matchedEmailSnippet) && (
                  <div className="bg-purple-500/10 border border-purple-500/30 p-4 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-black text-purple-600 dark:text-purple-300">
                        <Sparkles className="w-4 h-4" />
                        <span>AI Verification Details</span>
                      </div>
                      {(selectedOrder as any).verifiedBy && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold">
                          {(selectedOrder as any).verifiedBy}
                        </span>
                      )}
                    </div>

                    {(selectedOrder as any).aiVerificationReason && (
                      <p className="text-xs text-zinc-700 dark:text-zinc-300">
                        <span className="font-bold">Verdict: </span> {(selectedOrder as any).aiVerificationReason}
                      </p>
                    )}

                    {(selectedOrder as any).matchedEmailSubject && (
                      <div className="text-xs bg-white/60 dark:bg-black/40 p-2.5 rounded-xl border border-purple-500/20 font-mono text-zinc-800 dark:text-zinc-200">
                        <div className="font-bold text-purple-600 dark:text-purple-400 mb-0.5">Matched Bank Email:</div>
                        <div>Subject: {(selectedOrder as any).matchedEmailSubject}</div>
                        {(selectedOrder as any).matchedEmailDate && <div>Date: {(selectedOrder as any).matchedEmailDate}</div>}
                        {(selectedOrder as any).matchedEmailSnippet && (
                          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400 font-sans border-t border-purple-500/20 pt-1">
                            "{(selectedOrder as any).matchedEmailSnippet}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Transaction & Payment details submitted by user */}
                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">
                      User Submitted Payment Proof
                    </h3>
                    {(selectedOrder as any).senderBank && (
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20">
                        {(selectedOrder as any).senderBank}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-400 text-[10px] block uppercase font-bold">Transaction ID / TID</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white break-all">
                        {(selectedOrder as any).trxId || 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-400 text-[10px] block uppercase font-bold">Account Title</span>
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {(selectedOrder as any).accountTitle || 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-400 text-[10px] block uppercase font-bold">Account (Last 4)</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white">
                        {(selectedOrder as any).accountNumberLast4 ? `•••• ${(selectedOrder as any).accountNumberLast4}` : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-400 text-[10px] block uppercase font-bold">Payment Time / Date</span>
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {(selectedOrder as any).paymentDateTime || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Payment Screenshot Thumbnail */}
                  {(selectedOrder as any).paymentScreenshotUrl && (
                    <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Payment Receipt / Screenshot</p>
                      <div 
                        onClick={() => setPreviewImageUrl((selectedOrder as any).paymentScreenshotUrl)}
                        className="relative group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 max-h-48 cursor-pointer bg-black/40 flex items-center justify-center"
                      >
                        <img 
                          src={(selectedOrder as any).paymentScreenshotUrl} 
                          alt="Payment Proof" 
                          referrerPolicy="no-referrer"
                          className="w-full max-h-48 object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-bold">
                          <Eye className="w-4 h-4" /> Click to view full image
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* User Info Card */}
                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider mb-2">User Information</h3>
                  <p><span className="text-zinc-500 inline-block w-24">Name:</span> <span className="font-bold text-zinc-900 dark:text-white">{selectedOrder.userName}</span></p>
                  <p><span className="text-zinc-500 inline-block w-24">Email:</span> <span className="font-mono">{selectedOrder.userEmail}</span></p>
                  <p><span className="text-zinc-500 inline-block w-24">Phone:</span> {selectedUserPhone || 'N/A'} {selectedUserPhone && (
                    <a 
                      href={`https://wa.me/${selectedUserPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        selectedOrder.status === 'pending' 
                          ? `*Ap ke Order ka Shukriya!*\nAp ke Order ${selectedOrder.id} ki total payment Rs ${selectedOrder.amount} hai. Order ke Approval ke liye Payment kar ke Screenshot bhej dain.${settings?.isPaymentEnabled !== false ? `\n\n*Payment Details:*\n${getPaymentDetailsString()}` : ''}`
                          : selectedOrder.status === 'approved'
                          ? `Thanks for your Payment, Your order ${selectedOrder.id} has been approved.\n🍿 Enjoy watching on ${settings?.headerText || 'MovizNow'}!`
                          : ""
                      )}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="ml-2 text-emerald-500 hover:text-emerald-600 text-xs font-bold underline"
                    >
                      WhatsApp
                    </a>
                  )}</p>
                  <p><span className="text-zinc-500 inline-block w-24">Current Role:</span> <span className="uppercase font-bold text-emerald-500">{selectedOrder.userRole}</span></p>
                  <p><span className="text-zinc-500 inline-block w-24">Expiry:</span> <span className={clsx(
                    "font-bold",
                    selectedUserExpiry === 'Lifetime' ? "text-emerald-500" : 
                    selectedUserExpiry && new Date(selectedUserExpiry) < new Date() ? "text-red-500" : "text-zinc-700 dark:text-zinc-300"
                  )}>
                    {selectedUserExpiry === 'Lifetime' ? 'Lifetime' : 
                     selectedUserExpiry ? format(new Date(selectedUserExpiry), 'MMM dd, yyyy') : 'N/A'}
                  </span></p>
                </div>

                {/* Contents Card */}
                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider mb-2">Order Items</h3>
                  {selectedOrder.type === 'membership' ? (
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      Membership Plan: {selectedOrder.months} Month(s) ({selectedOrder.planName || 'VIP Plan'})
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedOrder.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                          <span className="font-bold text-zinc-900 dark:text-white">{item.title}</span>
                          <span className="text-emerald-500 font-extrabold">Rs {item.price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              {selectedOrder.status === 'pending' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => handleAiReVerify(selectedOrder)}
                    disabled={aiVerifyingId === selectedOrder.id}
                    className="px-4 py-2.5 text-xs font-black rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-all flex items-center gap-1.5 shadow-md shadow-purple-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {aiVerifyingId === selectedOrder.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    <span>AI Re-Verify with Gmail</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Decline Order',
                          message: 'Are you sure you want to decline this order?',
                          onConfirm: async () => {
                            await handleDecline(selectedOrder.id);
                            setSelectedOrder(null);
                          },
                          confirmText: 'Decline'
                        });
                      }}
                      disabled={processingId === selectedOrder.id}
                      className="px-4 py-2.5 text-xs rounded-xl font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Approve Order',
                          message: 'Are you sure you want to manually approve this order?',
                          onConfirm: async () => {
                            await handleApprove(selectedOrder);
                            setSelectedOrder(null);
                          },
                          confirmText: 'Approve'
                        });
                      }}
                      disabled={processingId === selectedOrder.id}
                      className="px-4 py-2.5 text-xs rounded-xl font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      Manual Approve
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Order',
                        message: 'Are you sure you want to delete this order permanently?',
                        onConfirm: async () => {
                          await handleDelete(selectedOrder.id);
                          setSelectedOrder(null);
                        },
                        confirmText: 'Delete'
                      });
                    }}
                    disabled={processingId === selectedOrder.id}
                    className="px-4 py-2.5 text-xs rounded-xl font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Permanently
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full-size Image Lightbox Modal */}
      <AnimatePresence>
        {previewImageUrl && (
          <div 
            onClick={() => setPreviewImageUrl(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out"
          >
            <div className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl">
              <button
                onClick={() => setPreviewImageUrl(null)}
                className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <img 
                src={previewImageUrl} 
                alt="Full Screenshot" 
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[85vh] object-contain rounded-2xl"
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        confirmText={confirmModal.confirmText}
      />
    </motion.div>
  );
}
