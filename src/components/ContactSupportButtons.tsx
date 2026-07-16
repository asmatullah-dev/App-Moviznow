import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { standardizePhone } from '../contexts/AuthContext';
import { MessageCircle } from 'lucide-react';
import { Content } from '../types';

interface ContactSupportButtonsProps {
  content?: Content;
}

export function ContactSupportButtons({ content }: ContactSupportButtonsProps) {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-zinc-500 dark:text-zinc-400 text-sm text-center max-w-xl">
        {content 
          ? t("Need help or want to report an issue with this content?")
          : t("Need help? Reach out to our support or join our community.")}
      </p>
      
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
        {settings?.isAdminContactEnabled !== false && (
          <button
            onClick={() => {
              const adminPhone = standardizePhone(
                settings?.supportNumber || "3363284466"
              ).replace("+", "");
              
              let msg = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(
                profile?.role || "Unknown",
              )
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) =>
                  c.toUpperCase(),
                )}, ${String(profile?.status || "Unknown").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n`;

              if (content) {
                msg += `${t("Content Issue:")}\nID: ${content.id}\nTitle: ${content.title}${content.year ? ` (${content.year})` : ''}\n\n${t("Your message/question:")}\n${t("I need help with this content.")}`;
              } else {
                msg += `${t("Your message/question:")}\n`;
              }

              window.open(
                `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`,
                "_blank",
              );
            }}
            className="inline-flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 px-6 py-3 rounded-xl font-medium hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors w-full sm:w-auto"
          >
            <MessageCircle className="w-5 h-5" /> {t("Contact Admin")}
          </button>
        )}
        
        {settings?.whatsappChannelLink && (
          <a
            href={settings.whatsappChannelLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#20b858] transition-colors shadow-sm w-full sm:w-auto"
          >
            <MessageCircle className="w-5 h-5" /> {t("Join WhatsApp Channel")}
          </a>
        )}
      </div>
    </div>
  );
}
