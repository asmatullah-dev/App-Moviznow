import React from 'react';
import { Globe } from 'lucide-react';
import {
  getMoviesdriveDomain,
  getSkymoviesDomain,
  getFilmygoDomain,
  getHdhub4uDomain,
  getFilmyflyDomain,
} from '../../utils/domains';

interface DomainSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  moviesdriveDomainInput: string;
  setMoviesdriveDomainInput: (val: string) => void;
  skymoviesDomainInput: string;
  setSkymoviesDomainInput: (val: string) => void;
  filmygoDomainInput: string;
  setFilmygoDomainInput: (val: string) => void;
  hdhubDomainInput: string;
  setHdhubDomainInput: (val: string) => void;
  filmyflyDomainInput: string;
  setFilmyflyDomainInput: (val: string) => void;
  onSave: () => void;
}

export const DomainSettingsModal: React.FC<DomainSettingsModalProps> = ({
  isOpen,
  moviesdriveDomainInput,
  setMoviesdriveDomainInput,
  skymoviesDomainInput,
  setSkymoviesDomainInput,
  filmygoDomainInput,
  setFilmygoDomainInput,
  hdhubDomainInput,
  setHdhubDomainInput,
  filmyflyDomainInput,
  setFilmyflyDomainInput,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Custom Site Search Domains
          </h4>
        </div>
        <span className="text-[11px] text-zinc-500">Saved to browser storage</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            MoviesDrive Domain
          </label>
          <input
            type="text"
            value={moviesdriveDomainInput}
            onChange={(e) => setMoviesdriveDomainInput(e.target.value)}
            placeholder="https://moviesdrives.cfd"
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            SkyMoviesHD Domain
          </label>
          <input
            type="text"
            value={skymoviesDomainInput}
            onChange={(e) => setSkymoviesDomainInput(e.target.value)}
            placeholder="https://skymovieshd.meme"
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            FilmyGo Domain
          </label>
          <input
            type="text"
            value={filmygoDomainInput}
            onChange={(e) => setFilmygoDomainInput(e.target.value)}
            placeholder="https://filmycab.press"
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            HDHub4U Domain
          </label>
          <input
            type="text"
            value={hdhubDomainInput}
            onChange={(e) => setHdhubDomainInput(e.target.value)}
            placeholder="https://new5.hdhub4u.cl"
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            FilmyFly Domain
          </label>
          <input
            type="text"
            value={filmyflyDomainInput}
            onChange={(e) => setFilmyflyDomainInput(e.target.value)}
            placeholder="https://filmyfly.bingo"
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setMoviesdriveDomainInput(getMoviesdriveDomain());
            setSkymoviesDomainInput(getSkymoviesDomain());
            setFilmygoDomainInput(getFilmygoDomain());
            setHdhubDomainInput(getHdhub4uDomain());
            setFilmyflyDomainInput(getFilmyflyDomain());
          }}
          className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
        >
          Reset Defaults
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5"
        >
          Save & Apply Domains
        </button>
      </div>
    </div>
  );
};
