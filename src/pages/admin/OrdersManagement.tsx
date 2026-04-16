import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { safeStorage } from '../../utils/safeStorage';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, arrayUnion, deleteDoc, writeBatch } from 'firebase/firestore';
import { Order, UserProfile } from '../../types';
import { Check, X, Clock, Search, Filter, Eye, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import ConfirmModal from '../../components/ConfirmModal';
import { useSettings } from '../../contexts/SettingsContext';

import { useUsers } from '../../contexts/UsersContext';

const CACHE_KEY = 'admin_orders_cache';
const PHONES_CACHE_KEY = 'admin_user_phones_cache';

export default function OrdersManagement() {
  const { users: allUsers } = useUsers();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>(() => {
    const cached = safeStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [filter, setFilter] = useState<string>(() => sessionStorage.getItem('orders_mgmt_filter') || 'all');
  const [search, setSearch] = useState(() => sessionStorage.getItem('orders_mgmt_search') || '');

  useEffect(() => {
    sessionStorage.setItem('orders_mgmt_filter', filter);
    sessionStorage.setItem('orders_mgmt_search', search);
  }, [filter, search]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
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

  useModalBehavior(!!selectedOrder, () => {
    setSelectedOrder(null);
    setSelectedUserPhone(null);
    setSelectedUserExpiry(null);
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
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      
      safeStorage.setItem(CACHE_KEY, JSON.stringify(ordersData));
      setOrders(ordersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Separate effect for auto-deletion to avoid blocking the main snapshot listener
  useEffect(() => {
    if (loading || orders.length === 0) return;

    const runAutoDelete = async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const ordersToDelete = orders.filter(order => {
        const createdAt = (order.createdAt as any)?.seconds 
          ? new Date((order.createdAt as any).seconds * 1000) 
          : new Date(order.createdAt);
        
        if (order.status === 'pending' && createdAt < sevenDaysAgo) return true;
        if (order.status === 'cancelled' && createdAt < twentyFourHoursAgo) return true;
        return false;
      });

      if (ordersToDelete.length > 0) {
        // Use a batch for faster deletion
        const batch = writeBatch(db);
        ordersToDelete.forEach(order => {
          batch.delete(doc(db, 'orders', order.id));
        });
        try {
          await batch.commit();
          console.log(`Auto-deleted ${ordersToDelete.length} old orders`);
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
      const userRef = doc(db, 'users', order.userId);
      const userData = allUsers.find(u => u.uid === order.userId);
      
      if (!userData) {
        console.error('User not found');
        setProcessingId(null);
        return;
      }

      const batch = writeBatch(db);

      if (order.type === 'membership') {
        const months = order.months || 1;
        
        // Calculate new expiry date
        let newExpiryDate = new Date();
        if (userData.expiryDate && new Date(userData.expiryDate) > new Date()) {
          // If already has active expiry, extend from that date
          newExpiryDate = new Date(userData.expiryDate);
        }
        newExpiryDate.setMonth(newExpiryDate.getMonth() + months);

        batch.update(userRef, {
          role: 'user', // Change to user if trial
          status: 'active',
          expiryDate: newExpiryDate.toISOString()
        });
      } else if (order.type === 'content' && order.items) {
        const contentIds = order.items.map(item => 
          item.type === 'season' ? `${item.contentId}:${item.seasonId}` : item.contentId
        );

        const updates: any = {
          assignedContent: arrayUnion(...contentIds)
        };

        // If user is pending, activate them and set role to selected_content
        if (userData.status === 'pending') {
          updates.status = 'active';
          updates.role = 'selected_content';
        }

        batch.update(userRef, updates);
      }

      batch.update(doc(db, 'orders', order.id), {
        status: 'approved'
      });

      await batch.commit();
    } catch (error) {
      console.error('Error approving order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'declined'
      });
    } catch (error) {
      console.error('Error declining order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (error) {
      console.error('Error deleting order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter !== 'all' && order.userRole !== filter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return order.userName.toLowerCase().includes(searchLower) || 
             order.userEmail.toLowerCase().includes(searchLower) ||
             order.id.toLowerCase().includes(searchLower);
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Orders Management</h1>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white"
            >
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="trial">Trial</option>
              <option value="selected_content">Selected Content</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-500 dark:text-zinc-400">
            <thead className="bg-white/50 dark:bg-zinc-950/50 text-xs uppercase font-semibold text-zinc-600 dark:text-zinc-300">
              <tr>
                <th className="px-3 py-4 whitespace-nowrap">Order Info</th>
                <th className="px-3 py-4 whitespace-nowrap">User</th>
                <th className="px-3 py-4 whitespace-nowrap">Status & Type</th>
                <th className="px-3 py-4 whitespace-nowrap">Details</th>
                <th className="px-3 py-4 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    onClick={() => setSelectedOrder(order)}
                    className="hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-4">
                      <div className="font-mono text-xs text-zinc-600 dark:text-zinc-300 mb-1">{order.id}</div>
                      <div className="text-xs text-zinc-500">
                        {order.createdAt ? format(new Date((order.createdAt as any).seconds ? (order.createdAt as any).seconds * 1000 : order.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                      </div>
                    </td>
                    <td className="px-3 py-4 max-w-[150px] md:max-w-[200px]">
                      <div className="font-medium text-zinc-900 dark:text-white truncate" title={order.userName}>{order.userName}</div>
                      <div className="text-xs text-zinc-500 truncate" title={userPhones[order.userId] || order.userEmail}>{userPhones[order.userId] || order.userEmail}</div>
                      <div className="text-[10px] uppercase tracking-wider mt-1 text-emerald-500 truncate">{order.userRole}</div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={clsx(
                          "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
                          order.status === 'pending' && "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
                          order.status === 'approved' && "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
                          order.status === 'declined' && "bg-red-500/10 text-red-500 border border-red-500/20"
                        )}>
                          {order.status}
                        </span>
                        <span className={clsx(
                          "text-[10px] font-bold uppercase tracking-wider opacity-60",
                          order.type === 'membership' ? "text-blue-400" : "text-purple-400"
                        )}>
                          {order.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-col">
                        <span className="text-zinc-600 dark:text-zinc-300 text-xs font-medium">
                          {order.type === 'membership' ? `${order.months} Month(s)` : `${order.items?.length || 0} Items`}
                        </span>
                        <span className="text-emerald-500 font-bold text-sm">
                          Rs {order.amount}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {order.status === 'pending' && (
                          <>
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
                              className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-lg transition-colors disabled:opacity-50"
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
                              className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
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
                          className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Permanently"
                        >
                          {processingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Order Details</h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-white/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Order ID</p>
                    <p className="font-mono text-sm">{selectedOrder.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Date</p>
                    <p className="text-sm">
                      {selectedOrder.createdAt ? format(new Date((selectedOrder.createdAt as any).seconds ? (selectedOrder.createdAt as any).seconds * 1000 : selectedOrder.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Status</p>
                    <span className={clsx(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                      selectedOrder.status === 'pending' && "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
                      selectedOrder.status === 'approved' && "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
                      selectedOrder.status === 'declined' && "bg-red-500/10 text-red-500 border border-red-500/20"
                    )}>
                      <span className="capitalize">{selectedOrder.status}</span>
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Amount</p>
                    <p className="font-bold text-emerald-500">Rs {selectedOrder.amount}</p>
                  </div>
                </div>

                <div className="bg-white/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                  <h3 className="text-sm font-semibold mb-3 text-zinc-600 dark:text-zinc-300">User Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-zinc-500 inline-block w-20">Name:</span> {selectedOrder.userName}</p>
                    <p><span className="text-zinc-500 inline-block w-20">Email:</span> {selectedOrder.userEmail}</p>
                    <p><span className="text-zinc-500 inline-block w-20">Phone:</span> {selectedUserPhone || 'N/A'} {selectedUserPhone && (
                      <a 
                        href={`https://wa.me/${selectedUserPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          selectedOrder.status === 'pending' 
                            ? `*Ap ke Order ka Shukriya!*\nAp ke Order ${selectedOrder.id} ki total payment Rs ${selectedOrder.amount} hai. Order ke Approval ke liye Payment kar ke Screenshot bhej dain.\n\n*Payment Details:*\n${getPaymentDetailsString()}`
                            : selectedOrder.status === 'approved'
                            ? `Thanks for your Payment, Your order ${selectedOrder.id} has been approved.\n🍿 Enjoy watching on ${settings?.headerText || 'MovizNow'}!`
                            : ""
                        )}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="ml-2 text-emerald-500 hover:text-emerald-600 text-xs font-medium underline"
                      >
                        WhatsApp
                      </a>
                    )}</p>
                    <p><span className="text-zinc-500 inline-block w-20">Role:</span> <span className="uppercase text-xs text-emerald-500">{selectedOrder.userRole}</span></p>
                    <p><span className="text-zinc-500 inline-block w-20">Expiry:</span> <span className={clsx(
                      "text-xs font-medium",
                      selectedUserExpiry === 'Lifetime' ? "text-emerald-500" : 
                      selectedUserExpiry && new Date(selectedUserExpiry) < new Date() ? "text-red-500" : "text-zinc-700 dark:text-zinc-300"
                    )}>
                      {selectedUserExpiry === 'Lifetime' ? 'Lifetime' : 
                       selectedUserExpiry ? format(new Date(selectedUserExpiry), 'MMM dd, yyyy') : 'N/A'}
                    </span></p>
                    <p><span className="text-zinc-500 inline-block w-20">User ID:</span> <span className="font-mono text-xs">{selectedOrder.userId}</span></p>
                  </div>
                </div>

                <div className="bg-white/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                  <h3 className="text-sm font-semibold mb-3 text-zinc-600 dark:text-zinc-300">Order Contents</h3>
                  <p className="text-sm mb-2"><span className="text-zinc-500">Type:</span> <span className="capitalize">{selectedOrder.type}</span></p>
                  
                  {selectedOrder.type === 'membership' ? (
                    <p className="text-sm"><span className="text-zinc-500">Duration:</span> {selectedOrder.months} Month(s)</p>
                  ) : (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500 mb-2">Items ({selectedOrder.items?.length || 0}):</p>
                      <ul className="space-y-2">
                        {selectedOrder.items?.map((item, idx) => (
                          <li key={idx} className="text-sm bg-zinc-50 dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-zinc-500 flex justify-between mt-1">
                              <span className="capitalize">{item.type}</span>
                              <span>Rs {item.price}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {selectedOrder.status === 'pending' ? (
                <div className="flex justify-between gap-2 mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
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
                    className="px-5 py-2.5 text-sm rounded-xl font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Approve Order',
                        message: 'Are you sure you want to approve this order?',
                        onConfirm: async () => {
                          await handleApprove(selectedOrder);
                          setSelectedOrder(null);
                        },
                        confirmText: 'Approve'
                      });
                    }}
                    disabled={processingId === selectedOrder.id}
                    className="px-5 py-2.5 text-sm rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <div className="flex justify-end mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Order',
                        message: 'Are you sure you want to delete this order permanently? This will remove it from all records.',
                        onConfirm: async () => {
                          await handleDelete(selectedOrder.id);
                          setSelectedOrder(null);
                        },
                        confirmText: 'Delete'
                      });
                    }}
                    disabled={processingId === selectedOrder.id}
                    className="px-5 py-2.5 text-sm rounded-xl font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Order Permanently
                  </button>
                </div>
              )}
            </motion.div>
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
