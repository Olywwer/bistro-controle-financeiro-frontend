import React, { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'bistro-de-sabores-financeiro-v1';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const categories = {
  income: ['Vendas', 'Delivery', 'Eventos', 'Outros'],
  expense: ['Boletos', 'Compras de mercado', 'Notas da Cobal avulsas', 'Fornecedores', 'Insumos', 'Equipe', 'Aluguel', 'Impostos', 'Outros'],
  investment: ['Aplicações', 'Equipamentos', 'Reformas', 'Expansão', 'Outros investimentos'],
};
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimalCurrency = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, { ...options, credentials: 'include' });
}

function parseMoney(value) {
  const normalized = String(value ?? '').trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatMoneyInput(value) {
  if (typeof value === 'number') return decimalCurrency.format(value);
  const raw = String(value ?? '');
  if (!raw) return '';
  const negative = raw.trim().startsWith('-');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return `${negative && amount > 0 ? '-' : ''}${decimalCurrency.format(amount)}`;
}

function handleMoneyInput(event) {
  event.currentTarget.value = formatMoneyInput(event.currentTarget.value);
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEntryStatus(entry, today = localDate(new Date())) {
  if (entry.status === 'paid') return 'paid';
  return entry.dueDate && entry.dueDate < today ? 'overdue' : 'pending';
}

function getEntryStatusLabel(entry, status = getEntryStatus(entry)) {
  if (status === 'paid') return entry.type === 'income' ? 'Recebido' : 'Pago';
  if (status === 'overdue') return 'Vencido';
  if (entry.dueDate === localDate(new Date())) return 'Vence hoje';
  return entry.type === 'income' ? 'A receber' : 'A pagar';
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { entries: [], suppliers: [], banks: [], bankUpdates: [] };
  try {
    const data = JSON.parse(saved);
    if (!Array.isArray(data.entries)) {
      throw new Error('Formato de dados inválido.');
    }
    const banks = Array.isArray(data.banks) ? [...data.banks] : [];
    const standardBanks = [
      { id: 'default-bank-sicredi', institution: 'Sicredi', name: 'Sicredi', balance: 0 },
      { id: 'default-bank-nubank', institution: 'Nubank', name: 'Nubank', balance: 0 },
    ];
    for (const bank of standardBanks) {
      const exists = banks.some((account) => account.institution?.toLocaleLowerCase('pt-BR') === bank.institution.toLocaleLowerCase('pt-BR'));
      if (!exists) banks.push(bank);
    }
    return {
      entries: data.entries.filter((entry) => !String(entry.id).startsWith('demo-')),
      suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
      banks,
      bankUpdates: Array.isArray(data.bankUpdates) ? data.bankUpdates : [],
    };
  } catch (error) {
    console.error('Não foi possível carregar os dados financeiros salvos.', error);
    return { entries: [], suppliers: [], banks: [], bankUpdates: [] };
  }
}

function normalizeData(data) {
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
    suppliers: Array.isArray(data?.suppliers) ? data.suppliers : [],
    banks: Array.isArray(data?.banks) ? data.banks : [],
    bankUpdates: Array.isArray(data?.bankUpdates) ? data.bankUpdates : [],
  };
}

function loadLegacyDataForImport() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return normalizeData(loadData());
  let parsed;
  try {
    parsed = JSON.parse(saved);
  } catch (error) {
    throw new Error('Os dados antigos do navegador estão inválidos e não foram importados. Preserve o armazenamento local e revise-o antes de tentar novamente.', { cause: error });
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error('Os dados antigos do navegador não têm o formato esperado e não foram importados.');
  }
  return normalizeData(loadData());
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let result = {};
  if (contentType.includes('application/json')) {
    result = await response.json().catch(() => ({}));
  }
  if (!response.ok) {
    const message = result.error || (response.status >= 500 && !contentType.includes('application/json')
      ? 'A API não respondeu. Verifique se o backend está ativo e tente novamente.'
      : `Falha na API (HTTP ${response.status}).`);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return result;
}

function Icon({ name, size = 19 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    receipt: <><path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-2z" /><path d="M9 8h6M9 12h6" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    down: <path d="m7 10 5 5 5-5" />,
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v4h14v-4" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6" /><path d="M10 11v5m4-5v5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}

function getEntryCreatorLabel(entry) {
  if (entry.createdByName) return `${entry.createdByName}${entry.createdByUsername ? ` (@${entry.createdByUsername})` : ''}`;
  if (entry.createdByUsername) return `@${entry.createdByUsername}`;
  return 'Não identificado (lançamento antigo)';
}

function AuthScreen({ status, error, onAuthenticated, onRetry }) {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const result = await readApiResponse(response);
      onAuthenticated(result.user);
    } catch (requestError) {
      setMessage(requestError.message || 'Não foi possível entrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password }),
      });
      const result = await readApiResponse(response);
      onAuthenticated(result.user);
    } catch (requestError) {
      setMessage(requestError.message || 'Não foi possível criar o cadastro.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking') {
    return <main className="auth-gate"><section className="auth-card"><img src="/logo-bistro-circular.png" alt="" /><h1>Carregando acesso</h1><p>Aguarde enquanto carregamos sua sessão.</p></section></main>;
  }
  if (status === 'error') {
    return <main className="auth-gate"><section className="auth-card"><img src="/logo-bistro-circular.png" alt="" /><h1>Não foi possível conectar</h1><p>{error}</p><button className="primary-button" onClick={onRetry}>Tentar novamente</button></section></main>;
  }

  return <main className="auth-gate">
    <section className="auth-card">
      <img src="/logo-bistro-circular.png" alt="Logo do Bistrô de Sabores" />
      <span className="eyebrow">CONTROLE FINANCEIRO</span>
      <h1>{mode === 'register' ? 'Criar cadastro' : 'Entrar na sua conta'}</h1>
      <p>{mode === 'register'
        ? 'Crie um usuário e uma senha para acessar os dados do restaurante.'
        : 'Acesse os dados compartilhados do Bistrô de Sabores.'}</p>

      {message && <div className="auth-message" role="status">{message}</div>}

      {mode === 'login' && <form className="auth-form" onSubmit={submitLogin}>
        <label className="form-field"><span>Usuário</span><input className="form-control" name="username" autoComplete="username" required maxLength="32" placeholder="Ex.: usuario.bistro" /></label>
        <label className="form-field"><span>Senha</span><input className="form-control" name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
        <button type="button" className="auth-switch" onClick={() => { setMode('register'); setMessage(''); }}>Ainda não tem cadastro? Criar conta</button>
      </form>}

      {mode === 'register' && <form className="auth-form" onSubmit={submitRegistration}>
        <label className="form-field"><span>Nome completo</span><input className="form-control" name="name" autoComplete="name" required minLength="2" maxLength="120" /></label>
        <label className="form-field"><span>Crie seu usuário</span><input className="form-control" name="username" autoComplete="username" required minLength="3" maxLength="32" pattern="[A-Za-z0-9._-]+" title="Use letras sem acento, números, ponto, hífen ou sublinhado." placeholder="Ex.: usuario.bistro" /></label>
        <label className="form-field"><span>Senha numérica (6 dígitos)</span><input className="form-control" name="password" type="password" inputMode="numeric" autoComplete="new-password" required minLength="6" maxLength="6" pattern="[0-9]{6}" title="A senha deve conter exatamente 6 números." /></label>
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Criando cadastro...' : 'Cadastrar e entrar'}</button>
        <button type="button" className="auth-switch" onClick={() => { setMode('login'); setMessage(''); }}>Já tenho cadastro</button>
      </form>}

      <small className="auth-shared-note">Os usuários cadastrados compartilham os dados financeiros do restaurante.</small>
    </section>
  </main>;
}

function App() {
  const [data, setData] = useState(loadData);
  const [authStatus, setAuthStatus] = useState('checking');
  const [authUser, setAuthUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authRetry, setAuthRetry] = useState(0);
  const [databaseStatus, setDatabaseStatus] = useState('connecting');
  const [databaseError, setDatabaseError] = useState('');
  const [databaseRetry, setDatabaseRetry] = useState(0);
  const [databaseSaveError, setDatabaseSaveError] = useState('');
  const [databaseSaving, setDatabaseSaving] = useState(false);
  const [saveRetry, setSaveRetry] = useState(0);
  const saveQueueRef = useRef(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [activePage, setActivePage] = useState('pagar');
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [entryType, setEntryType] = useState('expense');
  const [newEntryDate, setNewEntryDate] = useState(() => localDate(new Date()));
  const [newEntryDueDate, setNewEntryDueDate] = useState('');
  const [payableEntryToSettle, setPayableEntryToSettle] = useState(null);
  const [paymentBankId, setPaymentBankId] = useState('');
  const [selectedDueDate, setSelectedDueDate] = useState(() => localDate(new Date()));
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState(() => localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [filterEndDate, setFilterEndDate] = useState(() => localDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const [filterType, setFilterType] = useState('all');
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    async function checkSession() {
      setAuthStatus('checking');
      setAuthError('');
      try {
        const response = await apiFetch('/api/auth/me');
        if (response.status === 401) {
          if (active) setAuthStatus('anonymous');
          return;
        }
        const result = await readApiResponse(response);
        if (active) {
          setAuthUser(result.user);
          setAuthStatus('authenticated');
        }
      } catch (error) {
        if (active) {
          setAuthError(error.message || 'Não foi possível verificar sua sessão.');
          setAuthStatus('error');
        }
      }
    }
    checkSession();
    return () => { active = false; };
  }, [authRetry]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;
    let active = true;
    async function connectDatabase() {
      setDatabaseStatus('connecting');
      setDatabaseError('');
      try {
        const response = await apiFetch('/api/data');
        const result = await readApiResponse(response);
        if (result.data) {
          if (active) setData(normalizeData(result.data));
        } else {
          const legacyData = loadLegacyDataForImport();
          const importResponse = await apiFetch('/api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(legacyData),
          });
          await readApiResponse(importResponse);
          if (active) setData(legacyData);
        }
        if (active) setDatabaseStatus('ready');
      } catch (error) {
        if (active) {
          if (error.status === 401) {
            setAuthUser(null);
            setAuthStatus('anonymous');
            return;
          }
          setDatabaseError(error.message || 'Não foi possível conectar ao PostgreSQL.');
          setDatabaseStatus('error');
        }
      }
    }
    connectDatabase();
    return () => { active = false; };
  }, [databaseRetry, authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || databaseStatus !== 'ready') return undefined;
    const sequence = ++saveSequenceRef.current;
    const snapshot = JSON.stringify(normalizeData(data));
    const timeout = window.setTimeout(() => {
      setDatabaseSaving(true);
      const request = saveQueueRef.current.catch(() => undefined).then(async () => {
        const response = await apiFetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: snapshot,
        });
        await readApiResponse(response);
      });
      saveQueueRef.current = request;
      request.then(() => {
        if (sequence === saveSequenceRef.current) {
          setDatabaseSaving(false);
          setDatabaseSaveError('');
        }
      }).catch((error) => {
        if (sequence === saveSequenceRef.current) {
          setDatabaseSaving(false);
          if (error.status === 401) {
            setAuthUser(null);
            setAuthStatus('anonymous');
            return;
          }
          setDatabaseSaveError(error.message || 'Não foi possível salvar os dados no PostgreSQL.');
        }
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [data, databaseStatus, saveRetry, authStatus]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const monthEntries = useMemo(() => data.entries.filter((entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  }), [data.entries, month]);

  const monthBankUpdates = (data.bankUpdates || [])
    .filter((update) => {
      const date = new Date(update.updatedAt);
      return Number.isFinite(date.getTime()) && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const totals = useMemo(() => monthEntries.reduce((acc, entry) => {
    if (entry.status === 'pending') {
      if (entry.type === 'income') acc.receivable += entry.amount;
    } else if (entry.type === 'income') acc.income += entry.amount;
    else if (entry.type === 'expense') acc.expense += entry.amount;
    else if (entry.type === 'investment') acc.investment += entry.amount;
    else if (entry.type === 'withdrawal') acc.withdrawal += entry.amount;
    return acc;
  }, { income: 0, expense: 0, investment: 0, withdrawal: 0, receivable: 0 }), [monthEntries]);

  const invalidDateRange = Boolean(filterStartDate && filterEndDate && filterStartDate > filterEndDate);
  const today = localDate(new Date());
  const filteredEntries = useMemo(() => data.entries
    .filter((entry) => entry.type !== 'investment' && entry.type !== 'withdrawal')
    .filter(() => !invalidDateRange)
    .filter((entry) => (!filterStartDate || entry.date >= filterStartDate) && (!filterEndDate || entry.date <= filterEndDate))
    .filter((entry) => filterType === 'all' || entry.type === filterType)
    .filter((entry) => activeTab === 'all' || (activeTab === 'pending' ? getEntryStatus(entry, today) !== 'paid' : entry.type === activeTab))
    .filter((entry) => {
      const supplierName = data.suppliers.find((supplier) => supplier.id === entry.supplierId)?.name || '';
      const bankName = data.banks.find((bank) => bank.id === entry.bankId)?.name || entry.bank || '';
      return `${entry.description} ${entry.category} ${supplierName} ${bankName} ${entry.method || ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    })
    .sort((a, b) => b.date.localeCompare(a.date)), [data.entries, data.suppliers, data.banks, activeTab, query, filterStartDate, filterEndDate, filterType, invalidDateRange, today]);

  const categoryBreakdown = useMemo(() => {
    const totalsByCategory = monthEntries
      .filter((entry) => entry.status === 'paid' && (entry.type === 'expense' || entry.type === 'investment'))
      .reduce((summary, entry) => {
        const key = `${entry.type}:${entry.category}`;
        summary[key] ??= { key, type: entry.type, category: entry.category, amount: 0 };
        summary[key].amount += entry.amount;
        return summary;
      }, {});
    return Object.values(totalsByCategory).sort((a, b) => b.amount - a.amount).slice(0, 6);
  }, [monthEntries]);
  const categoryTotal = monthEntries
    .filter((entry) => entry.status === 'paid' && (entry.type === 'expense' || entry.type === 'investment'))
    .reduce((total, entry) => total + entry.amount, 0);

  const monthlyTrends = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const offset = index - 5;
    const period = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    const periodEntries = data.entries.filter((entry) => {
      const date = new Date(`${entry.date}T00:00:00`);
      return date.getFullYear() === period.getFullYear() && date.getMonth() === period.getMonth() && entry.status === 'paid';
    });
    return {
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(period).replace('.', ''),
      income: periodEntries.filter((entry) => entry.type === 'income' || entry.type === 'withdrawal').reduce((sum, entry) => sum + entry.amount, 0),
      outflow: periodEntries.filter((entry) => entry.type === 'expense' || entry.type === 'investment').reduce((sum, entry) => sum + entry.amount, 0),
    };
  }), [data.entries, month]);
  const trendMaximum = Math.max(1, ...monthlyTrends.flatMap((period) => [period.income, period.outflow]));
  const trendPoints = (key) => monthlyTrends.map((period, index) => {
    const x = 42 + index * 104;
    const y = 184 - (period[key] / trendMaximum) * 150;
    return `${x},${y}`;
  }).join(' ');

  function clearFilters() {
    setQuery('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterType('all');
    setActiveTab('all');
  }

  async function logout() {
    try {
      const response = await apiFetch('/api/auth/logout', { method: 'POST' });
      await readApiResponse(response);
      setAuthUser(null);
      setAuthStatus('anonymous');
      setDatabaseStatus('connecting');
      setDatabaseSaveError('');
      setData(loadData());
    } catch (error) {
      setToast(error.message || 'Não foi possível encerrar a sessão.');
    }
  }

  function openEntryModal(type) {
    setEntryType(type);
    setNewEntryDate(localDate(new Date()));
    setNewEntryDueDate('');
    setModalOpen(true);
  }

  const draftEntryStatus = !newEntryDueDate
    ? entryType === 'income' ? 'A receber' : 'Informe o vencimento'
    : newEntryDueDate < today
      ? 'Vencido'
      : newEntryDueDate === today ? 'Vence hoje' : 'Pendente';
  const draftEntryStatusClass = draftEntryStatus === 'Vencido' ? 'overdue' : 'pending';

  const weeks = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const start = index * 7 + 1;
    const end = Math.min(start + 6, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
    return monthEntries.reduce((week, entry) => {
      const day = Number(entry.date.slice(-2));
      if (entry.status === 'paid' && day >= start && day <= end) {
        week[entry.type === 'income' || entry.type === 'withdrawal' ? 'income' : 'expense'] += entry.amount;
      }
      return week;
    }, { label: `${String(start).padStart(2, '0')}–${String(end).padStart(2, '0')}`, income: 0, expense: 0 });
  }), [monthEntries, month]);

  const maxWeekValue = Math.max(1, ...weeks.map((week) => week.income + week.expense));
  const investmentTotal = totals.investment;
  const monthInvestments = monthEntries.filter((entry) => entry.type === 'investment');
  const monthWithdrawals = monthEntries.filter((entry) => entry.type === 'withdrawal');
  const netBalance = totals.income + totals.withdrawal - totals.expense - investmentTotal;
  const pendingCount = monthEntries.filter((entry) => entry.status === 'pending' && entry.type !== 'investment').length;
  const openPayables = monthEntries.filter((entry) => entry.status === 'pending' && entry.type !== 'income');
  const payableCount = openPayables.length;
  const openPayableTotal = openPayables.reduce((total, entry) => total + entry.amount, 0);
  const selectedDayPayables = data.entries
    .filter((entry) => entry.status === 'pending' && entry.type === 'expense' && entry.dueDate === selectedDueDate)
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'));
  const selectedDayTotal = selectedDayPayables.reduce((total, entry) => total + entry.amount, 0);

  function changeMonth(amount) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function addEntry(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = form.get('type');
    const isInvestment = type === 'investment';
    const today = localDate(new Date());
    const settledAt = isInvestment ? form.get('investmentDate') : '';
    const isPending = !settledAt;
    const dueDate = isInvestment ? '' : form.get('dueDate');
    const bankId = isInvestment ? form.get('bankId') || '' : '';
    if (isInvestment && settledAt > today) {
      setToast('A data do investimento não pode ser futura.');
      return;
    }
    if (isInvestment && !bankId) {
      setToast('Selecione o banco para registrar o investimento e atualizar o saldo.');
      return;
    }
    if (type !== 'income' && isPending && !dueDate) {
      setToast('Informe a data de vencimento para incluir a conta na agenda diária.');
      return;
    }
    const amount = parseMoney(form.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Informe um valor válido maior que zero.');
      return;
    }
    const bank = data.banks.find((account) => account.id === bankId);
    if (settledAt && (type === 'expense' || isInvestment) && bank && bank.balance < amount) {
      setToast(`Saldo insuficiente em ${bank.name} para registrar este pagamento.`);
      return;
    }
    const entry = {
      id: crypto.randomUUID(),
      createdByName: authUser?.name || '',
      createdByUsername: authUser?.username || '',
      createdAt: new Date().toISOString(),
      description: String(form.get('description') || '').trim(),
      category: isInvestment ? 'Outros investimentos' : form.get('category'),
      type,
      amount,
      date: isInvestment ? form.get('investmentDate') : form.get('date'),
      dueDate: dueDate || undefined,
      supplierId: isInvestment ? undefined : form.get('supplierId') || undefined,
      bankId: bankId || undefined,
      bank: bank?.name || undefined,
      status: isPending ? 'pending' : 'paid',
      method: isInvestment ? 'Investimento' : undefined,
      settledAt: settledAt || undefined,
    };
    setData((current) => ({
      ...current,
      entries: [entry, ...current.entries],
      banks: settledAt && bankId ? current.banks.map((account) => account.id === bankId
        ? { ...account, balance: account.balance + (type === 'income' ? amount : -amount) }
        : account) : current.banks,
    }));
    setMonth(new Date(`${entry.date.slice(0, 7)}-01T00:00:00`));
    setModalOpen(false);
    setToast(isInvestment
      ? `Investimento registrado e descontado do saldo de ${bank.name}.`
      : 'Lançamento criado. O status é calculado pelas datas e a baixa será manual.');
  }

  function addSupplier(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supplier = {
      id: crypto.randomUUID(),
      name: String(form.get('name')).trim(),
      document: String(form.get('document')).trim(),
      phone: String(form.get('phone')).trim(),
      email: String(form.get('email')).trim(),
      category: form.get('category'),
    };
    const alreadyExists = data.suppliers.some((item) => item.name.toLocaleLowerCase('pt-BR') === supplier.name.toLocaleLowerCase('pt-BR'));
    if (alreadyExists) {
      setToast('Já existe um fornecedor com esse nome.');
      return;
    }
    setData((current) => ({ ...current, suppliers: [...current.suppliers, supplier] }));
    setSupplierModalOpen(false);
    setToast('Fornecedor cadastrado com sucesso.');
  }

  function updateBankBalance(event, bankId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const balance = parseMoney(form.get('balance'));
    if (!Number.isFinite(balance)) {
      setToast('Informe um saldo válido.');
      return;
    }
    const account = data.banks.find((item) => item.id === bankId);
    if (!account) {
      setToast('A conta bancária não foi encontrada. Atualize a página e tente novamente.');
      return;
    }
    const bankUpdate = {
      id: crypto.randomUUID(),
      bankId: account.id,
      institution: account.institution,
      name: account.name,
      previousBalance: account.balance,
      balance,
      updatedAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      banks: current.banks.map((account) => account.id === bankId ? { ...account, balance } : account),
      bankUpdates: [bankUpdate, ...(current.bankUpdates || [])],
    }));
    setToast('Saldo atualizado e registrado no histórico.');
  }

  function addInvestmentWithdrawal(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bankId = String(form.get('bankId') || '');
    const amount = parseMoney(form.get('amount'));
    const date = String(form.get('date') || '');
    const description = String(form.get('description') || '').trim();
    const bank = data.banks.find((account) => account.id === bankId);
    if (!bank) {
      setToast('Selecione a conta bancária que receberá a retirada.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Informe um valor válido maior que zero.');
      return;
    }
    if (!date || !description) {
      setToast('Informe o motivo e a data da retirada.');
      return;
    }
    const withdrawal = {
      id: crypto.randomUUID(),
      createdByName: authUser?.name || '',
      createdByUsername: authUser?.username || '',
      createdAt: new Date().toISOString(),
      description,
      category: 'Retirada de investimentos',
      type: 'withdrawal',
      amount,
      date,
      settledAt: date,
      bankId: bank.id,
      bank: bank.name,
      status: 'paid',
      method: 'Retirada de investimento',
    };
    setData((current) => ({
      ...current,
      entries: [withdrawal, ...current.entries],
      banks: current.banks.map((account) => account.id === bank.id
        ? { ...account, balance: account.balance + amount }
        : account),
    }));
    setMonth(new Date(`${date}T00:00:00`));
    event.currentTarget.reset();
    setToast(`Retirada registrada e adicionada ao saldo de ${bank.name}.`);
  }

  function openPayableSettlement(entry) {
    setPayableEntryToSettle(entry);
    setPaymentBankId(entry.bankId || '');
  }

  function confirmPayableSettlement(event) {
    event.preventDefault();
    if (!payableEntryToSettle) return;
    if (paymentBankId !== '__none__' && paymentBankId && !data.banks.some((account) => account.id === paymentBankId)) {
      setToast('A conta bancária selecionada não está disponível. Atualize a lista e tente novamente.');
      return;
    }
    const settled = settleEntry(payableEntryToSettle.id, paymentBankId === '__none__' ? '' : paymentBankId);
    if (settled) setPayableEntryToSettle(null);
  }

  function settleEntry(id, bankIdOverride) {
    const today = localDate(new Date());
    const entry = data.entries.find((item) => item.id === id && item.status === 'pending');
    if (!entry) return false;
    const bankId = bankIdOverride === undefined ? entry.bankId : bankIdOverride || undefined;
    const bank = data.banks.find((account) => account.id === bankId);
    if (bank && entry.type !== 'income' && entry.type !== 'withdrawal' && bank.balance < entry.amount) {
      setToast(`Saldo insuficiente em ${bank.name}. Atualize o saldo ou escolha outra conta antes da baixa.`);
      return false;
    }
    setData((current) => ({
      ...current,
      entries: current.entries.map((item) => item.id === id && item.status === 'pending'
        ? {
          ...item,
          status: 'paid',
          settledAt: today,
          ...(bankIdOverride !== undefined ? { bankId, bank: bank?.name } : {}),
        }
        : item),
      banks: bankId ? current.banks.map((account) => account.id === bankId
        ? { ...account, balance: account.balance + (entry.type === 'income' || entry.type === 'withdrawal' ? entry.amount : -entry.amount) }
        : account) : current.banks,
    }));
    setToast(bank ? 'Título baixado e saldo bancário atualizado.' : 'Baixa registrada. Nenhuma conta vinculada para atualizar.');
    return true;
  }

  function deleteEntry(id) {
    const entry = data.entries.find((item) => item.id === id);
    if (!entry) return;
    const bank = data.banks.find((account) => account.id === entry.bankId);
    const balanceNote = entry.status === 'paid' && bank
      ? ` O saldo de ${bank.name} será ajustado para estornar esta movimentação.`
      : '';
    if (!window.confirm(`Excluir o lançamento "${entry.description}"? Esta ação não pode ser desfeita.${balanceNote}`)) return;
    setData((current) => ({
      ...current,
      entries: current.entries.filter((item) => item.id !== id),
      banks: entry.status === 'paid' && entry.bankId
        ? current.banks.map((account) => account.id === entry.bankId
          ? { ...account, balance: account.balance + (entry.type === 'income' || entry.type === 'withdrawal' ? -entry.amount : entry.amount) }
          : account)
        : current.banks,
    }));
    setToast(entry.status === 'paid' && bank
      ? 'Lançamento excluído e saldo bancário estornado.'
      : 'Lançamento excluído.');
  }

  function deleteSupplier(id) {
    const supplier = data.suppliers.find((item) => item.id === id);
    if (!supplier) return;
    const linkedEntries = data.entries.filter((entry) => entry.supplierId === id).length;
    const linkedNote = linkedEntries === 1
      ? ' O lançamento vinculado será mantido, mas ficará sem fornecedor associado.'
      : linkedEntries > 1
        ? ` Os ${linkedEntries} lançamentos vinculados serão mantidos, mas ficarão sem fornecedor associado.`
        : '';
    if (!window.confirm(`Excluir o fornecedor "${supplier.name}"?${linkedNote}`)) return;
    setData((current) => ({
      ...current,
      suppliers: current.suppliers.filter((item) => item.id !== id),
      entries: current.entries.map((entry) => entry.supplierId === id
        ? { ...entry, supplierId: undefined }
        : entry),
    }));
    setToast('Fornecedor excluído.');
  }

  function exportCsv() {
    const rows = [
      ['Data do lançamento', 'Data do pagamento', 'Vencimento', 'Descrição', 'Categoria', 'Fornecedor', 'Banco', 'Tipo', 'Valor', 'Status', 'Lançado por', 'Data e hora do registro'],
      ...filteredEntries.map((entry) => [
        entry.date,
        entry.settledAt || '',
        entry.dueDate || '',
        entry.description,
        entry.category,
        data.suppliers.find((supplier) => supplier.id === entry.supplierId)?.name || '',
        [data.banks.find((account) => account.id === entry.bankId)?.institution, data.banks.find((account) => account.id === entry.bankId)?.name].filter(Boolean).join(' · ') || entry.bank || '',
        entry.type === 'income' ? 'Receita' : entry.type === 'investment' ? 'Investimento' : entry.type === 'withdrawal' ? 'Retirada' : 'Despesa',
        entry.amount.toFixed(2).replace('.', ','),
        getEntryStatusLabel(entry, getEntryStatus(entry, today)),
        getEntryCreatorLabel(entry),
        entry.createdAt || '',
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bistro-lancamentos-${filterStartDate || 'todos'}-a-${filterEndDate || 'todos'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const pageTitles = {
    cadastros: ['Cadastros', 'Organize seus fornecedores e informações de apoio.'],
    lancamentos: ['Lançamentos', 'Registre receitas, boletos e compras do restaurante.'],
    investimentos: ['Investimentos', 'Acompanhe aplicações, equipamentos e projetos do bistrô.'],
    relatorios: ['Relatórios', 'Consulte o resumo e o fluxo financeiro por mês.'],
    bancos: ['Bancos e saldos', 'Acompanhe suas contas e atualize os saldos bancários.'],
    pagar: ['A pagar no dia', 'Consulte e dê baixa somente nas despesas com vencimento na data selecionada.'],
  };
  const pageNavigation = [
    ['pagar', 'A pagar no dia', 'clock'],
    ['lancamentos', 'Lançamentos', 'receipt'],
    ['cadastros', 'Cadastros', 'receipt'],
    ['bancos', 'Bancos', 'settings'],
    ['investimentos', 'Investimentos', 'chart'],
    ['relatorios', 'Relatórios', 'chart'],
  ];

  if (authStatus !== 'authenticated') {
    return <AuthScreen
      status={authStatus}
      error={authError}
      onAuthenticated={(user) => {
        setAuthUser(user);
        setAuthStatus('authenticated');
      }}
      onRetry={() => setAuthRetry((attempt) => attempt + 1)}
    />;
  }

  if (databaseStatus !== 'ready') {
    return <main className="database-gate">
      <section className="database-gate-card">
        <img src="/logo-bistro-circular.png" alt="" />
        <h1>{databaseStatus === 'connecting' ? 'Conectando ao PostgreSQL' : 'Banco de dados indisponível'}</h1>
        <p>{databaseStatus === 'connecting'
          ? 'Aguarde enquanto carregamos os dados financeiros.'
          : databaseError}</p>
        {databaseStatus === 'error' && <button className="primary-button" onClick={() => setDatabaseRetry((attempt) => attempt + 1)}>Tentar novamente</button>}
      </section>
    </main>;
  }

  return (
    <div className="app-shell">
      {databaseSaving && <div className="database-notice" role="status">Salvando dados no PostgreSQL...</div>}
      {databaseSaveError && <div className="database-notice database-notice-error" role="alert"><span>Falha ao salvar no PostgreSQL: {databaseSaveError}</span><button type="button" onClick={() => setSaveRetry((attempt) => attempt + 1)}>Tentar novamente</button></div>}
      <main className="main-content">
        <header className="topbar">
          <a className="brand" href="#inicio" onClick={(event) => { event.preventDefault(); setActivePage('pagar'); }} aria-label="Bistrô de Sabores, início">
            <img className="company-logo" src="/logo-bistro-circular.png" alt="Logo do Bistrô de Sabores" />
            <span className="brand-title"><small>RESTAURANTE</small><strong>Bistrô de Sabores</strong></span>
          </a>
          <nav className="top-navigation" aria-label="Menu principal">
            {pageNavigation.map(([page, label, icon]) => <button key={page} className={`top-nav-link ${activePage === page ? 'active' : ''}`} onClick={() => setActivePage(page)}><Icon name={icon} size={16} />{label}{page === 'lancamentos' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}{page === 'pagar' && selectedDayPayables.length > 0 && <span className="nav-count">{selectedDayPayables.length}</span>}</button>)}
          </nav>
          <div className="auth-user-control">
            <span className="auth-user-name" title={authUser?.username}>{authUser?.name}</span>
            <button type="button" className="auth-logout-button" onClick={logout}>Sair</button>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <h1>{pageTitles[activePage][0]}</h1>
            <p>{pageTitles[activePage][1]}</p>
          </div>
          {['lancamentos', 'investimentos'].includes(activePage) && <button className="primary-button" onClick={() => openEntryModal(activePage === 'investimentos' ? 'investment' : 'expense')}><Icon name="plus" size={18} /> {activePage === 'investimentos' ? 'Novo investimento' : 'Novo lançamento'}</button>}
        </section>

        {['relatorios', 'investimentos'].includes(activePage) && <section className="month-toolbar" aria-label="Selecionar mês">
          <div className="month-selector">
            <button className="icon-button month-arrow" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><Icon name="left" size={17} /></button>
            <span>{monthLabel(month)}</span>
            <button className="icon-button month-arrow" onClick={() => changeMonth(1)} aria-label="Próximo mês"><Icon name="right" size={17} /></button>
          </div>
          <button className="text-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Ir para este mês</button>
        </section>}

        {activePage === 'pagar' && <section className="panel payable-day-page">
          <div className="transactions-heading">
            <div><h2>Títulos com vencimento no dia</h2><p>Selecione uma data para ver somente as contas a pagar nesse dia.</p></div>
          </div>
          <div className="daily-date-picker payable-page-date">
            <button className="icon-button month-arrow" onClick={() => setSelectedDueDate((date) => {
              const previous = new Date(`${date}T00:00:00`);
              previous.setDate(previous.getDate() - 1);
              return localDate(previous);
            })} aria-label="Dia anterior"><Icon name="left" size={16} /></button>
            <input aria-label="Escolher dia dos títulos" type="date" value={selectedDueDate} onChange={(event) => setSelectedDueDate(event.target.value || localDate(new Date()))} />
            <button className="icon-button month-arrow" onClick={() => setSelectedDueDate((date) => {
              const next = new Date(`${date}T00:00:00`);
              next.setDate(next.getDate() + 1);
              return localDate(next);
            })} aria-label="Próximo dia"><Icon name="right" size={16} /></button>
          </div>
          <div className="daily-total payable-page-total">
            <span>Total a pagar em {dateFormat.format(new Date(`${selectedDueDate}T00:00:00`))}</span>
            <strong>{currency.format(selectedDayTotal)}</strong>
            <small>{selectedDayPayables.length} título{selectedDayPayables.length === 1 ? '' : 's'} pendente{selectedDayPayables.length === 1 ? '' : 's'}</small>
          </div>
          <div className="payable-day-list">
            {selectedDayPayables.map((entry) => (
              <article className="payable-day-item" key={entry.id}>
                <div className="due-icon"><Icon name="receipt" size={18} /></div>
                <div className="due-info">
                  <strong>{entry.description}</strong>
                  <span>{[data.suppliers.find((supplier) => supplier.id === entry.supplierId)?.name, entry.category, data.banks.find((bank) => bank.id === entry.bankId)?.institution || entry.bank].filter(Boolean).join(' · ')}</span>
                </div>
                <strong className="due-amount">{currency.format(entry.amount)}</strong>
                <button className="settle-button" onClick={() => openPayableSettlement(entry)} title="Registrar baixa e escolher o banco" aria-label={`Dar baixa em ${entry.description}`}><Icon name="check" size={16} /></button>
              </article>
            ))}
            {selectedDayPayables.length === 0 && <div className="payable-day-empty"><Icon name="check" size={22} /><strong>Nenhum título a pagar nesta data</strong><span>Os títulos pendentes com esse vencimento aparecerão aqui.</span></div>}
          </div>
        </section>}

        {activePage === 'relatorios' && <section className="summary-grid" aria-label="Resumo do mês">
          <article className="summary-card">
            <div className="summary-top"><span>Receitas recebidas</span><span className="metric-icon green"><Icon name="arrow" size={17} /></span></div>
            <strong className="metric-value">{currency.format(totals.income)}</strong>
            <div className="summary-footer"><span className="status-dot green-dot" />Entradas baixadas neste mês</div>
          </article>
          <article className="summary-card">
            <div className="summary-top"><span>Despesas pagas</span><span className="metric-icon coral"><Icon name="arrow" size={17} /></span></div>
            <strong className="metric-value">{currency.format(totals.expense)}</strong>
            <div className="summary-footer"><span className="status-dot coral-dot" />Saídas baixadas neste mês</div>
          </article>
          <article className="summary-card balance-card">
            <div className="summary-top"><span>Saldo realizado</span><span className="metric-icon navy"><Icon name="chart" size={17} /></span></div>
            <strong className={`metric-value ${netBalance < 0 ? 'negative' : ''}`}>{currency.format(netBalance)}</strong>
            <div className="summary-footer">Após despesas e investimentos pagos</div>
          </article>
          <article className="summary-card investment-card">
            <div className="summary-top"><span>Investimentos</span><span className="metric-icon navy"><Icon name="chart" size={17} /></span></div>
            <strong className="metric-value">{currency.format(investmentTotal)}</strong>
            <div className="summary-footer">Aplicações e investimentos pagos no mês</div>
          </article>
          <article className="summary-card payable-card">
            <div className="summary-top"><span>Títulos em aberto</span><span className="metric-icon amber"><Icon name="clock" size={17} /></span></div>
            <strong className="metric-value">{currency.format(openPayableTotal)}</strong>
            <div className="summary-footer"><span className="status-dot amber-dot" />{payableCount} pendente{payableCount === 1 ? '' : 's'} · a pagar</div>
          </article>
        </section>}

        {activePage === 'relatorios' && <section className="content-grid report-grid">
          <article className="panel chart-panel" id="resumo">
            <div className="panel-heading">
              <div><h2>Relatório de fluxo de caixa</h2><p>Entradas e saídas realizadas no período</p></div>
              <div className="chart-legend"><span><i className="legend-income" />Receitas</span><span><i className="legend-expense" />Despesas e investimentos</span></div>
            </div>
            <div className="chart-body">
              <div className="chart-y-labels"><span>{currency.format(maxWeekValue)}</span><span>{currency.format(maxWeekValue / 2)}</span><span>R$ 0</span></div>
              <div className="chart-plot">
                <div className="chart-gridline line-one" /><div className="chart-gridline line-two" /><div className="chart-gridline line-three" />
                <div className="bars">
                  {weeks.map((week) => {
                    const incomeHeight = week.income / maxWeekValue * 100;
                    const expenseHeight = week.expense / maxWeekValue * 100;
                    return <div className="bar-group" key={week.label} title={`${week.label}: receitas ${currency.format(week.income)}, despesas ${currency.format(week.expense)}`}>
                      <div className="bar-pair">
                        <span className="bar income-bar" style={{ height: `${Math.max(incomeHeight, week.income ? 2 : 0)}%` }} />
                        <span className="bar expense-bar" style={{ height: `${Math.max(expenseHeight, week.expense ? 2 : 0)}%` }} />
                      </div>
                      <span className="bar-label">{week.label}</span>
                    </div>;
                  })}
                </div>
              </div>
            </div>
          </article>

        </section>}

        {activePage === 'investimentos' && <section className="investment-page">
          <div className="investment-summary">
            <article className="panel investment-summary-card">
              <span>Investimentos realizados</span>
              <strong>{currency.format(investmentTotal)}</strong>
              <small>Investido em {monthLabel(month)}</small>
            </article>
            <article className="panel investment-summary-card">
              <span>Retiradas no mês</span>
              <strong>{currency.format(totals.withdrawal)}</strong>
              <small>{monthWithdrawals.length} retirada{monthWithdrawals.length === 1 ? '' : 's'} registrada{monthWithdrawals.length === 1 ? '' : 's'}</small>
            </article>
          </div>
          <section className="panel investment-list-panel withdrawal-form-panel">
            <div className="transactions-heading"><div><h2>Registrar retirada</h2><p>Informe o valor que voltou para a conta bancária.</p></div></div>
            <form className="withdrawal-form" onSubmit={addInvestmentWithdrawal}>
              <label className="form-field"><span>Motivo da retirada</span><input className="form-control" name="description" required maxLength="80" placeholder="Ex.: Resgate de aplicação" /></label>
              <label className="form-field"><span>Banco que recebeu</span><select className="form-select" name="bankId" required defaultValue=""><option value="">Selecione o banco</option>{data.banks.map((account) => <option key={account.id} value={account.id}>{account.institution} · {account.name}</option>)}</select></label>
              <label className="form-field"><span>Data da retirada</span><input className="form-control" name="date" type="date" required defaultValue={localDate(new Date())} /></label>
              <label className="form-field"><span>Valor (R$)</span><input className="form-control" name="amount" type="text" inputMode="decimal" required placeholder="0,00" onChange={handleMoneyInput} /></label>
              <button className="primary-button" type="submit"><Icon name="plus" size={17} />Registrar retirada</button>
            </form>
          </section>
          <section className="panel investment-list-panel">
            <div className="transactions-heading">
              <div><h2>Investimentos do mês</h2><p>Aplicações, equipamentos, reformas e expansão</p></div>
              <button className="secondary-button" onClick={() => setActivePage('lancamentos')}>Ver todos os lançamentos</button>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>INVESTIMENTO</th><th>DATA DO INVESTIMENTO</th><th>CATEGORIA</th><th>CONTA</th><th>STATUS</th><th className="amount-column">VALOR</th><th aria-label="Ações" /></tr></thead>
              <tbody>
                {monthInvestments.map((entry) => (
                  <tr key={entry.id}>
                    <td><div className="transaction-name"><span className="transaction-icon investment"><Icon name="chart" size={16} /></span><span><strong>{entry.description}</strong><small>{data.suppliers.find((supplier) => supplier.id === entry.supplierId)?.name || entry.method || 'Investimento do bistrô'}</small><small>Lançado por: {getEntryCreatorLabel(entry)}</small></span></div></td>
                    <td className="date-cell">{dateFormat.format(new Date(`${entry.date}T00:00:00`))}</td>
                    <td><span className="category-label">{entry.category}</span></td>
                    <td>{data.banks.find((bank) => bank.id === entry.bankId)?.institution || entry.bank || '—'}</td>
                    <td><span className={`status-pill ${getEntryStatus(entry, today)}`}><i />{getEntryStatus(entry, today) === 'paid' ? 'Realizado' : getEntryStatus(entry, today) === 'overdue' ? 'Vencido' : 'Planejado'}{entry.status === 'paid' && entry.settledAt && <small>{dateFormat.format(new Date(`${entry.settledAt}T00:00:00`))}</small>}</span></td>
                    <td className="amount-cell investment">{currency.format(entry.amount)}</td>
                    <td className="action-cell"><div className="action-buttons">{entry.status === 'pending' && <button className="settle-button" onClick={() => settleEntry(entry.id)} title="Dar baixa neste investimento" aria-label={`Dar baixa em ${entry.description}`}><Icon name="check" size={16} /></button>}<button className="delete-button" onClick={() => deleteEntry(entry.id)} title="Excluir investimento" aria-label={`Excluir ${entry.description}`}><Icon name="trash" size={15} /></button></div></td>
                  </tr>
                ))}
                {monthInvestments.length === 0 && <tr><td colSpan="7"><div className="investment-empty"><span className="metric-icon navy"><Icon name="chart" size={18} /></span><strong>Nenhum investimento neste mês</strong><p>Registre aplicações, compras de equipamentos ou projetos do bistrô.</p><button className="primary-button" onClick={() => openEntryModal('investment')}><Icon name="plus" size={16} />Adicionar investimento</button></div></td></tr>}
              </tbody>
            </table></div>
            <div className="table-footer"><span><strong>{monthInvestments.length}</strong> investimento{monthInvestments.length === 1 ? '' : 's'} no período</span><span>Valores em reais (BRL)</span></div>
          </section>
          <section className="panel investment-list-panel">
            <div className="transactions-heading"><div><h2>Retiradas do mês</h2><p>Valores resgatados e creditados nas contas bancárias</p></div></div>
            <div className="table-wrap"><table>
              <thead><tr><th>MOTIVO</th><th>DATA DA RETIRADA</th><th>BANCO / CONTA</th><th className="amount-column">VALOR</th><th aria-label="Ações" /></tr></thead>
              <tbody>{monthWithdrawals.map((entry) => {
                const bank = data.banks.find((account) => account.id === entry.bankId);
                return <tr key={entry.id}>
                  <td><div className="transaction-name"><span><strong>{entry.description}</strong><small>Lançado por: {getEntryCreatorLabel(entry)}</small></span></div></td>
                  <td className="date-cell">{dateFormat.format(new Date(`${entry.date}T00:00:00`))}</td>
                  <td>{bank ? `${bank.institution} · ${bank.name}` : entry.bank || '—'}</td>
                  <td className="amount-cell income">{currency.format(entry.amount)}</td>
                  <td className="action-cell"><button className="delete-button" onClick={() => deleteEntry(entry.id)} title="Excluir retirada" aria-label={`Excluir retirada ${entry.description}`}><Icon name="trash" size={15} /></button></td>
                </tr>;
              })}
                {monthWithdrawals.length === 0 && <tr><td colSpan="5"><div className="empty-table">Nenhuma retirada registrada neste mês.</div></td></tr>}
              </tbody>
            </table></div>
          </section>
        </section>}

        {activePage === 'relatorios' && <section className="report-visuals" aria-label="Gráficos financeiros">
          <article className="panel visual-panel trend-panel">
            <div className="panel-heading">
              <div><h2>Comparativo mensal</h2><p>Receitas e saídas realizadas nos últimos seis meses</p></div>
              <div className="chart-legend"><span><i className="legend-income" />Entradas</span><span><i className="legend-expense" />Saídas</span></div>
            </div>
            <div className="trend-chart-wrap">
              <svg className="trend-chart" viewBox="0 0 600 220" role="img" aria-label="Gráfico de linhas comparando receitas e saídas nos últimos seis meses">
                {[34, 84, 134, 184].map((y) => <line key={y} x1="42" y1={y} x2="562" y2={y} className="trend-gridline" />)}
                <polyline points={trendPoints('income')} className="trend-line trend-income" />
                <polyline points={trendPoints('outflow')} className="trend-line trend-outflow" />
                {monthlyTrends.map((period, index) => {
                  const x = 42 + index * 104;
                  const incomeY = 184 - (period.income / trendMaximum) * 150;
                  const outflowY = 184 - (period.outflow / trendMaximum) * 150;
                  return <g key={`${period.label}-${index}`}>
                    <circle cx={x} cy={incomeY} r="4" className="trend-point trend-point-income"><title>{`${period.label}: receitas ${currency.format(period.income)}`}</title></circle>
                    <circle cx={x} cy={outflowY} r="4" className="trend-point trend-point-outflow"><title>{`${period.label}: saídas ${currency.format(period.outflow)}`}</title></circle>
                    <text x={x} y="210" textAnchor="middle" className="trend-month-label">{period.label}</text>
                  </g>;
                })}
              </svg>
            </div>
            <div className="trend-footnote"><span>Valores consideram títulos baixados</span><strong>{currency.format(monthlyTrends.at(-1)?.income - monthlyTrends.at(-1)?.outflow || 0)} no mês selecionado</strong></div>
          </article>
          <article className="panel visual-panel category-panel">
            <div className="panel-heading">
              <div><h2>Despesas por categoria</h2><p>Despesas e investimentos pagos neste mês</p></div>
            </div>
            <div className="category-chart-total"><span>Total de saídas</span><strong>{currency.format(categoryTotal)}</strong></div>
            {categoryBreakdown.length > 0 ? <div className="category-bars">
              {categoryBreakdown.map((item) => <div className="category-bar-row" key={item.key}>
                <div className="category-bar-label"><span>{item.category}<small>{item.type === 'investment' ? 'Investimento' : 'Despesa'}</small></span><strong>{currency.format(item.amount)}</strong></div>
                <div className="category-bar-track"><span className={item.type === 'investment' ? 'investment-fill' : ''} style={{ width: `${Math.max(2, item.amount / categoryTotal * 100)}%` }} /></div>
              </div>)}
            </div> : <div className="category-empty">Sem despesas ou investimentos pagos neste mês.</div>}
          </article>
        </section>}

        {activePage === 'relatorios' && <section className="panel report-details">
          <div className="transactions-heading"><div><h2>Resumo por categoria</h2><p>Despesas e investimentos pagos no período</p></div></div>
          <div className="table-wrap"><table>
            <thead><tr><th>CATEGORIA</th><th>TIPO</th><th>LANÇAMENTOS</th><th className="amount-column">TOTAL</th></tr></thead>
            <tbody>{Object.entries(monthEntries.filter((entry) => entry.status === 'paid').reduce((summary, entry) => {
              const key = `${entry.type}:${entry.category}`;
              summary[key] ??= { type: entry.type, category: entry.category, count: 0, amount: 0 };
              summary[key].count += 1;
              summary[key].amount += entry.amount;
              return summary;
            }, {})).map(([key, item]) => <tr key={key}>
              <td>{item.category}</td><td>{item.type === 'investment' ? 'Investimento' : item.type === 'income' ? 'Receita' : item.type === 'withdrawal' ? 'Retirada' : 'Despesa'}</td><td>{item.count}</td><td className={`amount-cell ${item.type === 'income' || item.type === 'withdrawal' ? 'income' : item.type === 'investment' ? 'investment' : 'expense'}`}>{currency.format(item.amount)}</td>
            </tr>)}
            {monthEntries.filter((entry) => entry.status === 'paid').length === 0 && <tr><td colSpan="4"><div className="empty-table">Sem lançamentos pagos neste mês para gerar o relatório.</div></td></tr>}</tbody>
          </table></div>
          <div className="transactions-heading report-payments-heading"><div><h2>Contas pagas</h2><p>Data da baixa e banco utilizado em cada pagamento</p></div></div>
          <div className="table-wrap"><table>
            <thead><tr><th>CONTA / DESCRIÇÃO</th><th>CATEGORIA</th><th>DATA DO PAGAMENTO</th><th>BANCO / CONTA</th><th className="amount-column">VALOR</th></tr></thead>
            <tbody>{monthEntries.filter((entry) => entry.type === 'expense' && entry.status === 'paid')
              .sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''))
              .map((entry) => {
                const bank = data.banks.find((account) => account.id === entry.bankId);
                return <tr key={entry.id}>
                  <td>{entry.description}</td>
                  <td>{entry.category}</td>
                  <td>{entry.settledAt ? dateFormat.format(new Date(`${entry.settledAt}T00:00:00`)) : '—'}</td>
                  <td>{bank ? `${bank.institution} · ${bank.name}` : entry.bank || 'Sem banco vinculado'}</td>
                  <td className="amount-cell expense">{currency.format(entry.amount)}</td>
                </tr>;
              })}
              {monthEntries.filter((entry) => entry.type === 'expense' && entry.status === 'paid').length === 0 && <tr><td colSpan="5"><div className="empty-table">Sem contas pagas neste mês.</div></td></tr>}
            </tbody>
          </table></div>
          <div className="transactions-heading report-payments-heading"><div><h2>Histórico de atualização dos bancos</h2><p>Data e hora em que cada saldo foi atualizado manualmente</p></div></div>
          <div className="table-wrap"><table>
            <thead><tr><th>DATA E HORA</th><th>BANCO / CONTA</th><th className="amount-column">SALDO ANTERIOR</th><th className="amount-column">SALDO ATUALIZADO</th></tr></thead>
            <tbody>{monthBankUpdates.map((update) => <tr key={update.id}>
              <td>{dateTimeFormat.format(new Date(update.updatedAt))}</td>
              <td>{update.institution} · {update.name}</td>
              <td className="amount-cell expense">{currency.format(update.previousBalance)}</td>
              <td className="amount-cell income">{currency.format(update.balance)}</td>
            </tr>)}
              {monthBankUpdates.length === 0 && <tr><td colSpan="4"><div className="empty-table">Nenhuma atualização de saldo registrada neste mês.</div></td></tr>}
            </tbody>
          </table></div>
        </section>}

        {activePage === 'lancamentos' && <section className="panel transactions-panel" id="lancamentos">
          <div className="transactions-heading">
          <div><h2>Lançamentos</h2><p>Movimentações dentro do período selecionado</p></div>
            <div className="table-actions">
              <label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento" aria-label="Buscar lançamento" /></label>
              <button className="secondary-button export-button" onClick={exportCsv}><Icon name="download" size={16} />Exportar</button>
            </div>
          </div>
          <div className="advanced-filters" aria-label="Filtros avançados de lançamentos">
            <div className="filter-heading"><div><strong>Filtros avançados</strong><span>Escolha o intervalo de datas e o tipo de lançamento</span></div><button className="clear-filters" type="button" onClick={clearFilters}>Limpar filtros</button></div>
            <div className="filter-grid">
              <label className="filter-field"><span>De</span><input aria-label="Data inicial" type="date" value={filterStartDate} onChange={(event) => setFilterStartDate(event.target.value)} /></label>
              <label className="filter-field"><span>Até</span><input aria-label="Data final" type="date" value={filterEndDate} onChange={(event) => setFilterEndDate(event.target.value)} /></label>
              <label className="filter-field"><span>Tipo</span><select aria-label="Filtrar por tipo" value={filterType} onChange={(event) => setFilterType(event.target.value)}><option value="all">Todos</option><option value="income">Receita</option><option value="expense">Despesa</option></select></label>
            </div>
            {invalidDateRange && <p className="filter-error" role="alert">A data inicial precisa ser anterior ou igual à data final.</p>}
          </div>
          <div className="tabs" role="tablist" aria-label="Filtrar lançamentos">
            {[['all', 'Todos'], ['income', 'Receitas'], ['expense', 'Despesas'], ['pending', 'Em aberto']].map(([value, label]) => <button key={value} role="tab" aria-selected={activeTab === value} className={`tab ${activeTab === value ? 'selected' : ''}`} onClick={() => setActiveTab(value)}>{label}{value === 'pending' && pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}</button>)}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>DESCRIÇÃO</th><th>LANÇAMENTO / VENCIMENTO</th><th>CATEGORIA</th><th>LANÇADO POR</th><th>STATUS</th><th className="amount-column">VALOR</th><th aria-label="Ações" /></tr></thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td><div className="transaction-name"><span className={`transaction-icon ${entry.type}`}><Icon name={entry.type === 'income' ? 'arrow' : 'receipt'} size={16} /></span><span><strong>{entry.description}</strong><small>{[data.suppliers.find((supplier) => supplier.id === entry.supplierId)?.name, data.banks.find((account) => account.id === entry.bankId)?.name || entry.bank, entry.method].filter(Boolean).join(' · ') || 'Sem fornecedor ou conta vinculada'}</small></span></div></td>
                    <td className="date-cell"><span>{dateFormat.format(new Date(`${entry.date}T00:00:00`))}</span>{entry.dueDate && <small>Vence {dateFormat.format(new Date(`${entry.dueDate}T00:00:00`))}</small>}</td>
                    <td><span className="category-label">{entry.category}</span></td>
                    <td className="date-cell"><span>{getEntryCreatorLabel(entry)}</span>{entry.createdAt && <small>{dateTimeFormat.format(new Date(entry.createdAt))}</small>}</td>
                    <td><span className={`status-pill ${getEntryStatus(entry, today)}`}><i />{getEntryStatusLabel(entry, getEntryStatus(entry, today))}{entry.status === 'paid' && entry.settledAt && <small>{dateFormat.format(new Date(`${entry.settledAt}T00:00:00`))}</small>}</span></td>
                    <td className={`amount-cell ${entry.type}`}>{entry.type === 'income' ? '+' : '−'} {currency.format(entry.amount)}</td>
                    <td className="action-cell"><div className="action-buttons">{entry.status === 'pending' && <button className="settle-button" onClick={() => settleEntry(entry.id)} title="Dar baixa neste título" aria-label={`Dar baixa em ${entry.description}`}><Icon name="check" size={16} /></button>}<button className="delete-button" onClick={() => deleteEntry(entry.id)} title="Excluir lançamento" aria-label={`Excluir ${entry.description}`}><Icon name="trash" size={15} /></button></div></td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && <tr><td colSpan="7"><div className="empty-table">{query ? 'Nenhum lançamento encontrado para a busca e os filtros selecionados.' : 'Nenhum lançamento para os filtros selecionados.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>Exibindo <strong>{filteredEntries.length}</strong> de <strong>{data.entries.length}</strong> lançamentos</span><span>Valores em reais (BRL)</span></div>
        </section>}

        {activePage === 'cadastros' && <section className="panel suppliers-panel" id="fornecedores">
          <div className="transactions-heading">
            <div><h2>Fornecedores</h2><p>Cadastre e consulte os fornecedores do bistrô</p></div>
            <button className="btn btn-success primary-button" onClick={() => setSupplierModalOpen(true)}><Icon name="plus" size={17} />Cadastrar fornecedor</button>
          </div>
          {data.suppliers.length > 0 ? <div className="table-wrap">
            <table>
              <thead><tr><th>FORNECEDOR</th><th>CATEGORIA</th><th>TELEFONE</th><th>E-MAIL</th><th>CNPJ / CPF</th><th>AÇÕES</th></tr></thead>
              <tbody>{data.suppliers.map((supplier) => <tr key={supplier.id}>
                <td><div className="transaction-name"><span className="supplier-avatar">{supplier.name.slice(0, 1).toLocaleUpperCase('pt-BR')}</span><strong>{supplier.name}</strong></div></td>
                <td><span className="category-label">{supplier.category}</span></td>
                <td>{supplier.phone || '—'}</td><td>{supplier.email || '—'}</td><td>{supplier.document || '—'}</td>
                <td className="action-cell"><button className="delete-button" onClick={() => deleteSupplier(supplier.id)} title="Excluir fornecedor" aria-label={`Excluir fornecedor ${supplier.name}`}><Icon name="trash" size={15} /></button></td>
              </tr>)}</tbody>
            </table>
          </div> : <div className="suppliers-empty"><span className="supplier-avatar"><Icon name="receipt" size={18} /></span><div><strong>Nenhum fornecedor cadastrado</strong><p>Adicione fornecedores para organizar suas despesas.</p></div></div>}
          <div className="table-footer"><span><strong>{data.suppliers.length}</strong> fornecedor{data.suppliers.length === 1 ? '' : 'es'} cadastrado{data.suppliers.length === 1 ? '' : 's'}</span><span>Os dados ficam salvos neste dispositivo.</span></div>
        </section>}

        {activePage === 'bancos' && <section className="bank-page">
          {data.banks.length > 0 ? <div className="bank-cards">{data.banks.map((account) => <article className="panel bank-card" key={account.id}>
            <div className="bank-card-top"><span className="bank-logo">{account.institution.slice(0, 1)}</span><div><strong>{account.institution}</strong>{account.name !== account.institution && <small>{account.name}</small>}</div><span className="bank-card-label">CONTA</span></div>
            <span className="bank-balance-label">Saldo disponível informado</span><strong className={`bank-balance ${account.balance < 0 ? 'negative' : ''}`}>{currency.format(account.balance)}</strong>
            <form className="balance-update-form" key={`${account.id}-${account.balance}`} onSubmit={(event) => updateBankBalance(event, account.id)}>
              <label className="form-field"><span>Atualizar saldo atual</span><input className="form-control" name="balance" type="text" inputMode="decimal" required defaultValue={formatMoneyInput(account.balance)} onChange={handleMoneyInput} /></label>
              <button className="secondary-button" type="submit">Atualizar</button>
            </form>
          </article>)}</div> : <div className="panel banks-empty"><strong>Nenhuma conta bancária disponível</strong></div>}
        </section>}
        <footer className="page-footer"><span>© {new Date().getFullYear()} Bistrô de Sabores</span><span>Seus dados ficam salvos neste dispositivo.</span></footer>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="entry-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-heading"><div><span className="eyebrow">CONTROLE FINANCEIRO</span><h2 id="modal-title">{entryType === 'investment' ? 'Novo investimento' : 'Novo lançamento'}</h2></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fechar"><Icon name="close" /></button></div>
          <form onSubmit={addEntry}>
            {entryType === 'investment' ? <>
              <input type="hidden" name="type" value="investment" />
              <label className="form-field"><span>Motivo do investimento</span><input className="form-control" name="description" required maxLength="80" placeholder="Ex.: Compra de novo forno" /></label>
              <label className="form-field"><span>Data do investimento</span><input className="form-control" name="investmentDate" type="date" required max={localDate(new Date())} value={newEntryDate} onChange={(event) => setNewEntryDate(event.target.value)} /></label>
              <label className="form-field"><span>Banco</span><select className="form-select" name="bankId" required defaultValue=""><option value="">Selecione o banco</option>{data.banks.map((account) => <option key={account.id} value={account.id}>{account.institution} · {currency.format(account.balance)}</option>)}</select>
                {data.banks.length === 0 && <button type="button" className="inline-link" onClick={() => { setModalOpen(false); setActivePage('bancos'); }}>+ Cadastre uma conta bancária</button>}
              </label>
              <label className="form-field"><span>Valor do investimento (R$)</span><input className="form-control" name="amount" type="text" inputMode="decimal" required placeholder="0,00" onChange={handleMoneyInput} /></label>
              <p className="modal-hint"><Icon name="check" size={15} />Ao salvar, o investimento será registrado como realizado e descontado imediatamente do saldo bancário.</p>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" className="primary-button"><Icon name="plus" size={17} />Salvar investimento</button></div>
            </> : <>
              <label className="form-field"><span>Tipo de lançamento</span><select className="form-select" name="type" value={entryType} onChange={(event) => setEntryType(event.target.value)}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
              <label className="form-field"><span>Descrição</span><input className="form-control" name="description" required maxLength="80" placeholder={entryType === 'income' ? 'Ex.: Vendas do dia' : 'Ex.: Boleto de energia ou compras do mercado'} /></label>
              <div className="form-row">
                <label className="form-field"><span>Valor (R$)</span><input className="form-control" name="amount" type="text" inputMode="decimal" required placeholder="0,00" onChange={handleMoneyInput} /></label>
                <label className="form-field"><span>Categoria</span><select className="form-select" name="category">{categories[entryType].map((category) => <option key={category}>{category}</option>)}</select></label>
              </div>
              <div className="form-row">
                <label className="form-field"><span>Data do lançamento</span><input className="form-control" name="date" type="date" required value={newEntryDate} onChange={(event) => setNewEntryDate(event.target.value)} /></label>
                <label className="form-field"><span>Data de vencimento</span><input className="form-control" name="dueDate" type="date" value={newEntryDueDate} onChange={(event) => setNewEntryDueDate(event.target.value)} /></label>
              </div>
              <div className="draft-status" aria-live="polite"><span>Status automático</span><strong className={`status-pill ${draftEntryStatusClass}`}><i />{draftEntryStatus}</strong></div>
              <label className="form-field"><span>Fornecedor cadastrado (opcional)</span><select className="form-select" name="supplierId"><option value="">Selecione um fornecedor cadastrado</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
                <button type="button" className="inline-link" onClick={() => setSupplierModalOpen(true)}>+ Cadastrar novo fornecedor</button>
              </label>
              <p className="modal-hint"><Icon name="clock" size={15} />O status é calculado pelas datas. A baixa e a escolha do banco são feitas manualmente em “A pagar no dia”.</p>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" className="primary-button"><Icon name="plus" size={17} />Salvar lançamento</button></div>
            </>}
          </form>
        </section>
      </div>}
      {payableEntryToSettle && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPayableEntryToSettle(null); }}>
        <section className="entry-modal settlement-modal" role="dialog" aria-modal="true" aria-labelledby="settlement-modal-title">
          <div className="modal-heading"><div><span className="eyebrow">BAIXA MANUAL</span><h2 id="settlement-modal-title">Confirmar pagamento</h2></div><button className="icon-button" onClick={() => setPayableEntryToSettle(null)} aria-label="Fechar"><Icon name="close" /></button></div>
          <form onSubmit={confirmPayableSettlement}>
            <div className="settlement-summary"><strong>{payableEntryToSettle.description}</strong><span>Valor pago: {currency.format(payableEntryToSettle.amount)}</span></div>
            <label className="form-field"><span>Qual banco/conta foi usado?</span><select className="form-select" required value={paymentBankId} onChange={(event) => setPaymentBankId(event.target.value)}><option value="">Selecione o banco</option>{data.banks.map((account) => <option key={account.id} value={account.id}>{account.institution} · {account.name} · Saldo {currency.format(account.balance)}</option>)}<option value="__none__">Sem movimentação bancária (dinheiro/outro)</option></select></label>
            {data.banks.length === 0 && <button type="button" className="inline-link" onClick={() => { setPayableEntryToSettle(null); setActivePage('bancos'); }}>+ Cadastre uma conta bancária</button>}
            <p className="modal-hint"><Icon name="check" size={15} />A baixa só será registrada após sua confirmação. O valor será descontado do saldo da conta selecionada.</p>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPayableEntryToSettle(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={!paymentBankId}><Icon name="check" size={17} />Confirmar baixa</button></div>
          </form>
        </section>
      </div>}
      {supplierModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSupplierModalOpen(false); }}>
        <section className="entry-modal supplier-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title">
          <div className="modal-heading"><div><span className="eyebrow">CADASTRO</span><h2 id="supplier-modal-title">Novo fornecedor</h2></div><button className="icon-button" onClick={() => setSupplierModalOpen(false)} aria-label="Fechar"><Icon name="close" /></button></div>
          <form onSubmit={addSupplier}>
            <label className="form-field"><span>Nome / Razão social</span><input className="form-control" name="name" required maxLength="100" placeholder="Ex.: Distribuidora de alimentos" /></label>
            <div className="form-row">
              <label className="form-field"><span>CNPJ / CPF (opcional)</span><input className="form-control" name="document" maxLength="20" placeholder="00.000.000/0000-00" /></label>
              <label className="form-field"><span>Categoria</span><select className="form-select" name="category"><option>Alimentos</option><option>Bebidas</option><option>Hortifruti</option><option>Equipe e serviços</option><option>Contas e utilidades</option><option>Outros</option></select></label>
            </div>
            <div className="form-row">
              <label className="form-field"><span>Telefone</span><input className="form-control" name="phone" type="tel" maxLength="24" placeholder="(00) 00000-0000" /></label>
              <label className="form-field"><span>E-mail</span><input className="form-control" name="email" type="email" maxLength="120" placeholder="fornecedor@exemplo.com" /></label>
            </div>
            <div className="modal-actions"><button type="button" className="btn btn-outline-secondary secondary-button" onClick={() => setSupplierModalOpen(false)}>Cancelar</button><button type="submit" className="btn btn-success primary-button"><Icon name="plus" size={17} />Salvar fornecedor</button></div>
          </form>
        </section>
      </div>}
      {toast && <div className="toast" role="status"><span><Icon name="check" size={16} /></span>{toast}</div>}
    </div>
  );
}

export default App;
