import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

interface PaymentMethodsProps {
  copied: boolean;
  onCopy: (text?: string) => void;
}

export default function PaymentMethods({ copied, onCopy }: PaymentMethodsProps) {
  const { settings } = useSettings();
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  
  if (!settings) return null;

  const currentBankId = selectedBankId || settings.bankAccounts?.[0]?.id;
  const selectedBank = settings.bankAccounts?.find(b => b.id === currentBankId);

  const isIBAN = (value: string) => {
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/i.test(value.replace(/\s/g, ''));
  };

  // If custom payment details are provided, show them instead of the default UI
  if (settings.paymentDetails) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
          {settings.paymentDetails}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {settings.bankAccounts?.map((bank) => {
          const isSelected = bank.id === currentBankId;
          return (
            <button 
              key={bank.id}
              onClick={() => setSelectedBankId(bank.id)}
              style={{ 
                backgroundColor: isSelected ? (bank.textColor || '#ffffff') : (bank.labelColor || bank.color),
                borderColor: isSelected ? (bank.labelColor || bank.color) : 'transparent',
                color: isSelected ? (bank.labelColor || bank.color) : (bank.textColor || '#ffffff')
              }}
              className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-bold shadow-sm transition-all active:scale-95 ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-black' : ''}`}
            >
              {bank.iconUrl && (
                <img src={bank.iconUrl} alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
              )}
              {bank.name}
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all" />
        
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">Account Title</div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">
                {selectedBank?.accountTitle || settings.accountTitle || 'Asmat Ullah'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {selectedBank?.accountNumber && isIBAN(selectedBank.accountNumber) ? 'IBAN Number' : 'Account Number'}
              </div>
              {selectedBank?.name && (
                <div className="text-[10px] font-bold uppercase text-emerald-500">{selectedBank.name}</div>
              )}
            </div>
            <div className="flex items-center justify-between bg-white dark:bg-black/40 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50 gap-3">
              <div className="font-mono text-base sm:text-lg font-bold tracking-wider text-emerald-600 dark:text-emerald-500 break-all">
                {selectedBank?.accountNumber || settings.accountNumber || '03416286423'}
              </div>
              <button 
                onClick={() => onCopy(selectedBank?.accountNumber || settings.accountNumber)}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg transition-all text-xs font-bold border border-zinc-200 dark:border-zinc-700"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
