import { Zap, Sparkles, ShieldCheck, Crown, Gem, LucideIcon } from 'lucide-react';
import { Role } from '../types';

export interface MembershipPlan {
  id: string;
  name: string;
  months: number;
  price: number;
  perMonth: number;
  planRole: Role;
  headerBadge: string;
  saveBadge: string;
  popular: boolean;
  icon: LucideIcon;
  durationLabel: string;
  subtitle?: string;
}

/**
 * Unified VIP Membership Plans
 * Used across TopUp, Membership, Reminder Banner, and entire app
 */
export const VIP_PLANS: MembershipPlan[] = [
  {
    id: '1m',
    name: '1 Month VIP',
    durationLabel: '1 Month',
    months: 1,
    price: 300,
    perMonth: 300,
    planRole: 'vip' as Role,
    headerBadge: '',
    saveBadge: '',
    popular: false,
    icon: Zap,
    subtitle: 'Base monthly VIP rate',
  },
  {
    id: '3m',
    name: '3 Months VIP',
    durationLabel: '3 Months',
    months: 3,
    price: 750,
    perMonth: 250,
    planRole: 'vip' as Role,
    headerBadge: '',
    saveBadge: 'Save 17%',
    popular: false,
    icon: Sparkles,
    subtitle: 'Quarterly VIP pass',
  },
  {
    id: '6m',
    name: '6 Months VIP',
    durationLabel: '6 Months',
    months: 6,
    price: 1400,
    perMonth: 233,
    planRole: 'vip' as Role,
    headerBadge: '',
    saveBadge: 'Save 22%',
    popular: false,
    icon: ShieldCheck,
    subtitle: 'Half-yearly VIP pass',
  },
  {
    id: '1y',
    name: '1 Year VIP',
    durationLabel: '1 Year',
    months: 12,
    price: 2600,
    perMonth: 216,
    planRole: 'vip' as Role,
    headerBadge: '🔥 Most Popular',
    saveBadge: 'Save 28%',
    popular: true,
    icon: Crown,
    subtitle: 'Full-year unlimited VIP access',
  },
  {
    id: '2y',
    name: '2 Years VIP',
    durationLabel: '2 Years',
    months: 24,
    price: 4000,
    perMonth: 166,
    planRole: 'vip' as Role,
    headerBadge: '👑 Mega VIP',
    saveBadge: 'Save 44%',
    popular: false,
    icon: Gem,
    subtitle: 'Best value 2-year mega saver',
  },
];

/**
 * Unified Basic Membership Plans
 * Used across TopUp, Membership, Reminder Banner, and entire app
 */
export const BASIC_PLANS: MembershipPlan[] = [
  {
    id: 'basic_1m',
    name: '1 Month Basic',
    durationLabel: '1 Month',
    months: 1,
    price: 150,
    perMonth: 150,
    planRole: 'basic' as Role,
    headerBadge: '📺 Rs 150/mo',
    saveBadge: '',
    popular: true,
    icon: Zap,
    subtitle: 'Base monthly Basic plan',
  },
  {
    id: 'basic_3m',
    name: '3 Months Basic',
    durationLabel: '3 Months',
    months: 3,
    price: 400,
    perMonth: 133,
    planRole: 'basic' as Role,
    headerBadge: '',
    saveBadge: 'Save 11%',
    popular: true,
    icon: Sparkles,
    subtitle: 'Quarterly Basic pass',
  },
  {
    id: 'basic_6m',
    name: '6 Months Basic',
    durationLabel: '6 Months',
    months: 6,
    price: 750,
    perMonth: 125,
    planRole: 'basic' as Role,
    headerBadge: '',
    saveBadge: 'Save 17%',
    popular: false,
    icon: ShieldCheck,
    subtitle: 'Half-yearly Basic pass',
  },
  {
    id: 'basic_1y',
    name: '1 Year Basic',
    durationLabel: '1 Year',
    months: 12,
    price: 1300,
    perMonth: 108,
    planRole: 'basic' as Role,
    headerBadge: '🔥 Best Value',
    saveBadge: 'Save 17%',
    popular: false,
    icon: Crown,
    subtitle: 'Full-year Basic pass',
  },
];

/**
 * All Unified Membership Plans
 */
export const ALL_MEMBERSHIP_PLANS: MembershipPlan[] = [...VIP_PLANS, ...BASIC_PLANS];

export function getPlanById(id?: string | null): MembershipPlan | undefined {
  if (!id) return undefined;
  return ALL_MEMBERSHIP_PLANS.find((p) => p.id === id);
}

export function formatPrice(amount: number): string {
  return `Rs ${amount.toLocaleString()}`;
}
