import { useEffect, useState, useCallback } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, fmt } from '../lib/supabase';
import { Loader2, Trophy, Crown, Medal, User, Share2, TrendingUp } from 'lucide-react';

type LeaderboardEntry = {
  user_id: string;
  full_name: string;
  phone: string | null;
  referral_code: string | null;
  referral_count: number;
  total_deposit: number;
};

const rewards = [
  { rank: 1, amount: 10000, icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  { rank: 2, amount: 5000, icon: Medal, color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' },
  { rank: 3, amount: 3000, icon: Medal, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
];

export function TasksPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myReferrals, setMyReferrals] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_referral_leaderboard', { p_limit: 50 });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as LeaderboardEntry[];
    setLeaderboard(list);
    const idx = list.findIndex((e) => e.user_id === profile.id);
    setMyRank(idx >= 0 ? idx + 1 : null);
    const mine = list.find((e) => e.user_id === profile.id);
    setMyReferrals(mine?.referral_count || 0);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

  const share = async () => {
    const shareData = {
      title: 'Join PINONI',
      text: `Join me on PINONI and earn daily! Use my referral code: ${profile.referral_code}`,
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        toast.success('Referral link copied!');
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <Layout>
      <PageHeader title="Leaderboard" />
      <div className="p-4 space-y-4">
        {/* Sunday rewards banner */}
        <div
          className="rounded-2xl p-4 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5" />
            <span className="font-black text-sm">Sunday Referral Rewards</span>
          </div>
          <p className="text-xs text-white/90 mb-3">
            Top 3 users with the most referrals every Sunday win cash prizes!
          </p>
          <div className="grid grid-cols-3 gap-2">
            {rewards.map(({ rank, amount, icon: Icon }) => (
              <div key={rank} className="bg-white/15 rounded-xl p-2 text-center backdrop-blur-sm">
                <Icon className="w-5 h-5 mx-auto mb-1" />
                <div className="text-[10px] font-bold text-white/80">#{rank}</div>
                <div className="text-sm font-black">{fmt(amount)}</div>
                <div className="text-[9px] text-white/70">RWF</div>
              </div>
            ))}
          </div>
        </div>

        {/* My stats */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground">Your Referrals</div>
              <div className="text-2xl font-black text-foreground">{myReferrals}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Your Rank</div>
              <div className="text-2xl font-black text-primary">{myRank ? `#${myRank}` : '—'}</div>
            </div>
          </div>
          <button
            onClick={share}
            className="w-full btn-gold rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share Referral Code: {profile.referral_code || '—'}
          </button>
        </div>

        {/* Leaderboard list */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Top Referrers</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No referrals yet. Be the first!</div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, idx) => {
                const rank = idx + 1;
                const isMe = entry.user_id === profile.id;
                const reward = rewards.find((r) => r.rank === rank);
                return (
                  <div
                    key={entry.user_id}
                    className={`glass-card rounded-xl p-3 flex items-center gap-3 ${
                      isMe ? 'border-2 border-primary' : ''
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-black text-sm ${
                      rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                      rank === 2 ? 'bg-gray-100 text-gray-600' :
                      rank === 3 ? 'bg-orange-100 text-orange-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {rank <= 3 ? (rank === 1 ? <Crown className="w-4 h-4" /> : <Medal className="w-4 h-4" />) : rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground truncate flex items-center gap-1">
                        {entry.full_name || 'User'}
                        {isMe && <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded">You</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.referral_count} referrals · {fmt(entry.total_deposit || 0)} RWF deposited
                      </div>
                    </div>
                    {reward && (
                      <div className={`text-xs font-black px-2 py-1 rounded-lg ${reward.bg} ${reward.color}`}>
                        +{fmt(reward.amount)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
          <p className="font-bold mb-1">How it works</p>
          <p>Share your referral code with friends. When they deposit, you earn commissions (10% / 5% / 2% for 3 levels). The top 3 referrers every Sunday win 10,000 / 5,000 / 3,000 RWF automatically.</p>
        </div>
      </div>
    </Layout>
  );
}
