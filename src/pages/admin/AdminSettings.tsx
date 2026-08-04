import { useEffect, useState, useCallback } from 'react';
import { supabase, Settings } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Loader2, Save } from 'lucide-react';

export function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('settings').select('*').maybeSingle();
    if (error) { toast.error(error.message); setLoading(false); return; }
    setSettings(data as Settings);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    const { error } = await supabase.from('settings').update({
      announcement: settings.announcement,
      welcome_message: settings.welcome_message,
      telegram_channel_link: settings.telegram_channel_link,
      telegram_admin_link: settings.telegram_admin_link,
      whatsapp_group_link: settings.whatsapp_group_link,
      min_deposit: settings.min_deposit,
      max_balance_restriction: settings.max_balance_restriction,
      min_withdraw: settings.min_withdraw,
      withdraw_arrival_hours: settings.withdraw_arrival_hours,
      withdraw_fee_percent: settings.withdraw_fee_percent,
      mtn_ussd_template: settings.mtn_ussd_template,
      airtel_ussd_template: settings.airtel_ussd_template,
      mtn_destination: settings.mtn_destination,
      airtel_destination: settings.airtel_destination,
    }).eq('id', settings.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Settings saved');
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>;
  }
  if (!settings) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No settings row found.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <Field label="Announcement" value={settings.announcement || ''} onChange={(v) => setSettings({ ...settings, announcement: v })} multiline />
        <Field label="Welcome Message" value={settings.welcome_message || ''} onChange={(v) => setSettings({ ...settings, welcome_message: v })} multiline />
        <Field label="Telegram Channel Link" value={settings.telegram_channel_link || ''} onChange={(v) => setSettings({ ...settings, telegram_channel_link: v })} />
        <Field label="Telegram Admin Link" value={settings.telegram_admin_link || ''} onChange={(v) => setSettings({ ...settings, telegram_admin_link: v })} />
        <Field label="WhatsApp Group Link" value={settings.whatsapp_group_link || ''} onChange={(v) => setSettings({ ...settings, whatsapp_group_link: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min Deposit (RWF)" type="number" value={String(settings.min_deposit)} onChange={(v) => setSettings({ ...settings, min_deposit: Number(v) })} />
          <Field label="Max Balance Restriction" type="number" value={String(settings.max_balance_restriction)} onChange={(v) => setSettings({ ...settings, max_balance_restriction: Number(v) })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min Withdraw (RWF)" type="number" value={String(settings.min_withdraw)} onChange={(v) => setSettings({ ...settings, min_withdraw: Number(v) })} />
          <Field label="Withdraw Arrival (hours)" type="number" value={String(settings.withdraw_arrival_hours)} onChange={(v) => setSettings({ ...settings, withdraw_arrival_hours: Number(v) })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Withdraw Fee (%)" type="number" value={String(settings.withdraw_fee_percent ?? 20)} onChange={(v) => setSettings({ ...settings, withdraw_fee_percent: Number(v) })} />
        </div>
      </div>

      {/* USSD Code Settings */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="text-sm font-bold text-foreground">MTN USSD Code</div>
        <Field label="MTN USSD Template (use {amount} as placeholder)" value={settings.mtn_ussd_template || ''} onChange={(v) => setSettings({ ...settings, mtn_ussd_template: v })} />
        <Field label="MTN Destination Number" value={settings.mtn_destination || ''} onChange={(v) => setSettings({ ...settings, mtn_destination: v })} />
        <div className="text-sm font-bold text-foreground pt-2">Airtel USSD Code</div>
        <Field label="Airtel USSD Template (use {amount} as placeholder)" value={settings.airtel_ussd_template || ''} onChange={(v) => setSettings({ ...settings, airtel_ussd_template: v })} />
        <Field label="Airtel Destination Number" value={settings.airtel_destination || ''} onChange={(v) => setSettings({ ...settings, airtel_destination: v })} />
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Settings
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', multiline = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground font-semibold block mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      )}
    </div>
  );
}
