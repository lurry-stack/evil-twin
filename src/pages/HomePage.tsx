import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { supabase, fmt, Settings } from '../lib/supabase';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  CalendarCheck,
  Info,
  ShieldCheck,
  Headphones,
  CheckSquare,
  ChevronRight,
  Megaphone,
  Loader2,
  X,
} from 'lucide-react';

const banners = [
  'https://images.pexels.com/photos/210607/pexels-photo-210607.jpeg?auto=compress&cs=tinysrgb&w=800',
  'https://images.pexels.com/photos/3183132/pexels-photo-3183132.jpeg?auto=compress&cs=tinysrgb&w=800',
  'https://images.pexels.com/photos/7788009/pexels-photo-7788009.jpeg?auto=compress&cs=tinysrgb&w=800',
  'https://images.pexels.com/photos/6787892/pexels-photo-6787892.jpeg?auto=compress&cs=tinysrgb&w=800',
];

const taskBanner = banners[2];

const quickActions = [
  { label: 'Recharge', icon: ArrowDownToLine, path: '/deposit' },
  { label: 'Withdraw', icon: ArrowUpFromLine, path: '/withdraw' },
  { label: 'Records', icon: ClipboardList, path: '/records' },
  { label: 'Check In', icon: CalendarCheck, path: '/checkin' },
  { label: 'About Us', icon: Info, path: '/about' },
  { label: 'Regulation', icon: ShieldCheck, path: '/regulation' },
  { label: 'Support', icon: Headphones, path: '/support' },
  { label: 'Task Center', icon: CheckSquare, path: '/tasks' },
];

const partners = [
  { name: 'MTN', img: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'Airtel', img: 'https://images.pexels.com/photos/4386370/pexels-photo-4386370.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'Visa', img: 'https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'Mastercard', img: 'https://images.pexels.com/photos/4968393/pexels-photo-4968393.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'PayPal', img: 'https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'Stripe', img: 'https://images.pexels.com/photos/4968393/pexels-photo-4968393.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'PINONI', img: 'https://images.pexels.com/photos/7788009/pexels-photo-7788009.jpeg?auto=compress&cs=tinysrgb&w=200' },
  { name: 'Tech+', img: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=200' },
];

export function HomePage() {
  const { profile, loading } = useAuth();
  const { navigate } = useRouter();
  const [idx, setIdx] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('settings').select('*').maybeSingle().then(({ data }) => {
      setSettings(data as Settings);
      if (data?.welcome_message) setShowWelcome(true);
    });
  }, [profile]);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!profile) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <Layout>
      {showWelcome && settings?.welcome_message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                <span className="font-semibold text-foreground">Welcome to PINONI</span>
              </div>
              <button onClick={() => setShowWelcome(false)} className="text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{settings.welcome_message}</p>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
              <div className="text-xs font-bold text-foreground mb-1.5">How you make money on PINONI:</div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1. Buy a VIP plan — earn daily income for the plan duration.</li>
                <li>2. Refer friends — earn commission on their deposits (3 levels).</li>
                <li>3. Complete tasks — earn rewards for each task.</li>
                <li>4. Daily check-in — earn free rewards every day.</li>
                <li>5. Redeem gift codes — top up your balance anytime.</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWelcome(false)}
                className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium"
              >
                Close
              </button>
              {settings.telegram_channel_link && (
                <a
                  href={settings.telegram_channel_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 btn-gold py-2 rounded-lg text-sm font-medium text-center flex items-center justify-center gap-1"
                >
                  Join Telegram
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-background min-h-full">
        {/* Banner carousel */}
        <div className="relative w-full overflow-hidden" style={{ height: '200px' }}>
          {banners.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="PINONI banner"
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{ opacity: i === idx ? 1 : 0 }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #B45309)' }}
            >
              <span className="text-white text-[9px] font-black">PIN</span>
            </div>
            <span className="text-white font-black text-sm tracking-widest drop-shadow-lg">PINONI</span>
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-primary' : 'w-2 bg-white/40'}`}
              />
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-card mx-0 px-4 py-4 border-b border-border">
          <div className="grid grid-cols-4 gap-y-3">
            {quickActions.map(({ label, icon: Icon, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <div className="w-12 h-12 rounded-full border-2 border-primary/50 bg-primary/8 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs text-foreground font-semibold leading-tight text-center whitespace-nowrap">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Announcement marquee */}
        <div className="bg-muted/80 px-3 py-1.5 flex items-center gap-2 overflow-hidden border-b border-border">
          <Megaphone className="w-3 h-3 text-primary shrink-0" />
          <div className="overflow-hidden flex-1">
            <p className="marquee-inner text-[11px] text-muted-foreground">
              {settings?.announcement || 'Welcome to PINONI VIP Investment Platform! Earn daily income with our premium VIP plans.'}
            </p>
          </div>
        </div>

        {/* Task center banner */}
        <div
          className="mx-3 my-3 rounded-2xl overflow-hidden relative cursor-pointer active:scale-[0.99] transition-transform"
          style={{ height: '120px' }}
          onClick={() => navigate('/tasks')}
        >
          <img src={taskBanner} alt="Task Center" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-transparent" />
          <div className="absolute inset-0 px-4 py-3 flex flex-col justify-center">
            <div className="text-base font-black text-white mb-1">Referral Leaderboard</div>
            <div className="text-xs text-white/80 mb-2">Refer friends, climb the leaderboard, win weekly rewards</div>
            <span className="self-start bg-primary text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1">
              Enter <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Balance cards */}
        <div className="mx-3 mb-3 grid grid-cols-2 gap-3">
          {[
            { label: 'Account Balance', value: profile.main_balance || 0 },
            { label: 'Cumulative Earnings', value: profile.total_earnings || 0 },
          ].map(({ label, value }) => (
            <div key={label} className="glass-card rounded-2xl p-4 relative overflow-hidden select-none">
              <div className="text-base font-black text-foreground leading-tight">FRW {fmt(value)}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Partners */}
        <div className="mx-3 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <span className="text-sm font-black text-foreground">Our Partners</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {partners.map((p) => (
              <div key={p.name} className="bg-white border border-border rounded-xl overflow-hidden flex flex-col items-center">
                <div className="w-full" style={{ height: '56px' }}>
                  <img
                    src={p.img}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="w-full px-1 py-1 text-center text-[10px] font-black text-gray-700 leading-tight truncate">
                  {p.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VIP CTA */}
        <div
          className="mx-3 mb-6 rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-transform"
          style={{ background: 'linear-gradient(135deg, #451A03 0%, #78350F 40%, #92400E 100%)' }}
          onClick={() => navigate('/vip')}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-black text-white" style={{ color: '#FBBF24' }}>
                PINONI PLANS
              </div>
              <div className="text-xs text-white/80 mt-0.5">Earn 8% daily income for 20 days</div>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-white text-xs font-bold flex items-center gap-1">
              View <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
