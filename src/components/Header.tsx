import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Search, X, ArrowLeft, LogIn } from "lucide-react";
import { clsx } from "clsx";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { usePWA } from "../contexts/PWAContext";
import { NotificationMenu } from "./NotificationMenu";
import { CartButton } from "./CartButton";
import { UserProfileMenu } from "./UserProfileMenu";
import { AdminButtons } from "./AdminButtons";

interface HeaderProps {
  showSearchAndFilters?: boolean;
  showFilters?: boolean;
  setShowFilters?: (show: boolean) => void;
  hasAnyFilter?: boolean;
  clearFilters?: () => void;
  setIsLogoutModalOpen?: (isOpen: boolean) => void;
  showBackButton?: boolean;
}

export function Header({
  showSearchAndFilters = false,
  showFilters = false,
  setShowFilters,
  hasAnyFilter = false,
  clearFilters,
  setIsLogoutModalOpen,
  showBackButton = false,
}: HeaderProps) {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const { isInstallable, installApp } = usePWA();
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl border-b border-zinc-200/80 dark:border-zinc-800/80 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showBackButton && (
            <button
              onClick={() => navigate("/")}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors flex items-center justify-center mr-1"
              title={t("Back to Home")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <img
                src="/Blacklogo.svg"
                alt="Logo"
                className="w-auto h-8 block dark:hidden"
              />
              <img
                src="/Whitelogo.svg"
                alt="Logo"
                className="w-auto h-8 hidden dark:block"
              />
            </div>
            <span className="text-xl font-bold tracking-tight text-emerald-500 whitespace-nowrap">
              {settings?.headerText || "MovizNow"}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {showSearchAndFilters && (
            <>
              <button
                onClick={() => setShowFilters?.(!showFilters)}
                className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors border",
                  hasAnyFilter
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent"
                )}
                title={t("Search and Filters")}
              >
                <Search className="w-4 h-4" />
              </button>
              {hasAnyFilter && (
                <button
                  onClick={clearFilters}
                  className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  title={t("Clear Filters")}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {isInstallable && (
            <button
              onClick={installApp}
              className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              title={t("Install App")}
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          <AdminButtons profile={profile} />
          <NotificationMenu />
          <CartButton />
          {!profile && (
            <Link
              to="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-black dark:text-zinc-950 font-extrabold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all shrink-0"
              title={t("Login / Register")}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("Login")}</span>
            </Link>
          )}
          <UserProfileMenu
            onOpenLogoutModal={() => setIsLogoutModalOpen?.(true)}
          />
        </div>
      </div>
    </header>
  );
}
