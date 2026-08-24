import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { standardizePhone } from '../contexts/AuthContext';
import { MessageCircle, Headphones, Send } from 'lucide-react';
import { Content } from '../types';

interface ContactSupportButtonsProps {
  content?: Content;
}

export function ContactSupportButtons({ content }: ContactSupportButtonsProps) {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="bg-gradient-to-b from-white to-emerald-50/40 dark:from-zinc-900 dark:to-emerald-950/20 border border-emerald-500/20 dark:border-emerald-500/15 rounded-3xl p-6 sm:p-7 shadow-lg text-center flex flex-col items-center gap-5 my-8 relative overflow-hidden backdrop-blur-md">
      <div className="absolute top-0 right-0 w-36 h-36 bg-[#25D366]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-[#128C7E]/10 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 text-center sm:text-left">
        <div className="p-3 bg-[#25D366]/15 dark:bg-[#25D366]/20 border border-[#25D366]/30 text-[#128C7E] dark:text-[#25D366] rounded-2xl shadow-sm shrink-0">
          <Headphones className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2 justify-center sm:justify-start mb-0.5">
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              {t("Need Help or Support?")}
            </h3>
            <span className="hidden sm:inline-block bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md">
              WhatsApp Support
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm max-w-lg">
            {content 
              ? t("Need help or want to report an issue with this content?")
              : t("Need help? Reach out to our support or join our community.")}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-xl pt-1">
        {settings?.isAdminContactEnabled !== false && (
          <button
            onClick={() => {
              const adminPhone = standardizePhone(
                settings?.supportNumber || "3416286423"
              ).replace("+", "");
              
              let msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                profile?.role || "Unknown",
              )
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) =>
                  c.toUpperCase(),
                )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n`;

              if (content) {
                msg += `${t("Content Issue:")}\nID: MovizNow.com/${content.id}\nTitle: ${content.title}${content.year ? ` (${content.year})` : ''}\n\n${t("Your message/question:")}\n${t("I need help with this content.")}`;
              } else {
                msg += `${t("Your message/question:")}\n`;
              }

              window.open(
                `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                "_blank",
              );
            }}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1caa51] text-white px-6 py-3.5 rounded-2xl font-bold text-sm shadow-md shadow-[#25D366]/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 border border-emerald-400/30"
          >
            <MessageCircle className="w-5 h-5 fill-current" /> 
            <span>{t("Contact Admin")}</span>
          </button>
        )}
        
        {settings?.whatsappChannelLink && (
          <a
            href={settings.whatsappChannelLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2.5 bg-[#075E54] hover:bg-[#0a7064] active:bg-[#054a42] text-white px-6 py-3.5 rounded-2xl font-bold text-sm shadow-md shadow-[#075E54]/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 border border-teal-600/30"
          >
            <Send className="w-5 h-5" /> 
            <span>{t("Join WhatsApp Channel")}</span>
          </a>
        )}
      </div>
    </div>
  );
}

