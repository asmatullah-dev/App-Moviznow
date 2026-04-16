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
import { useModalBehavior } from '../../hooks/useModalBehavior';

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
  const [loading, setLoading] = useState(true);
  
  // Client-side/Deep Scan State
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'completed' | 'error'>(() => {
    return (localStorage.getItem('moviznow_scan_status') as any) || 'idle';
  });
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [errorLinks, setErrorLinks] = useState<ErrorLinkInfo[]>(() => {
    const cached = localStorage.getItem('moviznow_error_links');
    return cached ? JSON.parse(cached) : [];
  });

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

  const liveErrorLinks = React.useMemo(() => {
    return errorLinks.map(info => {
      const content = contentList.find(c => c.id === info.contentId);
      if (!content) return info;

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
              if (seasons[sIdx].episodes && seasons[seasons[sIdx].episodes ? eIdx : -1]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                if (links[info.linkIndex]) currentLink = links[info.linkIndex];
              }
            }
          }
        }
      } catch (e) {
        console.error("Error getting current link", e);
      }

      return { ...info, link: currentLink, errorCategory: categorizeError(info.errorDetail) };
    });
  }, [errorLinks, contentList]);

  const uniqueErrorTypes = Array.from(new Set(liveErrorLinks.map(link => link.errorCategory || 'Unknown'))).sort();

  const filteredAndSortedLinks = [...liveErrorLinks]
    .filter(link => filterErrorType === 'all' || link.errorDetail === filterErrorType)
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = a.contentTitle.localeCompare(b.contentTitle);
      } else if (sortBy === 'error') {
        comparison = a.errorDetail.localeCompare(b.errorDetail);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        comparison = dateA - dateB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  useEffect(() => {
    setLoading(contentLoading);
  }, [contentLoading]);

  useEffect(() => {
    const unsubErrorLinks = onSnapshot(collection(db, 'error_links'), (snapshot) => {
      setErrorLinks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as ErrorLinkInfo)));
    });

    return () => {
      unsubErrorLinks();
    };
  }, []);

  // Sync errorLinks to localStorage
  useEffect(() => {
    localStorage.setItem('moviznow_error_links', JSON.stringify(errorLinks));
  }, [errorLinks]);

  // Sync scanStatus to localStorage
  useEffect(() => {
    localStorage.setItem('moviznow_scan_status', scanStatus);
  }, [scanStatus]);

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
    setScanning(false);
    setScanStatus('completed');
    
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

    setErrorLinks(newErrorLinks);
  };

  const scanLinks = async (onlyFiltered = false) => {
    if (scanning) return;
    
    let linksToScan: { info: ErrorLinkInfo, url: string }[] = [];
    if (onlyFiltered) {
      linksToScan = filteredAndSortedLinks.map(l => ({ info: l, url: l.link.url }));
    } else {
      linksToScan = getAllLinksToScan();
    }
    
    if (linksToScan.length === 0) return;
    
    setScanning(true);
    setScanStatus('scanning');
    setScanProgress(0);
    setScanTotal(linksToScan.length);
    
    // Clear previous results when starting a new scan
    setErrorLinks([]);
    localStorage.removeItem('moviznow_error_links');
    localStorage.setItem('moviznow_scan_status', 'scanning');
    
    const controller = new AbortController();
    setAbortController(controller);

    const concurrency = 5;
    const results: any[] = [];
    const queue = [...linksToScan];
    let completed = 0;

    const processNext = async () => {
      if (queue.length === 0 || controller.signal.aborted) return;
      
      const item = queue.shift()!;
      try {
        const res = await performFullLinkScan(
          item.url, 
          {}, 
          languages, 
          qualities, 
          controller.signal,
          item.info.link?.size,
          item.info.link?.unit
        );
        results.push(res);
        
        // Show new results as they are found
        const isMissingLanguageOnly = res.statusLabel === "MISSING_METADATA" && res.message === "Missing Language in filename";
        if (!isMissingLanguageOnly && (!res.ok || res.statusLabel === "BROKEN" || res.statusLabel === "SIZE_MISMATCH" || res.statusLabel === "MISSING_FILENAME" || res.statusLabel === "MISSING_METADATA" || (res.mismatchWarnings && res.mismatchWarnings.length > 0))) {
          setErrorLinks(prev => {
            const errorDetail = (res.mismatchWarnings && res.mismatchWarnings.length > 0) ? res.mismatchWarnings.join(', ') : (res.message || res.statusLabel || "Unknown Error");
            const newError: ErrorLinkInfo = {
              ...item.info,
              errorDetail: errorDetail,
              errorCategory: categorizeError(errorDetail),
              fetchedSize: res.fileSizeText?.split(' ')[0],
              fetchedUnit: res.fileSizeText?.split(' ')[1] as 'MB' | 'GB',
              createdAt: new Date().toISOString()
            };
            return [...prev, newError];
          });
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error("Scan error for", item.url, e);
      } finally {
        completed++;
        setScanProgress(completed);
        await processNext();
      }
    };

    try {
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => processNext());
      await Promise.all(workers);
      
      if (!controller.signal.aborted) {
        await handleScanResults(results);
      }
    } catch (e) {
      console.error("Scan failed", e);
      setScanStatus('error');
    } finally {
      if (!controller.signal.aborted) {
        setScanning(false);
        setAbortController(null);
      }
    }
  };

  const cancelScan = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setScanning(false);
      setScanStatus('idle');
    }
  };

  const handleDeleteLink = async (info: ErrorLinkInfo) => {
    if (!window.confirm(`Are you sure you want to delete this link: ${info.link.name}?`)) return;
    
    const content = contentList.find(c => c.id === info.contentId);
    if (!content) return;

    try {
      const updatedContent = { ...content };
      if (info.contentType === 'movie') {
        if (info.listType === 'movie') {
          const links = parseLinks(content.movieLinks);
          links.splice(info.linkIndex, 1);
          updatedContent.movieLinks = JSON.stringify(links);
        } else if (info.listType === 'zip') {
          const links = parseLinks(content.fullSeasonZip);
          links.splice(info.linkIndex, 1);
          updatedContent.fullSeasonZip = JSON.stringify(links);
        } else if (info.listType === 'mkv') {
          const links = parseLinks(content.fullSeasonMkv);
          links.splice(info.linkIndex, 1);
          updatedContent.fullSeasonMkv = JSON.stringify(links);
        }
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
          const sIdx = info.seasonIndex!;
          if (seasons[sIdx]) {
            if (info.listType === 'zip') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
              links.splice(info.linkIndex, 1);
              seasons[sIdx].zipLinks = links;
            } else if (info.listType === 'mkv') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
              links.splice(info.linkIndex, 1);
              seasons[sIdx].mkvLinks = links;
            } else if (info.listType === 'episode') {
              const eIdx = info.episodeIndex!;
              if (seasons[sIdx].episodes && seasons[sIdx].episodes[eIdx]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                links.splice(info.linkIndex, 1);
                seasons[sIdx].episodes[eIdx].links = links;
              }
            }
            updatedContent.seasons = JSON.stringify(seasons);
          }
        } catch (e) {
          console.error("Error parsing seasons for delete", e);
        }
      }

      await updateDoc(doc(db, 'content', content.id), updatedContent);
      
      // Update local error links state to remove the deleted link
      setErrorLinks(prev => prev.filter(l => !(l.contentId === info.contentId && l.link.url === info.link.url)));
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
    if (!addLinksContent || !addLinksInput.trim()) return;
    setAddingLinks(true);
    try {
      const newLinks = parseLinks(addLinksInput);
      const updatedContent = { ...addLinksContent };
      
      if (updatedContent.type === 'movie') {
        const existing = parseLinks(updatedContent.movieLinks);
        updatedContent.movieLinks = JSON.stringify(sortLinksBySize([...existing, ...newLinks]));
      } else if (updatedContent.type === 'series' && updatedContent.seasons) {
        try {
          const seasons: Season[] = JSON.parse(updatedContent.seasons);
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
            
            {scanning ? (
              <div className="bg-zinc-100 dark:bg-zinc-800/50 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Scanning Progress</div>
                  <div className="text-sm font-mono text-emerald-500">{scanProgress} / {scanTotal}</div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => scanLinks(false)}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap shadow-lg shadow-emerald-500/20"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {scanStatus === 'idle' ? 'Start Deep Scan' : 'Restart Deep Scan'}
              </button>
            )}
            
            <button
              onClick={() => {
                setModalInput('');
                setModalAutoStart(false);
                setModalTitle('Manual Link Checker');
                setIsLinkCheckerModalOpen(true);
              }}
              className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap border border-zinc-300 dark:border-zinc-700"
            >
              <Search className="w-4 h-4" />
              Manual Check
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:justify-end">
            {scanning ? (
              <button
                onClick={cancelScan}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap border border-red-500/20"
              >
                <StopCircle className="w-4 h-4" />
                Cancel Scan
              </button>
            ) : (
              errorLinks.length > 0 && (
                <button
                  onClick={() => scanLinks(true)}
                  disabled={loading}
                  className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap border border-zinc-300 dark:border-zinc-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  Re-check Filtered ({filteredAndSortedLinks.length})
                </button>
              )
            )}
          </div>
        </div>
      </div>

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

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          {scanning && errorLinks.length > 0 && (
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
                  <div>
                    <div className="text-zinc-900 dark:text-white font-medium">Scanning in progress...</div>
                    <div className="text-xs text-zinc-500">Checking links: {scanProgress} / {scanTotal}</div>
                  </div>
                </div>
                <div className="text-emerald-500 font-bold font-mono">{Math.round((scanProgress / scanTotal) * 100)}%</div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-emerald-500 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(scanProgress / scanTotal) * 100}%` }}
                />
              </div>
            </div>
          )}
          {errorLinks.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">
              {scanning ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-24 h-24 mb-6">
                    <RefreshCw className="w-24 h-24 animate-spin text-emerald-500/20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-emerald-500">{Math.round((scanProgress / scanTotal) * 100)}%</span>
                    </div>
                  </div>
                  <p className="text-xl text-zinc-900 dark:text-white font-medium">Scanning links... {scanProgress} / {scanTotal}</p>
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
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  <select
                    value={filterErrorType}
                    onChange={(e) => setFilterErrorType(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
                  >
                    <option value="all">All Errors</option>
                    {uniqueErrorTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
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
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Date</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Content</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Location</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Link Name</th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap">Error Type</th>
                      <th className="px-6 py-4 font-medium text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filteredAndSortedLinks.map((info, i) => (
                      <tr key={i} className="hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-zinc-600 dark:text-zinc-300">
                          {info.createdAt ? new Date(info.createdAt).toLocaleDateString() : 'N/A'}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {info.createdAt ? new Date(info.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-zinc-900 dark:text-white">{info.contentTitle}</div>
                        <div className="text-xs text-zinc-500 uppercase">{info.contentType}</div>
                      </td>
                      <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">{info.location}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-600 dark:text-zinc-300">{info.link.name}</span>
                          <span className="text-xs text-zinc-500">({info.link.size}{info.link.unit})</span>
                        </div>
                        <a href={info.link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 hover:underline flex items-center gap-1 mt-1 truncate max-w-[200px]">
                          {info.link.url} <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-red-400 font-medium">{info.errorCategory}</div>
                        <div className="text-[10px] text-zinc-500 mt-1">{info.errorDetail}</div>
                        {info.fetchedSize && (
                          <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Server reports: {info.fetchedSize} {info.fetchedUnit}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const content = contentList.find(c => c.id === info.contentId);
                              if (content) {
                                setAddLinksContent(content);
                                setIsAddLinksModalOpen(true);
                              }
                            }}
                            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white p-1.5 rounded-lg transition-colors"
                            title="Add Links"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditClick(info)}
                            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white p-1.5 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLink(info)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-1.5 rounded-lg transition-colors"
                            title="Delete Link"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}

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
                <div>
                  <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Paste Links (JSON or Name:URL format)</label>
                  <textarea
                    value={addLinksInput}
                    onChange={(e) => setAddLinksInput(e.target.value)}
                    placeholder='[{"name":"720p","url":"..."},...]'
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 h-40 font-mono text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsAddLinksModalOpen(false)}
                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white py-3 rounded-xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddLinks}
                    disabled={addingLinks || !addLinksInput.trim()}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {addingLinks ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {addingLinks ? 'Adding...' : 'Add Links'}
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
                  <div className="text-zinc-900 dark:text-white font-medium">{editingLink.contentTitle} <span className="text-zinc-500 text-sm">({editingLink.location})</span></div>
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
