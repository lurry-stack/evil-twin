import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Info,
  ShieldCheck,
  Headphones,
  Users,
  CalendarCheck,
  KeyRound,
  Gift,
  LogOut,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { fmt } from '../lib/supabase';

const menuItems = [
  { label: 'About Us', icon: Info, path: '/about' },
  { label: 'Investment Rules', icon: ShieldCheck, path: '/regulation' },
  { label: 'Records', icon: ClipboardList, path: '/records' },
  { label: 'Customer Service', icon: Headphones, path: '/support' },
  { label: 'Share & Earn', icon: Users, path: '/team' },
  { label: 'Check In', icon: CalendarCheck, path: '/checkin' },
  { label: 'Change Password', icon: KeyRound, path: '/change-password' },
  { label: 'Redeem Gift', icon: Gift, path: '/redeem' },
];

export function ProfilePage() {
  const { profile, signOut, isAdmin } = useAuth();
  const { navigate } = useRouter();

  if (!profile) {
    navigate('/login');
    return null;
  }

  return (
    <Layout>
      <div className="bg-background flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
        {/* Header */}
        <div className="px-4 pt-4 pb-4" style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>
          <div className="flex items-center justify-between mb-3">
            {isAdmin ? (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1 text-[11px] border border-white/40 text-white px-2.5 py-0.5 rounded-full"
              >
                <Settings className="w-3 h-3" /> Admin
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
              className="flex items-center gap-1.5 border border-white/60 text-white text-xs px-3 py-1.5 rounded-full font-semibold"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0">
              <span className="text-white font-black text-xs">RIN</span>
            </div>
            <div>
              <div className="text-white font-black text-base leading-tight">{profile.full_name || 'PINONI User'}</div>
              <div className="text-white/70 text-xs mt-0.5 font-mono tracking-wide">
                ID: {profile.phone || profile.id?.slice(0, 12) || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mx-3 mt-3 bg-card rounded-xl shadow-sm p-3 border border-border">
          <div className="mb-2">
            <span className="text-[11px] bg-primary text-white px-3 py-0.5 rounded-full font-semibold">Lv1</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Recharge', icon: ArrowDownToLine, path: '/deposit' },
              { label: 'Withdraw', icon: ArrowUpFromLine, path: '/withdraw' },
              { label: 'Records', icon: ClipboardList, path: '/records' },
            ].map(({ label, icon: Icon, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1 py-1.5 active:scale-95 transition-transform"
              >
                <div className="w-9 h-9 rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-[11px] text-muted-foreground font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Check-in banner */}
        <div
          className="mx-3 mt-3 rounded-xl overflow-hidden relative cursor-pointer active:scale-[0.99] transition-transform"
          style={{ height: '88px' }}
          onClick={() => navigate('/checkin')}
        >
          <img
            src="https://images.pexels.com/photos/7788009/pexels-photo-7788009.jpeg?auto=compress&cs=tinysrgb&w=200"
            alt="Daily check-in"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/20" />
          <div className="absolute inset-0 px-3 py-2 flex flex-col justify-center">
            <div className="text-sm font-black text-white mb-0.5">Daily check-in</div>
            <div className="text-[11px] text-white/80 mb-1.5">Check-in daily to get rewards</div>
            <span className="self-start bg-primary text-white px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1">
              Check-in now <ChevronRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>

        {/* Balance cards */}
        <div className="mx-3 mt-3 grid grid-cols-2 gap-2">
          {[
            { label: 'Account balance', value: profile.main_balance || 0 },
            { label: 'Cumulative balance', value: (profile.total_earnings || 0) + (profile.total_withdraw || 0) },
          ].map(({ label, value }) => (
            <button
              key={label}
              onClick={() => navigate('/records')}
              className="bg-card border border-border rounded-xl p-2.5 text-left active:scale-95 transition-transform shadow-sm"
            >
              <div className="text-sm font-black text-foreground">FRW {fmt(value)}</div>
              <div className="text-[11px] text-primary font-semibold mt-0.5">{label} &gt;</div>
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="mx-3 mt-3 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <span className="text-sm font-black text-foreground">More</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {menuItems.map(({ label, icon: Icon, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="bg-card border border-border rounded-xl p-2 flex flex-col items-center gap-1 active:scale-95 transition-transform shadow-sm"
              >
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-[10px] text-muted-foreground font-semibold text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto px-4 pb-6 pt-4 text-center">
          <p className="text-[11px] text-muted-foreground/50">
            By using PINONI, you agree to our terms of service. All investment returns are based on the selected VIP plan.
          </p>
          <p className="text-[11px] text-muted-foreground/50 mt-2 mb-4">
            PINONI Investment Platform © {new Date().getFullYear()} · All rights reserved
          </p>
        </div>
      </div>
    </Layout>
  );
}
