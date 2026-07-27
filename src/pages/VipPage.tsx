import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, VipPlan, UserVip, fmtInt } from '../lib/supabase';
import { Loader2, ChevronRight } from 'lucide-react';

const planImages = [
  'https://images.pexels.com/photos/7788009/pexels-photo-7788009.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/3183132/pexels-photo-3183132.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/210607/pexels-photo-210607.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/6787892/pexels-photo-6787892.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/4386370/pexels-photo-4386370.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/7788009/pexels-photo-7788009.jpeg?auto=compress&cs=tinysrgb&w=400',
  'https://images.pexels.com/photos/210607/pexels-photo-210607.jpeg?auto=compress&cs=tinysrgb&w=400',
];

export function VipPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [myIncome, setMyIncome] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vip_plans').select('*').eq('is_active', true).order('sort_order');
    setPlans((data || []) as VipPlan[]);
    if (profile) {
      const { data: uv } = await supabase
        .from('user_vips')
        .select('days_paid, daily_income, is_active')
        .eq('user_id', profile.id);
      const list = (uv || []) as UserVip[];
      setActiveCount(list.filter((x) => x.is_active).length);
      setMyIncome(list.reduce((s, x) => s + (x.days_paid || 0) * x.daily_income, 0));
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const buy = async (plan: VipPlan) => {
    if (!profile) { navigate('/login'); return; }
    if ((profile.main_balance || 0) < plan.investment_amount) {
      toast.error(`Insufficient balance. Need RWF ${fmtInt(plan.investment_amount)}`);
      return;
    }
    setBuying(plan.id);
    try {
      const { error } = await supabase.rpc('buy_vip_plan', {
        p_user_id: profile.id,
        p_plan_id: plan.id,
        p_amount: plan.investment_amount,
        p_daily_income: plan.daily_income,
        p_duration_days: plan.duration_days,
        p_total_return: plan.total_return,
        p_plan_name: plan.name,
      });
      if (error) throw error;
      await refreshProfile();
      await load();
      toast.success(`${plan.name} purchased! Daily income starts at midnight (00:00).`);
    } catch (e: any) {
      toast.error('Purchase failed: ' + e.message);
    }
    setBuying(null);
  };

  return (
    <Layout>
      <div className="bg-background min-h-full">
        {/* Hero header */}
        <div
          className="relative w-full overflow-hidden"
          style={{ height: '230px', background: 'linear-gradient(135deg, #451A03 0%, #78350F 40%, #92400E 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }}
          />
          <div className="absolute top-4 left-0 right-0 flex items-center justify-center gap-2 px-4">
            <span className="text-lg font-black tracking-widest text-white drop-shadow">PINONI</span>
            <span className="text-lg font-black tracking-widest" style={{ color: '#FBBF24' }}>PLANS</span>
            <span className="text-lg font-black tracking-widest text-white drop-shadow">INVESTMENT</span>
          </div>
          <div className="absolute top-14 left-0 right-0 flex items-center justify-center gap-2 px-3">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1.5">
              <span className="text-[10px]">📅</span>
              <span className="text-[10px] font-bold text-white">TERM: 20 DAYS</span>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #B45309)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              <span className="text-[10px]">%</span>
              <span className="text-[10px] font-black text-white">COMMISSION: 20%</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1.5">
              <span className="text-[10px]">📈</span>
              <span className="text-[10px] font-bold text-white">DAILY: 8%</span>
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-4">
            <div>
              <div className="text-base font-black leading-tight" style={{ color: '#FBBF24', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                HIGH SAFETY
              </div>
              <div className="text-[9px] font-bold text-white/80 mt-0.5 leading-tight">100% SECURE INVESTMENT</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/my-products')}
                className="flex items-center gap-1 bg-black/60 border border-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-[11px] font-black active:scale-95 transition-transform"
              >
                <span>{activeCount}</span>
                <span className="font-semibold">My product</span>
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                onClick={() => navigate('/my-products')}
                className="flex items-center gap-1 bg-black/60 border border-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-[11px] font-black active:scale-95 transition-transform"
              >
                <span>RWF {fmtInt(myIncome)}</span>
                <span className="font-semibold">My income</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="pb-6">
            {plans.map((plan, i) => {
              const isBuying = buying === plan.id;
              const img = planImages[i % planImages.length];
              return (
                <div key={plan.id} className="mx-3 mt-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg font-black" style={{ color: '#F59E0B' }}>{plan.name}</span>
                      <span
                        className="text-[9px] font-black text-white px-1.5 py-0.5 rounded-md"
                        style={{ background: 'linear-gradient(135deg,#F59E0B,#92400E)' }}
                      >
                        PINONI
                      </span>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {[
                          { label: 'Price:', value: `RWF ${fmtInt(plan.investment_amount)}` },
                          { label: 'Term:', value: `${plan.duration_days}-day` },
                          { label: 'Daily income:', value: `RWF ${fmtInt(plan.daily_income)}` },
                          { label: 'Total income:', value: `RWF ${fmtInt(plan.total_return)}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center">
                            <span className="text-sm text-gray-400 w-28 shrink-0">{label}</span>
                            <span className="text-sm font-bold text-gray-800">{value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="shrink-0 rounded-xl overflow-hidden bg-gray-100" style={{ width: '110px', height: '110px' }}>
                        <img src={img} alt={plan.name} className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={() => buy(plan)}
                        disabled={isBuying}
                        className="rounded-xl font-black text-sm px-8 py-2.5 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                        style={{ backgroundColor: '#F59E0B', color: '#fff' }}
                      >
                        {isBuying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {isBuying ? 'Processing...' : 'BUY NOW'}
                      </button>
                    </div>
                    {(profile?.main_balance || 0) < plan.investment_amount && (
                      <p className="text-xs text-gray-400 text-right mt-1">
                        Need RWF {fmtInt(plan.investment_amount - (profile?.main_balance || 0))} more →{' '}
                        <button onClick={() => navigate('/deposit')} className="underline font-semibold" style={{ color: '#F59E0B' }}>
                          Deposit
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
