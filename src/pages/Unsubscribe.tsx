import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BellOff, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get('email') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function processUnsubscribe() {
      if (!email || !email.includes('@')) {
        setStatus('error');
        setMessage('Invalid email address specified in unsubscribe link.');
        return;
      }

      try {
        // 1. Call backend API endpoint
        const res = await fetch('/api/email/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus('success');
          setMessage(data.message || `You have been unsubscribed from movie & series email notifications.`);
        } else {
          // If backend fails or not available, try direct Firestore update
          const unsubscribed = await updateFirestoreUser(email);
          if (unsubscribed) {
            setStatus('success');
            setMessage(`You have been unsubscribed from movie & series email notifications.`);
          } else {
            setStatus('error');
            setMessage(data.error || 'Failed to unsubscribe email. Please try again.');
          }
        }
      } catch (err: any) {
        // Try Firestore directly as fallback
        const unsubscribed = await updateFirestoreUser(email);
        if (unsubscribed) {
          setStatus('success');
          setMessage(`You have been unsubscribed from movie & series email notifications.`);
        } else {
          setStatus('error');
          setMessage(err.message || 'Error processing unsubscribe request.');
        }
      }
    }

    processUnsubscribe();
  }, [email]);

  const updateFirestoreUser = async (userEmail: string): Promise<boolean> => {
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), where('email', '==', userEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        for (const userDoc of snap.docs) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            emailNotificationsEnabled: false,
            unsubscribedAt: new Date().toISOString()
          });
        }
        return true;
      }
    } catch (e) {
      console.warn('Firestore direct unsubscribe failed:', e);
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
        <div className="flex justify-center mb-2">
          <img src="/Whitelogo.svg" alt="MovizNow" className="h-16 w-auto" />
        </div>

        {status === 'loading' && (
          <div className="py-8 space-y-4">
            <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto" />
            <h2 className="text-xl font-bold">Unsubscribing...</h2>
            <p className="text-zinc-400 text-sm">Processing your request for {email}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-white">Unsubscribed Successfully</h2>
            <p className="text-zinc-300 text-sm leading-relaxed">{message}</p>
            <p className="text-zinc-500 text-xs">
              You will no longer receive movie or series alert emails at <strong className="text-zinc-300">{email}</strong>. Account and login alert emails will still be delivered safely.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Go to MovizNow
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Unsubscribe Request Failed</h2>
            <p className="text-red-400 text-sm leading-relaxed">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors mt-2"
            >
              Return to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
