'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

// --- TYPES ---
interface Invoice {
  id: string;
  num: number | string;
  type: number;
  cid: string;
  name: string;
  email: string;
  phone: string;
  amt: number;
  date: string;
  due: string;
  purl: string;
  durl: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  tax: string;
  city: string;
  pt: number | string;
}

interface LogEntry {
  m: string;
  t: 'in' | 'ok' | 'er';
  tm: string;
}

// --- CONSTANTS ---
const DOCUMENT_TYPES: Record<number, string> = {
  300: 'חשבון עסקה',
  305: 'חשבונית מס',
  320: 'מס/קבלה',
  10: 'הצעת מחיר',
  100: 'הזמנה',
  400: 'קבלה',
};

const PAYMENT_TERMS: Record<string, string> = {
  '-1': 'מיידי',
  '0': 'שוטף',
  '30': 'שוטף+30',
  '60': 'שוטף+60',
  '90': 'שוטף+90',
};

const AVATAR_COLORS = ['a', 'b', 'c', 'd', 'e', 'f'];

// --- HELPERS ---
const fm = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fd = (d: string) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const da = (d: string) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : 0;
const ac = (i: number) => AVATAR_COLORS[i % 6];

export default function MorningCollection() {
  // --- STATE ---
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState('inv');
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('overdue');
  
  const [token, setToken] = useState<string | null>(null);
  const [env, setEnv] = useState('production');
  const [isConnected, setIsConnected] = useState(false);
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, Client>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sentInvoices, setSentInvoices] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // API Config
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [businessName, setBusinessName] = useState('העסק שלי');
  const [waTemplate, setWaTemplate] = useState('שלום {clientName},\n\nפנייה זו מטעם {businessName}.\n\nברצוננו להזכירך כי {invoiceDetails} טרם שולמו.\n\nסה״כ לתשלום: {totalAmount}\n\nקישור לתשלום:\n{paymentLinks}\n\nנודה לטיפולך בהקדם.\nבברכה, {businessName}');
  const [emailSubject, setEmailSubject] = useState('תזכורת תשלום — {invoiceDetails} | {businessName}');
  const [emailTemplate, setEmailTemplate] = useState('שלום רב {clientName},\n\nאנו פונים אליך מטעם {businessName} בנוגע לחשבוניות פתוחות:\n\n{invoiceDetails}\n\nסה״כ לתשלום: {totalAmount}\n\nקישורים ישירים:\n{paymentLinks}\n\n{documentLinks}\n\nנודה על הסדרת התשלום בהקדם.\n\nבכבוד רב,\n{businessName}');

  // UI States
  const [showSettings, setShowSettings] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showClientDetail, setShowClientDetail] = useState(false);
  const [reminderData, setReminderData] = useState<{ type: 'whatsapp' | 'email', invs: Invoice[] } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ m: string, t: 'ok' | 'er' } | null>(null);
  const [connFeedback, setConnFeedback] = useState<{ type: string, title: string, detail: string } | null>(null);

  // --- PERSISTENCE ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDark(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Load settings from Database
    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data && !data.error) {
        if (data.apiKeyId) setApiKeyId(data.apiKeyId);
        if (data.apiSecret) setApiSecret(data.apiSecret);
        if (data.env) setEnv(data.env);
        if (data.businessName) setBusinessName(data.businessName);
        if (data.waTemplate) setWaTemplate(data.waTemplate);
        if (data.emailSubject) setEmailSubject(data.emailSubject);
        if (data.emailTemplate) setEmailTemplate(data.emailTemplate);
      }
    }).catch(() => {
      addLog('לא נטען ממאגר נתונים (DATABASE_URL לא מוגדר)', 'er');
    });
  }, []);

  const saveSettings = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKeyId,
          apiSecret,
          env,
          businessName,
          waTemplate,
          emailSubject,
          emailTemplate
        })
      });
      toast('הגדרות נשמרו בהצלחה למסד הנתונים');
    } catch {
      toast('שגיאה בשמירת הגדרות', 'er');
    }
    setShowSettings(false);
  };

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', newTheme ? 'dark' : 'white');
  };

  const toast = (m: string, t: 'ok' | 'er' = 'ok') => {
    setToastMessage({ m, t });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const addLog = (m: string, t: 'in' | 'ok' | 'er' = 'in') => {
    setLogs((prev: LogEntry[]) => [{ m, t, tm: new Date().toLocaleTimeString('he-IL') }, ...prev]);
  };

  // --- API ---
  const apiCall = async (method: string, endpoint: string, body?: any) => {
    const url = `/api/proxy?endpoint=${encodeURIComponent(endpoint)}&env=${env}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  };

  const loadData = async () => {
    if (!token) return;
    try {
      addLog('טוען נתונים...', 'in');
      const invData = await apiCall('POST', 'documents/search', { page: 0, pageSize: 100, type: [300, 305, 320], status: [0], sort: 'documentDate' });
      const items = invData.items || invData || [];
      const mappedInvoices = items.map((x: any) => ({
        id: x.id,
        num: x.number,
        type: x.type,
        cid: x.client?.id || x.clientId,
        name: x.client?.name || x.recipient?.name || 'לקוח',
        email: x.client?.emails?.[0] || x.recipient?.emails?.[0] || '',
        phone: x.client?.phone || x.recipient?.phone || '',
        amt: x.total || x.totalAmount || 0,
        date: x.date || x.documentDate,
        due: x.dueDate,
        purl: x.url?.origin || x.paymentUrl || '',
        durl: x.files?.downloadLinks?.he || ''
      }));

      const cliData = await apiCall('POST', 'clients/search', { page: 0, pageSize: 100, active: true });
      const cliItems = cliData.items || cliData || [];
      const mappedClients = cliItems.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.emails?.[0] || '',
        phone: c.phone || '',
        tax: c.taxId || '',
        city: c.city || '',
        pt: c.paymentTerms
      }));

      const newClientMap: Record<string, Client> = {};
      mappedClients.forEach((c: any) => newClientMap[c.id] = c);
      
      // Merge contact info if missing in invoice
      mappedInvoices.forEach((i: Invoice) => {
        const c = newClientMap[i.cid];
        if (c) {
          if (!i.email) i.email = c.email;
          if (!i.phone) i.phone = c.phone;
        }
      });

      setInvoices(mappedInvoices);
      setClients(mappedClients);
      setClientMap(newClientMap);
      addLog(`${mappedInvoices.length} חשבוניות נטענו`, 'ok');
    } catch (e: any) {
      addLog(`שגיאה בטעינה: ${e.message}`, 'er');
      toast(e.message, 'er');
    }
  };

  const connect = async () => {
    if (!apiKeyId || !apiSecret) {
      setConnFeedback({ type: 'warn', title: 'חסרים פרטים', detail: 'יש להזין מזהה מפתח וסוד.' });
      return;
    }
    
    setConnFeedback({ type: 'loading', title: 'מתחבר ל-Morning...', detail: 'שולח בקשת אימות...' });
    
    try {
      const res = await fetch(`/api/proxy?endpoint=account/token&env=${env}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: apiKeyId, secret: apiSecret })
      });

      if (!res.ok) {
        setConnFeedback({ type: 'error', title: 'שגיאת חיבור', detail: 'ודא שפרטי ה-API נכונים (Key & Secret).' });
        return;
      }

      const data = await res.json();
      if (!data.token) throw new Error('No token');

      setToken(data.token);
      setIsConnected(true);
      setConnFeedback({ type: 'success', title: 'מחובר!', detail: 'טוען נתונים...' });
      
      // Load data immediately
      const tokenVar = data.token;
      // We can't await loadData here easily because state hasn't updated, 
      // but we can pass token to a refined load function or use a separate effect.
    } catch (e: any) {
      setConnFeedback({ type: 'error', title: 'שגיאה', detail: e.message });
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  const loadDemo = () => {
    const demoInv = [
      { id: 'd1', num: 1042, type: 300, cid: 'c1', name: 'סקיאן תכשיטים', email: 'info@sakian.co.il', phone: '052-555-1234', amt: 8500, date: '2026-01-15', due: '2026-02-15', purl: '', durl: '' },
      { id: 'd2', num: 1038, type: 305, cid: 'c2', name: 'פסקינו', email: 'office@paskino.co.il', phone: '053-555-2345', amt: 4200, date: '2026-02-01', due: '2026-03-01', purl: '', durl: '' },
      { id: 'd3', num: 1045, type: 300, cid: 'c3', name: 'פישר קלינינג', email: 'billing@fischer.co.il', phone: '054-555-3456', amt: 3600, date: '2026-02-10', due: '2026-03-10', purl: '', durl: '' },
      { id: 'd4', num: 1046, type: 300, cid: 'c1', name: 'סקיאן תכשיטים', email: 'info@sakian.co.il', phone: '052-555-1234', amt: 12000, date: '2026-02-20', due: '2026-03-20', purl: '', durl: '' },
      { id: 'd5', num: 1033, type: 305, cid: 'c4', name: 'ספיד מחשבים', email: 'admin@speed.co.il', phone: '050-555-4567', amt: 6800, date: '2025-12-01', due: '2026-01-01', purl: '', durl: '' },
    ];
    setInvoices(demoInv);
    setClients([
      { id: 'c1', name: 'סקיאן תכשיטים', email: 'info@sakian.co.il', phone: '052-555-1234', tax: '515123456', city: 'תל אביב', pt: 30 },
      { id: 'c2', name: 'פסקינו', email: 'office@paskino.co.il', phone: '053-555-2345', tax: '515112233', city: 'רמת גן', pt: 0 },
      { id: 'c3', name: 'פישר קלינינג', email: 'billing@fischer.co.il', phone: '054-555-3456', tax: '512341234', city: 'חיפה', pt: 30 },
      { id: 'c4', name: 'ספיד מחשבים', email: 'admin@speed.co.il', phone: '050-555-4567', tax: '519998887', city: 'אילת', pt: 60 },
    ]);
    setIsConnected(true);
    addLog('מצב דמו הופעל', 'in');
    toast('נטען מצב דמו');
  };

  // --- LOGIC ---
  const filteredInvoices = useMemo(() => {
    let l = [...invoices];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      l = l.filter(i => i.name.toLowerCase().includes(q) || String(i.num).includes(q) || i.email.toLowerCase().includes(q));
    }
    
    switch (activeFilter) {
      case 'overdue': l = l.filter(i => da(i.due) > 0); break;
      case 'sent': l = l.filter(i => sentInvoices[i.id]); break;
      case 'not-sent': l = l.filter(i => !sentInvoices[i.id]); break;
      case 'current': l = l.filter(i => da(i.due) <= 30); break;
      case '30-60': l = l.filter(i => da(i.due) > 30 && da(i.due) <= 60); break;
      case '60-90': l = l.filter(i => da(i.due) > 60 && da(i.due) <= 90); break;
      case '90+': l = l.filter(i => da(i.due) > 90); break;
    }
    
    if (activeFilter.startsWith('type:')) {
      const t = activeFilter.split(':')[1];
      l = l.filter(i => DOCUMENT_TYPES[i.type] === t);
    }
    
    l.sort((a, b) => {
      if (sortBy === 'overdue') return da(b.due) - da(a.due);
      if (sortBy === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'amount-desc') return b.amt - a.amt;
      if (sortBy === 'amount-asc') return a.amt - b.amt;
      return 0;
    });
    
    return l;
  }, [invoices, searchQuery, activeFilter, sortBy, sentInvoices]);

  const stats = useMemo(() => {
    const totalCount = invoices.length;
    const totalAmount = invoices.reduce((s: number, i: Invoice) => s + i.amt, 0);
    const overdueCount = invoices.filter((i: Invoice) => i.due && da(i.due) > 30).length;
    const clientCount = new Set(invoices.map((i: Invoice) => i.cid || i.name)).size;
    return { totalCount, totalAmount, overdueCount, clientCount };
  }, [invoices]);

  const agingData = useMemo(() => {
    const counts = [0, 0, 0, 0];
    const amounts = [0, 0, 0, 0];
    invoices.forEach((inv: Invoice) => {
      const d = da(inv.due);
      const i = d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3;
      counts[i]++; amounts[i] += inv.amt;
    });
    return { counts, amounts };
  }, [invoices]);

  const groupedByClient = useMemo(() => {
    const byC: Record<string, Invoice[]> = {};
    invoices.forEach((i: Invoice) => { const k = i.cid || i.name; (byC[k] = byC[k] || []).push(i); });
    return Object.entries(byC).sort((a, b) => b[1].reduce((s: number, i: Invoice) => s + i.amt, 0) - a[1].reduce((s: number, i: Invoice) => s + i.amt, 0));
  }, [invoices]);

  // --- MESSAGE GENERATION ---
  const generateMessage = (type: 'whatsapp' | 'email', invs: Invoice[]) => {
    const biz = businessName || 'העסק';
    let t = type === 'whatsapp' ? waTemplate : emailTemplate;
    const n = invs[0]?.name || 'לקוח יקר';
    const det = invs.map(i => `חשבונית מס׳ ${i.num || '—'} ע״ס ${fm(i.amt)} מתאריך ${fd(i.date)}`).join('\n');
    const tot = fm(invs.reduce((s, i) => s + i.amt, 0));
    const pay = invs.map(i => `חשבונית ${i.num || ''}: ${i.purl || `https://app.morning.co/document/${i.id}`}`).join('\n');
    const doc = invs.map(i => `צפייה בחשבונית ${i.num || ''}: ${i.durl || `https://app.morning.co/document/${i.id}`}`).join('\n');
    
    return t.replace(/\{clientName\}/g, n)
            .replace(/\{businessName\}/g, biz)
            .replace(/\{invoiceDetails\}/g, det)
            .replace(/\{totalAmount\}/g, tot)
            .replace(/\{paymentLinks\}/g, pay)
            .replace(/\{documentLinks\}/g, doc);
  };

  const markSent = (ids: string[]) => {
    const now = new Date().toISOString();
    const next = { ...sentInvoices };
    ids.forEach(id => next[id] = now);
    setSentInvoices(next);
  };

  const sendByWA = (invs: Invoice[]) => {
    const byC: Record<string, Invoice[]> = {};
    invs.forEach(i => { const k = i.cid || i.name; (byC[k] = byC[k] || []).push(i); });
    
    let sentCount = 0;
    Object.values(byC).forEach(ci => {
      let ph = ci[0].phone.replace(/\D/g, '');
      if (!ph) { addLog(`${ci[0].name}: חסר טלפון`, 'er'); return; }
      if (ph.startsWith('0')) ph = '972' + ph.slice(1);
      
      const msg = generateMessage('whatsapp', ci);
      window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
      addLog(`WA → ${ci[0].name} (${ci.length})`, 'ok');
      sentCount += ci.length;
      markSent(ci.map(i => i.id));
    });
    if (sentCount) toast('WhatsApp נפתח');
  };

  const sendByEmail = (invs: Invoice[]) => {
    const byC: Record<string, Invoice[]> = {};
    invs.forEach(i => { const k = i.cid || i.name; (byC[k] = byC[k] || []).push(i); });
    
    let sentCount = 0;
    Object.values(byC).forEach(ci => {
      if (!ci[0].email) { addLog(`${ci[0].name}: חסר מייל`, 'er'); return; }
      const body = generateMessage('email', ci);
      const biz = businessName || 'העסק';
      const subj = emailSubject.replace(/\{clientName\}/g, ci[0].name)
                               .replace(/\{businessName\}/g, biz)
                               .replace(/\{invoiceDetails\}/g, ci.map(i => `#${i.num}`).join(', '))
                               .replace(/\{totalAmount\}/g, fm(ci.reduce((s, i) => s + i.amt, 0)));
      
      window.open(`mailto:${ci[0].email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`, '_blank');
      addLog(`Mail → ${ci[0].name} (${ci.length})`, 'ok');
      sentCount += ci.length;
      markSent(ci.map(i => i.id));
    });
    if (sentCount) toast('המייל נפתח');
  };

  // --- RENDER HELPERS ---
  const handleBulkAction = (type: 'whatsapp' | 'email') => {
    const selectedInvs = invoices.filter(i => selectedIds.has(i.id));
    if (type === 'whatsapp') sendByWA(selectedInvs);
    else sendByEmail(selectedInvs);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div dir="rtl" className="min-h-screen">
      {/* TOAST */}
      {toastMessage && (
        <div className="tts">
          <div className={`tt ${toastMessage.t}`}>
            {toastMessage.t === 'ok' ? '✓ ' : '✕ '}
            {toastMessage.m}
          </div>
        </div>
      )}

      <div className="app">
        {/* HEADER */}
        <div className="hdr gls">
          <div className="hdr-r">
            <div className="logo">₪</div>
            <div className="hdr-txt">
              <h1>מערכת גבייה</h1>
              <p>Next.js & Morning API</p>
            </div>
          </div>
          <div className="hdr-l">
            <div className="cbadge">
              <span className={`cdot ${isConnected ? 'on' : ''}`}></span>
              <span>{isConnected ? 'מחובר' : 'לא מחובר'}</span>
            </div>
            <div className="tp" onClick={toggleTheme}></div>
            <button className="ib" onClick={() => setShowSettings(true)}>⚙</button>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="qa">
          <button className="qa-btn send-all" onClick={() => sendByWA(invoices.filter(i => da(i.due) > 30))}>תזכר איחור 30+</button>
          <button className="qa-btn wa-all" onClick={() => sendByWA(invoices.filter(i => i.phone))}>WhatsApp לכולם</button>
          <button className="qa-btn refresh" onClick={loadData}>רענן נתונים</button>
          <button className="qa-btn refresh" onClick={() => setActiveTab('grp')}>קבץ לפי לקוח</button>
        </div>

        {/* STATS */}
        <div className="stats">
          <div className={`st gl bl ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => { setActiveTab('inv'); setActiveFilter('all'); }}>
            <div className="st-lbl">פתוחות</div>
            <div className="st-val">{stats.totalCount || '—'}</div>
          </div>
          <div className="st gl or">
            <div className="st-lbl">סה״כ לגבייה</div>
            <div className="st-val">{fm(stats.totalAmount) || '—'}</div>
          </div>
          <div className={`st gl rd ${activeFilter === 'overdue' ? 'active' : ''}`} onClick={() => { setActiveTab('inv'); setActiveFilter('overdue'); }}>
            <div className="st-lbl">באיחור 30+</div>
            <div className="st-val">{stats.overdueCount || '—'}</div>
          </div>
          <div className="st gl pu" onClick={() => setActiveTab('cli')}>
            <div className="st-lbl">לקוחות חייבים</div>
            <div className="st-val">{stats.clientCount || '—'}</div>
          </div>
        </div>

        {/* AGING BAR */}
        <div className="aging gl">
          <div className="aging-title">התפלגות גיל חוב</div>
          <div className="aging-bar">
            {agingData.counts.map((c, i) => (
              <div 
                key={i} 
                className="aging-seg" 
                style={{ 
                  width: `${(c / (invoices.length || 1) * 100)}%`,
                  background: ['var(--green)', 'var(--orange)', 'var(--red)', 'var(--purple)'][i]
                }}
              />
            ))}
          </div>
          <div className="aging-legend">
            {[
              { label: 'שוטף', max: 30, color: 'var(--green)' },
              { label: '30–60', max: 60, color: 'var(--orange)' },
              { label: '60–90', max: 90, color: 'var(--red)' },
              { label: '90+', max: 999, color: 'var(--purple)' }
            ].map((b, i) => (
              <div key={i} className="aging-item" onClick={() => { setActiveTab('inv'); setActiveFilter(i === 0 ? 'current' : i === 1 ? '30-60' : i === 2 ? '60-90' : '90+'); }}>
                <div className="aging-dot" style={{ background: b.color }}></div>
                {b.label}: {agingData.counts[i]} ({fm(agingData.amounts[i])})
              </div>
            ))}
          </div>
        </div>

        {/* NAVIGATION */}
        <div className="nav">
          <button className={`nb ${activeTab === 'inv' ? 'on' : ''}`} onClick={() => setActiveTab('inv')}>חשבוניות</button>
          <button className={`nb ${activeTab === 'cli' ? 'on' : ''}`} onClick={() => setActiveTab('cli')}>לקוחות</button>
          <button className={`nb ${activeTab === 'grp' ? 'on' : ''}`} onClick={() => setActiveTab('grp')}>לפי לקוח</button>
          <button className={`nb ${activeTab === 'log' ? 'on' : ''}`} onClick={() => setActiveTab('log')}>יומן</button>
        </div>

        {/* TABS */}
        {activeTab === 'inv' && (
          <div className="tab">
            <div className="filters">
              <button className={`fc ${activeFilter === 'all' ? 'on' : ''}`} onClick={() => setActiveFilter('all')}><span className="cnt">{invoices.length}</span>הכל</button>
              <button className={`fc ${activeFilter === 'overdue' ? 'on' : ''}`} onClick={() => setActiveFilter('overdue')}><span className="cnt">{invoices.filter(i => da(i.due) > 0).length}</span>באיחור</button>
              <button className={`fc ${activeFilter === 'not-sent' ? 'on' : ''}`} onClick={() => setActiveFilter('not-sent')}><span className="cnt">{invoices.length - Object.keys(sentInvoices).length}</span>לא נשלחה תזכורת</button>
              <button className={`fc ${activeFilter === 'sent' ? 'on' : ''}`} onClick={() => setActiveFilter('sent')}><span className="cnt">{Object.keys(sentInvoices).length}</span>נשלחה תזכורת</button>
            </div>
            <div className="tbar">
              <div className="sbox"><span className="si">⌕</span><input placeholder="חיפוש..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
              <select className="srt" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="overdue">איחור ↓</option>
                <option value="amount-desc">סכום ↓</option>
                <option value="amount-asc">סכום ↑</option>
                <option value="date-asc">ישן→חדש</option>
                <option value="date-desc">חדש→ישן</option>
              </select>
            </div>
            <div className="sa">
              <label><input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === filteredInvoices.length} onChange={toggleSelectAll} /> בחר הכל</label>
              <span>{selectedIds.size}/{filteredInvoices.length}</span>
            </div>
            <div className="cl">
              {filteredInvoices.length === 0 ? (
                <div className="empty">
                  <div className="empty-t">{isConnected ? 'אין חשבוניות בפילטר הנוכחי' : 'יש להתחבר ל-API'}</div>
                  {!isConnected && <div className="empty-h">לחץ על גלגל השיניים להזנת פרטי חיבור</div>}
                </div>
              ) : filteredInvoices.map((inv, idx) => {
                const od = da(inv.due);
                const isOD = od > 0;
                const sent = sentInvoices[inv.id];
                return (
                  <div key={inv.id} className={`ic gl ${selectedIds.has(inv.id) ? 'sel' : ''}`} onClick={(e) => toggleSelect(inv.id, e)}>
                    <div className="ic-top">
                      <div className="ic-cl">
                        <div className={`av ${ac(idx)}`}>{inv.name.charAt(0)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ic-nm">{inv.name}</div>
                          <div className="ic-mt">
                            {inv.phone && <span>{inv.phone}</span>}
                            {inv.email && <span>{inv.email}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="ic-am">{fm(inv.amt)}</div>
                    </div>
                    <div className="ic-mid">
                      <span className="ch ch-n">#{inv.num || '—'}</span>
                      <span className="ch ch-t">{DOCUMENT_TYPES[inv.type] || inv.type}</span>
                      <span className="ch ch-d">{fd(inv.date)}</span>
                      {isOD ? <span className="ch ch-od">{od} ימי איחור</span> : inv.due ? <span className="ch ch-op">עד {fd(inv.due)}</span> : <span className="ch ch-op">פתוחה</span>}
                      {sent && <span className="ch ch-sent">נשלחה {fd(sent)}</span>}
                    </div>
                    <div className="ic-bot" onClick={e => e.stopPropagation()}>
                      <button className="btn bw bs bpl" onClick={() => { setReminderData({ type: 'whatsapp', invs: [inv] }); setShowReminder(true); }} disabled={!inv.phone}>WhatsApp</button>
                      <button className="btn bm bs bpl" onClick={() => { setReminderData({ type: 'email', invs: [inv] }); setShowReminder(true); }} disabled={!inv.email}>מייל</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'cli' && (
          <div className="tab">
            <div className="tbar">
              <div className="sbox"><span className="si">⌕</span><input placeholder="חיפוש לקוח..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
            </div>
            <div className="cl">
              {clients.filter((c: Client) => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map((c: Client, i: number) => {
                const clientInvs = invoices.filter((inv: Invoice) => inv.cid === c.id);
                const debt = clientInvs.reduce((s: number, inv: Invoice) => s + inv.amt, 0);
                return (
                  <div key={c.id} className="cc gl" onClick={() => { setSelectedClientId(c.id); setShowClientDetail(true); }}>
                    <div className="cc-top">
                      <div className="cc-r">
                        <div className={`av ${ac(i)}`}>{c.name.charAt(0)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ic-nm">{c.name}</div>
                          <div className="ic-mt"><span>{clientInvs.length} חשבוניות פתוחות</span></div>
                        </div>
                      </div>
                      <div className={`cc-debt ${debt > 0 ? 'y' : 'n'}`}>{debt > 0 ? fm(debt) : '✓'}</div>
                    </div>
                    <div className="cc-det">
                      <div className="cc-f">מייל: <span>{c.email || '—'}</span></div>
                      <div className="cc-f">טלפון: <span>{c.phone || '—'}</span></div>
                      <div className="cc-f">ח.פ: <span>{c.tax || '—'}</span></div>
                      <div className="cc-f">עיר: <span>{c.city || '—'}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'grp' && (
          <div className="tab">
            <div className="cl grouped">
              {groupedByClient.map(([cid, invs], gi) => {
                const total = invs.reduce((s, i) => s + i.amt, 0);
                const name = invs[0].name;
                const phone = invs[0].phone;
                const email = invs[0].email;
                return (
                  <React.Fragment key={cid}>
                    <div className="grp-hdr gls">
                      <div className="grp-name">
                        <div className={`av ${ac(gi)}`} style={{ width: 28, height: 28, fontSize: 12 }}>{name.charAt(0)}</div>
                        {name} <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>({invs.length})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="grp-total">{fm(total)}</div>
                        <div className="grp-acts">
                          {phone && <button className="btn bw bxs" onClick={() => sendByWA(invs)}>WA</button>}
                          {email && <button className="btn bm bxs" onClick={() => sendByEmail(invs)}>מייל</button>}
                        </div>
                      </div>
                    </div>
                    {invs.map(inv => (
                      <div key={inv.id} className="gl" style={{ borderRadius: '0 0 var(--r2) var(--r2)', padding: '8px 14px', marginBottom: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="ch ch-n">#{inv.num}</span>
                          <span className="ch ch-d">{fd(inv.date)}</span>
                          {da(inv.due) > 0 && <span className="ch ch-od">{da(inv.due)} יום</span>}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, direction: 'ltr' }}>{fm(inv.amt)}</span>
                      </div>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'log' && (
          <div className="tab">
            <div className="gl" style={{ borderRadius: 'var(--r3)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>יומן שליחות</h3>
                <button className="btn bg bxs" onClick={() => setLogs([])}>נקה</button>
              </div>
              <div className="lg">
                {logs.length === 0 ? <div className="lg-l in">המערכת מוכנה.</div> : logs.map((l, i) => (
                  <div key={i} className={`lg-l ${l.t}`}>[{l.tm}] {l.m}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BULK BAR */}
        <div className={`bb gls ${selectedIds.size > 0 ? 'show' : ''}`}>
          <span className="bb-c">{selectedIds.size} נבחרו</span>
          <button className="btn bw bs" onClick={() => handleBulkAction('whatsapp')}>WhatsApp</button>
          <button className="btn bm bs" onClick={() => handleBulkAction('email')}>מייל</button>
          <button className="btn bg bs" onClick={() => setSelectedIds(new Set())}>✕</button>
        </div>

        {/* MODALS / OVERLAYS */}
        
        {/* SETTINGS */}
        <div className={`ov ${showSettings ? 'show' : ''}`} onClick={() => setShowSettings(false)}>
          <div className="sh gls" onClick={e => e.stopPropagation()}>
            <div className="sh-handle"></div>
            <div className="sh-hdr"><h3>הגדרות</h3><button className="sh-x" onClick={() => setShowSettings(false)}>✕</button></div>
            <div className="sh-bd">
              <div className="slbl">חיבור ל-Morning API</div>
              <div className="fld"><label>API KEY ID</label><input value={apiKeyId} onChange={e => setApiKeyId(e.target.value)} placeholder="מזהה מפתח" /></div>
              <div className="fld" style={{ marginTop: 6 }}><label>API SECRET</label><input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="מפתח סודי" /></div>
              <div className="fld" style={{ marginTop: 6 }}>
                <label>סביבה</label>
                <select value={env} onChange={e => setEnv(e.target.value)}>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn bp bs" onClick={connect} style={{ flex: 1 }}>התחבר</button>
                <button className="btn bg bs" onClick={loadDemo}>דמו</button>
              </div>
              
              {connFeedback && (
                <div style={{ marginTop: 12 }}>
                  <div className={`conn-fb ${connFeedback.type}`}>
                    <div className="cfb-icon">{connFeedback.type === 'loading' ? '…' : connFeedback.type === 'success' ? '✓' : '✕'}</div>
                    <div>
                      <div>{connFeedback.title}</div>
                      <div className="cfb-steps">{connFeedback.detail}</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--brd)', margin: '18px 0' }}></div>
              <div className="slbl">שם העסק</div>
              <div className="fld"><input value={businessName} onChange={e => setBusinessName(e.target.value)} style={{ direction: 'rtl', textAlign: 'right' }} /></div>
              
              <div className="slbl" style={{ marginTop: 16 }}>תבנית WhatsApp</div>
              <textarea className="tmpl" value={waTemplate} onChange={e => setWaTemplate(e.target.value)} />
              
              <div className="slbl" style={{ marginTop: 16 }}>נושא מייל</div>
              <div className="fld"><input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ direction: 'rtl', textAlign: 'right' }} /></div>
              
              <div className="slbl" style={{ marginTop: 10 }}>תוכן מייל</div>
              <textarea className="tmpl" style={{ minHeight: 150 }} value={emailTemplate} onChange={e => setEmailTemplate(e.target.value)} />
            </div>
            <div className="sh-ft">
              <button className="btn bp" onClick={saveSettings}>שמור</button>
            </div>
          </div>
        </div>

        {/* REMINDER REWARD */}
        <div className={`ov ${showReminder ? 'show' : ''}`} onClick={() => setShowReminder(false)}>
          <div className="sh gls" onClick={e => e.stopPropagation()}>
            <div className="sh-handle"></div>
            <div className="sh-hdr"><h3>{reminderData?.type === 'whatsapp' ? 'תזכורת WhatsApp' : 'תזכורת מייל'}</h3><button className="sh-x" onClick={() => setShowReminder(false)}>✕</button></div>
            <div className="sh-bd">
              {reminderData && (
                <>
                  <div className="mcli">
                    <div className="av a" style={{ width: 32, height: 32, fontSize: 13 }}>{reminderData.invs[0].name.charAt(0)}</div>
                    <div>
                      <div className="mcli-n">{reminderData.invs[0].name}</div>
                      <div className="mcli-s">{reminderData.type === 'whatsapp' ? reminderData.invs[0].phone : reminderData.invs[0].email}</div>
                    </div>
                  </div>
                  <div className="slbl">תצוגה מקדימה</div>
                  <div className="msg-pre">{generateMessage(reminderData.type, reminderData.invs)}</div>
                </>
              )}
            </div>
            <div className="sh-ft">
              {reminderData?.type === 'whatsapp' ? (
                <button className="btn bw" onClick={() => { sendByWA(reminderData.invs); setShowReminder(false); }}>שלח ב-WhatsApp</button>
              ) : (
                <button className="btn bm" onClick={() => { sendByEmail(reminderData?.invs || []); setShowReminder(false); }}>שלח במייל</button>
              )}
            </div>
          </div>
        </div>

        {/* CLIENT DETAIL */}
        <div className={`ov ${showClientDetail ? 'show' : ''}`} onClick={() => setShowClientDetail(false)}>
          <div className="sh gls" onClick={e => e.stopPropagation()}>
            <div className="sh-handle"></div>
            <div className="sh-hdr"><h3>לקוח</h3><button className="sh-x" onClick={() => setShowClientDetail(false)}>✕</button></div>
            <div className="sh-bd">
              {selectedClientId && clientMap[selectedClientId] && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div className="av a" style={{ width: 44, height: 44, fontSize: 18 }}>{clientMap[selectedClientId].name.charAt(0)}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{clientMap[selectedClientId].name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)' }}>{clientMap[selectedClientId].city || ''} · {clientMap[selectedClientId].tax || ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div className="gl" style={{ borderRadius: 'var(--r2)', padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>סה״כ חוב</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)', direction: 'ltr' }}>{fm(invoices.filter(inv => inv.cid === selectedClientId).reduce((s, inv) => s + inv.amt, 0))}</div>
                    </div>
                    <div className="gl" style={{ borderRadius: 'var(--r2)', padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>פתוחות</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)' }}>{invoices.filter(inv => inv.cid === selectedClientId).length}</div>
                    </div>
                  </div>
                  <div className="slbl">פרטי קשר</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                    <div className="cc-f">מייל: <span>{clientMap[selectedClientId].email || '—'}</span></div>
                    <div className="cc-f">טלפון: <span>{clientMap[selectedClientId].phone || '—'}</span></div>
                    <div className="cc-f">תנאי תשלום: <span>{PAYMENT_TERMS[clientMap[selectedClientId].pt] || clientMap[selectedClientId].pt}</span></div>
                  </div>
                  <div className="slbl">רשימת חשבוניות</div>
                  {invoices.filter(inv => inv.cid === selectedClientId).map(inv => (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '.5px solid var(--brd)' }}>
                      <div><span className="ch ch-n">#{inv.num}</span> <span className="ch ch-d">{fd(inv.date)}</span> {da(inv.due) > 0 && <span className="ch ch-od">{da(inv.due)} יום</span>}</div>
                      <span style={{ fontWeight: 700, direction: 'ltr' }}>{fm(inv.amt)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="sh-ft">
              <button className="btn bw" onClick={() => { sendByWA(invoices.filter(i => i.cid === selectedClientId)); setShowClientDetail(false); }}>שלח הכל ב-WhatsApp</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
