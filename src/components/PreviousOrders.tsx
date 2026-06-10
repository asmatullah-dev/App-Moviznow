import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, standardizePhone } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { ChevronDown, ChevronUp, Package, Clock, CheckCircle, XCircle, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';

export default function PreviousOrders() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });

  const orders = React.useMemo(() => {
    if (!profile?.orders) return [];
    return [...profile.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [profile?.orders]);

  const handleCancelOrder = async (orderId: string) => {
    try {
      const { updateDoc, doc } = await import('firebase/firestore');
      const updatedOrders = orders.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o);
      
      await updateDoc(doc(db, 'users', profile!.uid), {
        orders: updatedOrders
      });
      // Admin might need to be notified about cancellation too, but usually it's just user canceling pending
      
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error('Error cancelling order:', error);
      setAlertConfig({isOpen: true, title: 'Error', message: 'Failed to cancel order'});
    }
  };

  if (orders.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-emerald-500" />
        Previous Orders
      </h3>
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="bg-zinc-50 dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div
              onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-300">#{order.id}</span>
                <span className="text-sm font-medium">Rs {order.amount}</span>
              </div>
              <div className="flex items-center gap-3">
                {order.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    {settings?.isAdminContactEnabled !== false && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const adminPhone = standardizePhone(settings?.supportNumber || '3363284466').replace('+', '');
                          const message = `${order.type === 'membership' ? 'Membership Top Up' : 'Add Content'}\nOrder ID: ${order.id}\nAmount: Rs ${order.amount}`;
                          const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
                          window.open(whatsappUrl, '_blank');
                        }}
                        className="text-blue-500 hover:text-blue-600 p-1"
                        title="Send Screenshot"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmModal({
                          isOpen: true,
                          title: 'Cancel Order',
                          message: 'Are you sure you want to cancel this pending order?',
                          onConfirm: () => handleCancelOrder(order.id),
                          confirmText: 'Cancel Order'
                        });
                      }}
                      className="text-red-500 hover:text-red-600 p-1"
                      title="Cancel Order"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <span className="flex items-center gap-1 text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full"><Clock className="w-3 h-3" /> Pending</span>
                  </div>
                )}
                {order.status === 'approved' && <span className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" /> Approved</span>}
                {order.status === 'declined' && <span className="flex items-center gap-1 text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded-full"><XCircle className="w-3 h-3" /> Declined</span>}
                {order.status === 'cancelled' && <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-500/10 px-2 py-1 rounded-full"><XCircle className="w-3 h-3" /> Cancelled</span>}
                {expandedId === order.id ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </div>
            </div>
            <AnimatePresence>
              {expandedId === order.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 border-t border-zinc-200 dark:border-zinc-800/50"
                >
                  <div className="pt-3 space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <p><span className="text-zinc-500">Type:</span> {order.type === 'membership' ? 'Membership Top Up' : 'Content Purchase'}</p>
                    {order.type === 'membership' && <p><span className="text-zinc-500">Duration:</span> {order.months} Month(s)</p>}
                    {order.type === 'content' && order.items && (
                      <div>
                        <span className="text-zinc-500">Items:</span>
                        <ul className="list-disc list-inside mt-1 ml-2">
                          {order.items.map((item: any, idx: number) => (
                            <li key={idx}>{item.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p><span className="text-zinc-500">Date:</span> {order.createdAt ? (typeof order.createdAt === 'string' ? new Date(order.createdAt).toLocaleString() : (order.createdAt as any).toDate?.()?.toLocaleString() || new Date(order.createdAt).toLocaleString()) : 'Just now'}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        confirmText={confirmModal.confirmText}
      />
      
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />
    </div>
  );
}
