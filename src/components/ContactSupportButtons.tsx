import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { standardizePhone } from '../contexts/AuthContext';
import { MessageCircle, Headphones, Send, Film } from 'lucide-react';
import { Content } from '../types';

interface ContactSupportButtonsProps {
  content?: Content;
}

export function ContactSupportButtons({ content }: ContactSupportButtonsProps) {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="bg-gradient-to-b from-white to-emerald-50/40 dark:from-zinc-900 dark:to-zinc-950 border border-emerald-500/20 dark:border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-xl text-center flex flex-col items-center gap-4 sm:gap-5 my-8 relative overflow-hidden backdrop-blur-md">
      <div className="absolute top-0 right-0 w-36 h-36 bg-[#25D366]/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left">
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
      
      {/* Main Action Buttons - Single Line on all screen sizes */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3.5 w-full max-w-xl pt-1">
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
            className="w-full inline-flex items-center justify-center gap-1.5 sm:gap-2.5 bg-gradient-to-r from-[#25D366] to-emerald-600 hover:from-[#20bd5a] hover:to-emerald-500 text-white px-3 sm:px-6 py-3 sm:py-3.5 rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-[#25D366]/25 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 border border-emerald-400/30 whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0" /> 
            <span className="truncate">{t("Contact Admin")}</span>
          </button>
        )}
        
        {settings?.whatsappChannelLink && (
          <a
            href={settings.whatsappChannelLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-1.5 sm:gap-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white px-3 sm:px-6 py-3 sm:py-3.5 rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-purple-600/25 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 border border-purple-400/30 whitespace-nowrap"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> 
            <span className="truncate">{t("WhatsApp Channel")}</span>
          </a>
        )}
      </div>

      {/* Additional Channels in single line */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-xl pt-0.5">
        <a
          href="https://whatsapp.com/channel/0029VbBU43bHFxOwOghfmD1I"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 dark:bg-purple-500/15 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs font-bold transition-all shadow-sm hover:scale-[1.02] active:scale-95 whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
          <span className="whitespace-nowrap">{t("For Updates")}</span>
        </a>
        <a
          href="https://whatsapp.com/channel/0029Vb6m6uFEAKWA7Rzxjv0e"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-pink-500/10 dark:bg-pink-500/15 hover:bg-pink-500/20 text-pink-700 dark:text-pink-300 border border-pink-500/20 text-xs font-bold transition-all shadow-sm hover:scale-[1.02] active:scale-95 whitespace-nowrap"
        >
          <Film className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400 shrink-0" />
          <span className="whitespace-nowrap">{t("For Clips")}</span>
        </a>
      </div>
    </div>
  );
}

