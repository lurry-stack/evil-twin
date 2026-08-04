import { useState, useEffect, useRef } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, fmt, Settings } from '../lib/supabase';
import { Loader2, Smartphone, Check, Upload, Copy, Clock } from 'lucide-react';

const providers = [
  { name: 'MTN', color: '#FFCC00', textColor: '#000', desc: 'MTN Mobile Money' },
  { name: 'Airtel', color: '#E40000', textColor: '#fff', desc: 'Airtel Money' },
];

export function DepositPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'MTN' | 'Airtel'>('MTN');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('settings').select('*').maybeSingle().then(({ data }) => setSettings(data as Settings));
  }, []);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile]);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

  const ussdTemplate = provider === 'MTN'
    ? (settings?.mtn_ussd_template || '*182*8*1*101010*{amount}#')
    : (settings?.airtel_ussd_template || '*425*2*101010*{amount}#');
  const destination = provider === 'MTN'
    ? (settings?.mtn_destination || '101010')
    : (settings?.airtel_destination || '101010');
  const ussdCode = ussdTemplate.replace('{amount}', amount || '0');

  const copyUssd = () => {
    navigator.clipboard.writeText(ussdCode).then(() => {
      setCopied(true);
      toast.success('USSD code copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const uploadScreenshot = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('deposit-screenshots')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data: urlData } = supabase.storage.from('deposit-screenshots').getPublicUrl(path);
    setScreenshotUrl(urlData.publicUrl);
    setUploading(false);
    toast.success('Screenshot uploaded');
  };

  const submit = async () => {
    const amt = Number(amount);
    const min = settings?.min_deposit || 2000;
    if (!amt || amt < min) {
      toast.error(`Minimum deposit is RWF ${fmt(min)}`);
      return;
    }
    if (!phone || phone.length < 8) {
      toast.error('Enter a valid mobile money phone number');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('deposits').insert({
      user_id: profile.id,
      amount: amt,
      status: 'pending',
      bank_name: provider,
      account_number: phone,
      holder_name: `${provider} - ${phone}`,
      screenshot_url: screenshotUrl,
    });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    setSubmitting(false);
    toast.success('Deposit submitted! Waiting for admin approval.');
    navigate('/records');
  };

  return (
    <Layout>
      <PageHeader title="Recharge" />
      <div className="p-4 space-y-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Current Balance</div>
          <div className="text-2xl font-black text-foreground">RWF {fmt(profile.main_balance || 0)}</div>
        </div>

        {/* Provider selection */}
        <div>
          <div className="text-sm font-bold text-foreground mb-2">Select Mobile Money Provider</div>
          <div className="grid grid-cols-2 gap-3">
            {providers.map((p) => {
              const selected = provider === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => setProvider(p.name as 'MTN' | 'Airtel')}
                  className={`rounded-xl p-4 border-2 transition-all flex flex-col items-center gap-2 ${
                    selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                  }`}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: p.color }}
                  >
                    <Smartphone className="w-6 h-6" style={{ color: p.textColor }} />
                  </div>
                  <div className="text-sm font-bold text-foreground">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.desc}</div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Amount input */}
        <div>
          <div className="text-sm font-bold text-foreground mb-2">Deposit Amount (RWF)</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Min ${fmt(settings?.min_deposit || 2000)}`}
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Minimum deposit: {fmt(settings?.min_deposit || 2000)} RWF.
          </p>
        </div>

        {/* Quick amounts */}
        <div className="grid grid-cols-4 gap-2">
          {[2000, 5000, 10000, 25000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="bg-muted/50 border border-border rounded-lg py-2 text-xs font-bold text-foreground active:scale-95 transition-transform"
            >
              {fmt(v)}
            </button>
          ))}
        </div>

        {/* USSD Code — shown immediately when a provider is selected */}
        <div className="glass-card rounded-2xl p-4 border-2 border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{provider} USSD Payment Code</span>
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            Dial this code on your phone to pay via {provider} Mobile Money:
          </div>
          <div className="bg-black rounded-xl p-3 flex items-center justify-between gap-2">
            <code className="text-yellow-400 font-mono text-sm font-bold flex-1 break-all">{ussdCode}</code>
            <button
              onClick={copyUssd}
              className="shrink-0 bg-primary text-white rounded-lg p-2 active:scale-90 transition-transform"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            <div>Destination name: <span className="font-bold text-foreground">{destination}</span></div>
            <div className="mt-0.5">Amount: <span className="font-bold text-foreground">{amount && Number(amount) > 0 ? `${fmt(Number(amount))} RWF` : 'Enter amount below'}</span></div>
          </div>
        </div>

        {/* Phone number */}
        <div>
          <div className="text-sm font-bold text-foreground mb-2">Your Mobile Money Number</div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+250 7XX XXX XXX"
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Screenshot upload */}
        <div>
          <div className="text-sm font-bold text-foreground mb-2">Payment Screenshot (Recommended)</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadScreenshot(f); }}
          />
          {screenshotUrl ? (
            <div className="relative rounded-xl overflow-hidden border-2 border-primary">
              <img src={screenshotUrl} alt="Payment screenshot" className="w-full h-40 object-cover" />
              <button
                onClick={() => { setScreenshotUrl(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold"
              >
                X
              </button>
              <div className="absolute bottom-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Uploaded
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-border rounded-xl py-6 flex flex-col items-center gap-2 text-muted-foreground active:scale-95 transition-transform disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold">Tap to upload payment screenshot</span>
                  <span className="text-[10px]">JPG, PNG up to 5MB</span>
                </>
              )}
            </button>
          )}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-xl font-black text-sm px-8 py-3.5 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', color: '#fff' }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? 'Submitting...' : `Submit Deposit Request`}
        </button>

        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-800 text-xs flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Deposits require admin approval. Dial the USSD code to pay, upload a screenshot as proof, then submit. Your balance will be credited once the admin approves your deposit.</p>
        </div>
      </div>
    </Layout>
  );
}
