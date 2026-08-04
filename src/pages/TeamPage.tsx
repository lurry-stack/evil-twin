import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, fmt, fmtDate, maskPhone } from '../lib/supabase';
import { Users, Copy, Share2, ChevronRight, Info } from 'lucide-react';

type LevelMember = { id: string; full_name: string; phone: string | null; created_at: string; total_deposit: number };
type Commission = { id: string; level: number; commission_amount: number; created_at: string; source_user: { full_name: string; phone: string | null } | null };

export function TeamPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [level, setLevel] = useState(1);
  const [members, setMembers] = useState<{ level1: LevelMember[]; level2: LevelMember[]; level3: LevelMember[] }>({ level1: [], level2: [], level3: [] });
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: l1 } = await supabase.from('profiles').select('id, full_name, phone, created_at, total_deposit').eq('referred_by', profile.id);
    const l1Ids = ((l1 || []) as LevelMember[]).map((m) => m.id);
    let l2: LevelMember[] = [];
    if (l1Ids.length) {
      const { data } = await supabase.from('profiles').select('id, full_name, phone, created_at, total_deposit').in('referred_by', l1Ids);
      l2 = (data || []) as LevelMember[];
    }
    const l2Ids = l2.map((m) => m.id);
    let l3: LevelMember[] = [];
    if (l2Ids.length) {
      const { data } = await supabase.from('profiles').select('id, full_name, phone, created_at, total_deposit').in('referred_by', l2Ids);
      l3 = (data || []) as LevelMember[];
    }
    setMembers({ level1: (l1 || []) as LevelMember[], level2: l2, level3: l3 });
    const { data: comms } = await supabase
      .from('referral_commissions')
      .select('id, level, commission_amount, created_at, source_user:source_user_id(full_name, phone)')
      .eq('earner_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setCommissions((comms || []) as unknown as Commission[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

  const refLink = `${window.location.origin}/register?ref=${profile.referral_code}`;
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied!`));
  };
  const share = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join PINONI',
        text: `Join me on PINONI and earn daily! Use my referral code: ${profile.referral_code}`,
        url: refLink,
      }).catch(() => copy(refLink, 'Referral link'));
    } else {
      copy(refLink, 'Referral link');
    }
  };

  const current = members[`level${level}` as keyof typeof members];
  const totalMembers = members.level1.length + members.level2.length + members.level3.length;
  const activeMembers = [...members.level1, ...members.level2, ...members.level3].filter((m) => m.total_deposit > 0).length;

  return (
    <Layout>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold gradient-text" style={{ fontFamily: 'Playfair Display, serif' }}>My Team</h1>
        </div>

        {/* Level summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Lv1', count: members.level1.length, pct: '20%' },
            { label: 'Lv2', count: members.level2.length, pct: '5%' },
            { label: 'Lv3', count: members.level3.length, pct: '2%' },
          ].map(({ label, count, pct }) => (
            <div key={label} className="glass-card rounded-xl p-3 text-center">
              <div className="text-base font-bold text-primary">{label}</div>
              <div className="text-lg font-bold text-foreground">{count}</div>
              <div className="text-xs text-muted-foreground">Commission: {pct}</div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="glass-card rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Members', value: totalMembers },
              { label: 'Active Members', value: activeMembers },
              { label: 'Total Referral Commission', value: `RWF ${fmt(profile.total_referral_commission || 0)}`, span: 2 },
            ].map((s) => (
              <div key={s.label} className={`bg-muted/50 rounded-lg p-2.5 ${s.span === 2 ? 'col-span-2' : ''}`}>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-lg font-bold text-foreground">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite */}
        <div className="glass-card rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Invite Friends</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground font-mono">
              {profile.referral_code || '—'}
            </div>
            <button
              onClick={() => copy(profile.referral_code || '', 'Referral code')}
              className="p-2.5 bg-primary/10 rounded-lg border border-primary/20"
            >
              <Copy className="w-4 h-4 text-primary" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground truncate">{refLink}</div>
            <button
              onClick={() => copy(refLink, 'Referral link')}
              className="p-2.5 bg-primary/10 rounded-lg border border-primary/20"
            >
              <Copy className="w-4 h-4 text-primary" />
            </button>
            <button onClick={share} className="p-2.5 bg-primary/10 rounded-lg border border-primary/20">
              <Share2 className="w-4 h-4 text-primary" />
            </button>
          </div>
        </div>

        {/* Commission rules */}
        <div className="bg-muted/30 rounded-xl p-4 mb-4 text-xs text-muted-foreground space-y-1.5">
          <div className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span>Level 1: You earn <span className="text-primary font-semibold">20%</span> when your direct referral deposits.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span>Level 2: You earn <span className="text-primary font-semibold">5%</span> when their referral deposits.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span>Level 3: You earn <span className="text-primary font-semibold">2%</span> when their referral deposits.</span>
          </div>
        </div>

        {/* Level tabs */}
        <div className="mb-4">
          <div className="flex gap-2 mb-3">
            {[1, 2, 3].map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  level === l ? 'btn-gold' : 'bg-muted text-muted-foreground'
                }`}
              >
                Level {l} ({members[`level${l}` as keyof typeof members].length})
              </button>
            ))}
          </div>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : current.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No Level {level} members yet.<br />
              <span className="text-xs">Invite friends to grow your team!</span>
            </div>
          ) : (
            <div className="space-y-2">
              {current.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{m.full_name || 'User'}</div>
                    <div className="text-xs text-muted-foreground">{maskPhone(m.phone)} · {fmtDate(m.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Deposit</div>
                    <div className="text-sm font-semibold text-primary">RWF {fmt(m.total_deposit)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commission history */}
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="w-full flex items-center justify-between bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm font-medium text-foreground mb-2"
        >
          <span>Commission History</span>
          <ChevronRight className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
        </button>
        {showHistory && (
          <div className="space-y-2 mb-4">
            {commissions.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">No commissions yet</div>
            ) : (
              commissions.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-xs font-medium text-foreground">Level {c.level} Commission Received</div>
                    <div className="text-xs text-muted-foreground">
                      From: {c.source_user?.full_name || 'User'} · {fmtDate(c.created_at)}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-primary">+{fmt(c.commission_amount)} FRW</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
