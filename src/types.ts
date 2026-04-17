export type Role = 'owner' | 'admin' | 'user' | 'selected_content' | 'content_manager' | 'trial' | 'user_manager' | 'manager';
export type Status = 'pending' | 'active' | 'expired' | 'suspended';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: Role;
  status: Status;
  phone?: string;
  expiryDate?: string; // ISO string
  assignedContent?: string[]; // Content IDs
  watchLater?: string[];
  favorites?: string[];
  createdAt: string;
  sessionsCount?: number;
  timeSpent?: number; // in minutes
  lastNotificationCheck?: string; // ISO string
  permissions?: string[]; // Specific management access
  managedBy?: string; // UID of the User Manager who added this user
  isUserManager?: boolean; // Flag to keep user in User Managers list even if role changes
  previousStatus?: 'active' | 'pending' | 'suspended' | 'expired'; // Store previous status when manager role changes
  lastActive?: string; // ISO string
  requirePasswordReset?: boolean;
  hasPassword?: boolean;
  sessionId?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  contentId?: string;
  posterUrl?: string;
  type?: 'movie' | 'series' | 'custom';
  createdAt: string;
  createdBy: string;
  targetUserId?: string;
  targetUserIds?: string[];
  targetUserNames?: string[];
  buttonLabel?: string;
  buttonUrl?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  type: 'session_start' | 'content_click' | 'link_click' | 'time_spent';
  userId: string;
  timestamp: string; // ISO string
  contentId?: string;
  contentTitle?: string;
  linkId?: string;
  linkName?: string;
  duration?: number; // for session end
  playerType?: string;
}

export interface Genre {
  id: string;
  name: string;
  order?: number;
}

export interface Language {
  id: string;
  name: string;
  order?: number;
}

export interface Quality {
  id: string;
  name: string;
  order?: number;
  color?: string;
}

export interface LinkDef {
  id: string;
  name: string;
  url: string;
  size: string;
  unit: 'MB' | 'GB';
  tinyUrl?: string;
  season?: number;
  episode?: number;
  isFullSeasonMKV?: boolean;
  isFullSeasonZIP?: boolean;
}

export type QualityLinks = LinkDef[];

export interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  description?: string;
  duration?: string;
  links: QualityLinks;
}

export interface Season {
  id: string;
  seasonNumber: number;
  title?: string;
  year?: number;
  trailerUrl?: string;
  zipLinks: QualityLinks;
  mkvLinks?: QualityLinks;
  episodes: Episode[];
}

export interface Income {
  id: string;
  userId?: string;
  userName?: string;
  amount: number;
  description: string;
  date: string; // ISO string
}

export interface Trailer {
  id: string;
  url: string;
  title: string;
  youtubeTitle?: string; // Added youtubeTitle
  seasonNumber?: number;
}

export interface Content {
  id: string;
  type: 'movie' | 'series';
  title: string;
  description: string;
  posterUrl: string;
  trailerUrl: string;
  trailerTitle?: string; // Added trailerTitle
  trailerYoutubeTitle?: string; // Added trailerYoutubeTitle
  trailerSeasonNumber?: number; // Added trailerSeasonNumber
  trailers?: string; // JSON stringified Trailer[]
  genreIds: string[];
  languageIds: string[];
  qualityId?: string; // Added qualityId
  sampleUrl?: string; // Added sampleUrl
  imdbLink?: string; // Added imdbLink
  cast: string[];
  year: number;
  releaseDate?: string;
  runtime?: string;
  createdAt: string;
  updatedAt: string;
  addedBy?: string; // UID of the Content Manager who added this content
  addedByRole?: Role; // Role of the person who added this content
  status?: 'draft' | 'published' | 'selected_content';
  movieLinks?: string; // JSON stringified QualityLinks
  fullSeasonZip?: string; // JSON stringified QualityLinks
  fullSeasonMkv?: string; // JSON stringified QualityLinks
  seasons?: string; // JSON stringified Season[]
  imdbRating?: string; // Added imdbRating
  subtitles?: boolean; // Added subtitles
  country?: string; // Added country
  order?: number; // Added order for sorting
}

export interface CartItem {
  contentId: string;
  title: string;
  type: 'movie' | 'season';
  seasonId?: string;
  seasonNumber?: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: Role;
  type: 'membership' | 'content';
  amount: number;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  createdAt: string;
  months?: number; // For membership
  items?: CartItem[]; // For content
}

export interface BankAccount {
  id: string;
  name: string;
  accountNumber: string;
  accountTitle: string;
  color: string;
  labelColor?: string;
  textColor?: string;
  iconUrl?: string;
}

export interface AppSettings {
  headerText: string;
  membershipFee: number;
  movieFee: number;
  seasonFee: number;
  paymentDetails: string;
  itemsPerPage: number;
  recentViewLimit: number;
  recommendedLimit: number;
  defaultAppImage: string;
  supportNumber: string;
  accountTitle: string;
  accountNumber: string;
  bankAccounts: BankAccount[];
  adminTabsOrder: string[];
  hiddenAdminTabs?: string[];
  isTrialEnabled?: boolean;
  isPhoneLoginEnabled?: boolean;
  isAdminContactEnabled?: boolean;
  isPaymentEnabled?: boolean;
  serviceAccounts?: {
    sourceKey?: string;
    targets?: {
      id: string;
      title: string;
      key: string;
      databaseId: string;
    }[];
  };
}

export interface ErrorLinkInfo {
  contentId: string;
  contentTitle: string;
  contentType: 'movie' | 'series';
  location: string;
  link: any;
  linkIndex: number;
  seasonIndex?: number;
  episodeIndex?: number;
  listType?: 'movie' | 'zip' | 'mkv' | 'episode';
  errorDetail: string;
  errorCategory?: string;
  fetchedSize?: string;
  fetchedUnit?: 'MB' | 'GB';
  createdAt?: string;
}
