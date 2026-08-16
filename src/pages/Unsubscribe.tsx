import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft, Lock, UserX, LogOut } from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs, setDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, logout } = useAuth();

  const targetEmail = (searchParams.get('email') || '').trim().toLowerCase();

  // Get logged in email from AuthContext or local cached storage
  const getLoggedInUserEmail = (): string | null => {
    if (user?.email) return user.email.trim().toLowerCase();
    if (profile?.email) return profile.email.trim().toLowerCase();

    try {
      const cachedProfileStr = localStorage.getItem('profile_cache');
      if (cachedProfileStr) {
        const parsed = JSON.parse(cachedProfileStr);
        if (parsed && parsed.email) {
          return parsed.email.trim().toLowerCase();
        }
      }
    } catch (e) {}

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('firebase:authUser:')) {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed && parsed.email) {
              return parsed.email.trim().toLowerCase();
            }
          }
        }
      }
    } catch (e) {}

    return null;
  };

  const loggedInEmail = getLoggedInUserEmail();
  const isEmailValid = !!targetEmail && targetEmail.includes('@');

  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const updateFirestoreUser = async (userEmail: string): Promise<boolean> => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', userEmail.toLowerCase()), limit(50));
      const snap = await getDocs(q);
      
      let updated = false;
      if (!snap.empty) {
        for (const userDoc of snap.docs) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            emailNotificationsEnabled: false,
            emailNotificationsDisabled: true,
            unsubscribed: true,
            unsubscribedAt: new Date().toISOString()
          });
          updated = true;
        }
      }

      // Also update unsubscribed_emails collection directly in Firestore
      try {
        const unsubDocRef = doc(db, 'unsubscribed_emails', userEmail.replace(/[^a-zA-Z0-9]/g, '_'));
        await setDoc(unsubDocRef, {
          email: userEmail,
          unsubscribedAt: new Date().toISOString()
        }, { merge: true });
        updated = true;
      } catch (e) {
        console.warn('unsubscribed_emails setDoc failed:', e);
      }

      return updated;
    } catch (e) {
      console.warn('Firestore direct unsubscribe failed:', e);
    }
    return false;
  };

  const executeUnsubscribe = async () => {
    if (!isEmailValid) return;
    setStatus('processing');
    try {
      const res = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        await updateFirestoreUser(targetEmail);
        setStatus('success');
        setMessage(data.message || `You have been unsubscribed from movie & series email notifications.`);
      } else {
        const unsubscribed = await updateFirestoreUser(targetEmail);
        if (unsubscribed) {
          setStatus('success');
          setMessage(`You have been unsubscribed from movie & series email notifications.`);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to unsubscribe email. Please try again.');
        }
      }
    } catch (err: any) {
      const unsubscribed = await updateFirestoreUser(targetEmail);
      if (unsubscribed) {
        setStatus('success');
        setMessage(`You have been unsubscribed from movie & series email notifications.`);
      } else {
        setStatus('error');
        setMessage(err.message || 'Error processing unsubscribe request.');
      }
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!isEmailValid) {
      setStatus('error');
      setMessage('Invalid or missing email address specified in unsubscribe link.');
      return;
    }

    // Only unsubscribe if logged-in user email matches the link target email
    if (loggedInEmail && loggedInEmail === targetEmail && status === 'idle') {
      executeUnsubscribe();
    }
  }, [authLoading, loggedInEmail, targetEmail, isEmailValid]);

  const handleGoToLogin = () => {
    const currentUrl = location.pathname + location.search;
    navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  };

  const handleSwitchAccount = async () => {
    try {
      await logout();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    const currentUrl = location.pathname + location.search;
    navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
        <div className="flex justify-center mb-2">
          <img src="/Whitelogo.svg" alt="MovizNow" className="h-16 w-auto" />
        </div>

        {authLoading && (
          <div className="py-8 space-y-4">
            <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto" />
            <h2 className="text-xl font-bold">Verifying Account...</h2>
            <p className="text-zinc-400 text-sm">Checking authentication status</p>
          </div>
        )}

        {!authLoading && !isEmailValid && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Invalid Unsubscribe Link</h2>
            <p className="text-zinc-400 text-sm">{message || 'The unsubscribe link is missing a valid email parameter.'}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors mt-2"
            >
              Return to Home
            </button>
          </div>
        )}

        {/* User NOT logged in */}
        {!authLoading && isEmailValid && !loggedInEmail && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white">Log In Required</h2>
            <p className="text-zinc-300 text-sm leading-relaxed">
              This unsubscribe link is for <strong className="text-amber-300">{targetEmail}</strong>.
            </p>
            <p className="text-zinc-400 text-xs">
              To protect account security, you must log in to MovizNow with this account before you can unsubscribe.
            </p>
            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={handleGoToLogin}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                Log In to Unsubscribe
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-colors text-sm"
              >
                Return to Home
              </button>
            </div>
          </div>
        )}

        {/* Account Mismatch: Logged in as user X, but link is for user Y */}
        {!authLoading && isEmailValid && loggedInEmail && loggedInEmail !== targetEmail && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
              <UserX className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white">Account Mismatch</h2>
            <p className="text-zinc-300 text-sm leading-relaxed">
              You are currently logged in as <strong className="text-white">{loggedInEmail}</strong>, but this link is to unsubscribe <strong className="text-rose-400">{targetEmail}</strong>.
            </p>
            <p className="text-zinc-400 text-xs">
              Unsubscribe links only work when logged into the matching user account.
            </p>
            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={handleSwitchAccount}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Log Out & Switch Account
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-colors text-sm"
              >
                Continue as {loggedInEmail}
              </button>
            </div>
          </div>
        )}

        {/* Processing Unsubscribe for matched user */}
        {!authLoading && isEmailValid && loggedInEmail === targetEmail && status === 'processing' && (
          <div className="py-8 space-y-4">
            <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto" />
            <h2 className="text-xl font-bold">Unsubscribing...</h2>
            <p className="text-zinc-400 text-sm">Processing request for <span className="text-white font-medium">{targetEmail}</span></p>
          </div>
        )}

        {/* Successfully Unsubscribed */}
        {!authLoading && isEmailValid && loggedInEmail === targetEmail && status === 'success' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-white">Unsubscribed Successfully</h2>
            <p className="text-zinc-300 text-sm leading-relaxed">{message}</p>
            <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-3 text-xs text-zinc-300">
              Verified Account: <strong className="text-emerald-400">{targetEmail}</strong>
            </div>
            <p className="text-zinc-500 text-xs">
              You will no longer receive movie or series alert emails at <strong className="text-zinc-300">{targetEmail}</strong>. Essential account alerts will still be delivered.
            </p>
            <div className="pt-2">
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Go to MovizNow
              </button>
            </div>
          </div>
        )}

        {/* Error during unsubscribe */}
        {!authLoading && isEmailValid && loggedInEmail === targetEmail && status === 'error' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Unsubscribe Request Failed</h2>
            <p className="text-red-400 text-sm leading-relaxed">{message}</p>
            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={executeUnsubscribe}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all text-sm font-bold"
              >
                Try Again
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors text-sm"
              >
                Return to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
