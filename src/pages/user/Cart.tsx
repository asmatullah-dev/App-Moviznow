import React, { useState } from 'react';
import { useCart } from '../../contexts/CartContext';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import { ArrowLeft, Trash2, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote, ShoppingBag, Film, Tv, Sparkles, CheckCircle2, Compass } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import AlertModal from '../../components/AlertModal';
import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { CartButton } from '../../components/CartButton';
import { AdminButtons } from '../../components/AdminButtons';
import PaymentVerificationForm from '../../components/PaymentVerificationForm';

import { motion } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';
import { safeStorage } from '../../utils/safeStorage';

import PaymentMethods from '../../components/PaymentMethods';

export default function Cart() {
  const { cart, removeFromCart, totalPrice, clearCart } = useCart();
  const { profile, updateUserProfileData } = useAuth();
  const { language, t } = useLanguage();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [wasAutoApproved, setWasAutoApproved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<{
    id: string;
    items: any[];
    amount: number;
  } | null>(null);
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });

  React.useEffect(() => {
    if ((profile?.role === 'user' || profile?.role === 'trial') && profile?.status === 'expired' && cart.length === 0 && !confirmed && !lastCreatedOrder && !completedOrder) {
      navigate('/');
    }
  }, [profile, navigate, cart.length, confirmed, lastCreatedOrder, completedOrder]);

  const handleOrderFinished = (order: any, isAutoApproved: boolean) => {
    setCompletedOrder(order);
    setWasAutoApproved(isAutoApproved);
    setOrderId(order.id);
    setConfirmed(true);
    setLastCreatedOrder({
      id: order.id,
      items: order.items || cart,
      amount: order.amount || totalPrice,
    });
    clearCart();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/')} 
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-extrabold text-zinc-900 dark:text-white">{t('Your Cart')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationMenu />
            <AdminButtons profile={profile} />
            <UserProfileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {/* Banner */}
        <div className="relative mb-6 rounded-3xl overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white shadow-xl shadow-emerald-500/10">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold tracking-wider uppercase mb-2 text-emerald-100">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{t('Checkout Items')}</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight">{t('Complete Your Order')}</h2>
              <p className="text-emerald-100/90 text-xs sm:text-sm mt-1 max-w-md font-medium">
                {t('Review your selected movies and series seasons before confirming your payment.')}
              </p>
            </div>

            <div className="px-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-2 self-start sm:self-center">
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span className="text-xs font-extrabold text-white">
                {confirmed && lastCreatedOrder ? lastCreatedOrder.items.length : cart.length} {(confirmed && lastCreatedOrder ? lastCreatedOrder.items.length : cart.length) === 1 ? t('Item') : t('Items')}
              </span>
            </div>
          </div>
        </div>

        {/* Cart items list */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
          {confirmed && lastCreatedOrder ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t('Order Placed Successfully! Order ID:')} #{lastCreatedOrder.id}</span>
              </div>
              <div className="space-y-3">
                {lastCreatedOrder.items.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200/60 dark:border-zinc-800/60 transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 font-bold">
                        {item.type === 'season' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white truncate">{item.title}</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                          {item.type === 'season' ? `${t('Season')} ${item.seasonNumber}` : t('Movie')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl shadow-2xs">
                        Rs {item.price}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : cart.length > 0 ? (
            <div className="space-y-3">
              {cart.map((item, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200/60 dark:border-zinc-800/60 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 font-bold">
                      {item.type === 'season' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white truncate">{item.title}</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                        {item.type === 'season' ? `${t('Season')} ${item.seasonNumber}` : t('Movie')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl shadow-2xs">
                      Rs {item.price}
                    </span>
                    <button 
                      onClick={() => removeFromCart(item.contentId, item.seasonId)}
                      className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer active:scale-95"
                      title={t('Remove Item')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">{t('Your cart is empty')}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto mb-4 font-medium">
                {t('Add Movies and Series (Seasons) from home page and start watching.')}
              </p>
              <Link 
                to="/" 
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <Compass className="w-4 h-4" />
                <span>{t('Browse Content')}</span>
              </Link>
            </div>
          )}
          
          <div className="flex justify-between items-center border-t border-zinc-200/80 dark:border-zinc-800/80 pt-4 mt-5">
            <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{t('Total Amount')}</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              Rs {confirmed && lastCreatedOrder ? lastCreatedOrder.amount : totalPrice}
            </span>
          </div>
        </div>

        {/* Completion Celebration Card */}
        {completedOrder && wasAutoApproved && (
          <div className="bg-emerald-500/10 border-2 border-emerald-500/40 p-6 rounded-3xl mb-6 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase tracking-wider mb-2">
                ⚡ AI Auto-Approved
              </span>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white">
                🎉 Order Approved Instantly!
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-md mx-auto">
                Your payment was verified with the bank. Your content has been unlocked for streaming and download!
              </p>
            </div>
            <div className="p-3 bg-white/80 dark:bg-black/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
              <span>Order #{completedOrder.id}</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {completedOrder.amount}</span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
            >
              Start Watching Now 🍿
            </button>
          </div>
        )}

        {/* If cart has items and not completed, show PaymentVerificationForm */}
        {cart.length > 0 && !wasAutoApproved && (
          <PaymentVerificationForm
            orderType="content"
            amount={totalPrice}
            items={cart}
            onOrderCompleted={handleOrderFinished}
          />
        )}

        <PreviousOrders />
      </main>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />
    </div>
  );
}
