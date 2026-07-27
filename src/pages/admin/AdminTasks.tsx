import { useEffect, useState, useCallback } from 'react';
import { supabase, Task } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Loader2, Plus, Pencil, Trash2, X, ListTodo } from 'lucide-react';

const empty: Omit<Task, 'id'> = {
  title: '', description: '', reward: 0, image: '',
  is_active: true, sort_order: 0,
};

export function AdminTasks() {
  const toast = useToast();
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Task, 'id'>>(empty);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tasks').select('*').order('sort_order', { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data || []) as Task[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title, description: t.description || '', reward: t.reward,
      image: t.image || '', is_active: t.is_active, sort_order: t.sort_order,
    });
    setCreating(false);
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm(empty);
  };

  const cancel = () => { setEditing(null); setCreating(false); };

  const save = async () => {
    if (!form.title) { toast.error('Title required'); return; }
    setBusy(true);
    if (editing) {
      const { error } = await supabase.from('tasks').update(form).eq('id', editing.id);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Task updated');
    } else {
      const { error } = await supabase.from('tasks').insert(form);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Task created');
    }
    cancel();
    load();
  };

  const remove = async (t: Task) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from('tasks').delete().eq('id', t.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Task deleted');
    load();
  };

  return (
    <div className="space-y-3">
      <button
        onClick={startCreate}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Add Task
      </button>

      {(editing || creating) && (
        <div className="bg-card border border-primary/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{editing ? 'Edit Task' : 'New Task'}</span>
            <button onClick={cancel} className="text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <Field label="Description" value={form.description || ''} onChange={(v) => setForm({ ...form, description: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Reward" type="number" value={String(form.reward)} onChange={(v) => setForm({ ...form, reward: Number(v) })} />
            <Field label="Sort Order" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) })} />
          </div>
          <Field label="Image URL" value={form.image || ''} onChange={(v) => setForm({ ...form, image: v })} />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-primary text-white text-sm font-bold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No tasks yet</div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ListTodo className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      {t.title}
                      {!t.is_active && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Reward: FRW {t.reward} · Order: {t.sort_order}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(t)} className="p-2 rounded-lg bg-primary/10 text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(t)} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground font-semibold block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}
