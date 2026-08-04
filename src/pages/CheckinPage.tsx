import { useEffect, useState } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, Checkin, fmt, fmtDate } from '../lib/supabase';
import { Loader2, CalendarCheck, Gift } from 'lucide-react';

export function CheckinPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [todayChecked, setTodayChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('checkins').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30).then(({ data }) => {
      const list = (data || []) as Checkin[];
      setCheckins(list);
      const today = new Date().toDateString();
      setTodayChecked(list.some((c) => new Date(c.created_at).toDateString() === today));
      setLoading(false);
    });
  }, [profile]);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

  const checkin = async () => {
    if (todayChecked) return;
    setClaiming(true);
    const reward = Math.floor(Math.random() * 190) + 10;
    const { error } = await supabase.from('checkins').insert({
      user_id: profile.id,
      reward_amount: reward,
      reward_label: 'Daily check-in',
    });
    if (error) { setClaiming(false); toast.error(error.message); return; }
    await supabase.from('transactions').insert({
      user_id: profile.id,
      type: 'checkin',
      amount: reward,
      description: 'Daily check-in reward',
    });
    await supabase.from('profiles').update({
      main_balance: (profile.main_balance || 0) + reward,
      total_earnings: (profile.total_earnings || 0) + reward,
    }).eq('id', profile.id);
    await refreshProfile();
    setTodayChecked(true);
    setClaiming(false);
    toast.success(`Check-in successful! +RWF ${fmt(reward)}`);
  };

  const streak = checkins.length;

  return (
    <Layout>
      <PageHeader title="Daily Check-In" />
      <div className="p-4 space-y-4">
        <div className="glass-card rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, #F59E0B10 0%, #F59E0B08 100%)' }}>
          <CalendarCheck className="w-12 h-12 text-primary mx-auto mb-2" />
          <div className="text-2xl font-black text-foreground">{streak} days</div>
          <div className="text-xs text-muted-foreground mt-1">Current streak</div>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">How it works</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>Each user gets a random reward between 10–199 RWF.</li>
            <li>All check-in rewards go directly to your main balance.</li>
            <li>Complete 7 consecutive days for a bonus streak reward.</li>
          </ul>
        </div>

        <button
          onClick={checkin}
          disabled={todayChecked || claiming}
          className="w-full rounded-xl font-black text-sm px-8 py-3.5 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', color: '#fff' }}
        >
          {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {todayChecked ? 'Checked in today' : claiming ? 'Checking in...' : 'Check In Now'}
        </button>

        <div>
          <div className="text-sm font-bold text-foreground mb-2">Recent Check-ins</div>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          ) : checkins.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No check-ins yet</div>
          ) : (
            <div className="space-y-2">
              {checkins.map((c) => (
                <div key={c.id} className="glass-card rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{c.reward_label || 'Daily check-in'}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</div>
                  </div>
                  <div className="text-sm font-bold text-primary">+RWF {fmt(c.reward_amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
