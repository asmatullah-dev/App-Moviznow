import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { useContent } from '../../contexts/ContentContext';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Content, Season, QualityLinks, LinkDef, ErrorLinkInfo, Language, Quality } from '../../types';
import { AlertTriangle, Edit2, ExternalLink, RefreshCw, X, Save, CheckCircle2, Filter, ArrowUpDown, Search, Trash2, Plus, ClipboardPaste, StopCircle } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { LinkCheckerModal } from '../../components/LinkCheckerModal';
import { motion, AnimatePresence } from 'framer-motion';
import { performFullLinkScan, LinkCheckResult } from '../../utils/linkScanner';
import { linkScannerManager } from '../../utils/linkScannerManager';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { clsx } from 'clsx';

const parseLinks = (linksStr: string | undefined): QualityLinks => {
  if (!linksStr) return [];
  try {
    const parsed = JSON.parse(linksStr);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object') {
      return Object.entries(parsed).map(([name, link]: [string, any]) => ({
        id: Math.random().toString(36).substr(2, 9),
        name,
        url: link?.url || '',
        size: link?.size || '',
        unit: 'MB' as 'MB' | 'GB'
      })).filter(l => l.url);
    }
  } catch (e) {
    console.error("Error parsing links", e);
  }
  return [];
};

export default function ErrorLinks() {
  const { contentList, languages, qualities, loading: contentLoading } = useContent();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Client-side/Deep Scan State
  const [scanning, setScanning] = useState(linkScannerManager.status === 'scanning');
  const [scanStatus, setScanStatus] = useState(linkScannerManager.status);
  const [scanProgress, setScanProgress] = useState(linkScannerManager.scannedCount);
  const [scanTotal, setScanTotal] = useState(linkScannerManager.totalCount);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [errorLinks, setErrorLinks] = useState<ErrorLinkInfo[]>(linkScannerManager.errorLinks);

  useEffect(() => {
    linkScannerManager.setConfig(languages, qualities);
    const unsubscribe = linkScannerManager.subscribe(() => {
      setScanning(linkScannerManager.status === 'scanning');
      setScanStatus(linkScannerManager.status);
      setScanProgress(linkScannerManager.scannedCount);
      setScanTotal(linkScannerManager.totalCount);
      setErrorLinks([...linkScannerManager.errorLinks]);
    });
    return () => unsubscribe();
  }, [languages, qualities]);

  const [isLinkCheckerModalOpen, setIsLinkCheckerModalOpen] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalAutoStart, setModalAutoStart] = useState(false);
  const [modalTitle, setModalTitle] = useState('Link Checker');

  const [editingLink, setEditingLink] = useState<ErrorLinkInfo | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editUnit, setEditUnit] = useState<'MB' | 'GB'>('MB');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const [filterErrorType, setFilterErrorType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'error' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [isAddLinksModalOpen, setIsAddLinksModalOpen] = useState(false);
  const [addLinksContent, setAddLinksContent] = useState<Content | null>(null);
  const [addLinksInput, setAddLinksInput] = useState('');
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addSize, setAddSize] = useState('');
  const [addUnit, setAddUnit] = useState<'MB' | 'GB'>('MB');
  const [addLinkStatus, setAddLinkStatus] = useState<string | null>(null);
  const [addLinkError, setAddLinkError] = useState<string | null>(null);
  const [addingLinks, setAddingLinks] = useState(false);

  useModalBehavior(isLinkCheckerModalOpen, () => setIsLinkCheckerModalOpen(false));
  useModalBehavior(isAddLinksModalOpen, () => setIsAddLinksModalOpen(false));
  useModalBehavior(!!editingLink, () => setEditingLink(null));

  const categorizeError = (detail: string): string => {
    const d = detail.toLowerCase();
    if (d.includes('broken') || d.includes('404')) return 'Broken';
    if (d.includes('protected') || d.includes('password')) return 'Protected';
    if (d.includes('redirect')) return 'Redirect';
    if (d.includes('unavailable') || d.includes('503') || d.includes('500')) return 'Unavailable';
    if (d.includes('size mismatch')) return 'Size Mismatch';
    if (d.includes('missing size') || d.includes('missing unit')) return 'Missing Size/Unit';
    if (d.includes('mismatch')) return 'Mismatches';
    if (d.includes('missing filename')) return 'Missing Filename';
    if (d.includes('missing url')) return 'Missing URL';
    if (d.includes('missing quality')) return 'Missing Quality';
    if (d.includes('missing language')) return 'Missing Language';
    return 'Unknown';
  };

  // Optimization: use a map for content lookup
  const contentMap = React.useMemo(() => {
    const map = new Map<string, Content>();
    contentList.forEach(c => map.set(c.id, c));
    return map;
  }, [contentList]);

  const liveErrorLinks = React.useMemo(() => {
    return errorLinks.map(info => {
      const content = contentMap.get(info.contentId);
      if (!content) return { ...info, errorCategory: categorizeError(info.errorDetail) };

      let currentLink = info.link;
      try {
        if (info.contentType === 'movie') {
          if (info.listType === 'movie') {
            const links = parseLinks(content.movieLinks);
            if (links[info.linkIndex]) currentLink = links[info.linkIndex];
          } else if (info.listType === 'zip') {
            const links = parseLinks(content.fullSeasonZip);
            if (links[info.linkIndex]) currentLink = links[info.linkIndex];
          } else if (info.listType === 'mkv') {
            const links = parseLinks(content.fullSeasonMkv);
            if (links[info.linkIndex]) currentLink = links[info.linkIndex];
          }
        } else if (content.type === 'series' && content.seasons) {
          const seasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
          const sIdx = info.seasonIndex!;
          if (seasons[sIdx]) {
            if (info.listType === 'zip') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
              if (links[info.linkIndex]) currentLink = links[info.linkIndex];
            } else if (info.listType === 'mkv') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
              if (links[info.linkIndex]) currentLink = links[info.linkIndex];
            } else if (info.listType === 'episode') {
              const eIdx = info.episodeIndex!;
              if (seasons[sIdx].episodes && seasons[sIdx].episodes[eIdx]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                if (links[info.linkIndex]) currentLink = links[info.linkIndex];
              }
            }
          }
        }
      } catch (e) {
        console.error("Error getting current link", e);
      }

      return { 
        ...info, 
        contentYear: content.year,
        link: currentLink, 
        errorCategory: categorizeError(info.errorDetail) 
      };
    });
  }, [errorLinks, contentMap]);

  const stats = React.useMemo(() => {
    const counts: Record<string, number> = {};
    liveErrorLinks.forEach(link => {
      const cat = link.errorCategory || 'Unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [liveErrorLinks]);

  const uniqueErrorTypes = React.useMemo(() => 
    Object.keys(stats).sort()
  , [stats]);

  const filteredAndSortedLinks = React.useMemo(() => {
    return [...liveErrorLinks]
      .filter(link => {
        const matchesType = filterErrorType === 'all' || link.errorCategory === filterErrorType;
        const matchesSearch = !searchTerm || 
          link.contentTitle.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesType && matchesSearch;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'title') {
          comparison = a.contentTitle.localeCompare(b.contentTitle);
        } else if (sortBy === 'error') {
          comparison = (a.errorCategory || '').localeCompare(b.errorCategory || '');
        } else if (sortBy === 'date') {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          comparison = dateA - dateB;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [liveErrorLinks, filterErrorType, searchTerm, sortBy, sortOrder]);

  useEffect(() => {
    setLoading(contentLoading);
  }, [contentLoading]);



  // Auto-recheck links if they change
  useEffect(() => {
    if (scanning || loading) return;

    const checkChangedLinks = async () => {
      const changedLinks = liveErrorLinks.filter(live => {
        const original = errorLinks.find(o => 
          o.contentId === live.contentId && 
          o.listType === live.listType && 
          o.linkIndex === live.linkIndex &&
          o.seasonIndex === live.seasonIndex &&
          o.episodeIndex === live.episodeIndex
        );
        // If the URL in contentList is different from what we scanned, it's "changed"
        return original && live.link.url !== original.link.url;
      });

      if (changedLinks.length === 0) return;

      for (const item of changedLinks) {
        try {
          const result = await performFullLinkScan(item.link.url, {}, languages, qualities);
          if (result.ok) {
            // Link is now working! Remove from local error list
            setErrorLinks(prev => prev.filter(err => 
              !(err.contentId === item.contentId && 
                err.listType === item.listType && 
                err.linkIndex === item.linkIndex &&
                err.seasonIndex === item.seasonIndex &&
                err.episodeIndex === item.episodeIndex)
            ));
          } else {
            // Link still has error, update the error detail in local state
            setErrorLinks(prev => prev.map(err => {
              if (err.contentId === item.contentId && 
                  err.listType === item.listType && 
                  err.linkIndex === item.linkIndex &&
                  err.seasonIndex === item.seasonIndex &&
                  err.episodeIndex === item.episodeIndex) {
                return {
                  ...err,
                  link: item.link,
                  errorDetail: result.message || result.statusLabel || "Unknown Error",
                  fetchedSize: result.fileSizeText?.split(' ')[0],
                  fetchedUnit: result.fileSizeText?.split(' ')[1] as 'MB' | 'GB'
                };
              }
              return err;
            }));
          }
        } catch (e) {
          console.error("Error auto-rechecking link", e);
        }
      }
    };

    checkChangedLinks();
  }, [liveErrorLinks, errorLinks, scanning, loading]);



  const getAllLinksToScan = (): { info: ErrorLinkInfo, url: string }[] => {
    let allLinksToScan: { info: ErrorLinkInfo, url: string }[] = [];

    // Sort contentList by createdAt descending (newest first)
    const sortedContent = [...contentList].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    sortedContent.forEach(content => {
      if (content.type === 'movie') {
        if (content.movieLinks) {
          const links = parseLinks(content.movieLinks);
          links.forEach((link, idx) => {
            allLinksToScan.push({
              info: {
                contentId: content.id,
                contentTitle: content.title,
                contentType: 'movie',
                location: 'Movie Links',
                link,
                linkIndex: idx,
                listType: 'movie',
                errorDetail: '',
                createdAt: content.createdAt
              },
              url: link.url || ''
            });
          });
        }
        if (content.fullSeasonZip) {
          const links = parseLinks(content.fullSeasonZip);
          links.forEach((link, idx) => {
            allLinksToScan.push({
              info: {
                contentId: content.id,
                contentTitle: content.title,
                contentType: 'movie',
                location: 'Full Season ZIP',
                link,
                linkIndex: idx,
                listType: 'zip',
                errorDetail: '',
                createdAt: content.createdAt
              },
              url: link.url || ''
            });
          });
        }
        if (content.fullSeasonMkv) {
          const links = parseLinks(content.fullSeasonMkv);
          links.forEach((link, idx) => {
            allLinksToScan.push({
              info: {
                contentId: content.id,
                contentTitle: content.title,
                contentType: 'movie',
                location: 'Full Season MKV',
                link,
                linkIndex: idx,
                listType: 'mkv',
                errorDetail: '',
                createdAt: content.createdAt
              },
              url: link.url || ''
            });
          });
        }
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
          seasons.forEach((season, sIdx) => {
            const zipLinks = parseLinks(JSON.stringify(season.zipLinks));
            zipLinks.forEach((link, idx) => {
              allLinksToScan.push({
                info: {
                  contentId: content.id,
                  contentTitle: content.title,
                  contentType: 'series',
                  location: `Season ${season.seasonNumber} ZIP`,
                  link,
                  linkIndex: idx,
                  seasonIndex: sIdx,
                  listType: 'zip',
                  errorDetail: '',
                  createdAt: content.createdAt
                },
                url: link.url || ''
              });
            });
 
            const mkvLinks = parseLinks(JSON.stringify(season.mkvLinks || []));
            mkvLinks.forEach((link, idx) => {
              allLinksToScan.push({
                info: {
                  contentId: content.id,
                  contentTitle: content.title,
                  contentType: 'series',
                  location: `Season ${season.seasonNumber} MKV`,
                  link,
                  linkIndex: idx,
                  seasonIndex: sIdx,
                  listType: 'mkv',
                  errorDetail: '',
                  createdAt: content.createdAt
                },
                url: link.url || ''
              });
            });
 
            season.episodes?.forEach((ep, eIdx) => {
              const epLinks = parseLinks(JSON.stringify(ep.links));
              epLinks.forEach((link, idx) => {
                allLinksToScan.push({
                  info: {
                    contentId: content.id,
                    contentTitle: content.title,
                    contentType: 'series',
                    location: `S${season.seasonNumber} E${ep.episodeNumber}`,
                    link,
                    linkIndex: idx,
                    seasonIndex: sIdx,
                    episodeIndex: eIdx,
                    listType: 'episode',
                    errorDetail: '',
                    createdAt: content.createdAt
                  },
                  url: link.url || ''
                });
              });
            });
          });
        } catch (e) {
          console.error("Error parsing seasons for content", content.id);
        }
      }
    });
    return allLinksToScan;
  };

  
  const handleScanResults = async (results: any[]) => {
    const allLinksToScan = getAllLinksToScan();
    const newErrorLinks: ErrorLinkInfo[] = [];

    results.forEach(res => {
      const isMissingLanguageOnly = res.statusLabel === "MISSING_METADATA" && res.message === "Missing Language in filename";
      if (!isMissingLanguageOnly && (!res.ok || res.statusLabel === "BROKEN" || res.statusLabel === "SIZE_MISMATCH" || res.statusLabel === "MISSING_FILENAME" || res.statusLabel === "MISSING_METADATA" || (res.mismatchWarnings && res.mismatchWarnings.length > 0))) {
        const original = allLinksToScan.find(l => l.url === res.url);
        if (original) {
          const errorDetail = (res.mismatchWarnings && res.mismatchWarnings.length > 0) ? res.mismatchWarnings.join(', ') : (res.message || res.statusLabel || "Unknown Error");
          newErrorLinks.push({
            ...original.info,
            errorDetail: errorDetail,
            errorCategory: categorizeError(errorDetail),
            fetchedSize: res.fileSizeText?.split(' ')[0],
            fetchedUnit: res.fileSizeText?.split(' ')[1] as 'MB' | 'GB',
            createdAt: new Date().toISOString()
          });
        }
      }
    });

    linkScannerManager.errorLinks = newErrorLinks;
    setErrorLinks(newErrorLinks);
  };

  const scanLinks = async (onlyFiltered = false) => {
    let linksToScan = [];
    if (onlyFiltered) {
      linksToScan = filteredAndSortedLinks.map(l => ({ info: l, url: l.link.url }));
    } else {
      linksToScan = getAllLinksToScan();
    }
    if (linksToScan.length === 0) return;
    
    linkScannerManager.startScan(linksToScan);
  };

  const resumeScan = () => {
    linkScannerManager.resumeScan();
  };

  const pauseScan = () => {
    linkScannerManager.pauseScan();
  };

  const cancelScan = () => {
    linkScannerManager.cancelScan();
  };


  const handleDeleteLink = async (info: ErrorLinkInfo) => {
    if (!window.confirm(`Are you sure you want to delete this link: ${info.link.name}?`)) return;
    
    const content = contentList.find(c => c.id === info.contentId);
    if (!content) {
      console.error("Content not found for deletion", info.contentId);
      return;
    }

    try {
      const updatedContent = { ...content };
      let deleted = false;
      
      if (info.contentType === 'movie') {
        if (info.listType === 'movie') {
          const links = parseLinks(content.movieLinks);
          const idx = links.findIndex(l => l.url === info.link.url) !== -1 
            ? links.findIndex(l => l.url === info.link.url)
            : info.linkIndex;
          if (idx !== -1 && links[idx]) {
            links.splice(idx, 1);
            updatedContent.movieLinks = JSON.stringify(links);
            deleted = true;
          }
        } else if (info.listType === 'zip') {
          const links = parseLinks(content.fullSeasonZip);
          const idx = links.findIndex(l => l.url === info.link.url) !== -1 
            ? links.findIndex(l => l.url === info.link.url)
            : info.linkIndex;
          if (idx !== -1 && links[idx]) {
            links.splice(idx, 1);
            updatedContent.fullSeasonZip = JSON.stringify(links);
            deleted = true;
          }
        } else if (info.listType === 'mkv') {
          const links = parseLinks(content.fullSeasonMkv);
          const idx = links.findIndex(l => l.url === info.link.url) !== -1 
            ? links.findIndex(l => l.url === info.link.url)
            : info.linkIndex;
          if (idx !== -1 && links[idx]) {
            links.splice(idx, 1);
            updatedContent.fullSeasonMkv = JSON.stringify(links);
            deleted = true;
          }
        }
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
          const sIdx = info.seasonIndex!;
          if (seasons[sIdx]) {
            if (info.listType === 'zip') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
              const idx = links.findIndex(l => l.url === info.link.url) !== -1 
                ? links.findIndex(l => l.url === info.link.url)
                : info.linkIndex;
              if (idx !== -1 && links[idx]) {
                links.splice(idx, 1);
                seasons[sIdx].zipLinks = links;
                deleted = true;
              }
            } else if (info.listType === 'mkv') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
              const idx = links.findIndex(l => l.url === info.link.url) !== -1 
                ? links.findIndex(l => l.url === info.link.url)
                : info.linkIndex;
              if (idx !== -1 && links[idx]) {
                links.splice(idx, 1);
                seasons[sIdx].mkvLinks = links;
                deleted = true;
              }
            } else if (info.listType === 'episode') {
              const eIdx = info.episodeIndex!;
              if (seasons[sIdx].episodes && seasons[sIdx].episodes[eIdx]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                const idx = links.findIndex(l => l.url === info.link.url) !== -1 
                  ? links.findIndex(l => l.url === info.link.url)
                  : info.linkIndex;
                if (idx !== -1 && links[idx]) {
                  links.splice(idx, 1);
                  seasons[sIdx].episodes[eIdx].links = links;
                  deleted = true;
                }
              }
            }
            if (deleted) {
              updatedContent.seasons = JSON.stringify(seasons);
            }
          }
        } catch (e) {
          console.error("Error parsing seasons for delete", e);
        }
      }

      if (deleted) {
        await updateDoc(doc(db, 'content', content.id), updatedContent);
        // Update local error links state to remove the deleted link
        setErrorLinks(prev => prev.filter(l => !(l.contentId === info.contentId && l.link.url === info.link.url && l.listType === info.listType)));
      } else {
        alert("Could not find the link to delete. It may have already been removed.");
      }
    } catch (error) {
      console.error("Error deleting link:", error);
      alert("Failed to delete link.");
    }
  };

  const sortLinksBySize = (links: QualityLinks) => {
    return [...links].sort((a, b) => {
      const sizeA = parseFloat(a.size || '0') * (a.unit === 'GB' ? 1000 : 1);
      const sizeB = parseFloat(b.size || '0') * (b.unit === 'GB' ? 1000 : 1);
      return sizeB - sizeA; // Descending
    });
  };

  const handleAddLinks = async () => {
    if (!addLinksContent) return;
    
    let newLinks: QualityLinks = [];
    
    // If single link fields are filled, use them
    if (addUrl.trim() && addName.trim()) {
      newLinks = [{
        id: Math.random().toString(36).substr(2, 9),
        name: addName,
        url: addUrl,
        size: addSize,
        unit: addUnit
      }];
    } else if (addLinksInput.trim()) {
      newLinks = parseLinks(addLinksInput);
    }

    if (newLinks.length === 0) return;

    setAddingLinks(true);
    try {
      const updatedContent = { ...addLinksContent };
      
      if (updatedContent.type === 'movie') {
        const existing = parseLinks(updatedContent.movieLinks);
        updatedContent.movieLinks = JSON.stringify(sortLinksBySize([...existing, ...newLinks]));
      } else if (updatedContent.type === 'series' && updatedContent.seasons) {
        try {
          const seasons: Season[] = Array.isArray(updatedContent.seasons) ? updatedContent.seasons : JSON.parse(updatedContent.seasons);
          // Add to Season 1 Episode 1 by default if it's series and no episode specified in context (usually Add Links is for whole content or first ep)
          if (seasons.length > 0 && seasons[0].episodes && seasons[0].episodes.length > 0) {
            const existing = parseLinks(JSON.stringify(seasons[0].episodes[0].links));
            seasons[0].episodes[0].links = sortLinksBySize([...existing, ...newLinks]);
            updatedContent.seasons = JSON.stringify(seasons);
          }
        } catch (e) {
          console.error("Error parsing seasons for add links", e);
        }
      }

      await updateDoc(doc(db, 'content', updatedContent.id), updatedContent);
      setIsAddLinksModalOpen(false);
      setAddLinksInput('');
      setAddName('');
      setAddUrl('');
      setAddSize('');
      setAddUnit('MB');
      setAddLinkStatus(null);
      setAddLinkError(null);
    } catch (error) {
      console.error("Error adding links:", error);
      alert("Failed to add links.");
    } finally {
      setAddingLinks(false);
    }
  };

  const handleEditClick = (info: ErrorLinkInfo) => {
    setEditingLink(info);
    setEditUrl(info.link.url);
    setEditSize(info.link.size);
    setEditUnit(info.link.unit || 'MB');
    setEditName(info.link.name);
  };

  const handleUrlBlur = async (url: string) => {
    if (!url) return;
    try {
      const res = await fetch("/api/check-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileSize) {
          let sizeInBytes = data.fileSize;
          let size = 0;
          let unit: 'MB' | 'GB' = 'MB';
          
          if (sizeInBytes >= 1000 * 1000 * 1000) {
            size = sizeInBytes / (1000 * 1000 * 1000);
            unit = 'GB';
          } else {
            size = sizeInBytes / (1000 * 1000);
            unit = 'MB';
          }
          
          setEditSize(size.toFixed(2).replace(/\.00$/, ''));
          setEditUnit(unit);
        }
      }
    } catch (e) {
      console.error("Failed to check link info", e);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingLink) return;
    setSaving(true);
    
    try {
      const content = contentList.find(c => c.id === editingLink.contentId);
      if (!content) throw new Error("Content not found");

      const updateData: any = {};
      
      if (editingLink.listType === 'movie') {
        const links = parseLinks(content.movieLinks);
        if (links[editingLink.linkIndex]) {
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          updateData.movieLinks = JSON.stringify(links);
        }
      } else if (editingLink.listType === 'zip' && content.type === 'movie') {
        const links = parseLinks(content.fullSeasonZip);
        if (links[editingLink.linkIndex]) {
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          updateData.fullSeasonZip = JSON.stringify(links);
        }
      } else if (editingLink.listType === 'mkv' && content.type === 'movie') {
        const links = parseLinks(content.fullSeasonMkv);
        if (links[editingLink.linkIndex]) {
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          updateData.fullSeasonMkv = JSON.stringify(links);
        }
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
          const sIdx = editingLink.seasonIndex!;
          
          if (seasons[sIdx]) {
            if (editingLink.listType === 'zip') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
              if (links[editingLink.linkIndex]) {
                links[editingLink.linkIndex] = {
                  ...links[editingLink.linkIndex],
                  url: editUrl,
                  size: editSize,
                  unit: editUnit,
                  name: editName
                };
                seasons[sIdx].zipLinks = links;
              }
            } else if (editingLink.listType === 'mkv') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
              if (links[editingLink.linkIndex]) {
                links[editingLink.linkIndex] = {
                  ...links[editingLink.linkIndex],
                  url: editUrl,
                  size: editSize,
                  unit: editUnit,
                  name: editName
                };
                seasons[sIdx].mkvLinks = links;
              }
            } else if (editingLink.listType === 'episode') {
              const eIdx = editingLink.episodeIndex!;
              if (seasons[sIdx].episodes && seasons[sIdx].episodes[eIdx]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                if (links[editingLink.linkIndex]) {
                  links[editingLink.linkIndex] = {
                    ...links[editingLink.linkIndex],
                    url: editUrl,
                    size: editSize,
                    unit: editUnit,
                    name: editName
                  };
                  seasons[sIdx].episodes[eIdx].links = links;
                }
              }
            }
            updateData.seasons = JSON.stringify(seasons);
          }
        } catch (e) {
          console.error("Error parsing seasons for update", e);
          throw new Error("Invalid seasons data format");
        }
      }

      await updateDoc(doc(db, 'content', editingLink.contentId), updateData);
      
      // Re-check the link after saving
      const checkRes = await fetch("/api/check-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: editUrl }),
      });
      const checkData = await checkRes.json().catch(() => ({ ok: false }));
      const isWorking = !!checkData.ok;

      // Update error list
      setErrorLinks(prev => {
        const filtered = prev.filter(item => 
          !(item.contentId === editingLink.contentId && 
            item.listType === editingLink.listType && 
            item.linkIndex === editingLink.linkIndex &&
            item.seasonIndex === editingLink.seasonIndex &&
            item.episodeIndex === editingLink.episodeIndex)
        );
        
        if (isWorking) {
          return filtered;
        }

        const updatedLink: ErrorLinkInfo = {
          ...editingLink,
          link: {
            ...editingLink.link,
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          }
        };
        
        return [...filtered, updatedLink];
      });

      setEditingLink(null);
    } catch (error) {
      console.error("Error updating link:", error);
      alert("Failed to update link");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            Error Links
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Deep Scan using multiple algorithms to find broken links across your entire content library.</p>
        </div>
        
        <div className="flex flex-col gap-3 items-start lg:items-end w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-2 w-full lg:justify-end">
            {scanStatus === 'completed' && (
              <span className="bg-emerald-500/10 text-emerald-500 text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> Deep Scan complete
              </span>
            )}
            {scanStatus === 'error' && (
              <span className="bg-red-500/10 text-red-500 text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 border border-red-500/20">
                <AlertTriangle className="w-3.5 h-3.5" /> Deep Scan failed
              </span>
            )}
            
            {scanStatus === 'scanning' || scanStatus === 'paused' ? (
              <div className="flex items-center gap-4 w-full justify-between lg:justify-end bg-zinc-100 dark:bg-zinc-800/50 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-col mx-2 min-w-[200px]">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    <span>{scanStatus === 'scanning' ? 'Scanning...' : 'Scan Paused'}</span>
                    <span>{scanProgress} / {scanTotal} ({scanTotal > 0 ? Math.round((scanProgress / scanTotal) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full ${scanStatus === 'paused' ? 'bg-amber-500' : 'bg-emerald-500'} transition-all duration-300 ease-out`}
                      style={{ width: `${scanTotal > 0 ? (scanProgress / scanTotal) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {scanStatus === 'scanning' ? (
                    <button
                      onClick={pauseScan}
                      className="bg-amber-500 hover:bg-amber-600 text-white p-2 rounded-md transition-all active:scale-95"
                      title="Pause Scan"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={resumeScan}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-md transition-all active:scale-95"
                      title="Resume Scan"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={cancelScan}
                    className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-md transition-all active:scale-95"
                    title="Cancel Scan"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : scanStatus === 'completed' || scanStatus === 'error' || scanStatus === 'idle' ? (
              <>
                <button
                  onClick={() => scanLinks()}
                  disabled={loading}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap shadow-lg shadow-emerald-500/20"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Start Deep Scan
                </button>
                {errorLinks.length > 0 && (
                  <button
                    onClick={() => scanLinks(true)}
                    disabled={loading}
                    className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap border border-zinc-300 dark:border-zinc-700"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Re-check Filtered ({filteredAndSortedLinks.length})
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Links Table */}
      <LinkCheckerModal 
        isOpen={isLinkCheckerModalOpen} 
        onClose={() => {
          setIsLinkCheckerModalOpen(false);
          setScanning(false);
        }} 
        initialInput={modalInput}
        autoStart={modalAutoStart}
        title={modalTitle}
        onResults={handleScanResults}
        languages={languages}
        qualities={qualities}
      />
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mx-auto mb-4" />
            <p className="text-zinc-500">Loading error links...</p>
          </div>
        ) : errorLinks.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">
              {(scanStatus === 'scanning' || scanStatus === 'paused') ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-24 h-24 mb-6">
                    <RefreshCw className={`w-24 h-24 text-emerald-500/20 ${scanStatus === 'scanning' ? 'animate-spin' : ''}`} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-emerald-500">{Math.round((scanProgress / scanTotal) * 100)}%</span>
                    </div>
                  </div>
                  <p className="text-xl text-zinc-900 dark:text-white font-medium">{scanStatus === 'paused' ? 'Scanning paused...' : 'Scanning links...'} {scanProgress} / {scanTotal}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Checking all Pixeldrain links in your content library.</p>
                  
                  <div className="w-full max-w-md bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full mt-8 overflow-hidden">
                    <motion.div 
                      className="bg-emerald-500 h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(scanProgress / scanTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ) : scanStatus === 'completed' ? (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="w-16 h-16 mb-4 text-emerald-500" />
                  <p className="text-xl text-zinc-900 dark:text-white font-medium">All links are working perfectly!</p>
                  <p className="text-sm mt-2">We checked the Pixeldrain links and found no errors.</p>
                </div>
              ) : scanStatus === 'error' ? (
                <div className="flex flex-col items-center">
                  <AlertTriangle className="w-16 h-16 mb-4 text-red-500" />
                  <p className="text-xl text-zinc-900 dark:text-white font-medium">Cannot scan links</p>
                  <p className="text-sm mt-2">There was a problem scanning the links. Please try again.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="w-16 h-16 mb-4 text-emerald-500/50" />
                  <p className="text-xl text-zinc-900 dark:text-white">No error links found.</p>
                  <p className="text-sm mt-2">Click "Start Deep Scan" to check all Pixeldrain links.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Total Errors</p>
                  <p className="text-xl font-bold text-zinc-900 dark:text-white">{liveErrorLinks.length}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Searching</p>
                  <p className="text-xl font-bold text-zinc-900 dark:text-white">{filteredAndSortedLinks.length}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Movies</p>
                  <p className="text-xl font-bold text-blue-500">{liveErrorLinks.filter(l => l.contentType === 'movie').length}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Series</p>
                  <p className="text-xl font-bold text-purple-500">{liveErrorLinks.filter(l => l.contentType === 'series').length}</p>
                </div>
              </div>
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search title..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                    <select
                      value={filterErrorType}
                      onChange={(e) => setFilterErrorType(e.target.value)}
                      className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
                    >
                      <option value="all">All Errors ({liveErrorLinks.length})</option>
                      {uniqueErrorTypes.map(type => (
                        <option key={type} value={type}>{type} ({stats[type] || 0})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <ArrowUpDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'title' | 'error' | 'date')}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
                  >
                    <option value="date">Sort by Date</option>
                    <option value="title">Sort by Title</option>
                    <option value="error">Sort by Error Type</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white transition-colors"
                  >
                    {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Content</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Details</th>
                      <th className="px-6 py-4 font-medium text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredAndSortedLinks.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-zinc-500">
                          <div className="flex flex-col items-center gap-2">
                            <Search className="w-8 h-8 opacity-20" />
                            <p>No error links match your search or filters.</p>
                            {(searchTerm || filterErrorType !== 'all') && (
                              <button 
                                onClick={() => { setSearchTerm(''); setFilterErrorType('all'); }}
                                className="text-emerald-500 hover:underline text-xs"
                              >
                                Clear all filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedLinks.map((info) => (
                        <tr key={`${info.contentId}-${info.listType}-${info.linkIndex}-${info.seasonIndex || 'no'}-${info.episodeIndex || 'no'}`} className="hover:bg-zinc-200 dark:hover:bg-zinc-800/10 transition-colors">
                          <td className="px-6 py-4 align-top">
                            <div className="font-bold text-zinc-900 dark:text-white">
                              {info.contentTitle}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 font-medium">
                                {info.contentYear && <span>{info.contentYear}</span>}
                                <span className={clsx(
                                  "text-[10px] font-bold uppercase tracking-wider",
                                  info.contentType === 'movie' ? 'text-blue-500' : 'text-purple-500'
                                )}>
                                  {info.contentType}
                                </span>
                                <span className="text-emerald-500 truncate whitespace-nowrap">{info.link.name.substring(0, 6)}</span>
                                <span className="text-zinc-500 text-xs whitespace-nowrap">({info.link.size}{info.link.unit})</span>
                              </div>
                              <div>
                                <a 
                                  href={info.link.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-[10px] text-zinc-500 hover:text-emerald-500 transition-colors truncate max-w-md inline-block font-mono"
                                >
                                  {info.link.url}
                                </a>
                              </div>
                              <div>
                                <div className={clsx(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full inline-block",
                                  info.errorCategory === 'Broken' ? "bg-red-500/10 text-red-500" :
                                  info.errorCategory === 'Protected' ? "bg-amber-500/10 text-amber-500" :
                                  info.errorCategory === 'Size Mismatch' ? "bg-orange-500/10 text-orange-500" :
                                  "bg-zinc-500/10 text-zinc-500"
                                )}>
                                  {info.errorCategory}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right align-top">
                            <div className="flex flex-col items-end gap-2 mt-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    const content = contentList.find(c => c.id === info.contentId);
                                    if (content) {
                                      setAddLinksContent(content);
                                      setIsAddLinksModalOpen(true);
                                    }
                                  }}
                                  className="bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500/10 hover:text-emerald-500 text-zinc-500 dark:text-zinc-400 p-2 rounded-lg transition-all"
                                  title="Add Links"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEditClick(info)}
                                  className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 p-2 rounded-lg transition-all"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLink(info)}
                                  className="bg-red-500/5 hover:bg-red-500/10 text-red-400 p-2 rounded-lg transition-all"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium truncate max-w-[120px]" title={info.location}>
                                {info.location}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
              </table>
            </div>
            </div>
          )}
        </div>

      {/* Add Links Modal */}
      <AnimatePresence>
        {isAddLinksModalOpen && addLinksContent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add Links to {addLinksContent.title}</h2>
                <button onClick={() => setIsAddLinksModalOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-4 p-4 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Link Details</p>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Link URL</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={addUrl}
                        onChange={(e) => setAddUrl(e.target.value)}
                        onBlur={async (e) => {
                          const url = e.target.value;
                          if (!url) return;
                          setAddingLinks(true);
                          setAddLinkStatus(null);
                          setAddLinkError(null);
                          try {
                            const result = await performFullLinkScan(url, {}, languages, qualities);
                            
                            if (result.fileSizeText) {
                              const [val, unit] = result.fileSizeText.split(' ');
                              setAddSize(val);
                              setAddUnit(unit as 'MB' | 'GB');
                            }
                            
                            if (result.qualityLabel) {
                              setAddName(result.qualityLabel);
                            } else if (result.fileName) {
                              const lowerName = result.fileName.toLowerCase();
                              const foundQuality = qualities.find(q => lowerName.includes(q.name.toLowerCase()));
                              if (foundQuality) setAddName(foundQuality.name);
                            }

                            if (result.ok) {
                              if (result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "MISSING_METADATA") {
                                setAddLinkStatus("Available (Missing metadata)");
                              } else {
                                setAddLinkStatus("Available");
                              }
                            } else {
                              setAddLinkError(result.message || result.statusLabel || "Unavailable");
                            }
                            
                            // Auto-fill name if empty
                            if (!addName) {
                              if (result.qualityLabel) {
                                setAddName(result.qualityLabel);
                              } else if (result.fileName) {
                                const lowerName = result.fileName.toLowerCase();
                                const foundQuality = qualities.find(q => lowerName.includes(q.name.toLowerCase()));
                                if (foundQuality) setAddName(foundQuality.name);
                                else setAddName(result.fileName.substring(0, 30));
                              }
                            }
                          } catch (e) {
                            console.error("Failed to check link info", e);
                            setAddLinkError("Failed to check link");
                          } finally {
                            setAddingLinks(false);
                          }
                        }}
                        placeholder="https://pixeldrain.com/u/..."
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 pr-10 focus:outline-none focus:border-emerald-500 text-sm"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {addingLinks && <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />}
                        {!addingLinks && addLinkStatus && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {!addingLinks && addLinkError && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      </div>
                    </div>
                    {addLinkError && <p className="text-[10px] text-red-500 mt-1 font-medium">{addLinkError}</p>}
                    {addLinkStatus && <p className="text-[10px] text-emerald-500 mt-1 font-medium">{addLinkStatus}</p>}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Name / Quality</label>
                      <input
                        type="text"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="e.g. 720p HEVC, 1080p Atmos"
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500 text-sm font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Size</label>
                      <input
                        type="number"
                        value={addSize}
                        onChange={(e) => setAddSize(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Unit</label>
                      <select
                        value={addUnit}
                        onChange={(e) => setAddUnit(e.target.value as 'MB' | 'GB')}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500 text-sm font-bold"
                      >
                        <option value="MB">MB</option>
                        <option value="GB">GB</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setIsAddLinksModalOpen(false);
                      setAddName('');
                      setAddUrl('');
                      setAddSize('');
                      setAddUnit('MB');
                      setAddLinksInput('');
                      setAddLinkStatus(null);
                      setAddLinkError(null);
                    }}
                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white py-3 rounded-xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddLinks}
                    disabled={addingLinks || (!addUrl.trim() || !addName.trim())}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {addingLinks ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {addingLinks ? 'Adding...' : 'Add Link'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingLink && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Edit Link</h2>
                <button onClick={() => setEditingLink(null)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Content</label>
                  <div className="text-zinc-900 dark:text-white font-medium flex flex-wrap items-center gap-2">
                    <span>{editingLink.contentTitle} {editingLink.contentYear && <span className="text-zinc-500 font-normal">({editingLink.contentYear})</span>}</span>
                    <span className="text-[10px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-normal">{editingLink.location}</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">URL</label>
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    onBlur={(e) => handleUrlBlur(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-zinc-500">Paste a new Pixeldrain link to auto-fetch size.</p>
                    {editUrl.includes('/api/file/') && (
                      <button
                        onClick={() => setEditUrl(editUrl.replace('/api/file/', '/u/'))}
                        className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                      >
                        Convert to /u/ format
                      </button>
                    )}
                    {editUrl.includes('/api/list/') && (
                      <button
                        onClick={() => setEditUrl(editUrl.replace('/api/list/', '/l/'))}
                        className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                      >
                        Convert to /l/ format
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Size</label>
                    <input
                      type="number"
                      value={editSize}
                      onChange={(e) => setEditSize(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                    />
                    {editingLink.fetchedSize && (
                      <button
                        onClick={() => {
                          setEditSize(editingLink.fetchedSize!);
                          setEditUnit(editingLink.fetchedUnit!);
                        }}
                        className="text-[10px] text-emerald-500 hover:text-emerald-400 mt-1 font-medium flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Apply server size ({editingLink.fetchedSize} {editingLink.fetchedUnit})
                      </button>
                    )}
                  </div>
                  <div className="w-32">
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Unit</label>
                    <div className="flex bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditUnit('MB')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editUnit === 'MB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-600 dark:text-zinc-300'}`}
                      >
                        MB
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUnit('GB')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editUnit === 'GB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-600 dark:text-zinc-300'}`}
                      >
                        GB
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setEditingLink(null)}
                  className="px-4 py-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editUrl}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-6 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <><Save className="w-4 h-4" /> Save Changes</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
