import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, addDoc, getDocs } from 'firebase/firestore';
import { AlertTriangle, Edit2, Trash2, Bell, CheckCircle2, X, Save } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { Content, QualityLinks, Season } from '../../types';
import { LinkCheckerModal } from '../../components/LinkCheckerModal';
import { useModalBehavior } from '../../hooks/useModalBehavior';

interface ReportedLink {
  id: string;
  userId: string;
  userName: string;
  contentId: string;
  contentTitle: string;
  contentType: 'movie' | 'series';
  linkId: string;
  linkName: string;
  linkUrl: string;
  status: 'pending' | 'resolved';
  createdAt: any;
}

export default function ReportedLinks() {
  const [reports, setReports] = useState<ReportedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReport, setEditingReport] = useState<ReportedLink | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editUnit, setEditUnit] = useState<'MB' | 'GB'>('MB');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [isLinkCheckerModalOpen, setIsLinkCheckerModalOpen] = useState(false);

  useModalBehavior(!!editingReport, () => setEditingReport(null));
  useModalBehavior(isLinkCheckerModalOpen, () => setIsLinkCheckerModalOpen(false));

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'reported_links'));
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ReportedLink));
        // Sort by status (pending first) then by date
        data.sort((a, b) => {
          if (a.status === 'pending' && b.status === 'resolved') return -1;
          if (a.status === 'resolved' && b.status === 'pending') return 1;
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setReports(data);
        setLoading(false);
      } catch (error) {
        console.error("Reported links fetch error:", error);
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'reported_links');
      }
    };
    fetchReports();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    try {
      await deleteDoc(doc(db, 'reported_links', id));
      setReports(reports.filter(r => r.id !== id));
    } catch (error) {
      console.error("Error deleting report:", error);
      alert("Failed to delete report");
    }
  };

  const [notifying, setNotifying] = useState<string | null>(null);
  const [notified, setNotified] = useState<string | null>(null);
  const [bgScanning, setBgScanning] = useState(false);

  const handleNotify = async (report: ReportedLink) => {
    setNotifying(report.id);
    try {
      // Create a notification for the user
      await updateDoc(doc(db, 'reported_links', report.id), {
        status: 'resolved'
      });
      setReports(reports.map(r => r.id === report.id ? { ...r, status: 'resolved' } : r));
      
      if (report.userId) {
        // Add a notification to the user's notifications collection
        await addDoc(collection(db, 'notifications'), {
          title: 'Reported Link Fixed',
          body: `The link "${report.linkName}" for ${report.contentTitle} has been fixed and is now working.`,
          contentId: report.contentId,
          type: report.contentType,
          createdAt: new Date().toISOString(),
          createdBy: 'system',
          targetUserId: report.userId // This already targets the specific user
        });
      }
      
      setNotified(report.id);
      setTimeout(() => setNotified(null), 3000); // Reset after 3 seconds
    } catch (error) {
      console.error("Error notifying user:", error);
      alert("Failed to notify user");
    } finally {
      setNotifying(null);
    }
  };

  const parseLinks = (linksStr: string | undefined): QualityLinks => {
    if (!linksStr) return [];
    try {
      const parsed = JSON.parse(linksStr);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.error("Error parsing links", e);
    }
    return [];
  };

  const handleEditClick = async (report: ReportedLink) => {
    try {
      const contentDoc = await getDoc(doc(db, 'content', report.contentId));
      if (!contentDoc.exists()) {
        alert("Content not found");
        return;
      }
      const content = contentDoc.data() as Content;
      
      let foundLink: any = null;

      if (content.type === 'movie' && content.movieLinks) {
        const links = parseLinks(content.movieLinks);
        foundLink = links.find(l => l.id === report.linkId);
      } else if (content.type === 'series' && content.seasons) {
        const seasons = (Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]')) as Season[];
        for (const season of seasons) {
          if (season.zipLinks) {
            foundLink = season.zipLinks.find(l => l.id === report.linkId);
            if (foundLink) break;
          }
          if (season.mkvLinks) {
            foundLink = season.mkvLinks.find(l => l.id === report.linkId);
            if (foundLink) break;
          }
          if (season.episodes) {
            for (const ep of season.episodes) {
              if (ep.links) {
                foundLink = ep.links.find(l => l.id === report.linkId);
                if (foundLink) break;
              }
            }
          }
          if (foundLink) break;
        }
      }

      if (foundLink) {
        setEditUrl(foundLink.url);
        setEditSize(foundLink.size || '');
        setEditUnit(foundLink.unit || 'MB');
        setEditName(foundLink.name || '');
        setEditingReport(report);
      } else {
        alert("Link not found in content. It might have been deleted already.");
      }
    } catch (error) {
      console.error("Error fetching content for edit:", error);
      alert("Failed to fetch content details");
    }
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
    if (!editingReport) return;
    setSaving(true);

    try {
      const contentRef = doc(db, 'content', editingReport.contentId);
      const contentDoc = await getDoc(contentRef);
      
      if (!contentDoc.exists()) {
        throw new Error("Content not found");
      }

      const content = contentDoc.data() as Content;
      let updated = false;

      if (content.type === 'movie' && content.movieLinks) {
        const links = parseLinks(content.movieLinks);
        const linkIndex = links.findIndex(l => l.id === editingReport.linkId);
        if (linkIndex !== -1) {
          links[linkIndex] = { ...links[linkIndex], url: editUrl, size: editSize, unit: editUnit, name: editName };
          await updateDoc(contentRef, { movieLinks: JSON.stringify(links) });
          updated = true;
        }
      } else if (content.type === 'series' && content.seasons) {
        const seasons = (Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]')) as Season[];
        for (let s = 0; s < seasons.length; s++) {
          const season = seasons[s];
          
          if (season.zipLinks) {
            const idx = season.zipLinks.findIndex(l => l.id === editingReport.linkId);
            if (idx !== -1) {
              season.zipLinks[idx] = { ...season.zipLinks[idx], url: editUrl, size: editSize, unit: editUnit, name: editName };
              updated = true;
              break;
            }
          }
          if (season.mkvLinks) {
            const idx = season.mkvLinks.findIndex(l => l.id === editingReport.linkId);
            if (idx !== -1) {
              season.mkvLinks[idx] = { ...season.mkvLinks[idx], url: editUrl, size: editSize, unit: editUnit, name: editName };
              updated = true;
              break;
            }
          }
          if (season.episodes) {
            for (let e = 0; e < season.episodes.length; e++) {
              const ep = season.episodes[e];
              if (ep.links) {
                const idx = ep.links.findIndex(l => l.id === editingReport.linkId);
                if (idx !== -1) {
                  ep.links[idx] = { ...ep.links[idx], url: editUrl, size: editSize, unit: editUnit, name: editName };
                  updated = true;
                  break;
                }
              }
            }
            if (updated) break;
          }
        }
        if (updated) {
          await updateDoc(contentRef, { seasons: JSON.stringify(seasons) });
        }
      }

      if (updated) {
        // Mark report as resolved
        await updateDoc(doc(db, 'reported_links', editingReport.id), {
          status: 'resolved'
        });
        setEditingReport(null);
        alert("Link updated successfully");
      } else {
        alert("Could not find the link to update in the content document.");
      }
    } catch (error) {
      console.error("Error saving edited link:", error);
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          Reported Links
        </h1>
        <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <span className="text-zinc-500 dark:text-zinc-400">Total Reports: </span>
          <span className="text-zinc-900 dark:text-white font-bold">{reports.length}</span>
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-medium whitespace-nowrap">User</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">Content</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">Link Name</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">Status</th>
                <th className="px-6 py-4 font-medium text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No reported links found.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-900 dark:text-white">{report.userName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-900 dark:text-white">{report.contentTitle}</div>
                      <div className="text-xs text-zinc-500 capitalize">{report.contentType}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-600 dark:text-zinc-300">{report.linkName}</div>
                      <div className="text-xs text-zinc-500 truncate max-w-[200px]" title={report.linkUrl}>
                        {report.linkUrl}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {report.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleNotify(report)}
                          disabled={notifying === report.id || notified === report.id}
                          className={`p-2 rounded-lg transition-colors ${
                            notified === report.id 
                              ? 'text-emerald-500 bg-emerald-500/10' 
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10'
                          }`}
                          title="Notify User"
                        >
                          {notifying === report.id ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : notified === report.id ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Bell className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleEditClick(report)}
                          className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="Edit Link"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(report.id)}
                          className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete Report"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-6 max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Edit Link</h3>
              <button
                onClick={() => setEditingReport(null)}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Content</label>
                <div className="text-zinc-900 dark:text-white font-medium">{editingReport.contentTitle}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Link Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    onBlur={(e) => handleUrlBlur(e.target.value)}
                    className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => setIsLinkCheckerModalOpen(true)}
                    className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-4 py-3 rounded-xl font-medium transition-colors whitespace-nowrap"
                  >
                    Check Link
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Size</label>
                  <input
                    type="text"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. 1.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Unit</label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value as 'MB' | 'GB')}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setEditingReport(null)}
                className="px-6 py-2.5 rounded-xl font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editUrl.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <LinkCheckerModal 
        isOpen={isLinkCheckerModalOpen} 
        onClose={() => setIsLinkCheckerModalOpen(false)} 
        initialInput={editUrl}
        autoStart={!!editUrl}
        onAddLinks={(links) => {
          if (links.length > 0) {
            setEditUrl(links[0].url);
            if (links[0].size) setEditSize(links[0].size.toString());
            if (links[0].unit) setEditUnit(links[0].unit as 'MB' | 'GB');
          }
          setIsLinkCheckerModalOpen(false);
        }}
      />
    </div>
  );
}
