import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet-async';
import { 
  ShieldCheck, 
  Lock, 
  Eye, 
  Database, 
  Smartphone, 
  Bell, 
  CreditCard, 
  Trash2, 
  CheckCircle2, 
  FileText,
  MessageCircle,
  KeyRound,
  Globe
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function PrivacyPolicy() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const appName = settings?.headerText || 'MovizNow';

  const sections = [
    {
      id: 'collection',
      icon: <Eye className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      title: '1. Information We Collect',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            When you create an account, log in, or interact with <strong>{appName}</strong>, we collect only the necessary information to provide you with seamless media streaming and account services:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li><strong>Account Information:</strong> Display Name, Email address, Profile photo (via Google Sign-In), and optional WhatsApp phone number.</li>
            <li><strong>Usage & Preferences:</strong> Watchlist, Favorites, custom language preference, playback progress, and theme settings.</li>
            <li><strong>Device & Client Details:</strong> Browser type, operating system (e.g. Android/Windows/iOS), screen resolution, and installation status to optimize responsive streaming.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'payments',
      icon: <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
      title: '2. Payment Verification Information',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            When you purchase a membership or unlock content:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>We collect transaction reference IDs, sender name/title, and transaction timestamp to verify payments against bank alerts.</li>
            <li>We do <strong>not</strong> collect, store, or process credit card numbers or banking passwords.</li>
            <li>Payment screenshot data submitted during order creation is used solely for optical verification and is purged or minimized immediately to protect your privacy.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'oauth',
      icon: <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
      title: '3. Google OAuth & Services',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            If you sign in using Google OAuth:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>We only access your basic public profile information (name, email, avatar) provided by Google.</li>
            <li>We adhere to the Google API Services User Data Policy, including the Limited Use requirements. Your Google account data is never sold or used for behavioral advertising.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'cookies',
      icon: <Database className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      title: '4. Local Storage & Client Caching',
      content: (
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          {appName} utilizes secure HTML5 Local Storage and IndexedDB caches on your local device. This allows instant offline app loading, fast video chunk playback, and seamless state persistence between browser sessions without unnecessary server roundtrips.
        </p>
      )
    },
    {
      id: 'notifications',
      icon: <Bell className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
      title: '5. Push Notifications & Communications',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            With your explicit browser permission, we may send web push notifications (FCM) regarding:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>New releases for TV series or movies you have subscribed to.</li>
            <li>Membership activation and renewal alerts.</li>
            <li>Account order verification updates.</li>
          </ul>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            You can disable or customize notifications at any time directly in the Settings page or via your browser's site settings.
          </p>
        </div>
      )
    },
    {
      id: 'security',
      icon: <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
      title: '6. Data Protection & Security',
      content: (
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          All data transmitted between your browser and {appName} is encrypted using industry-standard SSL/TLS (HTTPS). User records and authorization states are stored securely in Google Cloud Firebase with strict role-based access rules preventing unauthorized access.
        </p>
      )
    },
    {
      id: 'rights',
      icon: <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />,
      title: '7. Your Data Rights & Account Deletion',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>You have full ownership and control over your personal data:</p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>You can view and edit your profile details at any time in Account Settings.</li>
            <li>You can request a complete export or permanent deletion of your account and related watch data by contacting our support team via WhatsApp or Email.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'thirdparties',
      icon: <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      title: '8. Third-Party Integrations',
      content: (
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          Our service utilizes third-party providers including The Movie Database (TMDB) for movie posters and cast metadata, and Google Firebase for hosting and authentication. These services have their own independent privacy policies governing their respective platforms.
        </p>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col relative overflow-hidden transition-colors duration-300">
      <Helmet>
        <title>{appName} - {t("Privacy Policy")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Ambient Lighting Background */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-emerald-600/10 dark:from-emerald-600/15 via-blue-600/10 dark:via-blue-600/15 to-purple-600/10 dark:to-purple-600/15 blur-[120px] pointer-events-none rounded-full animate-pulse" />
      <div className="absolute top-[40rem] -left-20 w-[400px] h-[400px] bg-teal-500/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute top-[70rem] -right-20 w-[400px] h-[400px] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-20 w-full space-y-10">
          
          {/* Hero Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-white/95 via-zinc-50/90 to-emerald-50/40 dark:from-zinc-900/90 dark:via-zinc-950/95 dark:to-zinc-900/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-12 shadow-xl dark:shadow-2xl backdrop-blur-2xl text-center space-y-5"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-inner">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t("Your Privacy & Security")}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white leading-tight max-w-3xl mx-auto">
              {t("Privacy Policy")}
            </h1>

            <p className="text-zinc-600 dark:text-zinc-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              We value your trust and are committed to safeguarding your personal information. Here is how {appName} handles and protects your data.
            </p>

            <div className="text-xs font-mono text-zinc-500">
              Last Updated: September 2026
            </div>
          </motion.div>

          {/* Sections List */}
          <div className="space-y-6">
            {sections.map((section, index) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white/95 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700/80 rounded-2xl p-5 sm:p-7 shadow-md dark:shadow-lg backdrop-blur-md space-y-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50">
                    {section.icon}
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-wide">
                    {section.title}
                  </h2>
                </div>
                <div className="pt-2 pl-0 sm:pl-11">
                  {section.content}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Quick Navigation Cards */}
          <div className="grid sm:grid-cols-2 gap-4 pt-4">
            <Link
              to="/terms"
              className="p-5 rounded-2xl bg-white/90 dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-emerald-500/40 transition-all flex items-center justify-between group shadow-sm"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Terms of Service</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Review our terms of use & policies</div>
                </div>
              </div>
              <span className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors text-lg font-bold">→</span>
            </Link>

            <Link
              to="/contact"
              className="p-5 rounded-2xl bg-white/90 dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-emerald-500/40 transition-all flex items-center justify-between group shadow-sm"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Contact Support</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Have questions about your data?</div>
                </div>
              </div>
              <span className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors text-lg font-bold">→</span>
            </Link>
          </div>

          {/* Support Section */}
          <ContactSupportButtons />

        </main>
      </PageTransition>
    </div>
  );
}
