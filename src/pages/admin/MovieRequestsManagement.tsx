import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, Search, Clock, CheckCircle2, XCircle, MessageCircle, Trash2, Tv, Filter, User, Mail, Calendar, ArrowUp, ArrowDown, Plus, X, Eye, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { format } from 'date-fns';
import ConfirmModal from '../../components/ConfirmModal';
import CommentModal from '../../components/CommentModal';
import { useModalBehavior } from '../../hooks/useModalBehavior';

interface MovieRequest {
  id: string;
  title: string;
  type: 'movie' | 'series';
  userId: string;
  userEmail: string;
  userName: string;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: string;
  requestedBy: string[];
  requestCount: number;
  adminComment?: string;
}

export default function MovieRequestsManagement() {
  const { profile } = useAuth();
  const { contentList: allContent } = useContent();
  const [requests, setRequests] = useState<MovieRequest[]>([]);
  const [search, setSearch] = useState(() => sessionStorage.getItem('requests_mgmt_search') || '');
  const [contentSearch, setContentSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>(() => sessionStorage.getItem('requests_mgmt_status') || 'all');
  const [filterType, setFilterType] = useState<string>(() => sessionStorage.getItem('requests_mgmt_type') || 'all');
  const [sortBy, setSortBy] = useState<'count' | 'date'>(() => (sessionStorage.getItem('requests_mgmt_sort_by') as any) || 'count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => (sessionStorage.getItem('requests_mgmt_sort_order') as any) || 'desc');

  useEffect(() => {
    sessionStorage.setItem('requests_mgmt_search', search);
    sessionStorage.setItem('requests_mgmt_status', filterStatus);
    sessionStorage.setItem('requests_mgmt_type', filterType);
    sessionStorage.setItem('requests_mgmt_sort_by', sortBy);
    sessionStorage.setItem('requests_mgmt_sort_order', sortOrder);
  }, [search, filterStatus, filterType, sortBy, sortOrder]);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [requestToComment, setRequestToComment] = useState<MovieRequest | null>(null);

  useModalBehavior(isDeleteModalOpen, () => setIsDeleteModalOpen(false));
  useModalBehavior(isPickerOpen, () => setIsPickerOpen(false));
  useModalBehavior(!!requestToComment, () => setRequestToComment(null));

  useEffect(() => {
    const q = query(collection(db, 'movie_requests'), orderBy(sortBy === 'count' ? 'requestCount' : 'createdAt', sortOrder));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MovieRequest));
      setRequests(data);
      setLoading(false);
    }, (error) => {
      console.error("Requests snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'movie_requests');
    });

    return () => unsub();
  }, [sortBy, sortOrder]);

  const handleUpdateStatus = async (requestId: string, status: 'completed' | 'rejected' | 'pending') => {
    try {
      await updateDoc(doc(db, 'movie_requests', requestId), { status });
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status.");
    }
  };

  const handleUpdateComment = async (requestId: string, comment: string) => {
    try {
      await updateDoc(doc(db, 'movie_requests', requestId), { adminComment: comment });
    } catch (error) {
      console.error("Error updating comment:", error);
      alert("Failed to update comment.");
    }
  };

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    try {
      await deleteDoc(doc(db, 'movie_requests', requestToDelete));
      setIsDeleteModalOpen(false);
      setRequestToDelete(null);
    } catch (error) {
      console.error("Error deleting request:", error);
      alert("Failed to delete request.");
    }
  };

  const handleSelectContent = async (contentId: string) => {
    if (!selectedRequestId) return;
    setIsSelecting(contentId);
    try {
      await updateDoc(doc(db, 'movie_requests', selectedRequestId), { 
        status: 'completed',
        linkedContentId: contentId 
      });
      setIsPickerOpen(false);
      setSelectedRequestId(null);
      setContentSearch('');
    } catch (error) {
      console.error("Error linking content:", error);
      alert("Failed to link content.");
    } finally {
      setIsSelecting(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) || 
                         r.userName.toLowerCase().includes(search.toLowerCase()) ||
                         r.userEmail.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchesType = filterType === 'all' || r.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <MessageCircle className="w-7 h-7 text-emerald-500" />
            Movie Requests Management
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Manage and respond to user movie requests.</p>
        </div>

        <div className="flex items-center gap-4 bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-2 rounded-2xl">
          <div className="flex flex-col items-center px-4 border-r border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total</span>
            <span className="text-xl font-bold text-zinc-900 dark:text-white">{requests.length}</span>
          </div>
          <div className="flex flex-col items-center px-4 border-r border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Pending</span>
            <span className="text-xl font-bold text-yellow-500">{requests.filter(r => r.status === 'pending').length}</span>
          </div>
          <div className="flex flex-col items-center px-4">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Completed</span>
            <span className="text-xl font-bold text-emerald-500">{requests.filter(r => r.status === 'completed').length}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search title, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Types</option>
            <option value="movie">Movies</option>
            <option value="series">Series</option>
          </select>
        </div>

        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="count">Sort by Popularity</option>
            <option value="date">Sort by Date</option>
          </select>

          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Request Details</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">User Info</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-zinc-500">
                    <Film className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No movie requests found matching your filters.</p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-zinc-200 dark:hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white",
                          request.type === 'movie' ? "bg-blue-500/90" : "bg-purple-500/90"
                        )}>
                          {request.type === 'movie' ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-100">{request.title}</p>
                          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{request.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                          <User className="w-3 h-3 text-zinc-500" />
                          {request.userName}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                          <Mail className="w-3 h-3" />
                          {request.userEmail}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(request.createdAt), 'MMM dd, yyyy HH:mm')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={request.status}
                        onChange={(e) => handleUpdateStatus(request.id, e.target.value as any)}
                        className={clsx(
                          "text-xs font-bold px-3 py-1.5 rounded-lg border focus:outline-none transition-colors w-20 text-zinc-100",
                          request.status === 'pending' && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                          request.status === 'completed' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                          request.status === 'rejected' && "bg-red-500/10 text-red-500 border-red-500/20"
                        )}
                      >
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 transition-opacity">
                        {request.status === 'completed' && (request as any).linkedContentId && (
                          <a
                            href={`/movie/${(request as any).linkedContentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="View Content"
                          >
                            <Eye className="w-5 h-5" />
                          </a>
                        )}
                        {request.status === 'pending' && (
                          <button
                            onClick={() => {
                              setSelectedRequestId(request.id);
                              setIsPickerOpen(true);
                            }}
                            className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Select from Existing"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setRequestToComment(request);
                          }}
                          className="p-2 text-zinc-500 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="Add Comment"
                        >
                          <MessageSquare className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setRequestToDelete(request.id);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete Request"
                        >
                          <Trash2 className="w-5 h-5" />
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

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Delete Request"
        message="Are you sure you want to delete this movie request? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDeleteRequest}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      {requestToComment && (
        <CommentModal
          isOpen={!!requestToComment}
          onClose={() => setRequestToComment(null)}
          onSave={(comment) => handleUpdateComment(requestToComment.id, comment)}
          initialComment={requestToComment.adminComment || ''}
        />
      )}

      {/* Content Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] relative">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-lg font-bold">Select Existing Content</h2>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPickerOpen(false);
                }} 
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search movies or series..."
                  value={contentSearch}
                  onChange={(e) => setContentSearch(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {allContent
                .filter(c => c.title.toLowerCase().includes(contentSearch.toLowerCase()))
                .slice(0, 20)
                .map(item => (
                  <button
                    key={item.id}
                    disabled={isSelecting !== null}
                    onClick={() => handleSelectContent(item.id)}
                    className={clsx(
                      "w-full p-2 flex items-center gap-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left",
                      isSelecting === item.id && "bg-emerald-500/10 border border-emerald-500/50"
                    )}
                  >
                    <img src={item.posterUrl} className="w-10 h-14 object-cover rounded-lg" referrerPolicy="no-referrer" />
                    <div className="flex-1">
                      <p className="font-bold text-sm text-zinc-100">{item.title}</p>
                      <p className="text-[10px] uppercase font-bold flex items-center gap-1.5">
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-white",
                          item.type === 'movie' ? "bg-blue-500/90" : "bg-purple-500/90"
                        )}>
                          {item.type}
                        </span>
                        <span className="text-zinc-500 tracking-wider">• {item.year}</span>
                      </p>
                    </div>
                    {isSelecting === item.id && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent"></div>
                    )}
                  </button>
                ))}
              {allContent.filter(c => c.title.toLowerCase().includes(contentSearch.toLowerCase())).length === 0 && (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  No content found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
