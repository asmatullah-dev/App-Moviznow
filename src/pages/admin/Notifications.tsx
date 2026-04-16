import React, { useState, useEffect } from "react";
import { useUsers } from "../../contexts/UsersContext";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  where,
  limit,
} from "firebase/firestore";
import { db } from "../../firebase";
import { AppNotification, NotificationTemplate, UserProfile } from "../../types";
import { Bell, Trash2, Search, Calendar, Loader2, Plus, Send, User, Users, FileText, X, ChevronRight, Edit2, ExternalLink, Info, Check, Clock } from "lucide-react";
import { format, isToday, formatDistanceToNow } from "date-fns";
import ConfirmModal from "../../components/ConfirmModal";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import Button from "../../components/Button";
import Modal from "../../components/Modal";

const APP_PAGES = [
  { name: 'Home', url: '/' },
  { name: 'Watch Later', url: '/watch-later' },
  { name: 'Favorites', url: '/favorites' },
  { name: 'Movie Requests', url: '/requests' },
  { name: 'Top Up', url: '/top-up' },
  { name: 'Cart', url: '/cart' },
  { name: 'Settings', url: '/settings' },
  { name: 'Install App', url: '/app' },
];

const USER_CACHE_KEY = 'moviznow_admin_user_cache';
const USER_CACHE_EXPIRY = 1000 * 60 * 60; // 1 hour

export default function Notifications() {
  const { users: allUsers } = useUsers();
  const [activeTab, setActiveTab] = useState<'history' | 'templates'>('history');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  // Details Modal State
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  // Template Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ 
    name: '', 
    title: '', 
    body: '',
    buttonLabel: '',
    buttonUrl: ''
  });

  // Send Modal State
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ 
    title: '', 
    body: '', 
    targetType: 'all' as 'all' | 'specific',
    targetUserIds: [] as string[],
    targetUserNames: [] as string[],
    buttonLabel: '',
    buttonUrl: '',
    useCustomLink: false
  });
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserProfile[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [showUserList, setShowUserList] = useState(false);

  useModalBehavior(!!deleteId, () => setDeleteId(null));
  useModalBehavior(!!deleteTemplateId, () => setDeleteTemplateId(null));
  useModalBehavior(isTemplateModalOpen, () => setIsTemplateModalOpen(false));
  useModalBehavior(isSendModalOpen, () => setIsSendModalOpen(false));
  useModalBehavior(!!selectedNotification, () => setSelectedNotification(null));

  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as AppNotification);
      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "notification_templates"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as NotificationTemplate);
      setTemplates(data);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const searchUsers = () => {
      if (userSearchTerm.length === 0) {
        setUserSearchResults(allUsers);
        return;
      }

      // Search in the synced allUsers state
      const filtered = allUsers.filter((u: any) => 
        (u.displayName?.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (u.phone?.includes(userSearchTerm))
      );
      
      setUserSearchResults(filtered);
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [userSearchTerm, allUsers]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setProcessing(prev => ({ ...prev, delete: true }));
    try {
      await deleteDoc(doc(db, "notifications", deleteId));
    } catch (error) {
      console.error("Error deleting notification:", error);
    } finally {
      setProcessing(prev => ({ ...prev, delete: false }));
      setDeleteId(null);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    setProcessing(prev => ({ ...prev, deleteTemplate: true }));
    try {
      await deleteDoc(doc(db, "notification_templates", deleteTemplateId));
    } catch (error) {
      console.error("Error deleting template:", error);
    } finally {
      setProcessing(prev => ({ ...prev, deleteTemplate: false }));
      setDeleteTemplateId(null);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(prev => ({ ...prev, saveTemplate: true }));
    try {
      if (editingTemplate) {
        await updateDoc(doc(db, "notification_templates", editingTemplate.id), {
          ...templateForm
        });
      } else {
        await addDoc(collection(db, "notification_templates"), {
          ...templateForm,
          createdAt: new Date().toISOString()
        });
      }
      setIsTemplateModalOpen(false);
      setTemplateForm({ name: '', title: '', body: '', buttonLabel: '', buttonUrl: '' });
      setEditingTemplate(null);
    } catch (error) {
      console.error("Error saving template:", error);
    } finally {
      setProcessing(prev => ({ ...prev, saveTemplate: false }));
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(prev => ({ ...prev, send: true }));
    try {
      const notificationData: any = {
        title: sendForm.title,
        body: sendForm.body,
        targetUserIds: sendForm.targetType === 'specific' ? sendForm.targetUserIds : null,
        targetUserNames: sendForm.targetType === 'specific' ? sendForm.targetUserNames : null,
        buttonLabel: sendForm.buttonLabel || null,
        buttonUrl: sendForm.buttonUrl || null,
        createdAt: new Date().toISOString(),
        createdBy: 'admin'
      };

      // Backward compatibility for single user
      if (sendForm.targetType === 'specific' && sendForm.targetUserIds.length === 1) {
        notificationData.targetUserId = sendForm.targetUserIds[0];
      }

      await addDoc(collection(db, "notifications"), notificationData);

      // Send push notification via API
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sendForm.title,
          body: sendForm.body,
          targetUserIds: sendForm.targetType === 'specific' ? sendForm.targetUserIds : undefined,
          buttonLabel: sendForm.buttonLabel,
          buttonUrl: sendForm.buttonUrl
        })
      });

      setIsSendModalOpen(false);
      setSendForm({ 
        title: '', 
        body: '', 
        targetType: 'all', 
        targetUserIds: [], 
        targetUserNames: [],
        buttonLabel: '',
        buttonUrl: '',
        useCustomLink: false
      });
    } catch (error) {
      console.error("Error sending notification:", error);
    } finally {
      setProcessing(prev => ({ ...prev, send: false }));
    }
  };

  const handleBulkSelect = (criteria: string) => {
    let usersToAdd: UserProfile[] = [];
    
    switch (criteria) {
      case 'pending':
        usersToAdd = allUsers.filter(u => u.status === 'pending');
        break;
      case 'expiry':
        usersToAdd = allUsers.filter(u => u.status === 'expired');
        break;
      case 'active':
        usersToAdd = allUsers.filter(u => u.status === 'active');
        break;
      case 'user':
        usersToAdd = allUsers.filter(u => u.role === 'user');
        break;
      case 'selected_content':
        usersToAdd = allUsers.filter(u => u.assignedContent && u.assignedContent.length > 0);
        break;
    }

    if (usersToAdd.length === 0) return;

    const newIds = new Set(sendForm.targetUserIds);
    const newNamesMap = new Map(sendForm.targetUserIds.map((id, idx) => [id, sendForm.targetUserNames[idx]]));

    let allAlreadySelected = usersToAdd.every(u => newIds.has(u.uid));

    if (allAlreadySelected) {
      // Unselect them
      usersToAdd.forEach(u => {
        newIds.delete(u.uid);
        newNamesMap.delete(u.uid);
      });
    } else {
      // Select them
      usersToAdd.forEach(u => {
        newIds.add(u.uid);
        newNamesMap.set(u.uid, u.displayName || u.email);
      });
    }

    setSendForm(prev => ({
      ...prev,
      targetUserIds: Array.from(newIds),
      targetUserNames: Array.from(newIds).map(id => newNamesMap.get(id) || '')
    }));
  };

  const filteredNotifications = notifications.filter(
    (n) =>
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.body.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const notificationsToday = notifications.filter((n) =>
    isToday(new Date(n.createdAt)),
  ).length;

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-500">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white transition-colors duration-300">
            <Bell className="w-6 h-6 text-blue-500" />
            Notifications
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm transition-colors duration-300">
            Manage push notifications and templates
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsSendModalOpen(true)}
            variant="blue"
            className="flex items-center gap-2 py-1.5 px-3 text-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Send Notification
          </Button>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 flex items-center gap-3 transition-colors duration-300">
            <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white transition-colors duration-300">
                {notificationsToday}
              </div>
              <div className="text-[9px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold transition-colors duration-300">
                Sent Today
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('history')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-white dark:bg-zinc-800 text-blue-500 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'templates' ? 'bg-white dark:bg-zinc-800 text-blue-500 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
        >
          Templates
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-280px)] transition-colors duration-300">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500 text-zinc-900 dark:text-white text-sm transition-colors duration-300"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 transition-colors duration-300">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No notifications found</p>
              </div>
            ) : (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex gap-4 transition-colors duration-300"
                >
                  {notification.posterUrl ? (
                    <img 
                      src={notification.posterUrl} 
                      alt="Poster" 
                      className="w-12 h-16 object-cover rounded-md shrink-0 border border-zinc-200 dark:border-zinc-800"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-zinc-100 dark:bg-zinc-900 rounded-md shrink-0 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                      <Bell className="w-5 h-5 text-zinc-600" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white leading-tight transition-colors duration-300">
                        {notification.title}
                      </h4>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${notification.targetUserId || notification.targetUserIds ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                          {notification.targetUserId || notification.targetUserIds ? 'Targeted' : 'Global'}
                        </span>
                        <button
                          onClick={() => setSelectedNotification(notification)}
                          className="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(notification.id)}
                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          disabled={processing.delete}
                        >
                          {processing.delete && deleteId === notification.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2 transition-colors duration-300">
                      {notification.body}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                        <span className="text-[10px] text-zinc-400 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                          {format(new Date(notification.createdAt), "MMM dd, yyyy HH:mm")}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                        {notification.buttonLabel ? 'Custom Action' : 
                         notification.type === 'movie' || notification.title.includes('Movie') ? 'View Movie' : 
                         notification.type === 'series' || notification.title.includes('Series') ? 'View Series' : 
                         'View Content'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingTemplate(null);
                setTemplateForm({ name: '', title: '', body: '', buttonLabel: '', buttonUrl: '' });
                setIsTemplateModalOpen(true);
              }}
              variant="secondary"
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Template
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.length === 0 ? (
              <div className="col-span-full text-center py-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-500">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No templates created yet</p>
              </div>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-blue-500/50 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setSendForm({
                            title: template.title,
                            body: template.body,
                            targetType: 'all',
                            targetUserIds: [],
                            targetUserNames: [],
                            buttonLabel: template.buttonLabel || '',
                            buttonUrl: template.buttonUrl || '',
                            useCustomLink: !!template.buttonUrl
                          });
                          setIsSendModalOpen(true);
                        }}
                        className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Use Template"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingTemplate(template);
                          setTemplateForm({
                            name: template.name,
                            title: template.title,
                            body: template.body,
                            buttonLabel: template.buttonLabel || '',
                            buttonUrl: template.buttonUrl || ''
                          });
                          setIsTemplateModalOpen(true);
                        }}
                        className="p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Edit Template"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTemplateId(template.id)}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-zinc-900 dark:text-white mb-1">{template.name}</h3>
                  <p className="text-xs text-zinc-500 mb-3 line-clamp-1">{template.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{template.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Send Notification Modal */}
      <Modal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        title="Send Notification"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSendNotification} className="space-y-4">
          <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl mb-4">
            <button
              type="button"
              onClick={() => setSendForm(prev => ({ ...prev, targetType: 'all' }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${sendForm.targetType === 'all' ? 'bg-white dark:bg-zinc-800 text-blue-500 shadow-sm' : 'text-zinc-500'}`}
            >
              <Users className="w-4 h-4" />
              All Users
            </button>
            <button
              type="button"
              onClick={() => setSendForm(prev => ({ ...prev, targetType: 'specific' }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${sendForm.targetType === 'specific' ? 'bg-white dark:bg-zinc-800 text-emerald-500 shadow-sm' : 'text-zinc-500'}`}
            >
              <User className="w-4 h-4" />
              Specific User
            </button>
          </div>

          {sendForm.targetType === 'specific' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-500 uppercase">Target Users ({sendForm.targetUserIds.length})</label>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => handleBulkSelect('pending')}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
                >
                  Pending
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSelect('expiry')}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  Expiry
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSelect('active')}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSelect('user')}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                >
                  User
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSelect('selected_content')}
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                >
                  Selected Content
                </button>
              </div>

              {sendForm.targetUserIds.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-h-32 overflow-y-auto">
                  {sendForm.targetUserIds.map((uid, idx) => (
                    <div key={uid} className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span>{sendForm.targetUserNames[idx]}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newIds = [...sendForm.targetUserIds];
                          const newNames = [...sendForm.targetUserNames];
                          newIds.splice(idx, 1);
                          newNames.splice(idx, 1);
                          setSendForm(prev => ({ ...prev, targetUserIds: newIds, targetUserNames: newNames }));
                        }}
                        className="hover:text-emerald-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search and select users..."
                  value={userSearchTerm}
                  onChange={(e) => {
                    setUserSearchTerm(e.target.value);
                    if (e.target.value.length > 0) setShowUserList(true);
                  }}
                  onFocus={() => setShowUserList(true)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowUserList(!showUserList)}
                  className="absolute right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  title={showUserList ? "Hide list" : "Show list"}
                >
                  {showUserList ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {isSearchingUsers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
                )}
                {showUserList && userSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Select Users</span>
                      <button 
                        type="button"
                        onClick={() => setShowUserList(false)}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600"
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {userSearchResults.map(u => {
                        const isSelected = sendForm.targetUserIds.includes(u.uid);
                        return (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                const idx = sendForm.targetUserIds.indexOf(u.uid);
                                const newIds = [...sendForm.targetUserIds];
                                const newNames = [...sendForm.targetUserNames];
                                newIds.splice(idx, 1);
                                newNames.splice(idx, 1);
                                setSendForm(prev => ({ ...prev, targetUserIds: newIds, targetUserNames: newNames }));
                              } else {
                                setSendForm(prev => ({ 
                                  ...prev, 
                                  targetUserIds: [...prev.targetUserIds, u.uid],
                                  targetUserNames: [...prev.targetUserNames, u.displayName || u.email]
                                }));
                              }
                            }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                          >
                            <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 font-bold">
                              {(u.displayName || u.email)[0].toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-sm text-zinc-900 dark:text-white">{u.displayName || 'No Name'}</div>
                              <div className="text-xs text-zinc-500">{u.email}</div>
                              <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-2">
                                <span>{u.phone || 'No Phone'}</span>
                                <span className="w-1 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
                                <span className="uppercase">{u.role}</span>
                                <span className="w-1 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
                                <span className="capitalize">{u.status}</span>
                              </div>
                            </div>
                            {isSelected ? <Check className="w-4 h-4 text-emerald-500" /> : <Plus className="w-4 h-4 text-zinc-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Title</label>
            <input
              type="text"
              required
              value={sendForm.title}
              onChange={(e) => setSendForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Notification Title"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Message Body</label>
            <textarea
              required
              rows={3}
              value={sendForm.body}
              onChange={(e) => setSendForm(prev => ({ ...prev, body: e.target.value }))}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none"
              placeholder="What would you like to say?"
            />
          </div>

          <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-500 uppercase">Custom Action Button</label>
              <button
                type="button"
                onClick={() => setSendForm(prev => ({ ...prev, useCustomLink: !prev.useCustomLink }))}
                className={`w-10 h-5 rounded-full transition-colors relative ${sendForm.useCustomLink ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${sendForm.useCustomLink ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            {sendForm.useCustomLink && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Button Label</label>
                  <input
                    type="text"
                    value={sendForm.buttonLabel}
                    onChange={(e) => setSendForm(prev => ({ ...prev, buttonLabel: e.target.value }))}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Open Now"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Target Page / URL</label>
                  <div className="grid grid-cols-2 gap-2 mb-2 max-h-24 overflow-y-auto p-1">
                    {APP_PAGES.map(page => (
                      <button
                        key={page.url}
                        type="button"
                        onClick={() => setSendForm(prev => ({ ...prev, buttonUrl: page.url }))}
                        className={`text-[10px] p-2 rounded-lg border text-left transition-all ${sendForm.buttonUrl === page.url ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}
                      >
                        {page.name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={sendForm.buttonUrl}
                    onChange={(e) => setSendForm(prev => ({ ...prev, buttonUrl: e.target.value }))}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="Enter custom URL or select above"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={() => setIsSendModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="blue"
              className="flex-1 flex items-center justify-center gap-2"
              disabled={processing.send || (sendForm.targetType === 'specific' && sendForm.targetUserIds.length === 0)}
            >
              {processing.send ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send to {sendForm.targetType === 'all' ? 'All' : sendForm.targetUserIds.length} Users
            </Button>
          </div>
        </form>
      </Modal>

      {/* Template Modal */}
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title={editingTemplate ? "Edit Template" : "New Template"}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Template Name</label>
            <input
              type="text"
              required
              value={templateForm.name}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. Welcome Message"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Default Title</label>
            <input
              type="text"
              required
              value={templateForm.title}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Notification Title"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Default Body</label>
            <textarea
              required
              rows={3}
              value={templateForm.body}
              onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Message content..."
            />
          </div>

          <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <label className="text-xs font-bold text-zinc-500 uppercase">Default Custom Action</label>
            <div className="space-y-2">
              <input
                type="text"
                value={templateForm.buttonLabel}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, buttonLabel: e.target.value }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                placeholder="Button Label (e.g. Open Now)"
              />
              <input
                type="text"
                value={templateForm.buttonUrl}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, buttonUrl: e.target.value }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                placeholder="Button URL or /page"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={() => setIsTemplateModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="blue"
              className="flex-1 flex items-center justify-center gap-2"
              disabled={processing.saveTemplate}
            >
              {processing.saveTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Notification"
        message="Are you sure you want to delete this notification history?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={processing.delete}
      />

      <ConfirmModal
        isOpen={!!deleteTemplateId}
        title="Delete Template"
        message="Are you sure you want to delete this template?"
        onConfirm={handleDeleteTemplate}
        onCancel={() => setDeleteTemplateId(null)}
        loading={processing.deleteTemplate}
      />

      {/* Details Modal */}
      <Modal
        isOpen={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
        title="Notification Details"
        maxWidth="max-w-md"
      >
        {selectedNotification && (
          <div className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Title</label>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">{selectedNotification.title}</div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Message</label>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                {selectedNotification.body}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Date</label>
                <div className="text-sm font-medium text-zinc-900 dark:text-white">
                  {format(new Date(selectedNotification.createdAt), "MMMM dd, yyyy")}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Time</label>
                <div className="text-sm font-medium text-zinc-900 dark:text-white">
                  {format(new Date(selectedNotification.createdAt), "HH:mm:ss")}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Audience</label>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${selectedNotification.targetUserId || selectedNotification.targetUserIds ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                  {selectedNotification.targetUserId || selectedNotification.targetUserIds ? 'Targeted' : 'Global Broadcast'}
                </span>
                {(selectedNotification.targetUserId || selectedNotification.targetUserIds) && (
                  <span className="text-xs text-zinc-500">
                    {selectedNotification.targetUserIds ? `${selectedNotification.targetUserIds.length} Users` : '1 User'}
                  </span>
                )}
              </div>
              {(selectedNotification.targetUserIds || selectedNotification.targetUserNames) && (
                <div className="mt-2 max-h-32 overflow-y-auto p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 space-y-1">
                  {selectedNotification.targetUserNames ? (
                    selectedNotification.targetUserNames.map((name, idx) => (
                      <div key={idx} className="text-[10px] text-zinc-600 dark:text-zinc-400 font-bold flex items-center gap-2">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                        {name}
                      </div>
                    ))
                  ) : selectedNotification.targetUserIds?.map(uid => (
                    <div key={uid} className="text-[10px] text-zinc-500 font-mono">{uid}</div>
                  ))}
                </div>
              )}
            </div>

            {selectedNotification.buttonLabel && (
              <div className="space-y-2 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                <label className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Custom Action</label>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">{selectedNotification.buttonLabel}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {selectedNotification.buttonUrl}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => setSelectedNotification(null)}
              variant="secondary"
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
