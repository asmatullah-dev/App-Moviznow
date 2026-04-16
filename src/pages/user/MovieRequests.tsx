import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, limit, where, getDocs, updateDoc, doc, arrayUnion, increment } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Film, Plus, Search, Clock, CheckCircle2, XCircle, MessageCircle, ArrowLeft, Tv, AlertCircle, Eye, ShoppingCart } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../../components/ThemeToggle';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { smartSearch } from '../../utils/searchUtils';
import { format } from 'date-fns';
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
  linkedContentId?: string;
}

export default function MovieRequests() {
  const { profile } = useAuth();
  const { cart } = useCart();
  const [requests, setRequests] = useState<MovieRequest[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({ title: '', type: 'movie' as 'movie' | 'series' });
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [userRequestCount, setUserRequestCount] = useState(0);

  useModalBehavior(isRequestModalOpen, () => setIsRequestModalOpen(false));

  const MAX_REQUESTS_PER_USER = 3;

  useEffect(() => {
    if (!profile) return;

    const fetchRequests = async () => {
      try {
        const q = query(
          collection(db, 'movie_requests'), 
          where('userId', '==', profile.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MovieRequest));
        setRequests(data);
        setLoading(false);

        if (profile) {
          const count = data.filter(r => r.userId === profile.uid).length;
          setUserRequestCount(count);
        }
      } catch (error) {
        console.error("Requests fetch error:", error);
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'movie_requests');
      }
    };
    fetchRequests();
  }, [profile]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newRequest.title.trim() || submitting) return;

    if (userRequestCount >= MAX_REQUESTS_PER_USER) {
      alert(`You can only have ${MAX_REQUESTS_PER_USER} active requests at a time.`);
      return;
    }

    setSubmitting(true);
    try {
      // Check if this movie is already requested
      const existingRequest = requests.find(r => r.title.toLowerCase() === newRequest.title.toLowerCase() && r.type === newRequest.type);

      if (existingRequest) {
        if (existingRequest.requestedBy.includes(profile.uid)) {
          alert("You have already requested this movie.");
        } else {
          // Add user to existing request
          await updateDoc(doc(db, 'movie_requests', existingRequest.id), {
            requestedBy: arrayUnion(profile.uid),
            requestCount: increment(1)
          });
          alert("Your vote has been added to this request!");
        }
      } else {
        // Create new request
        await addDoc(collection(db, 'movie_requests'), {
          title: newRequest.title.trim(),
          type: newRequest.type,
          userId: profile.uid,
          userEmail: profile.email,
          userName: profile.displayName || 'User',
          status: 'pending',
          createdAt: new Date().toISOString(),
          requestedBy: [profile.uid],
          requestCount: 1
        });
        alert("Request submitted successfully!");
      }

      setNewRequest({ title: '', type: 'movie' });
      setIsRequestModalOpen(false);
    } catch (error) {
      console.error("Error submitting request:", error);
      alert("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpvote = async (requestId: string) => {
    if (!profile) return;
    const request = requests.find(r => r.id === requestId);
    if (!request || request.requestedBy.includes(profile.uid)) return;

    try {
      await updateDoc(doc(db, 'movie_requests', requestId), {
        requestedBy: arrayUnion(profile.uid),
        requestCount: increment(1)
      });
    } catch (error) {
      console.error("Error upvoting:", error);
    }
  };

  const filteredRequests = search.trim() ? smartSearch(requests, search) : requests;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-500" />
              Movie Requests
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {((profile?.role === 'selected_content' && profile?.status !== 'expired') || profile?.status === 'pending') && (
              <Link to="/cart" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors relative" title="Cart">
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                    {cart.length}
                  </span>
                )}
              </Link>
            )}
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Request New
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Info Box */}
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-8 flex items-start gap-4 transition-colors duration-300">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <AlertCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-200">How it works</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Can't find what you're looking for? Request it here!
            </p>
            <div className="mt-3 flex items-center gap-4">
              <span className="text-xs font-medium px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                Your Requests: {userRequestCount} / {MAX_REQUESTS_PER_USER}
              </span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search existing requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
          />
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">No requests found</p>
            <button 
              onClick={() => setIsRequestModalOpen(true)}
              className="mt-4 text-emerald-500 hover:underline font-medium"
            >
              Be the first to request a movie!
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <div 
                key={request.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between group hover:border-zinc-300 dark:hover:border-zinc-300 dark:border-zinc-700 transition-colors shadow-sm"
              >
            <div className="flex items-center gap-4">
              <div className={clsx(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                request.type === 'movie' ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
              )}>
                {request.type === 'movie' ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
                  {request.title}
                  {request.status === 'completed' && (
                    <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Available
                    </span>
                  )}
                  {request.status === 'rejected' && (
                    <span className="bg-red-500/10 text-red-500 text-[10px] px-2 py-0.5 rounded-full border border-red-500/20 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Rejected
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  <span className="capitalize">{request.type}</span>
                  <span>•</span>
                  <span>{format(new Date(request.createdAt), 'MMM dd, yyyy')}</span>
                </div>
                {(request as any).adminComment && (
                  <div className="mt-2 p-2 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 italic transition-colors">
                    <span className="text-zinc-600 dark:text-zinc-500 font-bold not-italic mr-1">Admin:</span>
                    {(request as any).adminComment}
                  </div>
                )}
              </div>
            </div>

                <div className="flex items-center gap-3">
                  {request.status === 'completed' && request.linkedContentId && (
                    <Link
                      to={`/movie/${request.linkedContentId}`}
                      className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Link>
                  )}
                  {request.status === 'pending' && (
                    <button
                      onClick={() => handleUpvote(request.id)}
                      disabled={request.requestedBy.includes(profile?.uid || '')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                        request.requestedBy.includes(profile?.uid || '')
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-default"
                          : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white"
                      )}
                    >
                      {request.requestedBy.includes(profile?.uid || '') ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Requested
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Me Too
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Request Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative transition-colors duration-300 shadow-2xl">
            <button 
              onClick={() => setIsRequestModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>

            <h3 className="text-xl font-bold mb-2 text-zinc-900 dark:text-white">Request Movie/Series</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
              Please provide the exact title of the movie or series you want to request.
            </p>

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewRequest(prev => ({ ...prev, type: 'movie' }))}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all duration-300",
                      newRequest.type === 'movie' 
                        ? "bg-blue-500/10 border-blue-500 text-blue-500" 
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-300 dark:border-zinc-700"
                    )}
                  >
                    <Film className="w-4 h-4" />
                    Movie
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRequest(prev => ({ ...prev, type: 'series' }))}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all duration-300",
                      newRequest.type === 'series' 
                        ? "bg-purple-500/10 border-purple-500 text-purple-500" 
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-300 dark:border-zinc-700"
                    )}
                  >
                    <Tv className="w-4 h-4" />
                    Series
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Title</label>
                <input
                  type="text"
                  required
                  placeholder="Enter movie or series title..."
                  value={newRequest.title}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors duration-300"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !newRequest.title.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors duration-300 mt-4"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
