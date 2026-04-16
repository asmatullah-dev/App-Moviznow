import React, { useState } from 'react';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { ArrowLeft, Trash2, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, setDoc, serverTimestamp, query, where, orderBy, limit, collection, getDocs } from 'firebase/firestore';
import { motion } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';

import PaymentMethods from '../../components/PaymentMethods';

export default function Cart() {
  const { cart, removeFromCart, totalPrice, clearCart } = useCart();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  React.useEffect(() => {
    if (profile?.status === 'expired') {
      navigate('/');
    }
  }, [profile, navigate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(settings?.accountNumber || '03416286423');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = async (): Promise<string | null> => {
    if (!profile || cart.length === 0) return null;
    setLoading(true);
    try {
      const newOrderId = Math.floor(10000000 + Math.random() * 90000000).toString();

      await setDoc(doc(db, 'orders', newOrderId), {
        userId: profile.uid,
        userName: profile.displayName || 'Unknown',
        userEmail: profile.email,
        userRole: profile.role,
        type: 'content',
        amount: totalPrice,
        items: cart,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setOrderId(newOrderId);
      setConfirmed(true);
      clearCart();
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
          // If not confirmed, create the order first
          currentOrderId = await handleConfirm();
          setLoading(true); // handleConfirm sets it to false, so we set it back to true
          if (!currentOrderId) return; // Failed to create order
      }

      // Fetch the last content order
      const q = query(
        collection(db, 'orders'),
        where('userId', '==', profile.uid),
        where('type', '==', 'content'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      const lastOrder = snapshot.docs[0]?.data();

      const message = `Add Content\nOrder ID: ${currentOrderId}\nItems: ${lastOrder?.items?.length || 0}\nTotal Amount: Rs ${lastOrder?.amount || totalPrice}`;
      const whatsappUrl = `https://wa.me/92${settings?.supportNumber || '3363284466'}?text=${encodeURIComponent(message)}`;
      
      clearCart();
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
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white mb-6 transition-all active:scale-95">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Home
        </button>

        <h1 className="text-2xl font-bold mb-6">Your Cart</h1>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6">
          {cart.length > 0 ? (
            <div className="space-y-4">
              {cart.map((item, index) => (
                <div key={index} className="flex items-start sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {item.type === 'season' ? `Season ${item.seasonNumber}` : 'Movie'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold whitespace-nowrap">Rs {item.price}</span>
                    <button 
                      onClick={() => removeFromCart(item.contentId, item.seasonId)}
                      className="text-red-500 hover:text-red-400 p-2 -mr-2"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-zinc-500 dark:text-zinc-400">Your cart is empty. Add Movies and Series (Seasons) from home page and start watching.</p>
          )}
          
          <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
            <span className="text-lg font-semibold">Total Amount</span>
            <span className="text-2xl font-bold text-red-500">Rs {totalPrice}</span>
          </div>
        </div>

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
          disabled={loading || confirmed || cart.length === 0}
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
