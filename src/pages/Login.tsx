import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, standardizePhone } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Film, Mail, Phone, ArrowLeft, Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { ConfirmationResult } from 'firebase/auth';
import { UserProfile } from '../types';

type LoginStep = 'social' | 'identifier' | 'password' | 'reset-password' | 'create_password';

export default function Login() {
  const { 
    user, 
    profile, 
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithEmail, 
    signUpWithPhoneAndPassword,
    findUsersByEmailOrPhone,
    updateUserPassword,
    updateUserProfileData,
    isPhoneWhitelisted,
    clearError,
    authLoading, 
    error 
  } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<LoginStep>('social');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState<React.ReactNode | null>(null);
  
  const [identifier, setIdentifier] = useState(''); // Email or Phone
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [optionalEmail, setOptionalEmail] = useState('');
  const [registeredUser, setRegisteredUser] = useState<UserProfile | null>(null);
  const [wrongPasswordCount, setWrongPasswordCount] = useState(0);

  useEffect(() => {
    if (location.state?.suspended) {
      setCustomError("Your account has been suspended. Please contact admin.");
    }
  }, [location.state]);

  useEffect(() => {
    if (user && profile) {
      // If user is suspended, don't redirect to home, just show error
      if (profile.status === 'suspended') {
        setCustomError("Your account has been suspended. Please contact admin.");
        return;
      }

      // If user requires password reset, force them to reset it
      if (profile.requirePasswordReset && step !== 'reset-password') {
        setStep('reset-password');
        return;
      }
      
      if (!profile.requirePasswordReset) {
        const from = location.state?.from || { pathname: profile.role === 'admin' ? '/admin' : '/' };
        navigate(from, { replace: true });
      }
    }
  }, [user, profile, navigate, location, step]);

  useEffect(() => {
    if (error) {
      setIsLoggingIn(false);
    }
  }, [error]);

  const formatIdentifier = (input: string) => {
    const trimmed = input.trim();
    // If it looks like a phone number (contains digits, maybe starts with + or 0)
    if (/^[\d+]+$/.test(trimmed)) {
      return standardizePhone(trimmed);
    }
    return trimmed.toLowerCase();
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    await signInWithGoogle();
  };

  const handleIdentifierNext = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCustomError(null);
    setIsLoggingIn(true);
    
    try {
      // Try finding user with raw input first
      const foundUsersRaw = await findUsersByEmailOrPhone(identifier.trim());
      let foundUser = foundUsersRaw.length > 0 ? foundUsersRaw[0] : null;
      
      if (!foundUser) {
        // If not found, try with formatted identifier
        const formatted = formatIdentifier(identifier);
        const foundUsersFormatted = await findUsersByEmailOrPhone(formatted);
        foundUser = foundUsersFormatted.length > 0 ? foundUsersFormatted[0] : null;
        if (foundUser) {
          setIdentifier(formatted);
        }
      } else {
        // If found with raw input, format it for the UI if it's a phone
        if (/^[\d+]+$/.test(identifier.trim())) {
           const formatted = formatIdentifier(identifier);
           setIdentifier(formatted);
        }
      }

      if (foundUser) {
        setRegisteredUser(foundUser);
        if (foundUser.hasPassword) {
          setStep('password');
        } else {
          // Pre-fill details for create_password step
          setDisplayName(foundUser.displayName || '');
          setOptionalEmail(foundUser.email?.endsWith('@moviznow.com') ? '' : (foundUser.email || ''));
          setStep('create_password');
        }
      } else {
        // Not registered, check if it's a phone number and if it's whitelisted
        const isEmail = identifier.includes('@');
        if (!isEmail) {
          const formattedPhone = formatIdentifier(identifier);
          const isWhitelisted = await isPhoneWhitelisted(formattedPhone);
          if (!isWhitelisted) {
            setCustomError(
              <div className="flex flex-col gap-3">
                <p>This number is not authorized.</p>
                <div className="flex flex-col gap-2 mt-2">
                  <button 
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    Use Google <span className="text-[10px] uppercase tracking-wider opacity-90 bg-white/20 px-1.5 py-0.5 rounded-md">(Recommended)</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      const adminPhone = `92${settings?.supportNumber || '3363284466'}`;
                      window.open(`https://wa.me/${adminPhone}?text=I want to register my number: ${formattedPhone}`, '_blank');
                    }}
                    className="w-full bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 py-2.5 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Contact Admin
                  </button>
                </div>
              </div>
            );
            setIsLoggingIn(false);
            return;
          }
        }
        
        // Allow to create account
        setRegisteredUser(null);
        setStep('create_password');
      }
    } catch (err) {
      console.error("Identifier next error:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registeredUser) return;
    clearError();
    setCustomError(null);
    setIsLoggingIn(true);
    try {
      // If they logged in with phone, we use the dummy email or their real email if linked
      const loginEmail = registeredUser.email || `${identifier.replace('+', '')}@moviznow.com`;
      await signInWithEmail(loginEmail, password);
      setWrongPasswordCount(0);
    } catch (err: any) {
      setIsLoggingIn(false);
      setWrongPasswordCount(prev => prev + 1);
    }
  };

  const handleForgotPassword = async () => {
    if (registeredUser?.email && !registeredUser.email.endsWith('@moviznow.com')) {
      try {
        const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
        await sendPasswordResetEmail(getAuth(), registeredUser.email);
        alert('A password reset link has been sent to your email.');
      } catch (error: any) {
        console.error("Error sending reset email:", error);
        alert(error.message || 'Failed to send reset email.');
      }
    } else {
      // Open WhatsApp to admin
      const adminPhone = `92${settings?.supportNumber || '3363284466'}`;
      const message = `I forgot my password.\nName: ${registeredUser?.displayName || 'Unknown'}\nPhone: ${registeredUser?.phone || identifier}\nEmail: ${registeredUser?.email || 'N/A'}`;
      window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCustomError(null);
    setIsLoggingIn(true);
    try {
      await updateUserProfileData({ requirePasswordReset: false }, newPassword);
      // Success, profile listener will handle navigation
    } catch (err) {
      setIsLoggingIn(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-900 dark:text-white p-4 transition-colors duration-300">
      <div className="max-w-md w-full bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <div className="flex justify-center mb-6">
          <LazyLoadImage src="/logo.svg?v=2" alt="Logo" className="w-24 h-24" />
        </div>
        <h1 className="text-3xl font-bold mb-2 text-center">{settings?.headerText || 'MovizNow'}</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-center">Your ultimate movies & series destination</p>
        
        {(error || customError) && !isLoggingIn && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-500 text-sm transition-colors">
            {customError || error}
          </div>
        )}

        {step === 'social' && (
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => { clearError(); setStep('identifier'); }}
              className="w-full bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center gap-3"
            >
              <Phone className="w-5 h-5" />
              Continue with WhatsApp Number
            </button>
          </div>
        )}

        {step === 'identifier' && (
          <form onSubmit={handleIdentifierNext} className="space-y-4">
            <button 
              type="button"
              onClick={() => setStep('social')} 
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">WhatsApp Number</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="0311..."
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">For phone numbers, +92 will be added automatically if missing.</p>
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-70"
            >
              {isLoggingIn ? 'Checking...' : 'Next'}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <button 
              type="button"
              onClick={() => { setStep('identifier'); setWrongPasswordCount(0); }} 
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-3 p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Welcome back,</p>
                <p className="text-sm font-semibold">{registeredUser?.displayName || identifier}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-70"
            >
              {isLoggingIn ? 'Logging in...' : 'Login'}
            </button>
            
            {wrongPasswordCount > 0 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-red-500 mb-2">Incorrect password. Contact admin for reset password.</p>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-emerald-500 font-semibold hover:underline"
                >
                  Forgot Password? (WhatsApp Admin)
                </button>
              </div>
            )}
          </form>
        )}

        {step === 'create_password' && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            clearError();
            setCustomError(null);
            setIsLoggingIn(true);
            try {
              if (!registeredUser || registeredUser.uid.startsWith('pending_')) {
                // New user or pending user
                await signUpWithPhoneAndPassword(identifier, password, displayName, optionalEmail.trim().toLowerCase() || undefined);
              } else {
                // Active user without password (likely Google login)
                setCustomError("This account was created with Google. Please log in with Google, or use 'Forgot Password' to set a password.");
                setIsLoggingIn(false);
              }
            } catch (err) {
              setIsLoggingIn(false);
            }
          }} className="space-y-4">
            <button 
              type="button"
              onClick={() => setStep('identifier')} 
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Create Password</h2>
              <p className="text-sm text-zinc-500">Set up a password for {identifier}</p>
            </div>
            
            {registeredUser && !registeredUser.uid.startsWith('pending_') ? (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400 text-sm mb-4">
                  This account was created with Google. You can log in with Google below, or use 'Forgot Password' to set a password via email.
                </div>
                
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Login with Google
                </button>
                
                {registeredUser?.email && !registeredUser.email.endsWith('@moviznow.com') && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="w-full bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Send Password Reset Email
                  </button>
                )}
              </div>
            ) : (
              <>
                {!registeredUser?.displayName && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>
                )}
                {(!registeredUser?.email || registeredUser.email.endsWith('@moviznow.com')) && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Email (Optional)</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="email"
                        value={optionalEmail}
                        onChange={(e) => setOptionalEmail(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-70"
                >
                  {isLoggingIn ? 'Creating password...' : 'Create Password'}
                </button>
              </>
            )}
          </form>
        )}

        {step === 'reset-password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Password Restored</h2>
              <p className="text-sm text-zinc-500 text-balance">Your password was reset by the admin. Please enter a new password to continue.</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  const { logout } = await import('../contexts/AuthContext').then(m => ({ logout: m.useAuth().logout }));
                  // useAuth is a hook, we can't call it here. We need to get logout from the component scope.
                }}
                className="hidden"
              >
              </button>
              {/* Wait, I can just use the logout function from the useAuth hook at the top of the component */}
              <button
                type="button"
                onClick={async () => {
                  const { getAuth, signOut } = await import('firebase/auth');
                  await signOut(getAuth());
                  setStep('identifier');
                }}
                className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold py-3 px-4 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoggingIn || newPassword.length < 6}
                className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-70"
              >
                {isLoggingIn ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
