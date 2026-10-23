import React from "react";
import { clsx } from "clsx";
import { Calendar, Sparkles } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { isUserExpired } from "../../contexts/UsersContext";
import { HeaderRefreshButton } from "../HeaderRefreshButton";

export function UserWelcomeBanner() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  const isExpired = profile?.expiryDate ? isUserExpired(profile.expiryDate) : false;
  const currentStatus = isExpired ? "expired" : (profile?.status || "active");
  const role = profile?.role || "user";

  const getRoleColor = (r: string) => {
    switch (r.toLowerCase()) {
      case "admin":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30";
      case "owner":
      case "vip":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "basic":
        return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30";
      case "manager":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "content_manager":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
      case "selected_content":
        return "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30";
      case "trial":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      default:
        return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30";
    }
  };

  const getRoleDisplayLabel = (r: string) => {
    const lower = r.toLowerCase();
    if (lower === "vip") return "VIP";
    if (lower === "basic") return "Basic";
    if (lower === "user") return "User";
    return r.replace("_", " ");
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "expired":
      case "suspended":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      default:
        return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30";
    }
  };

  const formatExpiryDate = (expiryDate?: string) => {
    if (!expiryDate) return "N/A";
    if (expiryDate.toLowerCase() === "lifetime") return "Lifetime";
    if (/^\d{2}-\d{2}-\d{4}$/.test(expiryDate)) {
      return expiryDate;
    }
    const ymdMatch = expiryDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return `${day}-${month}-${year}`;
    }
    try {
      const d = new Date(expiryDate);
      if (isNaN(d.getTime())) return expiryDate;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return expiryDate;
    }
  };

  const displayName = user
    ? profile?.displayName || user?.displayName || user?.email?.split("@")[0] || profile?.phone || "User"
    : "Guest";

  const roleLabel = !user ? t("Guest") : getRoleDisplayLabel(role);
  const statusLabel = !user ? t("Active") : (currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).toLowerCase());
  const expiryText = user ? formatExpiryDate(profile?.expiryDate) : "Lifetime";

  // Typewriter animation unified across "Welcome " + displayName
  const welcomeWord = t("Welcome");
  const welcomePrefix = `${welcomeWord} `;
  const fullText = `${welcomePrefix}${displayName}`;

  // Initially show full text on open
  const [charCount, setCharCount] = React.useState<number>(fullText.length);
  const [phase, setPhase] = React.useState<"PAUSE_FULL" | "DELETING" | "PAUSE_EMPTY" | "TYPING">("PAUSE_FULL");

  // Sync if full text changes
  React.useEffect(() => {
    setCharCount(fullText.length);
    setPhase("PAUSE_FULL");
  }, [fullText]);

  React.useEffect(() => {
    let timer: NodeJS.Timeout;

    if (phase === "PAUSE_FULL") {
      // Pause for 5 seconds when fully shown
      timer = setTimeout(() => {
        setPhase("DELETING");
      }, 5000);
    } else if (phase === "DELETING") {
      // Smooth backspacing from right to left in-place (no scroll)
      timer = setTimeout(() => {
        setCharCount((prev) => {
          if (prev <= 1) {
            setPhase("PAUSE_EMPTY");
            return 0;
          }
          return prev - 1;
        });
      }, 38);
    } else if (phase === "PAUSE_EMPTY") {
      // Brief pause when erased
      timer = setTimeout(() => {
        setPhase("TYPING");
      }, 350);
    } else if (phase === "TYPING") {
      // Type characters out from left to right
      timer = setTimeout(() => {
        setCharCount((prev) => {
          if (prev + 1 >= fullText.length) {
            setPhase("PAUSE_FULL");
            return fullText.length;
          }
          return prev + 1;
        });
      }, 60);
    }

    return () => clearTimeout(timer);
  }, [phase, charCount, fullText.length]);

  // Divide visible characters between prefix ("Welcome ") and name
  const prefixSlice = fullText.slice(0, Math.min(charCount, welcomePrefix.length));
  const nameSlice = charCount > welcomePrefix.length ? fullText.slice(welcomePrefix.length, charCount) : "";

  return (
    <div className="py-1 mb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
      {/* Line 1: Welcome {Name} with in-place text erase & retype animation */}
      <div className="flex items-center min-w-0 h-7 leading-tight select-none">
        <span className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white whitespace-pre">
          {prefixSlice}
        </span>
        {nameSlice && (
          <span className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight whitespace-pre">
            {nameSlice}
          </span>
        )}
      </div>

      {/* Line 2: Plan & Role labels (with user profile menu colors), beautified expiry date, unified refresh button */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs leading-normal mt-1">
        {/* Role label */}
        <span
          className={clsx(
            "text-[10px] sm:text-[11px] font-extrabold tracking-wider px-2 py-0.5 rounded-lg border uppercase shadow-2xs inline-flex items-center",
            getRoleColor(role)
          )}
        >
          {roleLabel}
        </span>

        {/* Status label */}
        <span
          className={clsx(
            "text-[10px] sm:text-[11px] font-extrabold tracking-wider px-2 py-0.5 rounded-lg border uppercase shadow-2xs inline-flex items-center gap-1",
            getStatusColor(currentStatus)
          )}
        >
          <span
            className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              currentStatus === "active"
                ? "bg-emerald-500"
                : currentStatus === "expired"
                ? "bg-red-500"
                : "bg-yellow-500"
            )}
          />
          {statusLabel}
        </span>

        {/* Beautified Expiry Date */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-zinc-100/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs text-[11px] text-zinc-600 dark:text-zinc-300">
          <Calendar className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold text-zinc-500 dark:text-zinc-400">
            {t("Expiry")}:
          </span>
          <span
            className={clsx(
              "font-extrabold text-zinc-900 dark:text-white tracking-wide",
              expiryText === "Lifetime" &&
                "text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"
            )}
          >
            {expiryText === "Lifetime" && (
              <Sparkles className="w-3 h-3 text-amber-500 inline shrink-0" />
            )}
            {expiryText === "Lifetime" ? t("Lifetime") : expiryText}
          </span>
        </div>

        {/* Unified Refresh Button */}
        {user && <HeaderRefreshButton />}
      </div>
    </div>
  );
}

export default UserWelcomeBanner;
