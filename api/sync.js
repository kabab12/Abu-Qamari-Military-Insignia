// خادم مزامنة أبو قمري — Vercel Function + Supabase (بدون مكتبات)
// يبحث عن المتغيرات حتى لو أضاف Vercel قبلها بادئة مثل STORAGE_ أو غيّر اسمها
const ENV = process.env;
const names = Object.keys(ENV);
const pick = (...sfx) => {
  for (const s of sfx) { const k = names.find(n => n === s); if (k && ENV[k]) return ENV[k]; }
  for (const s of sfx) { const k = names.find(n => n.endsWith('_' + s) && ENV[n]); if (k) return ENV[k]; }
  return '';
};
const SB_URL = (pick('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const SB_KEY = pick('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SERVICE_ROLE_KEY');
const MAX = 3.5 * 1024 * 1024;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'طلب غير مسموح' });
  if (!SB_URL || !SB_KEY) {
    const found = names.filter(n => /SUPABASE/i.test(n)).join(', ') || 'لا يوجد';
    const miss = (!SB_URL ? 'رابط SUPABASE_URL ' : '') + (!SB_KEY ? 'مفتاح SUPABASE_SERVICE_ROLE_KEY ' : '');
    return res.status(500).json({ error: 'قاعدة البيانات غير مربوطة: ينقص ' + miss.trim() + ' — المتغيرات الموجودة: ' + found + ' — أعد نشر المشروع بعد إضافتها' });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'بريد غير صالح' });

  const H = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (SB_KEY.startsWith('eyJ')) H.Authorization = 'Bearer ' + SB_KEY;
  const T = SB_URL + '/rest/v1/abq_backups';
  const q = '?email=eq.' + encodeURIComponent(email);

  try {
    if (b.action === 'check' || b.action === 'login') {
      const r = await fetch(T + q + '&select=updated_at', { headers: H });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'db');
      return res.json({ hasData: j.length > 0 });
    }
    if (b.action === 'pull') {
      const r = await fetch(T + q + '&select=data,updated_at', { headers: H });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'db');
      return res.json({ data: j[0] ? j[0].data : null, ts: j[0] ? Date.parse(j[0].updated_at) : null });
    }
    if (b.action === 'push') {
      const data = typeof b.data === 'string' ? b.data : '';
      if (!data) return res.status(400).json({ error: 'لا توجد بيانات' });
      if (data.length > MAX) return res.status(413).json({ error: 'حجم البيانات كبير جداً' });
      const now = new Date().toISOString();
      const r = await fetch(T + '?on_conflict=email', {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ email, data, updated_at: now })
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || 'db'); }
      return res.json({ ok: true, ts: Date.parse(now) });
    }
    return res.status(400).json({ error: 'إجراء غير معروف' });
  } catch (e) {
    const m = String(e.message || '');
    const hint = /abq_backups|relation|schema cache/i.test(m) ? ' (الجدول غير موجود: شغّل ملف supabase.sql في Supabase → SQL Editor)' : /api key|jwt|invalid/i.test(m) ? ' (المفتاح غير صحيح: استخدم service_role أو secret وليس anon/publishable)' : '';
    return res.status(500).json({ error: 'تعذر الحفظ في قاعدة البيانات: ' + m + hint });
  }
};
