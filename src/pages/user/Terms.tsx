import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet-async';
import { 
  FileText, 
  ShieldCheck, 
  CreditCard, 
  AlertCircle, 
  HelpCircle, 
  CheckCircle2, 
  Users, 
  Scale, 
  Sparkles,
  Lock,
  MessageCircle,
  RefreshCw,
  Ban
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function Terms() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const appName = settings?.headerText || 'MovizNow';

  const sections = [
    {
      id: 'acceptance',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      title: '1. Acceptance of Terms',
      content: (
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          By accessing, downloading, or using the <strong>{appName}</strong> web application or mobile progressive web app (PWA), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree with any part of these terms, you must discontinue the use of our services immediately.
        </p>
      )
    },
    {
      id: 'accounts',
      icon: <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
      title: '2. User Accounts & Eligibility',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            To access certain features, you must register an account using a valid email address, Google authentication, or authorized mobile number. You are responsible for maintaining the confidentiality of your account credentials.
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>You agree to provide accurate and truthful information during signup.</li>
            <li>You may not share or resell your VIP/Basic membership account credentials to third parties.</li>
            <li>We reserve the right to suspend accounts that violate safety guidelines or abuse system resources.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'payments',
      icon: <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
      title: '3. Membership Plans & Payments',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            {appName} offers free trial access, individual content purchases, and premium (Basic / VIP) subscription plans.
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li><strong>Manual Payment Verification:</strong> Payments made via EasyPaisa, JazzCash, NayaPay, SadaPay, or local bank transfers are verified either instantly via our automated verification engine or manually by our admin team.</li>
            <li><strong>No Hidden Recurring Charges:</strong> We do not automatically deduct payments from your bank account without your manual submission. Every renewal is initiated explicitly by you.</li>
            <li><strong>Pricing:</strong> Plan prices are listed in Pakistani Rupees (PKR) and may be adjusted periodically with prior notice on our platform.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'refunds',
      icon: <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      title: '4. Refund & Cancellation Policy',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            Because digital access and streaming permissions are granted immediately upon order approval:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>Completed and approved membership orders are generally non-refundable once activated.</li>
            <li>If you made a payment error or were mistakenly billed twice for the same duration, reach out to our WhatsApp support team within 24 hours with your transaction proof for an immediate adjustment or credit.</li>
            <li>You can cancel any pending order at any time directly from the "Previous Orders" section.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'content',
      icon: <Scale className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
      title: '5. Content Availability & DMCA Notice',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            {appName} is a catalog index and media streaming aggregator. We do not host copyrighted files on our own primary servers; media content is delivered via decentralized links and third-party media servers.
          </p>
          <p>
            If you are a copyright owner or an agent thereof and believe that any content hosted or indexed on our platform infringes upon your copyright, please contact us immediately with relevant proof for rapid removal.
          </p>
        </div>
      )
    },
    {
      id: 'conduct',
      icon: <Ban className="w-5 h-5 text-red-600 dark:text-red-400" />,
      title: '6. Prohibited Activities',
      content: (
        <div className="space-y-3 text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>When using {appName}, you agree NOT to:</p>
          <ul className="list-disc list-inside space-y-1.5 text-zinc-500 dark:text-zinc-400 pl-2">
            <li>Attempt to scrape, reverse engineer, or decompile the application code or streaming links.</li>
            <li>Submit fraudulent payment transaction IDs or falsified screenshots.</li>
            <li>Abuse customer support channels or engage in harassment.</li>
            <li>Circumvent access control mechanisms or role permissions.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'liability',
      icon: <Lock className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
      title: '7. Limitation of Liability',
      content: (
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          {appName} and its operators shall not be held liable for any indirect, incidental, punitive, or consequential damages resulting from the use or inability to use our services, server maintenance downtimes, or external link outages.
        </p>
      )
    },
    {
      id: 'modifications',
      icon: <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      title: '8. Modifications to Terms',
      content: (
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm sm:text-base">
          We reserve the right to revise or update these Terms of Service at any time. Changes become effective immediately upon posting to this page. Continued use of the platform after updates constitutes your formal acceptance of the modified terms.
        </p>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col relative overflow-hidden transition-colors duration-300">
      <Helmet>
        <title>{appName} - {t("Terms of Service")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Ambient Lighting Background */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-emerald-600/10 dark:from-emerald-600/15 via-teal-600/10 dark:via-teal-600/15 to-indigo-600/10 dark:to-indigo-600/15 blur-[120px] pointer-events-none rounded-full animate-pulse" />
      <div className="absolute top-[40rem] -left-20 w-[400px] h-[400px] bg-blue-500/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute top-[70rem] -right-20 w-[400px] h-[400px] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-20 w-full space-y-10">
          
          {/* Hero Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-gradient-to-br from-white/95 via-zinc-50/90 to-emerald-50/40 dark:from-zinc-900/90 dark:via-zinc-950/95 dark:to-zinc-900/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-12 shadow-xl dark:shadow-2xl backdrop-blur-2xl text-center space-y-5"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-inner">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t("Legal & Compliance")}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white leading-tight max-w-3xl mx-auto">
              {t("Terms of Service")}
            </h1>

            <p className="text-zinc-600 dark:text-zinc-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              Please read these terms carefully before using {appName}. By using our platform, you agree to these operating standards and service terms.
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
              to="/privacy"
              className="p-5 rounded-2xl bg-white/90 dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-emerald-500/40 transition-all flex items-center justify-between group shadow-sm"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Privacy Policy</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Learn how we protect your personal data</div>
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
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Have questions regarding our terms?</div>
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
