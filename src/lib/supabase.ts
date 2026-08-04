import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  referral_code: string | null;
  referred_by: string | null;
  main_balance: number;
  total_earnings: number;
  total_deposit: number;
  total_referral_commission: number;
  total_withdraw: number;
  is_admin: boolean;
  created_at: string;
};

export type VipPlan = {
  id: string;
  name: string;
  investment_amount: number;
  daily_income: number;
  duration_days: number;
  total_return: number;
  sort_order: number;
  is_active: boolean;
};

export type UserVip = {
  id: string;
  user_id: string;
  vip_plan_id: string | null;
  plan_name: string;
  investment_amount: number;
  daily_income: number;
  duration_days: number;
  total_return: number;
  purchased_at: string;
  expires_at: string | null;
  last_income_at: string;
  days_paid: number;
  is_active: boolean;
};

export type Deposit = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  bank_name: string | null;
  account_number: string | null;
  holder_name: string | null;
  created_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  screenshot_url: string | null;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  bank_name: string | null;
  account_number: string | null;
  holder_name: string | null;
  created_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  fee: number;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
};

export type ReferralCommission = {
  id: string;
  earner_id: string;
  source_user_id: string | null;
  level: number;
  commission_amount: number;
  paid: boolean;
  created_at: string;
  source_user?: { full_name: string; phone: string | null } | null;
};

export type Checkin = {
  id: string;
  user_id: string;
  reward_amount: number;
  reward_label: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  image: string | null;
  is_active: boolean;
  sort_order: number;
};

export type Settings = {
  id: string;
  announcement: string | null;
  welcome_message: string | null;
  telegram_channel_link: string | null;
  telegram_admin_link: string | null;
  min_deposit: number;
  max_balance_restriction: number;
  min_withdraw: number;
  withdraw_arrival_hours: number;
  withdraw_fee_percent: number;
  mtn_ussd_template: string | null;
  airtel_ussd_template: string | null;
  mtn_destination: string | null;
  airtel_destination: string | null;
  whatsapp_group_link: string | null;
};

export const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number) => Number(n || 0).toLocaleString('en-US');

export const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const maskPhone = (p: string | null) =>
  p ? p.slice(0, 4) + '****' + p.slice(-2) : '****';

export type LockedInvestment = {
  id: string;
  user_id: string;
  source_user_vip_id: string | null;
  locked_plan_id: string | null;
  plan_name: string;
  investment_amount: number;
  daily_income: number;
  duration_days: number;
  total_return: number;
  locked_at: string;
  claim_at: string;
  days_paid: number;
  accrued_income: number;
  is_claimed: boolean;
  claimed_at: string | null;
  created_at: string;
};

export type LockedPlan = {
  id: string;
  name: string;
  investment_amount: number;
  daily_income: number;
  duration_days: number;
  total_return: number;
  sort_order: number;
  is_active: boolean;
};
