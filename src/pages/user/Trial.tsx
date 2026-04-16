import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export default function Trial() {
  const { user, profile, loading, authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Activating your trial...');
  const hasActivatedRef = useRef(false);

  useEffect(() => {
    if (loading || authLoading) return;

    if (!user || !profile) {
      navigate('/login', { state: { from: '/trial' }, replace: true });
      return;
    }

    if (hasActivatedRef.current) return;

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
      }
    };

    activateTrial();
  }, [user, profile, loading, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Helmet>
        <title>Activate Trial - Moviznow</title>
      </Helmet>

      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center shadow-2xl border border-gray-700">
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
      </div>
    </div>
  );
}
