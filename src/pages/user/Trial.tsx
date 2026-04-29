import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader2, CheckCircle, AlertCircle, Home, MessageCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export default function Trial() {
  const { user, profile, loading, authLoading } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'disabled'>('loading');
  const [message, setMessage] = useState('Activating your trial...');
  const [countdown, setCountdown] = useState(15);
  const hasActivatedRef = useRef(false);

  useEffect(() => {
    if (loading || authLoading || !settings) return;

    if (!user || !profile) {
      navigate('/login', { state: { from: '/trial' }, replace: true });
      return;
    }

    if (hasActivatedRef.current) return;

    if (settings.isTrialEnabled === false) {
      setStatus('disabled');
      setMessage('Sorry we are not giving Trial on direct link. Please contact admin.');
      
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate('/');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }

    if (profile.status === 'active') {
      setStatus('error');
      setMessage(profile.role === 'trial' ? 'You already have an active trial.' : 'Your account is already active.');
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    if (profile.status === 'expired' || profile.role !== 'user') {
      setStatus('error');
      setMessage('Trial is only available for new pending accounts.');
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    const activateTrial = async () => {
      hasActivatedRef.current = true;
      try {
        const now = new Date();
        const expiry = new Date(now);
        
        // If after 6 PM (18:00), don't count today. Add 3 days total.
        // If before 6 PM, count today. Add 2 days total.
        if (now.getHours() >= 18) {
          expiry.setDate(expiry.getDate() + 3);
        } else {
          expiry.setDate(expiry.getDate() + 2);
        }

        await updateDoc(doc(db, 'users', user.uid), {
          role: 'trial',
          status: 'active',
          expiryDate: expiry.toISOString()
        });

        setStatus('success');
        setMessage('Trial activated successfully! Enjoy 48 hours of access.');
        setTimeout(() => navigate('/'), 3000);
      } catch (error) {
        console.error('Error activating trial:', error);
        hasActivatedRef.current = false;
        setStatus('error');
        setMessage('Failed to activate trial. Please try again.');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    activateTrial();
  }, [user, profile, loading, authLoading, navigate, settings]);

  const handleContactAdmin = () => {
    let supportPhone = settings?.supportNumber || '3363284466';
    // Clean up the number to ensure it starts with country code for WhatsApp link
    if (supportPhone.startsWith('0')) {
      supportPhone = '92' + supportPhone.substring(1);
    } else if (!supportPhone.startsWith('92') && !supportPhone.startsWith('+')) {
      supportPhone = '92' + supportPhone; 
    }
    // Remove '+' if present
    supportPhone = supportPhone.replace('+', '');
    
    const message = encodeURIComponent(`Hello Admin,\n\nName: ${user?.displayName || 'Unknown'}\nEmail: ${user?.email || 'N/A'}\nPhone: ${profile?.phone || 'N/A'}\nRole & Status: ${String(profile?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\nYour message/question:\nI tried to activate a trial but saw that it is disabled on the direct link. Please help me get a trial or membership.`);
    window.open(`https://wa.me/${supportPhone}?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Helmet>
        <title>Activate Trial - {settings?.headerText || 'Moviznow'}</title>
      </Helmet>

      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center shadow-2xl border border-gray-700 relative overflow-hidden">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Activating Trial</h2>
            <p className="text-gray-400">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Success!</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to home...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Cannot Activate Trial</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to home...</p>
          </div>
        )}

        {status === 'disabled' && (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Trial Disabled</h2>
            <p className="text-gray-300 mb-6 text-sm sm:text-base leading-relaxed bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">{message}</p>
            
            <div className="flex flex-col gap-3 w-full mb-6">
              {settings?.isAdminContactEnabled !== false && (
                <button 
                  onClick={handleContactAdmin}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/20"
                >
                  <MessageCircle className="w-5 h-5" />
                  Contact Admin (WhatsApp)
                </button>
              )}
              
              <button 
                onClick={() => navigate('/')}
                className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 border border-gray-600"
              >
                <Home className="w-5 h-5" />
                Go to Home
              </button>
            </div>
            
            <p className="text-sm text-gray-500 flex items-center justify-center gap-2 bg-gray-900/50 py-2 px-4 rounded-full w-fit mx-auto">
              Redirecting to home in <span className="font-mono text-emerald-400 font-bold">{countdown}</span>...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
