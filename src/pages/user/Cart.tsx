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
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<{
    id: string;
    items: any[];
    amount: number;
  } | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.phone || '');
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });

  React.useEffect(() => {
    if ((profile?.role === 'user' || profile?.role === 'trial') && profile?.status === 'expired' && cart.length === 0 && !confirmed && !lastCreatedOrder) {
      navigate('/');
    }
  }, [profile, navigate, cart.length, confirmed, lastCreatedOrder]);

  const handleCopy = () => {
    navigator.clipboard.writeText(settings?.accountNumber || '03416286423');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = async (): Promise<{ id: string; items: any[]; amount: number } | null> => { 
    if (lastCreatedOrder) return lastCreatedOrder;
    if (!profile || cart.length === 0) return null; 
    if (!whatsappNumber || whatsappNumber.length < 10) { 
      setAlertConfig({isOpen: true, title: t('Invalid Phone Number'), message: t('Please enter a valid WhatsApp number')}); 
      return null; 
    } 
    setLoading(true); 
    try { 
      const currentCart = [...cart];
      const currentTotal = totalPrice;
      const newOrderId = Math.floor(10000000 + Math.random() * 90000000).toString(); 
      const orderData = { 
        id: newOrderId, 
        userId: profile.uid, 
        userName: profile.displayName || 'Unknown', 
        userEmail: profile.email, 
        userRole: profile.role, 
        type: 'content', 
        amount: currentTotal, 
        items: currentCart, 
        status: 'pending', 
        createdAt: new Date().toISOString() 
      }; 
      const pendingOrdersStr = safeStorage.getItem('pending_orders_array') || '[]'; 
      const pendingOrders = JSON.parse(pendingOrdersStr); 
      pendingOrders.push(orderData); 
      safeStorage.setItem('pending_orders_array', JSON.stringify(pendingOrders)); 
      safeStorage.setItem('needs_user_sync', 'true'); 
      await updateUserProfileData({ phone: whatsappNumber }, undefined, true); 
      
      const created = { id: newOrderId, items: currentCart, amount: currentTotal };
      setLastCreatedOrder(created);
      setOrderId(newOrderId); 
      setConfirmed(true); 
      clearCart(); 
      return created; 
    } catch (error) { 
      console.error('Error creating order:', error); 
      setAlertConfig({isOpen: true, title: t('Error'), message: t('Failed to create order. Please try again.')}); 
      return null; 
    } finally { 
      setLoading(false); 
    } 
  };

  const handleSendPaymentScreenshot = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let activeOrder = lastCreatedOrder;
      if (!activeOrder && !confirmed) {
        activeOrder = await handleConfirm();
        if (!activeOrder) { setLoading(false); return; }
      }

      let finalOrderId = activeOrder?.id || orderId;
      let finalItems = activeOrder?.items || (cart.length > 0 ? [...cart] : []);
      let finalAmount = activeOrder ? activeOrder.amount : (totalPrice > 0 ? totalPrice : 0);

      if (!finalOrderId || (finalItems.length === 0 && finalAmount === 0)) {
        try {
          const pendingOrdersStr = safeStorage.getItem('pending_orders_array') || '[]';
          const pendingOrders = JSON.parse(pendingOrdersStr);
          const matched = (finalOrderId ? pendingOrders.find((o: any) => o.id === finalOrderId) : null) || pendingOrders[pendingOrders.length - 1];
          if (matched) {
            finalOrderId = matched.id;
            finalItems = Array.isArray(matched.items) ? matched.items : [];
            finalAmount = matched.amount || 0;
          } else {
            const userOrders = profile.orders || [];
            const matchedProfileOrder = (finalOrderId ? userOrders.find((o: any) => o.id === finalOrderId) : null) || userOrders[userOrders.length - 1];
            if (matchedProfileOrder) {
              finalOrderId = matchedProfileOrder.id;
              finalItems = Array.isArray(matchedProfileOrder.items) ? matchedProfileOrder.items : [];
              finalAmount = matchedProfileOrder.amount || 0;
            }
          }
        } catch (e) {
          console.error("Error retrieving order for screenshot:", e);
        }
      }

      if (!finalOrderId) {
        setAlertConfig({ isOpen: true, title: t('Error'), message: t('Please add items to cart and confirm your order first.') });
        return;
      }

      let itemTitles = '';
      if (finalItems && finalItems.length > 0) {
        itemTitles = finalItems.map((item: any) => {
          if (item.type === 'season') {
            return `${item.title} (${t('Season')} ${item.seasonNumber})`;
          }
          return item.title;
        }).join(', ');
      }

      const itemsLine = `${t("Items")}: ${finalItems.length}${itemTitles ? ` (${itemTitles})` : ''}`;
      const message = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || 'N/A'}\n${t("Phone")}: ${whatsappNumber || profile?.phone || 'N/A'}\n${t("Role & Status")}: ${String(profile?.role || t("Unknown")).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || t("Unknown")).replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("Please approve my order. Order ID:")} ${finalOrderId}\n${itemsLine}\n${t("Total Amount: Rs")} ${finalAmount}`;
      
      const adminPhone = standardizePhone(settings?.supportNumber || '3363284466').replace('+', '');
      const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      navigate('/');
    } finally { 
      setLoading(false); 
    }
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

        {!profile?.phone && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
            <h2 className="text-base font-extrabold mb-3 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              {t('WhatsApp Number')}
            </h2>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="e.g. 03001234567"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>
        )}

        {settings?.isPaymentEnabled !== false && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
            <h2 className="text-base font-extrabold mb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Wallet className="w-4 h-4 text-emerald-500" />
              {t('Payment Details')}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-5 text-xs font-medium">
              {t('Please send the payment to the following account via any of these methods:')}
            </p>
            
            <PaymentMethods copied={copied} onCopy={handleCopy} />
          </div>
        )}

        <div className="text-center mb-6">
          <p className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            {settings?.isPaymentEnabled !== false ? t('After Payment Send Screenshot for Approval') : t('Submit your request for approval')}
          </p>
        </div>

        <div className="space-y-3 mb-8">
          <button
            onClick={handleConfirm}
            disabled={loading || confirmed || cart.length === 0}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 shadow-lg shadow-blue-500/20 text-sm cursor-pointer"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmed ? <CheckCircle2 className="w-5 h-5" /> : null}
            <span>{loading ? t('Processing...') : confirmed ? t('Order Confirmed') : t('Confirm Order')}</span>
          </button>

          {settings?.isAdminContactEnabled !== false && (
            <button
              onClick={handleSendPaymentScreenshot}
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span>{loading ? t('Processing...') : (settings?.isPaymentEnabled !== false ? t('Send Payment Screenshot') : t('Contact Admin For Order'))}</span>
            </button>
          )}
        </div>

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
