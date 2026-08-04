import { Layout, PageHeader } from '../components/Layout';
import { ShieldCheck, Headphones, Award, Building2, Lock, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase, Settings } from '../lib/supabase';

export function AboutPage() {
  return (
    <Layout>
      <PageHeader title="About Us" />
      <div className="p-4 space-y-4">
        <div className="text-center py-6">
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)' }}
          >
            <span className="text-white text-lg font-black">RIN</span>
          </div>
          <h1 className="text-2xl font-black gradient-text" style={{ fontFamily: 'Playfair Display, serif' }}>PINONI</h1>
          <p className="text-sm text-muted-foreground mt-1">Premium VIP Investment Platform</p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Company Introduction</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            PINONI is a premium VIP investment platform offering daily income through carefully curated investment plans.
            We partner with leading global brands to provide secure, reliable, and high-yield investment opportunities
            for our members across Africa and beyond.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Your Right to Invest</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            It is your right to invest in PINONI — and it is your right not to. Whether you choose to invest or not
            is entirely your decision, and all benefits from your investment belong to you. PINONI does not pressure
            anyone to invest. We simply provide the platform; the choice and the rewards are yours alone.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Our Mission</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To empower our members with sustainable daily income through transparent, secure, and accessible
            investment products — starting from as little as 5,000 RWF.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Security & Trust</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All investments are protected by our 100% secure investment guarantee. We use bank-grade encryption
            and partner only with licensed financial institutions.
          </p>
        </div>
      </div>
    </Layout>
  );
}

export function RegulationPage() {
  return (
    <Layout>
      <PageHeader title="Investment Rules" />
      <div className="p-4 space-y-4">
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Terms of Service</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            By using PINONI, you agree to our terms of service. All investment returns are based on the selected VIP plan.
            PINONI is not responsible for investment losses outside the platform. Deposits are non-refundable once approved.
            PINONI reserves the right to suspend accounts violating platform policies.
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Investment Rules</span>
          </div>
          <ul className="text-sm text-muted-foreground leading-relaxed space-y-1.5 list-disc pl-4">
            <li>Minimum deposit: 5,000 RWF.</li>
            <li>All VIP plans run for 20 days with daily income.</li>
            <li>Referral commissions: 10% Level 1, 5% Level 2, 2% Level 3.</li>
            <li>Withdrawals are processed within 48 hours of approval.</li>
            <li>Withdrawals available Monday to Saturday, 07:00 to 13:00.</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}

export function SupportPage() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    supabase.from('settings').select('*').maybeSingle().then(({ data }) => setSettings(data as Settings));
  }, []);

  const telegramChannel = settings?.telegram_channel_link || 'https://t.me/pinoni';
  const telegramAdmin = settings?.telegram_admin_link || 'https://t.me/pinoni_admin';
  const whatsappGroup = settings?.whatsapp_group_link || '';

  return (
    <Layout>
      <PageHeader title="Customer Service" />
      <div className="p-4 space-y-4">
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Contact Support</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our customer service team is available 24/7 to assist you with any questions or issues.
          </p>
          {telegramChannel && (
            <a
              href={telegramChannel}
              target="_blank"
              rel="noreferrer"
              className="block w-full btn-gold rounded-xl py-3 text-center text-sm font-semibold"
            >
              Join Telegram Channel
            </a>
          )}
          {telegramAdmin && (
            <a
              href={telegramAdmin}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-xl py-3 text-center text-sm font-semibold border-2 border-primary text-primary bg-primary/5"
            >
              Contact Telegram Admin
            </a>
          )}
          {whatsappGroup && (
            <a
              href={whatsappGroup}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-xl py-3 text-center text-sm font-semibold border-2 border-green-600 text-green-600 bg-green-50"
            >
              Supportive WhatsApp Group
            </a>
          )}
        </div>
        <div className="glass-card rounded-2xl p-4 space-y-2">
          <div className="text-sm font-bold text-foreground">FAQ</div>
          {[
            { q: 'How do I deposit?', a: 'Go to Recharge, choose MTN or Airtel mobile money, enter your number and amount. Payment is processed automatically.' },
            { q: 'When does daily income start?', a: 'Daily income starts 24 hours after purchasing a VIP plan. Each plan lasts 20 days.' },
            { q: 'How long are withdrawals?', a: 'Withdrawals are processed automatically via MTN or Airtel mobile money. A 5% fee applies.' },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-border last:border-0 pb-2 last:pb-0">
              <div className="text-sm font-semibold text-foreground">{q}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{a}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
