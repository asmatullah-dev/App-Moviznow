import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, setDoc, serverTimestamp, query, where, orderBy, limit, collection, getDocs } from 'firebase/firestore';
import { motion } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';

import PaymentMethods from '../../components/PaymentMethods';

import { useSettings } from '../../contexts/SettingsContext';

export default function TopUp() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [months, setMonths] = useState(1);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pendingMembershipOrder, setPendingMembershipOrder] = useState<any>(null);
  const [isCheckingPendingOrder, setIsCheckingPendingOrder] = useState(true);

  useEffect(() => {
    const checkPendingOrder = async () => {
      if (!profile?.uid) {
        setIsCheckingPendingOrder(false);
        return;
      }
      const q = query(
        collection(db, 'orders'),
        where('userId', '==', profile.uid),
        where('status', '==', 'pending'),
        where('type', '==', 'membership')
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setPendingMembershipOrder(snapshot.docs[0].data());
        setOrderId(snapshot.docs[0].id);
        setConfirmed(true);
      }
      setIsCheckingPendingOrder(false);
    };
    checkPendingOrder();
  }, [profile?.uid]);

  const isExtend = location.state?.isExtend;
  const isExpired = profile?.status === 'expired';

  const actionText = isExtend ? 'Extend' : (isExpired && profile?.role === 'user' ? 'Renew' : 'Get');

  const handleCopy = () => {
    navigator.clipboard.writeText(settings?.accountNumber || '03416286423');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = async (): Promise<string | null> => {
    if (!profile) return null;
    setLoading(true);
    try {
      const newOrderId = Math.floor(10000000 + Math.random() * 90000000).toString();

      await setDoc(doc(db, 'orders', newOrderId), {
        userId: profile.uid,
        userName: profile.displayName || 'Unknown',
        userEmail: profile.email,
        userRole: profile.role,
        type: 'membership',
        amount: months * (settings?.membershipFee || 200),
        months,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setOrderId(newOrderId);
      setConfirmed(true);
      return newOrderId;
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSendPaymentScreenshot = async () => {
    if (!profile) return;
    
    setLoading(true);
    try {
      let currentOrderId = orderId;
      if (!confirmed) {
          currentOrderId = await handleConfirm();
          setLoading(true);
          if (!currentOrderId) return;
      }
      
      // Fetch the last membership order
      const q = query(
        collection(db, 'orders'),
        where('userId', '==', profile.uid),
        where('type', '==', 'membership'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      const lastOrder = snapshot.docs[0]?.data();

      const message = `Membership Top Up\nOrder ID: ${currentOrderId}\nMonths: ${lastOrder?.months || months}\nAmount: Rs ${lastOrder?.amount || months * (settings?.membershipFee || 200)}`;
      const whatsappUrl = `https://wa.me/92${settings?.supportNumber || '3363284466'}?text=${encodeURIComponent(message)}`;
      
      window.open(whatsappUrl, '_blank');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white p-4 md:p-8 transition-colors duration-300"
    >
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white mb-6 transition-all active:scale-95">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Home
        </button>

        <h1 className="text-2xl font-bold mb-6">Top Up Membership</h1>

        {isCheckingPendingOrder ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : pendingMembershipOrder ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-xl mb-6">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              You have already a Pending Membership Order. Send Payment Screenshot OR Cancel it for New Order
            </p>
          </div>
        ) : (
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Membership Details</h2>
            <div className="flex items-center justify-between mb-4">
              <span>Duration (Months)</span>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setMonths(Math.max(1, months - 1))}
                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-700"
                >
                  -
                </button>
                <span className="text-xl font-bold">{months}</span>
                <button 
                  onClick={() => setMonths(months + 1)}
                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-700"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
              <span className="text-zinc-500 dark:text-zinc-400">Total Amount</span>
              <span className="text-2xl font-bold text-red-500">Rs {months * (settings?.membershipFee || 200)}</span>
            </div>
          </div>
        )}

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6 shadow-2xl border border-zinc-200 dark:border-zinc-800/50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-500" />
            Payment Details
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
            Please send the payment to the following account via any of these methods:
          </p>
          
          <PaymentMethods copied={copied} onCopy={handleCopy} />
        </div>

        <div className="text-center mb-6">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            After Payment Send Screenshot for Approval
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading || confirmed || !!pendingMembershipOrder}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg mb-4"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmed ? 'Confirmed' : 'Confirm Order'}
        </button>

        <button
          onClick={handleSendPaymentScreenshot}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          {loading ? 'Processing...' : 'Send Payment Screenshot'}
        </button>

        <PreviousOrders />
      </div>
    </motion.div>
  );
}
