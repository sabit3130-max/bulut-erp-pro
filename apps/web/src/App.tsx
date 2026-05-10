import {
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Barcode,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Edit3,
  FileDown,
  FileText,
  ImagePlus,
  LayoutDashboard,
  MessageCircle,
  Menu,
  Moon,
  PackagePlus,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Upload,
  Sun,
  Trash2,
  RefreshCcw,
  Tags,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Account, AccountDetail, apiDelete, apiGet, apiHealthCheck, apiPost, apiPut, apiUrl, Category, Collection, Dashboard, MessageTemplate, Order, PaymentLog, PdfTemplate, Product, Purchase, Quote, Sale, SupplierPayment, TransactionItem, UserSession } from './api';

type Tab = 'dashboard' | 'accounts' | 'products' | 'categories' | 'sales' | 'collections' | 'purchases' | 'dealer' | 'quotes' | 'pdfs' | 'messages' | 'users' | 'tests' | 'settings';
type Modal = 'account' | 'product' | null;
type CartLine = { product: Product; quantity: number };

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'accounts', label: 'Cariler', icon: Users },
  { id: 'products', label: 'Urun/Stok', icon: Boxes },
  { id: 'categories', label: 'Kategoriler', icon: Tags },
  { id: 'sales', label: 'Satis', icon: ReceiptText },
  { id: 'collections', label: 'Tahsilat', icon: WalletCards },
  { id: 'purchases', label: 'Alislar', icon: PackagePlus },
  { id: 'dealer', label: 'B2B Bayi', icon: ShoppingCart },
  { id: 'quotes', label: 'Teklifler', icon: FileText },
  { id: 'pdfs', label: 'PDF Sablonlari', icon: FileDown },
  { id: 'messages', label: 'Mesaj Sablonlari', icon: MessageCircle },
  { id: 'users', label: 'Kullanicilar', icon: UserRound },
  { id: 'tests', label: 'Panel Test', icon: RefreshCcw },
  { id: 'settings', label: 'Entegrasyon', icon: CreditCard },
];

const warehouses = ['Merkez Depo', 'Bayi Depo', 'E-Ticaret Depo'];
function money(value: number, currency = 'TL') {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function usdFromTry(value: number, rate: number) {
  return rate > 0 ? value / rate : 0;
}

function tryFromUsd(value: number, rate: number) {
  return value * rate;
}

function DualMoney({ tryValue, usdValue, compact = false }: { tryValue: number; usdValue: number; compact?: boolean }) {
  return (
    <div className={`flex ${compact ? 'flex-row flex-wrap' : 'flex-col'} gap-1`}>
      <span className="inline-flex w-fit rounded bg-[#dfeeff] px-2 py-1 text-xs font-bold text-[#1d5d99]">{money(tryValue)}</span>
      <span className="inline-flex w-fit rounded bg-[#d7f2ea] px-2 py-1 text-xs font-bold text-ocean">{money(usdValue, 'USD')}</span>
    </div>
  );
}

function PriorityMoney({ currency, tryValue, usdValue, large = false }: { currency: 'TRY' | 'USD'; tryValue: number; usdValue: number; large?: boolean }) {
  const primary = currency === 'USD' ? money(usdValue, 'USD') : money(tryValue);
  const secondary = currency === 'USD' ? money(tryValue) : money(usdValue, 'USD');
  return <div className="space-y-1"><div className={`inline-flex rounded-xl bg-[#d7f2ea] px-2.5 py-1.5 font-black text-ocean shadow-sm ${large ? 'text-base' : 'text-sm'}`}>{primary}</div><div className="text-xs font-semibold text-slate-500">{secondary}</div></div>;
}

function parseNumber(value: unknown) {
  const parsed = parseFloat(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumber(value: unknown) {
  return Math.max(0, parseNumber(value));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function productItemMatches(item: TransactionItem, product: Product) {
  const values = [item.productId, item.productName].filter(Boolean).map((value) => String(value).trim().toLocaleLowerCase('tr-TR'));
  const productValues = [product.id, product.name, product.code, product.barcode].filter(Boolean).map((value) => String(value).trim().toLocaleLowerCase('tr-TR'));
  return values.some((value) => productValues.includes(value));
}

function grossFromNet(value: number, vatRate: number) {
  return roundMoney(value * (1 + vatRate / 100));
}

function netFromGross(value: number, vatRate: number) {
  return roundMoney(value / (1 + vatRate / 100));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { message?: string | string[] };
      return Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message ?? error.message;
    } catch {
      return error.message;
    }
  }
  return 'Islem tamamlanamadi';
}

export function App() {
  const [active, setActive] = useState<Tab>('dashboard');
  const [dark, setDark] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserSession[]>([]);
  const [categoriesData, setCategoriesData] = useState<Category[]>([]);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplate[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [productDetailId, setProductDetailId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [returnDetailAccountId, setReturnDetailAccountId] = useState('');
  const [manualRate, setManualRate] = useState('');
  const [notice, setNotice] = useState('Canlı sistem aktif');
  const [apiError, setApiError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('erp_user') ?? 'null') as UserSession | null;
    } catch {
      return null;
    }
  });
  const globalSearchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        globalSearchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'CUSTOMER' || currentUser?.role === 'DEALER') {
      setDetail(null);
      setProductDetailId('');
      setActive('dealer');
    }
  }, [currentUser?.role]);

  useEffect(() => {
    if (window.location.pathname === '/login') return;
    const match = window.location.pathname.match(/^\/cariler\/([^/]+)$/);
    if (match) void openDetail(match[1], false);
    const productMatch = window.location.pathname.match(/^\/urunler\/([^/]+)$/);
    if (productMatch) {
      setProductDetailId(productMatch[1]);
      setActive('products');
    }
    const handlePopState = () => {
      const nextMatch = window.location.pathname.match(/^\/cariler\/([^/]+)$/);
      const nextProductMatch = window.location.pathname.match(/^\/urunler\/([^/]+)$/);
      if (nextMatch) void openDetail(nextMatch[1], false);
      else setDetail(null);
      if (nextProductMatch) {
        setProductDetailId(nextProductMatch[1]);
        setActive('products');
      } else setProductDetailId('');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function refresh() {
    try {
      await apiHealthCheck();
      const [dashboardData, accountData, productData, saleData, collectionData, purchaseData, supplierPaymentData, quoteData, orderData, logData, categoryData, pdfData, messageData] = await Promise.all([
        apiGet<Dashboard>('/dashboard'),
        apiGet<Account[]>('/accounts'),
        apiGet<Product[]>('/products'),
        apiGet<Sale[]>('/sales'),
        apiGet<Collection[]>('/collections'),
        apiGet<Purchase[]>('/purchases'),
        apiGet<SupplierPayment[]>('/supplier-payments'),
        apiGet<Quote[]>('/quotes'),
        apiGet<Order[]>('/orders'),
        apiGet<PaymentLog[]>('/payments/logs'),
        apiGet<Category[]>('/categories'),
        apiGet<PdfTemplate[]>('/pdf-templates'),
        apiGet<MessageTemplate[]>('/message-templates'),
      ]);
      let storedUser: UserSession | null = null;
      try {
        storedUser = JSON.parse(localStorage.getItem('erp_user') ?? 'null') as UserSession | null;
      } catch {
        storedUser = null;
      }
      const userData = storedUser?.role === 'ADMIN' ? await apiGet<UserSession[]>('/users') : [];
      setApiError('');
      setDashboard(dashboardData);
      setAccounts(accountData);
      setProducts(productData);
      setSales(saleData);
      setCollections(collectionData);
      setPaymentLogs(logData);
      setPurchases(purchaseData);
      setSupplierPayments(supplierPaymentData);
      setQuotes(quoteData);
      setOrders(orderData);
      setCategoriesData(categoryData);
      setPdfTemplates(pdfData);
      setMessageTemplates(messageData);
      setUsers(userData);
    } catch {
      setApiError('API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
      setNotice('API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
    }
  }

  function storeSession(accessToken: string, user: UserSession) {
    localStorage.setItem('erp_token', accessToken);
    localStorage.setItem('erp_user', JSON.stringify(user));
    setCurrentUser(user);
    void refresh();
  }

  function logout() {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    setCurrentUser(null);
    window.history.pushState({}, '', '/login');
  }

  async function createUserForAccount(payload: { name: string; email: string; username?: string; password: string; role: 'CUSTOMER' | 'DEALER'; accountId: string; phone?: string }) {
    try {
      const user = await apiPost<UserSession>('/users', { ...payload, mustChangePassword: true, active: true });
      await refresh();
      setNotice(`Kullanici olusturuldu: ${user.username ?? user.email} / gecici sifre verildi`);
      return user;
    } catch (error) {
      setNotice(errorMessage(error));
      throw error;
    }
  }

  async function saveUser(payload: { id?: string; name: string; email: string; username?: string; password?: string; role: UserSession['role']; accountId?: string; phone?: string; active?: boolean }) {
    try {
      const body = { ...payload, mustChangePassword: payload.id ? undefined : true };
      if (payload.id) await apiPut<UserSession>(`/users/${payload.id}`, body);
      else await apiPost<UserSession>('/users', body);
      await refresh();
      setNotice(payload.id ? 'Kullanici guncellendi' : 'Kullanici olusturuldu');
    } catch (error) {
      setNotice(errorMessage(error));
      throw error;
    }
  }

  async function createAccount(payload: Partial<Account>) {
    try {
      if (editingAccount) await apiPut<Account>(`/accounts/${editingAccount.id}`, payload);
      else await apiPost<Account>('/accounts', payload);
      await refresh();
      setModal(null);
      setEditingAccount(null);
      setNotice(editingAccount ? 'Cari kart guncellendi' : 'Cari kart eklendi');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function createProduct(payload: Partial<Product>) {
    try {
      const normalized = {
        ...payload,
        purchaseTry: positiveNumber(payload.purchaseTry),
        purchaseUsd: positiveNumber(payload.purchaseUsd),
        saleTry: parseNumber(payload.saleTry),
        saleUsd: parseNumber(payload.saleUsd),
        dealerTry: parseNumber(payload.dealerTry),
        dealerUsd: parseNumber(payload.dealerUsd),
        stock: parseNumber(payload.stock),
        criticalStock: parseNumber(payload.criticalStock),
      };
      if (editingProduct) await apiPut<Product>(`/products/${editingProduct.id}`, normalized);
      else await apiPost<Product>('/products', normalized);
      await refresh();
      setModal(null);
      setEditingProduct(null);
      setNotice(editingProduct ? 'Urun karti guncellendi' : 'Urun karti eklendi');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function openDetail(id: string, push = true) {
    setProductDetailId('');
    setDetail(await apiGet<AccountDetail>(`/accounts/${id}`));
    setActive('accounts');
    if (push) window.history.pushState({}, '', `/cariler/${id}`);
  }

  function openProductDetail(id: string, push = true) {
    setDetail(null);
    setProductDetailId(id);
    setActive('products');
    if (push) window.history.pushState({}, '', `/urunler/${id}`);
  }

  async function createSale(accountId: string, cart: CartLine[], paid: number, discount: number, currency: 'TRY' | 'USD', paymentMethod: string) {
    try {
      const sale = await apiPost<Sale>('/sales', {
        accountId,
        currency,
        paid,
        discount,
        paymentMethod,
        items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity, unitPriceTry: line.product.saleTry, unitPriceUsd: line.product.saleUsd })),
      });
      await refresh();
      const receipt = await apiGet<{ receiptNo: string }>('/receipts/sales/' + sale.id);
      if (returnDetailAccountId === accountId) {
        setDetail(await apiGet<AccountDetail>(`/accounts/${accountId}`));
        window.history.pushState({}, '', `/cariler/${accountId}`);
        setReturnDetailAccountId('');
      }
      setNotice(`Satis ${sale.id} olustu, stok dustu. Fis ${receipt.receiptNo} ve satis bilgi notu detay ekranindan hazirlanabilir.`);
      return true;
    } catch (error) {
      setNotice(errorMessage(error));
      return false;
    }
  }

  async function updateRate(manual?: boolean) {
    try {
      const body = manual && manualRate ? { rate: Number(manualRate) } : {};
      const result = await apiPost<{ usdTry: number; updatedAt: string; source: string }>('/exchange-rate/update', body);
      await refresh();
      setManualRate(String(result.usdTry));
      setNotice(`USD kuru guncellendi: ${result.usdTry} (${result.source})`);
    } catch (error) {
      setNotice(`${errorMessage(error)}. Manuel kur girip tekrar deneyin.`);
    }
  }

  async function createCollection(payload: { accountId: string; method: string; currency: 'TRY' | 'USD'; amount: number; description?: string }) {
    try {
      const collection = await apiPost<Collection>('/collections', payload);
      await refresh();
      setNotice(`Tahsilat makbuzu hazir: ${collection.id} - ${money(collection.amount, collection.currency === 'USD' ? 'USD' : 'TL')}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function sendDebtMessage(accountId: string) {
    try {
      const result = await apiPost<{ link: string }>('/whatsapp/debt/' + accountId);
      setNotice('WhatsApp borc hatirlatma linki olusturuldu');
      window.open(result.link, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function deleteAccount(account: Account) {
    try {
      await apiDelete(`/accounts/${account.id}`);
      await refresh();
      setNotice('Cari silindi');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function deleteProduct(product: Product) {
    try {
      await apiDelete(`/products/${product.id}`);
      await refresh();
      setNotice('Urun silindi');
    } catch (error) {
      const message = errorMessage(error);
      if (message.toLowerCase().includes('hareket')) {
        await apiPut<Product>(`/products/${product.id}/archive`, { active: false });
        await refresh();
        setNotice('Urunun hareket gecmisi oldugu icin kalici silinmedi, pasife alindi');
        return;
      }
      setNotice(message);
    }
  }

  async function archiveProduct(product: Product, active: boolean) {
    try {
      await apiPut<Product>(`/products/${product.id}/archive`, { active });
      await refresh();
      setNotice(active ? 'Urun aktife alindi' : 'Urun pasife alindi');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function startAccountSale(accountId: string) {
    setSelectedAccountId(accountId);
    setReturnDetailAccountId(accountId);
    setDetail(null);
    window.history.pushState({}, '', '/');
    setActive('sales');
    setNotice('Cari secildi, satis ekranindan urun ekleyip satisi tamamlayabilirsin');
  }

  function startAccountCollection(accountId: string) {
    setSelectedAccountId(accountId);
    setDetail(null);
    window.history.pushState({}, '', '/');
    setActive('collections');
    setNotice('Cari secildi, tahsilat tutarini girip makbuz olusturabilirsin');
  }

  function startAccountPurchase(accountId: string) {
    setSelectedAccountId(accountId);
    setDetail(null);
    window.history.pushState({}, '', '/');
    setActive('purchases');
    setNotice('Tedarikci secildi, alis veya odeme kaydi olusturabilirsin');
  }

  async function createSupplierPaymentFromDetail(accountId: string, payload: { date: string; currency: 'TRY' | 'USD'; amount: number; method: string; description: string }) {
    try {
      await apiPost<SupplierPayment>('/supplier-payments', {
        supplierId: accountId,
        method: payload.method,
        currency: payload.currency,
        amount: payload.amount,
        date: payload.date ? new Date(payload.date).toISOString() : undefined,
        description: payload.description,
      });
      await refresh();
      setDetail(await apiGet<AccountDetail>(`/accounts/${accountId}`));
      setNotice('Tedarikci odemesi kaydedildi.');
    } catch (error) {
      setNotice(errorMessage(error));
      throw error;
    }
  }

  function activateTab(tabId: Tab) {
    setDetail(null);
    setProductDetailId('');
    window.history.pushState({}, '', '/');
    setActive(tabId);
    setMobileMenuOpen(false);
  }

  const content = useMemo(() => {
    if (!dashboard) return <div className="rounded-2xl border border-line bg-white p-8 text-sm font-semibold text-rose dark:border-slate-700 dark:bg-[#17202a]">{apiError || 'Yukleniyor...'}</div>;
    const activeProducts = products.filter((product) => product.active !== false);
    if (currentUser?.role === 'CUSTOMER' || currentUser?.role === 'DEALER') return <DealerView usdRate={dashboard.usdRate} products={activeProducts} accounts={accounts} orders={orders} initialSession={currentUser} onNotice={setNotice} onRefresh={refresh} />;
    if (detail) return <AccountDetailPage usdRate={dashboard.usdRate} detail={detail} products={products} accounts={accounts} users={users} onCreateUser={createUserForAccount} onBack={() => { setDetail(null); window.history.pushState({}, '', '/'); }} onSale={startAccountSale} onCollection={startAccountCollection} onPurchase={startAccountPurchase} onSupplierPayment={createSupplierPaymentFromDetail} onDebt={sendDebtMessage} onNotice={setNotice} onReload={async () => { await refresh(); setDetail(await apiGet<AccountDetail>(`/accounts/${detail.account.id}`)); }} />;
    if (productDetailId) return <ProductDetailPage productId={productDetailId} usdRate={dashboard.usdRate} products={products} accounts={accounts} sales={sales} purchases={purchases} quotes={quotes} orders={orders} onBack={() => { setProductDetailId(''); window.history.pushState({}, '', '/'); }} onEdit={(product) => { setEditingProduct(product); setModal('product'); }} onDelete={deleteProduct} onArchive={archiveProduct} onNotice={setNotice} />;
    if (active === 'dashboard') return <DashboardView dashboard={dashboard} sales={sales} products={products} accounts={accounts} onNotice={setNotice} />;
    if (active === 'accounts') return <AccountsView accounts={accounts} onAdd={() => { setEditingAccount(null); setModal('account'); }} onEdit={(account) => { setEditingAccount(account); setModal('account'); }} onDelete={deleteAccount} onDetail={openDetail} onDebt={sendDebtMessage} />;
    if (active === 'products') return <ProductsView products={products} sales={sales} purchases={purchases} quotes={quotes} orders={orders} categories={categoriesData} usdRate={dashboard.usdRate} onAdd={() => { setEditingProduct(null); setModal('product'); }} onEdit={(product) => { setEditingProduct(product); setModal('product'); }} onDelete={deleteProduct} onArchive={archiveProduct} onDetail={openProductDetail} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'categories') return <CategoriesView categories={categoriesData} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'sales') return <SalesView usdRate={dashboard.usdRate} selectedAccountId={selectedAccountId} accounts={accounts} products={activeProducts} categories={categoriesData} sales={sales} onSale={createSale} onNotice={setNotice} />;
    if (active === 'collections') return <CollectionsView usdRate={dashboard.usdRate} selectedAccountId={selectedAccountId} accounts={accounts} collections={collections} paymentLogs={paymentLogs} onCollection={createCollection} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'purchases') return <PurchasesView usdRate={dashboard.usdRate} accounts={accounts} products={activeProducts} purchases={purchases} supplierPayments={supplierPayments} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'dealer') return <DealerView usdRate={dashboard.usdRate} products={activeProducts} accounts={accounts} orders={orders} initialSession={currentUser?.role === 'ADMIN' ? currentUser : null} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'quotes') return <QuotesView usdRate={dashboard.usdRate} quotes={quotes} accounts={accounts} products={activeProducts} pdfTemplates={pdfTemplates} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'pdfs') return <PdfTemplatesView templates={pdfTemplates} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'messages') return <MessageTemplatesView templates={messageTemplates} onNotice={setNotice} onRefresh={refresh} />;
    if (active === 'users') return currentUser?.role === 'ADMIN' ? <UsersView users={users} accounts={accounts} onSave={saveUser} onNotice={setNotice} /> : <AccessDenied />;
    if (active === 'tests') return <PanelTestView onNotice={setNotice} onRefresh={refresh} />;
    return <OperationsView usdRate={dashboard.usdRate} accounts={accounts} products={products} purchases={purchases} quotes={quotes} onDebt={sendDebtMessage} onNotice={setNotice} onRefresh={refresh} />;
  }, [active, accounts, collections, dashboard, products, purchases, quotes, sales, supplierPayments, categoriesData, detail, productDetailId, orders, paymentLogs, users, currentUser, apiError]);

  const loginPath = window.location.pathname;
  if (!currentUser || ['/login', '/bayi-giris', '/admin-giris'].includes(loginPath)) {
    const mode = loginPath === '/bayi-giris' ? 'portal' : loginPath === '/admin-giris' ? 'admin' : 'any';
    if (currentUser && loginPath !== '/login') window.history.replaceState({}, '', currentUser.role === 'CUSTOMER' || currentUser.role === 'DEALER' ? '/bayi-giris' : '/');
    if (currentUser && loginPath !== '/login') {
      // Already authenticated, continue to the app shell.
    } else {
      return <LoginPage mode={mode} onLogin={(token, user) => {
      storeSession(token, user);
      window.history.pushState({}, '', '/');
      setActive(user.role === 'CUSTOMER' || user.role === 'DEALER' ? 'dealer' : 'dashboard');
      setNotice(`${user.name} olarak giris yapildi`);
      }} />;
    }
  }

  const portalOnly = currentUser?.role === 'CUSTOMER' || currentUser?.role === 'DEALER';
  const visibleTabs = portalOnly ? tabs.filter((tab) => tab.id === 'dealer') : tabs.filter((tab) => tab.id !== 'users' || currentUser?.role === 'ADMIN');

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eaf7f4_0,#f6f8fb_34%,#eef3f7_100%)] text-ink dark:bg-[radial-gradient(circle_at_top_left,#14313a_0,#0b1118_38%,#111827_100%)] dark:text-slate-100">
      <aside className={`fixed inset-y-0 left-0 z-20 hidden border-r border-white/40 bg-white/75 py-5 shadow-2xl shadow-slate-900/5 backdrop-blur-xl transition-all duration-300 dark:border-slate-700/60 dark:bg-[#17202a]/80 lg:block ${sidebarCollapsed ? 'w-20 px-3' : 'w-72 px-4'}`}>
        <div className={`flex items-center gap-3 px-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <div className="grid h-11 w-11 place-items-center rounded bg-ocean text-white shadow-lg shadow-ocean/25">
            <Building2 size={24} />
          </div>
          <div className={sidebarCollapsed ? 'hidden' : ''}>
            <div className="text-base font-bold">Bulut ERP Pro</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">On muhasebe, B2B, POS</div>
          </div>
        </div>
        <div className={`mt-5 flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
          <IconButton title={sidebarCollapsed ? 'Menuyu genislet' : 'Menuyu daralt'} onClick={() => setSidebarCollapsed((value) => !value)}>
            <ChevronRight size={18} className={`transition ${sidebarCollapsed ? '' : 'rotate-180'}`} />
          </IconButton>
        </div>
        <nav className="mt-8 space-y-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                title={tab.label}
                onClick={() => activateTab(tab.id)}
                className={`group relative flex h-11 w-full items-center gap-3 rounded px-3 text-left text-sm font-medium transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-sm ${
                  active === tab.id ? 'bg-gradient-to-r from-ocean/95 to-ocean/75 text-white shadow-lg shadow-ocean/10' : 'text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-slate-800/80'
                }`}
              >
                <span className={`absolute left-0 top-2 h-7 w-1 rounded-r-full bg-mint transition-all duration-300 ${active === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'}`} />
                <Icon size={19} className="shrink-0" strokeWidth={1.8} />
                <span className={sidebarCollapsed ? 'hidden' : ''}>{tab.label}</span>
                {!sidebarCollapsed && <ChevronRight size={15} className="ml-auto opacity-0 transition group-hover:opacity-100" />}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
        <header className="sticky top-0 z-10 border-b border-white/50 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-[#17202a]/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button type="button" title="Menu" onClick={() => setMobileMenuOpen(true)} className="grid h-11 w-11 place-items-center rounded border border-line bg-white/80 text-slate-700 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-ocean hover:text-ocean dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 lg:hidden"><Menu size={20} /></button>
              <div className="relative min-w-0 flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input ref={globalSearchRef} className="h-10 w-full rounded border border-line bg-white pl-10 pr-20 text-sm outline-none transition focus:border-ocean focus:ring-2 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900" placeholder="Cari, urun, barkod veya siparis ara" />
                <kbd className="absolute right-2 top-2 hidden rounded border border-line bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800 sm:block">Ctrl K</kbd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 items-center gap-3 rounded border border-line bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <span className="text-xs font-semibold text-slate-500">USD</span>
                  <span className="text-sm font-bold text-ocean">{dashboard?.usdRate}</span>
                  <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
                    {[8, 12, 7, 15, 11, 18].map((height, index) => <span key={index} style={{ height }} className="w-1 rounded bg-mint" />)}
                  </span>
                </div>
                <input value={manualRate} onChange={(event) => setManualRate(event.target.value)} className="h-10 w-24 rounded border border-line bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Kur" />
                <IconButton title="Kur guncelle" onClick={() => updateRate(Boolean(manualRate))}><RefreshCcw size={18} /></IconButton>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <IconButton title="Tema" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
              {currentUser ? <Button variant="soft" onClick={logout}>{currentUser.name}</Button> : <Button variant="soft" onClick={() => { window.history.pushState({}, '', '/admin-giris'); setNotice('Giris ekranina yonlendirildi'); }}>Giris</Button>}
              {!portalOnly && <button onClick={() => activateTab('sales')} className="inline-flex h-10 items-center gap-2 rounded bg-ocean px-4 text-sm font-semibold text-white transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#0e5c70] hover:shadow-lg hover:shadow-ocean/15">
                <PackagePlus size={18} />
                Hizli satis
              </button>}
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)}>
            <aside className="h-full w-[86vw] max-w-sm border-r border-white/40 bg-white/85 p-4 shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-[#17202a]/90" onClick={(event) => event.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded bg-ocean text-white shadow-lg shadow-ocean/25"><Building2 size={23} /></div>
                  <div><div className="font-bold">Bulut ERP Pro</div><div className="text-xs text-slate-500 dark:text-slate-400">Mobil yonetim</div></div>
                </div>
                <IconButton title="Kapat" onClick={() => setMobileMenuOpen(false)}><X size={18} /></IconButton>
              </div>
              <nav className="space-y-2">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.id} onClick={() => activateTab(tab.id)} className={`group flex min-h-11 w-full items-center gap-3 rounded px-3 py-3 text-left text-sm font-semibold transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-sm ${active === tab.id ? 'bg-ocean text-white shadow-sm' : 'bg-white/60 text-slate-700 hover:bg-white dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                      <Icon size={19} />
                      <span>{tab.label}</span>
                      <ChevronRight size={16} className="ml-auto opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-medium text-slate-700 shadow-soft backdrop-blur dark:border-slate-700/70 dark:bg-[#17202a]/80 dark:text-slate-200">
            {notice}
          </div>
          {content}
          {dashboard && <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">Kur son guncelleme: {new Date(dashboard.usdRateUpdatedAt).toLocaleString('tr-TR')}</div>}
        </main>
      </div>

      {modal === 'account' && <AccountModal initial={editingAccount} onClose={() => { setModal(null); setEditingAccount(null); }} onSave={createAccount} />}
      {modal === 'product' && <ProductModal initial={editingProduct} products={products} categories={categoriesData} usdRate={dashboard?.usdRate ?? 1} onClose={() => { setModal(null); setEditingProduct(null); }} onSave={createProduct} onNotice={setNotice} onRefresh={refresh} />}
    </div>
  );
}

function DashboardView({ dashboard, sales, products, accounts, onNotice }: { dashboard: Dashboard; sales: Sale[]; products: Product[]; accounts: Account[]; onNotice: (message: string) => void }) {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const stats = [
    ['Gunluk satis', dashboard.dailySales, usdFromTry(dashboard.dailySales, dashboard.usdRate), BadgeDollarSign, 'bg-mint text-ocean'],
    ['Aylik satis', dashboard.monthlySales, usdFromTry(dashboard.monthlySales, dashboard.usdRate), BarChart3, 'bg-[#fff2cd] text-[#9b6500]'],
    ['Toplam tahsilat', dashboard.totalCollected, usdFromTry(dashboard.totalCollected, dashboard.usdRate), WalletCards, 'bg-[#ffe3e9] text-rose'],
    ['Kasa + banka', dashboard.cashStatus + dashboard.bankStatus, usdFromTry(dashboard.cashStatus + dashboard.bankStatus, dashboard.usdRate), Banknote, 'bg-[#dfeeff] text-[#1d5d99]'],
    ['Cari borc', dashboard.balanceTry, dashboard.balanceUsd, Building2, 'bg-slate-100 text-slate-700'],
  ] as const;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-5 shadow-panel backdrop-blur dark:border-slate-700/70 dark:bg-[#17202a]/85">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ocean dark:text-mint">Canli finans ozeti</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Bulut ERP Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Satis, tahsilat, kasa ve kritik stoklari tek ekrandan izle.</p>
          </div>
          <div className="rounded-2xl border border-line bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
            <div className="text-xs font-semibold text-slate-500">Guncel kur</div>
            <div className="mt-1 text-xl font-black text-ocean dark:text-mint">1 USD = {money(dashboard.usdRate)}</div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, tryValue, usdValue, Icon, tone]) => (
          <div key={label} className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-soft backdrop-blur transition-all duration-200 hover:-translate-y-1 hover:shadow-lift dark:border-slate-700/70 dark:bg-[#17202a]/90">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</span>
              <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tone}`}><Icon size={19} /></span>
            </div>
            <div className="mt-3"><DualMoney tryValue={tryValue} usdValue={usdValue} /></div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Satis ve tahsilat grafigi">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9e1e8" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Area dataKey="sales" stroke="#126c82" fill="#d7f2ea" name="Satis" />
                <Area dataKey="collections" stroke="#e5a526" fill="#fff0bf" name="Tahsilat" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Kritik stok widget">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.criticalStocks}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="stock" fill="#b9415a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <DataTable
        title="Son satislar"
        headers={['Fis', 'Cari', 'Tutar', 'Odenen', 'Kalan', 'Tarih', 'Islem']}
        rows={sales.map((sale) => [<button key={`${sale.id}-id`} onClick={() => setSelectedSale(sale)} className="font-semibold text-ocean hover:underline">{sale.id}</button>, sale.accountName ?? sale.accountId, <DualMoney key={`${sale.id}-total`} compact tryValue={sale.totalTry ?? (sale.currency === 'TRY' ? sale.total : tryFromUsd(sale.total, dashboard.usdRate))} usdValue={sale.totalUsd ?? (sale.currency === 'USD' ? sale.total : usdFromTry(sale.total, dashboard.usdRate))} />, <DualMoney key={`${sale.id}-paid`} compact tryValue={sale.paidTry ?? (sale.currency === 'TRY' ? sale.paid : tryFromUsd(sale.paid, dashboard.usdRate))} usdValue={sale.paidUsd ?? (sale.currency === 'USD' ? sale.paid : usdFromTry(sale.paid, dashboard.usdRate))} />, <DualMoney key={`${sale.id}-remain`} compact tryValue={sale.remainingTry ?? (sale.currency === 'TRY' ? sale.remaining : tryFromUsd(sale.remaining, dashboard.usdRate))} usdValue={sale.remainingUsd ?? (sale.currency === 'USD' ? sale.remaining : usdFromTry(sale.remaining, dashboard.usdRate))} />, new Date(sale.createdAt).toLocaleDateString('tr-TR'), <Button key={`${sale.id}-detail`} variant="soft" onClick={() => setSelectedSale(sale)}>Detay</Button>])}
      />
      {selectedSale && <SaleDetailModal sale={selectedSale} products={products} accounts={accounts} fallbackRate={dashboard.usdRate} onClose={() => setSelectedSale(null)} onNotice={onNotice} />}
    </section>
  );
}

function AccountsView({ accounts, onAdd, onEdit, onDelete, onDetail, onDebt }: { accounts: Account[]; onAdd: () => void; onEdit: (account: Account) => void; onDelete: (account: Account) => void; onDetail: (id: string) => void; onDebt: (id: string) => void }) {
  const [typeFilter, setTypeFilter] = useState('Tumu');
  const [sortBy, setSortBy] = useState('last');
  const filtered = accounts
    .filter((account) => typeFilter === 'Tumu' || account.type === typeFilter)
    .sort((a, b) => {
      if (sortBy === 'debtDesc') return (b.balanceTry + b.balanceUsd) - (a.balanceTry + a.balanceUsd);
      if (sortBy === 'debtAsc') return (a.balanceTry + a.balanceUsd) - (b.balanceTry + b.balanceUsd);
      if (sortBy === 'receivableDesc') return Math.abs(Math.min(0, b.balanceTry) + Math.min(0, b.balanceUsd)) - Math.abs(Math.min(0, a.balanceTry) + Math.min(0, a.balanceUsd));
      if (sortBy === 'az') return a.companyName.localeCompare(b.companyName, 'tr');
      if (sortBy === 'za') return b.companyName.localeCompare(a.companyName, 'tr');
      return (b.lastTransactionDate ?? '').localeCompare(a.lastTransactionDate ?? '');
    });
  return (
    <DataTable
      title="Cari hesaplar"
      actions={<Toolbar><FormSelect label="" value={typeFilter} onChange={setTypeFilter} options={['Tumu', 'MUSTERI', 'BAYI', 'TEDARIKCI'].map((item) => ({ label: item, value: item }))} /><FormSelect label="" value={sortBy} onChange={setSortBy} options={[{ label: 'Son islem', value: 'last' }, { label: 'Borc buyukten', value: 'debtDesc' }, { label: 'Borc kucukten', value: 'debtAsc' }, { label: 'Alacak buyukten', value: 'receivableDesc' }, { label: 'Ada gore A-Z', value: 'az' }, { label: 'Ada gore Z-A', value: 'za' }]} /><Button onClick={onAdd} icon={<Plus size={17} />}>Cari ekle</Button><a className="inline-flex h-10 items-center gap-2 rounded border border-line px-3 text-sm font-semibold dark:border-slate-700" href={apiUrl('/exports/accounts.xlsx')}><FileDown size={17} /> Excel</a></Toolbar>}
      headers={['Kod', 'Firma', 'Tip', 'Telefon', 'TL', 'USD', 'Risk', 'Son satis', 'Son tahsilat', 'Islem']}
      rows={filtered.map((account) => [
        account.code,
        <button key={`${account.id}-name`} onClick={() => onDetail(account.id)} className="font-semibold text-ocean hover:underline">{account.companyName}</button>,
        <Badge key={`${account.id}-type`}>{account.type}</Badge>,
        account.phone ?? '-',
        money(account.balanceTry),
        money(account.balanceUsd, 'USD'),
        money(account.riskLimit),
        account.lastSaleDate ? new Date(account.lastSaleDate).toLocaleDateString('tr-TR') : '-',
        account.lastCollectionDate ? new Date(account.lastCollectionDate).toLocaleDateString('tr-TR') : '-',
        <Toolbar key={account.id}>
          <Button variant="soft" onClick={() => onDetail(account.id)} icon={<ReceiptText size={16} />}>Detay</Button>
          <Button variant="soft" onClick={() => onEdit(account)} icon={<Edit3 size={16} />}>Duzenle</Button>
          <Button variant="soft" onClick={() => onDelete(account)} icon={<Trash2 size={16} />}>Sil</Button>
          <Button variant="soft" onClick={() => onDebt(account.id)} icon={<MessageCircle size={16} />}>WhatsApp</Button>
        </Toolbar>,
      ])}
    />
  );
}

function ProductsView({ products, sales, purchases, quotes, orders, categories, usdRate, onAdd, onEdit, onDelete, onArchive, onDetail, onNotice, onRefresh }: { products: Product[]; sales: Sale[]; purchases: Purchase[]; quotes: Quote[]; orders: Order[]; categories: Category[]; usdRate: number; onAdd: () => void; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onArchive: (product: Product, active: boolean) => void; onDetail: (id: string) => void; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [categoryFilter, setCategoryFilter] = useState('Tumu');
  const [statusFilter, setStatusFilter] = useState<'active' | 'passive' | 'all'>('active');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const hasMovements = (product: Product) => {
    const inItems = (items?: TransactionItem[]) => (items ?? []).some((item) => productItemMatches(item, product));
    return sales.some((sale) => inItems(sale.items))
      || purchases.some((purchase) => inItems(purchase.items))
      || quotes.some((quote) => inItems(quote.items))
      || orders.some((order) => inItems(order.items));
  };
  const filtered = products
    .filter((product) => statusFilter === 'all' || (statusFilter === 'active' ? product.active !== false : product.active === false))
    .filter((product) => categoryFilter === 'Tumu' || product.category === categoryFilter || product.subCategory === categoryFilter);
  const productHeaders = ['Urun adi', 'Urun kodu', 'Barkod', 'Kategori', 'Alt kategori', 'Marka', 'Depo', 'Stok adedi', 'Alis fiyat TL', 'Alis fiyat USD', 'Satis fiyat TL', 'Satis fiyat USD', 'Bayi fiyat TL', 'Bayi fiyat USD', 'KDV orani', 'Kritik stok limiti', 'Urun gorsel URL', 'Aktif'];
  const templateRow = { 'Urun adi': '', 'Urun kodu': '', Barkod: '', Kategori: '', 'Alt kategori': '', Marka: '', Depo: 'Merkez Depo', 'Stok adedi': '', 'Alis fiyat TL': '', 'Alis fiyat USD': '', 'Satis fiyat TL': '', 'Satis fiyat USD': '', 'Bayi fiyat TL': '', 'Bayi fiyat USD': '', 'KDV orani': '20', 'Kritik stok limiti': '5', 'Urun gorsel URL': '', Aktif: 'Evet' };
  const exportRows = filtered.map((product) => ({
    'Urun adi': product.name,
    'Urun kodu': product.code,
    Barkod: product.barcode,
    Kategori: product.category,
    'Alt kategori': product.subCategory ?? '',
    Marka: product.brand,
    Depo: product.warehouse,
    'Stok adedi': product.stock,
    'Alis fiyat TL': product.purchaseTry ?? 0,
    'Alis fiyat USD': product.purchaseUsd ?? 0,
    'Satis fiyat TL': product.saleTry,
    'Satis fiyat USD': product.saleUsd,
    'Bayi fiyat TL': product.dealerTry,
    'Bayi fiyat USD': product.dealerUsd,
    'KDV orani': product.vatRate ?? 20,
    'Kritik stok limiti': product.criticalStock,
    'Urun gorsel URL': product.imageUrl ?? '',
    Aktif: product.active === false ? 'Hayir' : 'Evet',
  }));
  function downloadCsv(name: string, rows: object[]) {
    const keys = rows[0] ? Object.keys(rows[0]) : productHeaders;
    const csv = '\ufeff' + [keys.join(';'), ...rows.map((row) => keys.map((key) => `"${String((row as Record<string, unknown>)[key] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = name;
    link.click();
  }
  function downloadExcel(name: string, rows: object[]) {
    const keys = rows[0] ? Object.keys(rows[0]) : productHeaders;
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml((row as Record<string, unknown>)[key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    link.download = name;
    link.click();
  }
  function parseDelimited(text: string) {
    const clean = text.replace(/^\ufeff/, '');
    const firstLine = clean.split(/\r?\n/)[0] ?? '';
    const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < clean.length; index += 1) {
      const char = clean[index];
      const next = clean[index + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) {
        row.push(cell.trim());
        cell = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = '';
      } else cell += char;
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }
  async function importProductFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    const [headers = [], ...lines] = parseDelimited(text);
    const rows = lines.map((values) => {
      const source = Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]]));
      return {
        name: source['Urun adi'] || source.name,
        code: source['Urun kodu'] || source.code,
        barcode: source.Barkod || source.barcode,
        category: source.Kategori || source.category,
        subCategory: source['Alt kategori'] || source.subCategory,
        brand: source.Marka || source.brand,
        warehouse: source.Depo || source.warehouse,
        stock: source['Stok adedi'] || source.stock,
        purchaseTry: source['Alis fiyat TL'],
        purchaseUsd: source['Alis fiyat USD'],
        saleTry: source['Satis fiyat TL'],
        saleUsd: source['Satis fiyat USD'],
        dealerTry: source['Bayi fiyat TL'],
        dealerUsd: source['Bayi fiyat USD'],
        vatRate: source['KDV orani'],
        criticalStock: source['Kritik stok limiti'],
        imageUrl: source['Urun gorsel URL'],
        active: String(source.Aktif ?? 'Evet').toLowerCase() !== 'hayir',
      };
    });
    const result = await apiPost<{ created: number; updated: number; errors: { row: number; message: string }[] }>('/products/import', { rows });
    await onRefresh();
    onNotice(`Ice aktarim: ${result.created} yeni, ${result.updated} guncel, ${result.errors.length} hata`);
  }
  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {warehouses.map((warehouse) => <InfoCard key={warehouse} label={warehouse} value={`${products.filter((item) => item.warehouse === warehouse).reduce((sum, item) => sum + item.stock, 0)} adet`} icon={<Boxes size={18} />} />)}
      </div>
      <ProductInventoryTable
        products={filtered}
        categories={categories}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        setStatusFilter={setStatusFilter}
        setCategoryFilter={setCategoryFilter}
        onImport={importProductFile}
        onExportCsv={() => downloadCsv('urunler.csv', exportRows)}
        onExportExcel={() => downloadExcel('urunler.xls', exportRows)}
        onTemplateCsv={() => downloadCsv('urun_sablonu.csv', [templateRow])}
        onTemplateExcel={() => downloadExcel('urun_sablonu.xls', [templateRow])}
        onAdd={onAdd}
        onDetail={onDetail}
        onEdit={onEdit}
        onArchive={onArchive}
        onDeleteRequest={setDeleteTarget}
      />
      {deleteTarget && (
        <ModalFrame title={hasMovements(deleteTarget) ? 'Urun arsivleme' : 'Urun silme onayi'} onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <div className="rounded border border-line bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="font-bold">{deleteTarget.name}</div>
              <div className="mt-1 text-sm text-slate-500">{deleteTarget.code} / {deleteTarget.barcode || 'Barkod yok'}</div>
            </div>
            {hasMovements(deleteTarget) ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Bu urunun hareket gecmisi oldugu icin silinemez. Urunu pasife almak ister misiniz? Pasif urun yeni satis, alis ve teklif ekranlarinda secilemez; eski kayitlarda ve urun detay gecmisinde gorunmeye devam eder.</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">Bu urune bagli satis, alis, teklif veya siparis hareketi bulunmuyor. ADMIN olarak kalici silme islemini onayliyor musunuz?</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="soft" onClick={() => setDeleteTarget(null)}>Vazgec</Button>
              {hasMovements(deleteTarget) ? (
                <Button onClick={() => { onArchive(deleteTarget, false); setDeleteTarget(null); }}>Pasife Al</Button>
              ) : (
                <Button onClick={() => { onDelete(deleteTarget); setDeleteTarget(null); }} icon={<Trash2 size={16} />}>Kalici Sil</Button>
              )}
            </div>
          </div>
        </ModalFrame>
      )}
    </section>
  );
}

function ProductInventoryTable({ products, categories, statusFilter, categoryFilter, setStatusFilter, setCategoryFilter, onImport, onExportCsv, onExportExcel, onTemplateCsv, onTemplateExcel, onAdd, onDetail, onEdit, onArchive, onDeleteRequest }: { products: Product[]; categories: Category[]; statusFilter: 'active' | 'passive' | 'all'; categoryFilter: string; setStatusFilter: (value: 'active' | 'passive' | 'all') => void; setCategoryFilter: (value: string) => void; onImport: (file?: File) => void | Promise<void>; onExportCsv: () => void; onExportExcel: () => void; onTemplateCsv: () => void; onTemplateExcel: () => void; onAdd: () => void; onDetail: (id: string) => void; onEdit: (product: Product) => void; onArchive: (product: Product, active: boolean) => void; onDeleteRequest: (product: Product) => void }) {
  const [query, setQuery] = useState('');
  const visible = products.filter((product) => `${product.name} ${product.code} ${product.barcode} ${product.category} ${product.brand}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-panel backdrop-blur dark:border-slate-700/70 dark:bg-[#17202a]/90">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 p-5 dark:border-slate-700/70">
        <h1 className="text-lg font-black tracking-tight">Urun ve stok yonetimi</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-52 rounded-xl border border-line bg-white/90 px-3 text-sm outline-none transition focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80" placeholder="Tabloda ara" />
          <FormSelect label="" value={statusFilter} onChange={(value) => setStatusFilter(value as 'active' | 'passive' | 'all')} options={[{ label: 'Aktif urunler', value: 'active' }, { label: 'Pasif urunler', value: 'passive' }, { label: 'Tumu', value: 'all' }]} />
          <FormSelect label="" value={categoryFilter} onChange={setCategoryFilter} options={[{ label: 'Tum kategoriler', value: 'Tumu' }, ...categories.map((item) => ({ label: item.name, value: item.name }))]} />
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white/90 px-3 text-sm font-semibold text-ocean shadow-sm transition hover:-translate-y-0.5 hover:bg-mint dark:border-slate-700 dark:bg-slate-900/80">
            <Upload size={16} /> Içe aktar
            <input type="file" accept=".csv,.txt,.tsv,.xls" className="hidden" onChange={(event) => void onImport(event.target.files?.[0])} />
          </label>
          <Button variant="soft" onClick={onExportCsv}>CSV disa aktar</Button>
          <Button variant="soft" onClick={onExportExcel}>Excel disa aktar</Button>
          <Button variant="soft" onClick={onTemplateCsv}>CSV sablon</Button>
          <Button variant="soft" onClick={onTemplateExcel}>Excel sablon</Button>
          <Button onClick={onAdd} icon={<Plus size={17} />}>Urun ekle</Button>
        </div>
      </div>
      <div className="hidden xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
            <tr>
              <th className="w-[34%] px-5 py-4 font-bold">Urun</th>
              <th className="w-[16%] px-5 py-4 font-bold">Kategori / Depo</th>
              <th className="w-[13%] px-5 py-4 font-bold">Stok</th>
              <th className="w-[22%] px-5 py-4 font-bold">Fiyatlar</th>
              <th className="w-[15%] px-5 py-4 text-right font-bold">Islem</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => <ProductInventoryRow key={product.id} product={product} onDetail={onDetail} onEdit={onEdit} onArchive={onArchive} onDeleteRequest={onDeleteRequest} />)}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 xl:hidden">
        {visible.map((product) => (
          <div key={product.id} className="rounded-2xl border border-line bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <ProductInventoryRowContent product={product} onDetail={onDetail} onEdit={onEdit} onArchive={onArchive} onDeleteRequest={onDeleteRequest} mobile />
          </div>
        ))}
      </div>
      {!visible.length && <div className="p-6 text-sm text-slate-500">Filtreye uygun urun bulunamadi.</div>}
    </section>
  );
}

function ProductInventoryRow({ product, onDetail, onEdit, onArchive, onDeleteRequest }: { product: Product; onDetail: (id: string) => void; onEdit: (product: Product) => void; onArchive: (product: Product, active: boolean) => void; onDeleteRequest: (product: Product) => void }) {
  return (
    <tr className="border-t border-line/70 transition hover:bg-slate-50/90 dark:border-slate-700/70 dark:hover:bg-slate-900/80">
      <td className="px-5 py-4 align-top"><ProductIdentity product={product} onDetail={onDetail} /></td>
      <td className="px-5 py-4 align-top"><div className="font-bold">{product.category}</div><div className="mt-1 text-xs text-slate-500">{product.subCategory || product.brand || '-'}</div><div className="mt-2 text-xs font-semibold text-slate-500">{product.warehouse}</div></td>
      <td className="px-5 py-4 align-top"><ProductStockBadge product={product} /><div className="mt-2"><span className={product.active === false ? 'rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'rounded bg-mint px-2 py-1 text-xs font-semibold text-ocean'}>{product.active === false ? 'Pasif' : 'Aktif'}</span></div></td>
      <td className="px-5 py-4 align-top"><ProductPriceBlock product={product} /></td>
      <td className="px-5 py-4 align-top"><ProductActions product={product} onDetail={onDetail} onEdit={onEdit} onArchive={onArchive} onDeleteRequest={onDeleteRequest} /></td>
    </tr>
  );
}

function ProductInventoryRowContent({ product, onDetail, onEdit, onArchive, onDeleteRequest, mobile = false }: { product: Product; onDetail: (id: string) => void; onEdit: (product: Product) => void; onArchive: (product: Product, active: boolean) => void; onDeleteRequest: (product: Product) => void; mobile?: boolean }) {
  return (
    <div className="space-y-3">
      <ProductIdentity product={product} onDetail={onDetail} />
      <div className={`grid gap-3 ${mobile ? 'sm:grid-cols-3' : 'grid-cols-3'}`}>
        <div><div className="text-xs font-bold uppercase text-slate-500">Kategori</div><div className="mt-1 font-semibold">{product.category}</div></div>
        <div><div className="text-xs font-bold uppercase text-slate-500">Depo</div><div className="mt-1 font-semibold">{product.warehouse}</div></div>
        <div><div className="text-xs font-bold uppercase text-slate-500">Stok</div><div className="mt-1"><ProductStockBadge product={product} /></div></div>
      </div>
      <ProductPriceBlock product={product} />
      <ProductActions product={product} onDetail={onDetail} onEdit={onEdit} onArchive={onArchive} onDeleteRequest={onDeleteRequest} />
    </div>
  );
}

function ProductIdentity({ product, onDetail }: { product: Product; onDetail: (id: string) => void }) {
  const code = product.code && product.code.length > 42 ? `${product.code.slice(0, 42)}...` : product.code || 'Kodsuz';
  const barcode = product.barcode && product.barcode.length > 22 ? `${product.barcode.slice(0, 22)}...` : product.barcode;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <ProductThumb product={product} />
      <button type="button" onClick={() => onDetail(product.id)} className="min-w-0 text-left">
        <div className="product-code-clamp text-[11px] font-bold uppercase tracking-wide text-slate-400" title={`${product.code || 'Kodsuz'}${product.barcode ? ` / ${product.barcode}` : ''}`}>{code}{barcode ? ` / ${barcode}` : ''}</div>
        <div className="product-title-clamp mt-1 min-h-[44px] text-sm font-black leading-snug text-ocean hover:underline">{product.name}</div>
        <div className="mt-1 text-xs font-semibold text-slate-500">{product.brand || 'Marka yok'}</div>
      </button>
    </div>
  );
}

function ProductStockBadge({ product }: { product: Product }) {
  const critical = product.stock <= product.criticalStock;
  return <span className={critical ? 'inline-flex rounded-full border border-rose/20 bg-[#ffe3e9] px-3 py-1 text-xs font-bold text-rose' : 'inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{product.stock} adet</span>;
}

function ProductPriceBlock({ product }: { product: Product }) {
  const vat = product.vatRate ?? 20;
  return (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-3">
      <div><div className="text-xs font-bold uppercase text-slate-500">KDV haric</div><DualMoney compact tryValue={product.saleTry} usdValue={product.saleUsd} /></div>
      <div><div className="text-xs font-bold uppercase text-slate-500">KDV dahil</div><DualMoney compact tryValue={grossFromNet(product.saleTry, vat)} usdValue={grossFromNet(product.saleUsd, vat)} /></div>
      <div><div className="text-xs font-bold uppercase text-slate-500">Bayi</div><DualMoney compact tryValue={product.dealerTry} usdValue={product.dealerUsd} /></div>
    </div>
  );
}

function ProductActions({ product, onDetail, onEdit, onArchive, onDeleteRequest }: { product: Product; onDetail: (id: string) => void; onEdit: (product: Product) => void; onArchive: (product: Product, active: boolean) => void; onDeleteRequest: (product: Product) => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <IconButton title="Detay" onClick={() => onDetail(product.id)}><ReceiptText size={16} /></IconButton>
      <IconButton title="Duzenle" onClick={() => onEdit(product)}><Edit3 size={16} /></IconButton>
      {product.active === false ? <IconButton title="Aktife Al" onClick={() => onArchive(product, true)}><RefreshCcw size={16} /></IconButton> : <IconButton title="Sil" onClick={() => onDeleteRequest(product)}><Trash2 size={16} /></IconButton>}
    </div>
  );
}

function ProductDetailPage({ productId, usdRate, products, accounts, sales, purchases, quotes, orders, onBack, onEdit, onDelete, onArchive, onNotice }: { productId: string; usdRate: number; products: Product[]; accounts: Account[]; sales: Sale[]; purchases: Purchase[]; quotes: Quote[]; orders: Order[]; onBack: () => void; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onArchive: (product: Product, active: boolean) => void; onNotice: (message: string) => void }) {
  const product = products.find((item) => item.id === productId);
  const [range, setRange] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (!product) return <Panel title="Urun bulunamadi"><Button variant="soft" onClick={onBack}>Geri don</Button></Panel>;
  const since = (() => {
    const date = new Date();
    if (range === 'today') return date.toISOString().slice(0, 10);
    if (range === 'week') { date.setDate(date.getDate() - 7); return date.toISOString(); }
    if (range === 'month') { date.setMonth(date.getMonth() - 1); return date.toISOString(); }
    return '';
  })();
  const matchesDate = (date: string) => !since || (range === 'today' ? date.startsWith(since) : date >= since);
  const matchesProduct = (item: TransactionItem) => productItemMatches(item, product);
  const hasMovements = [...sales, ...purchases, ...quotes, ...orders].some((entry) => (entry.items ?? []).some(matchesProduct));
  const productSales = sales
    .filter((sale) => matchesDate(sale.createdAt) && (sale.items ?? []).some(matchesProduct))
    .filter((sale) => `${sale.id} ${sale.accountName ?? ''} ${(sale.items ?? []).map((item) => item.productName).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const productPurchases = purchases
    .filter((purchase) => matchesDate(purchase.createdAt) && (purchase.items ?? []).some(matchesProduct))
    .filter((purchase) => `${purchase.id} ${purchase.supplierName ?? ''} ${purchase.invoiceNo ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const movementSeed = [
    ...productPurchases.flatMap((purchase) => (purchase.items ?? []).filter(matchesProduct).map((item) => ({ date: purchase.createdAt, type: 'Alis girisi', description: purchase.invoiceNo ?? purchase.id, warehouse: product.warehouse, inQty: item.quantity, outQty: 0, user: 'Depo Personeli', source: purchase }))),
    ...productSales.flatMap((sale) => (sale.items ?? []).filter(matchesProduct).map((item) => ({ date: sale.createdAt, type: 'Satis cikisi', description: sale.id, warehouse: product.warehouse, inQty: 0, outQty: item.quantity, user: 'Satis Personeli', source: sale }))),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const movements = movementSeed.map((movement) => {
    running += movement.inQty - movement.outQty;
    return { ...movement, remaining: running };
  }).sort((a, b) => b.date.localeCompare(a.date));
  const stockValue = product.stock * (product.purchaseTry || product.saleTry);
  const vatRate = product.vatRate ?? 20;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Urunler &gt; {product.name}</div>
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
        </div>
        <Toolbar>
          <Button variant="soft" onClick={onBack}>Geri don</Button>
          <Button variant="soft" onClick={() => onEdit(product)} icon={<Edit3 size={17} />}>Duzenle</Button>
          {product.active === false ? (
            <Button onClick={() => onArchive(product, true)} icon={<RefreshCcw size={17} />}>Aktife Al</Button>
          ) : (
            <Button variant="soft" onClick={() => setDeleteOpen(true)} icon={<Trash2 size={17} />}>Sil / Pasife Al</Button>
          )}
        </Toolbar>
      </div>
      <Panel title="Urun ozeti">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Urun kodu / barkod" value={`${product.code} / ${product.barcode || '-'}`} />
          <SummaryCard label="Kategori / Marka" value={`${product.category} / ${product.brand || '-'}`} />
          <SummaryCard label="KDV orani" value={`%${vatRate}`} />
          <div className="rounded border border-line bg-white p-4 dark:border-slate-700 dark:bg-[#17202a]"><div className="text-xs font-semibold uppercase text-slate-500">Alis KDV haric</div><div className="mt-2"><DualMoney tryValue={product.purchaseTry ?? 0} usdValue={product.purchaseUsd ?? 0} /></div></div>
          <div className="rounded border border-line bg-white p-4 dark:border-slate-700 dark:bg-[#17202a]"><div className="text-xs font-semibold uppercase text-slate-500">Alis KDV dahil</div><div className="mt-2"><DualMoney tryValue={grossFromNet(product.purchaseTry ?? 0, vatRate)} usdValue={grossFromNet(product.purchaseUsd ?? 0, vatRate)} /></div></div>
          <div className="rounded border border-line bg-white p-4 dark:border-slate-700 dark:bg-[#17202a]"><div className="text-xs font-semibold uppercase text-slate-500">Satis KDV haric</div><div className="mt-2"><DualMoney tryValue={product.saleTry} usdValue={product.saleUsd} /></div></div>
          <div className="rounded border border-line bg-white p-4 dark:border-slate-700 dark:bg-[#17202a]"><div className="text-xs font-semibold uppercase text-slate-500">Satis KDV dahil</div><div className="mt-2"><DualMoney tryValue={grossFromNet(product.saleTry, vatRate)} usdValue={grossFromNet(product.saleUsd, vatRate)} /></div></div>
          <SummaryCard label="Toplam stok" value={`${product.stock} adet`} tone={product.stock <= product.criticalStock ? 'debt' : 'neutral'} />
          <SummaryCard label="Stok degeri" value={money(stockValue)} />
          <SummaryCard label="Kritik stok" value={product.stock <= product.criticalStock ? 'Kritik seviyede' : 'Normal'} tone={product.stock <= product.criticalStock ? 'debt' : 'credit'} />
        </div>
      </Panel>
      <Panel title="Filtre">
        <div className="grid gap-3 md:grid-cols-4">
          <FormSelect label="Tarih" value={range} onChange={setRange} options={[{ label: 'Tum zamanlar', value: 'all' }, { label: 'Bugun', value: 'today' }, { label: 'Bu hafta', value: 'week' }, { label: 'Bu ay', value: 'month' }]} />
          <FormInput label="Arama" value={query} onChange={setQuery} />
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <DataTable title="Onceki satislar" headers={['Tarih', 'Musteri', 'Fis no', 'Miktar', 'Birim USD/TL', 'Toplam USD/TL', 'Personel', 'Detay']} rows={productSales.flatMap((sale) => (sale.items ?? []).filter(matchesProduct).map((item) => [new Date(sale.createdAt).toLocaleDateString('tr-TR'), sale.accountName ?? accounts.find((account) => account.id === sale.accountId)?.companyName ?? sale.accountId, sale.id, item.quantity, <DualMoney key={`${sale.id}-unit`} compact tryValue={item.unitPriceTry ?? 0} usdValue={item.unitPriceUsd ?? 0} />, <DualMoney key={`${sale.id}-total`} compact tryValue={item.lineTotalTry ?? 0} usdValue={item.lineTotalUsd ?? 0} />, 'Satis Personeli', <Button key={`${sale.id}-detail`} variant="soft" onClick={() => setSelectedSale(sale)}>Detay</Button>]))} />
        <DataTable title="Onceki alislar" headers={['Tarih', 'Tedarikci', 'Fatura no', 'Miktar', 'Alis USD/TL', 'Toplam USD/TL', 'Odeme', 'Detay']} rows={productPurchases.flatMap((purchase) => (purchase.items ?? []).filter(matchesProduct).map((item) => [new Date(purchase.createdAt).toLocaleDateString('tr-TR'), purchase.supplierName ?? accounts.find((account) => account.id === purchase.supplierId)?.companyName ?? purchase.supplierId, purchase.invoiceNo ?? '-', item.quantity, <DualMoney key={`${purchase.id}-unit`} compact tryValue={item.unitPriceTry ?? 0} usdValue={item.unitPriceUsd ?? 0} />, <DualMoney key={`${purchase.id}-total`} compact tryValue={item.lineTotalTry ?? 0} usdValue={item.lineTotalUsd ?? 0} />, purchase.paymentStatus ?? '-', <Button key={`${purchase.id}-detail`} variant="soft" onClick={() => setSelectedPurchase(purchase)}>Detay</Button>]))} />
      </div>
      <DataTable title="Stok ekstresi ve hareketler" headers={['Tarih', 'Islem tipi', 'Aciklama', 'Depo', 'Giris', 'Cikis', 'Kalan', 'Kullanici']} rows={movements.map((movement) => [new Date(movement.date).toLocaleDateString('tr-TR'), movement.type, movement.description, movement.warehouse, movement.inQty || '-', movement.outQty || '-', movement.remaining, movement.user])} />
      {selectedSale && <SaleDetailModal sale={selectedSale} products={products} accounts={accounts} fallbackRate={usdRate} onClose={() => setSelectedSale(null)} onNotice={onNotice} />}
      {selectedPurchase && <PurchaseDetailModal purchase={selectedPurchase} products={products} accounts={accounts} fallbackRate={usdRate} onClose={() => setSelectedPurchase(null)} onNotice={onNotice} onSaved={setSelectedPurchase} />}
      {deleteOpen && (
        <ModalFrame title={hasMovements ? 'Urun arsivleme' : 'Urun silme onayi'} onClose={() => setDeleteOpen(false)}>
          <div className="space-y-4">
            <div className="rounded border border-line bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="font-bold">{product.name}</div>
              <div className="mt-1 text-sm text-slate-500">{product.code} / {product.barcode || 'Barkod yok'}</div>
            </div>
            {hasMovements ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Bu urunun hareket gecmisi oldugu icin kalici silinemez. Urunu pasife alirsan yeni satis, alis ve teklif ekranlarinda secilemez; eski kayitlarda gorunmeye devam eder.</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">Bu urune bagli hareket bulunmuyor. Kalici silme islemini onayliyor musunuz?</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="soft" onClick={() => setDeleteOpen(false)}>Vazgec</Button>
              {hasMovements ? (
                <Button onClick={() => { onArchive(product, false); setDeleteOpen(false); onBack(); }}>Pasife Al</Button>
              ) : (
                <Button onClick={() => { onDelete(product); setDeleteOpen(false); onBack(); }} icon={<Trash2 size={16} />}>Kalici Sil</Button>
              )}
            </div>
          </div>
        </ModalFrame>
      )}
    </section>
  );
}

function PurchaseDetailModal({ purchase, products, accounts, fallbackRate, onClose, onNotice, onSaved }: { purchase: Purchase; products: Product[]; accounts: Account[]; fallbackRate: number; onClose: () => void; onNotice: (message: string) => void; onSaved?: (purchase: Purchase) => void | Promise<void> }) {
  const supplier = accounts.find((account) => account.id === purchase.supplierId);
  const suppliers = accounts.filter((account) => account.type === 'TEDARIKCI');
  const supplierName = supplier?.companyName ?? purchase.supplierName ?? purchase.supplierId;
  const rate = purchase.exchangeRate && purchase.exchangeRate > 1 ? purchase.exchangeRate : fallbackRate;
  const lines = purchase.items?.length ? purchase.items : [];
  const buildEditLines = () => (lines.length ? lines : [{ productId: '', quantity: 1, unitPriceTry: 0, unitPriceUsd: 0, vatRate: 20, unitPrice: 0, lineTotal: 0 }]).map((item) => ({
    uid: purchaseUid(),
    productId: item.productId,
    quantity: item.quantity || 1,
    priceTry: lineUnitTry(item),
    priceUsd: lineUnitUsd(item),
    vatRate: item.vatRate ?? 20,
    gross: false,
  }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDraft, setEditDraft] = useState({ supplierId: purchase.supplierId, invoiceNo: purchase.invoiceNo ?? '', date: purchase.createdAt.slice(0, 10), currency: purchase.currency, paymentStatus: purchase.paymentStatus ?? 'Bekliyor', description: purchase.description ?? '' });
  const [editLines, setEditLines] = useState<PurchaseLineDraft[]>([]);
  const lineUnitTry = (item: TransactionItem) => item.unitPriceTry ?? (purchase.currency === 'TRY' ? item.unitPrice : tryFromUsd(item.unitPrice, rate));
  const lineUnitUsd = (item: TransactionItem) => item.unitPriceUsd ?? (purchase.currency === 'USD' ? item.unitPrice : usdFromTry(item.unitPrice, rate));
  const lineNetTry = (item: TransactionItem) => item.lineTotalTry ?? lineUnitTry(item) * item.quantity;
  const lineNetUsd = (item: TransactionItem) => item.lineTotalUsd ?? lineUnitUsd(item) * item.quantity;
  const lineGrossTry = (item: TransactionItem) => grossFromNet(lineNetTry(item), item.vatRate ?? 20);
  const lineGrossUsd = (item: TransactionItem) => grossFromNet(lineNetUsd(item), item.vatRate ?? 20);
  const subtotalTry = lines.reduce((sum, item) => sum + lineNetTry(item), 0) || (purchase.currency === 'TRY' ? purchase.subtotal : tryFromUsd(purchase.subtotal, rate));
  const subtotalUsd = lines.reduce((sum, item) => sum + lineNetUsd(item), 0) || (purchase.currency === 'USD' ? purchase.subtotal : usdFromTry(purchase.subtotal, rate));
  const vatTry = lines.reduce((sum, item) => sum + (lineGrossTry(item) - lineNetTry(item)), 0) || (purchase.currency === 'TRY' ? purchase.vat : tryFromUsd(purchase.vat, rate));
  const vatUsd = lines.reduce((sum, item) => sum + (lineGrossUsd(item) - lineNetUsd(item)), 0) || (purchase.currency === 'USD' ? purchase.vat : usdFromTry(purchase.vat, rate));
  const totalTry = subtotalTry + vatTry;
  const totalUsd = subtotalUsd + vatUsd;
  function productFor(item: TransactionItem) {
    return products.find((product) => product.id === item.productId);
  }
  function productName(item: TransactionItem) {
    return item.productName ?? productFor(item)?.name ?? item.productId;
  }
  function productMeta(item: TransactionItem) {
    const product = productFor(item);
    return [product?.code, product?.barcode].filter(Boolean).join(' / ') || '-';
  }
  useEffect(() => {
    setEditDraft({ supplierId: purchase.supplierId, invoiceNo: purchase.invoiceNo ?? '', date: purchase.createdAt.slice(0, 10), currency: purchase.currency, paymentStatus: purchase.paymentStatus ?? 'Bekliyor', description: purchase.description ?? '' });
    setEditLines(buildEditLines());
    setEditing(false);
  }, [purchase.id]);
  const editableLines = editLines.filter((line) => line.productId && line.quantity > 0);
  const editLineNetTry = (line: PurchaseLineDraft) => line.gross ? netFromGross(line.priceTry, line.vatRate) : line.priceTry;
  const editLineNetUsd = (line: PurchaseLineDraft) => line.gross ? netFromGross(line.priceUsd, line.vatRate) : line.priceUsd;
  const editLineGrossTry = (line: PurchaseLineDraft) => line.gross ? line.priceTry : grossFromNet(line.priceTry, line.vatRate);
  const editLineGrossUsd = (line: PurchaseLineDraft) => line.gross ? line.priceUsd : grossFromNet(line.priceUsd, line.vatRate);
  const editSubtotalTry = editableLines.reduce((sum, line) => sum + editLineNetTry(line) * line.quantity, 0);
  const editSubtotalUsd = editableLines.reduce((sum, line) => sum + editLineNetUsd(line) * line.quantity, 0);
  const editVatTry = editableLines.reduce((sum, line) => sum + (editLineGrossTry(line) - editLineNetTry(line)) * line.quantity, 0);
  const editVatUsd = editableLines.reduce((sum, line) => sum + (editLineGrossUsd(line) - editLineNetUsd(line)) * line.quantity, 0);
  function setEditLine(uid: string, patch: Partial<PurchaseLineDraft>) {
    setEditLines((current) => current.map((line) => line.uid === uid ? { ...line, ...patch } : line));
  }
  function selectEditProduct(uid: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    setEditLine(uid, { productId, quantity: productId ? 1 : 0, priceTry: product?.purchaseTry ?? 0, priceUsd: product?.purchaseUsd ?? 0, vatRate: product?.vatRate ?? 20 });
  }
  async function saveEdit() {
    if (!editDraft.supplierId) return onNotice('Tedarikci secimi zorunlu');
    if (!editableLines.length) return onNotice('En az bir urun satiri gerekli');
    setSaving(true);
    try {
      const updated = await apiPut<Purchase>(`/purchases/${purchase.id}`, {
        ...editDraft,
        date: editDraft.date ? new Date(editDraft.date).toISOString() : undefined,
        items: editableLines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceTry: editLineNetTry(line), unitPriceUsd: editLineNetUsd(line), vatRate: line.vatRate })),
      });
      await onSaved?.(updated);
      setEditing(false);
      onNotice('Alis kaydi guncellendi');
    } catch (error) {
      onNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  function openPurchasePdfPreview() {
    const fileName = `alis-fisi-${purchase.id}.pdf`;
    const rows = lines.map((item) => `
      <tr>
        <td><strong>${escapeHtml(productName(item))}</strong><br><small>${escapeHtml(productMeta(item))}</small></td>
        <td>${item.quantity}</td>
        <td>${escapeHtml(money(lineUnitUsd(item), 'USD'))}<br><small>${escapeHtml(money(lineUnitTry(item)))}</small></td>
        <td>%${item.vatRate ?? 20}</td>
        <td>${escapeHtml(money(lineNetUsd(item), 'USD'))}<br><small>${escapeHtml(money(lineNetTry(item)))}</small></td>
        <td>${escapeHtml(money(lineGrossUsd(item), 'USD'))}<br><small>${escapeHtml(money(lineGrossTry(item)))}</small></td>
      </tr>
    `).join('');
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(fileName)}</title><style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Inter, Arial, sans-serif; color:#17202a; margin:0; font-size:12px; line-height:1.45; }
      .top { display:flex; justify-content:space-between; gap:24px; border-bottom:3px solid #126c82; padding-bottom:16px; }
      .brand { font-size:24px; font-weight:900; color:#126c82; }
      h1 { font-size:20px; margin:22px 0 12px; }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:16px 0; }
      .box { border:1px solid #d9e1e8; border-radius:10px; padding:10px; }
      table { width:100%; border-collapse:collapse; margin-top:16px; }
      th { background:#eef8f5; color:#126c82; text-align:left; }
      th,td { border:1px solid #d9e1e8; padding:9px; vertical-align:top; }
      .totals { margin-left:auto; width:320px; margin-top:16px; }
      .totals div { display:flex; justify-content:space-between; border-bottom:1px solid #d9e1e8; padding:7px 0; }
      .strong { font-weight:900; color:#126c82; }
      .stamp { margin-top:42px; display:flex; gap:24px; }
      .sign { height:92px; flex:1; border:1px dashed #94a3b8; border-radius:8px; padding:10px; color:#64748b; }
    </style></head><body>
      <div class="top"><div class="brand">Bulut ERP Pro</div><div><strong>Alis fis no:</strong> ${escapeHtml(purchase.id)}<br><strong>Fatura no:</strong> ${escapeHtml(purchase.invoiceNo ?? '-')}<br><strong>Tarih:</strong> ${escapeHtml(new Date(purchase.createdAt).toLocaleString('tr-TR'))}</div></div>
      <h1>Alis Fisi</h1>
      <div class="grid"><div class="box"><strong>Tedarikci</strong><br>${escapeHtml(supplierName)}<br>${escapeHtml(supplier?.phone ?? supplier?.whatsapp ?? '')}</div><div class="box"><strong>Para birimi / Kur</strong><br>${purchase.currency}<br>1 USD = ${escapeHtml(rate)} TL<br><strong>Odeme:</strong> ${escapeHtml(purchase.paymentStatus ?? '-')}</div></div>
      <table><thead><tr><th>Urun</th><th>Adet</th><th>Birim TL/USD</th><th>KDV</th><th>KDV haric</th><th>KDV dahil</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Urun kaydi yok</td></tr>'}</tbody></table>
      <div class="totals"><div><span>Ara toplam</span><span>${escapeHtml(money(subtotalUsd, 'USD'))} / ${escapeHtml(money(subtotalTry))}</span></div><div><span>KDV</span><span>${escapeHtml(money(vatUsd, 'USD'))} / ${escapeHtml(money(vatTry))}</span></div><div class="strong"><span>Genel toplam</span><span>${escapeHtml(money(totalUsd, 'USD'))} / ${escapeHtml(money(totalTry))}</span></div></div>
      <div class="box" style="margin-top:18px;"><strong>Aciklama</strong><br>${escapeHtml(purchase.description || '-')}</div>
      <div class="stamp"><div class="sign">Imza alani</div><div class="sign">Kase alani</div></div>
      <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
    </body></html>`;
    const preview = window.open('', '_blank');
    if (!preview) return onNotice('PDF onizleme penceresi acilamadi. Tarayici popup iznini kontrol edin.');
    preview.document.write(html);
    preview.document.close();
    onNotice(`PDF alis fisi onizlemesi acildi: ${fileName}`);
  }
  function openWhatsapp() {
    const phone = normalizeWhatsappPhone(supplier?.whatsapp ?? supplier?.phone);
    if (!phone) return onNotice('Tedarikci kartta WhatsApp numarasi bulunamadi.');
    const message = `Sayin ${supplierName},\n${purchase.invoiceNo ?? purchase.id} numarali alis/fatura kaydi sisteme islenmistir.\n\nToplam: ${money(totalUsd, 'USD')} / ${money(totalTry)}\nKur: ${rate}\nOdeme durumu: ${purchase.paymentStatus ?? '-'}\n\nTesekkur ederiz.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    onNotice('WhatsApp alis mesaji acildi');
  }
  return (
    <ModalFrame title={`Alis detayi - ${purchase.invoiceNo ?? purchase.id}`} onClose={onClose}>
      <div className="space-y-4">
        {editing ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <FormSelect label="Tedarikci" value={editDraft.supplierId} onChange={(supplierId) => setEditDraft({ ...editDraft, supplierId })} options={suppliers.map((item) => ({ label: item.companyName, value: item.id }))} />
              <FormInput label="Fatura no" value={editDraft.invoiceNo} onChange={(invoiceNo) => setEditDraft({ ...editDraft, invoiceNo })} />
              <FormInput label="Tarih" type="date" value={editDraft.date} onChange={(date) => setEditDraft({ ...editDraft, date })} />
              <FormSelect label="Para birimi" value={editDraft.currency} onChange={(currency) => setEditDraft({ ...editDraft, currency: currency as 'TRY' | 'USD' })} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
              <FormSelect label="Odeme durumu" value={editDraft.paymentStatus} onChange={(paymentStatus) => setEditDraft({ ...editDraft, paymentStatus })} options={['Bekliyor', 'Kismi', 'Odendi'].map((item) => ({ label: item, value: item }))} />
              <FormInput label="Aciklama" value={editDraft.description} onChange={(description) => setEditDraft({ ...editDraft, description })} />
            </div>
            <div className="overflow-x-auto rounded border border-line dark:border-slate-700">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Adet', 'Alis TL', 'Alis USD', 'KDV', 'KDV dahil', 'Toplam', 'Islem'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
                <tbody>{editLines.map((line) => (
                  <tr key={line.uid} className="border-t border-line dark:border-slate-700">
                    <td className="px-3 py-2"><select value={line.productId} onChange={(event) => selectEditProduct(line.uid, event.target.value)} className="h-10 w-full rounded-xl border border-line bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Urun sec</option>{products.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></td>
                    <td className="px-3 py-2"><input value={line.quantity} onChange={(event) => setEditLine(line.uid, { quantity: positiveNumber(event.target.value) || 1 })} className="h-10 w-20 rounded-xl border border-line bg-white px-2 text-center font-bold dark:border-slate-700 dark:bg-slate-900" /></td>
                    <td className="px-3 py-2"><input value={line.priceTry} onChange={(event) => setEditLine(line.uid, { priceTry: positiveNumber(event.target.value) })} className="h-10 w-28 rounded-xl border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
                    <td className="px-3 py-2"><input value={line.priceUsd} onChange={(event) => setEditLine(line.uid, { priceUsd: positiveNumber(event.target.value) })} className="h-10 w-28 rounded-xl border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
                    <td className="px-3 py-2"><select value={line.vatRate} onChange={(event) => setEditLine(line.uid, { vatRate: positiveNumber(event.target.value) })} className="h-10 rounded-xl border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900">{[0, 1, 10, 20].map((vat) => <option key={vat} value={vat}>%{vat}</option>)}</select></td>
                    <td className="px-3 py-2"><input type="checkbox" checked={line.gross} onChange={(event) => setEditLine(line.uid, { gross: event.target.checked })} /></td>
                    <td className="px-3 py-2"><DualMoney compact tryValue={editLineGrossTry(line) * line.quantity} usdValue={editLineGrossUsd(line) * line.quantity} /></td>
                    <td className="px-3 py-2"><IconButton title="Satir sil" onClick={() => setEditLines((current) => current.length <= 1 ? current : current.filter((item) => item.uid !== line.uid))}><Trash2 size={16} /></IconButton></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="soft" onClick={() => setEditLines((current) => [...current, { uid: purchaseUid(), productId: '', quantity: 1, priceTry: 0, priceUsd: 0, vatRate: 20, gross: false }])} icon={<Plus size={17} />}>Satir ekle</Button>
              <div className="grid gap-2 md:grid-cols-3">
                <DualSummary label="Ara toplam" tryValue={editSubtotalTry} usdValue={editSubtotalUsd} />
                <DualSummary label="KDV" tryValue={editVatTry} usdValue={editVatUsd} />
                <DualSummary label="Genel toplam" tryValue={editSubtotalTry + editVatTry} usdValue={editSubtotalUsd + editVatUsd} strong />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
              <Button variant="soft" onClick={() => setEditing(false)}>Vazgec</Button>
              <Button disabled={saving} onClick={saveEdit} icon={<CheckCircle2 size={17} />}>Kaydet</Button>
            </div>
          </>
        ) : (
          <>
        <div className="grid gap-3 md:grid-cols-4">
          <Info label="Fis no" value={purchase.id} />
          <Info label="Fatura no" value={purchase.invoiceNo ?? '-'} />
          <Info label="Tarih" value={new Date(purchase.createdAt).toLocaleString('tr-TR')} />
          <Info label="Tedarikci" value={supplierName} />
          <Info label="Kur" value={String(rate)} />
          <Info label="Para" value={purchase.currency} />
          <Info label="Odeme durumu" value={purchase.paymentStatus ?? '-'} />
          <Info label="Aciklama" value={purchase.description || '-'} />
        </div>
        <div className="overflow-x-auto rounded border border-line dark:border-slate-700"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Kod / Barkod', 'Adet', 'Birim alis TL/USD', 'KDV', 'KDV haric', 'KDV dahil'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead><tbody>{lines.map((item) => <tr key={item.productId} className="border-t border-line dark:border-slate-700"><td className="px-3 py-2 font-semibold">{productName(item)}</td><td className="px-3 py-2 text-xs text-slate-500">{productMeta(item)}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2"><DualMoney compact tryValue={lineUnitTry(item)} usdValue={lineUnitUsd(item)} /></td><td className="px-3 py-2">%{item.vatRate ?? 20}</td><td className="px-3 py-2"><DualMoney compact tryValue={lineNetTry(item)} usdValue={lineNetUsd(item)} /></td><td className="px-3 py-2"><DualMoney compact tryValue={lineGrossTry(item)} usdValue={lineGrossUsd(item)} /></td></tr>)}</tbody></table></div>
        {!lines.length && <div className="rounded border border-line p-4 text-sm text-slate-500 dark:border-slate-700">Bu eski alis kaydinda urun kalemi bulunmuyor. Fatura no ve toplam bilgisiyle gosteriliyor.</div>}
        <div className="grid gap-3 md:grid-cols-3">
          <DualSummary label="Ara toplam" tryValue={subtotalTry} usdValue={subtotalUsd} />
          <DualSummary label="KDV" tryValue={vatTry} usdValue={vatUsd} />
          <DualSummary label="Genel toplam" tryValue={totalTry} usdValue={totalUsd} strong />
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
          <Button variant="soft" onClick={openPurchasePdfPreview} icon={<FileDown size={17} />}>PDF alis fisi olustur</Button>
          <Button variant="soft" onClick={() => setEditing(true)} icon={<Edit3 size={17} />}>Duzenle</Button>
          <Button onClick={openWhatsapp} icon={<MessageCircle size={17} />}>WhatsApp gonder</Button>
          <Button variant="soft" onClick={onClose}>Kapat</Button>
        </div>
          </>
        )}
      </div>
    </ModalFrame>
  );
}

function CategoriesView({ categories, onNotice, onRefresh }: { categories: Category[]; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const empty = { name: '', parentId: '', description: '', vatRate: 20, defaultProfitRate: 25, active: true };
  const [form, setForm] = useState<Partial<Category>>(empty);
  const [editingId, setEditingId] = useState('');
  async function saveCategory() {
    try {
      const payload = { ...form, icon: form.icon || 'Tags', sortOrder: form.sortOrder || categories.length + 1, dealerPriceRate: form.defaultProfitRate, criticalStockLimit: form.criticalStockLimit || 10, discountRate: form.discountRate || 0 };
      if (editingId) await apiPut(`/categories/${editingId}`, payload);
      else await apiPost('/categories', payload);
      await onRefresh();
      setForm(empty);
      setEditingId('');
      onNotice(editingId ? 'Kategori guncellendi' : 'Kategori eklendi');
    } catch (error) { onNotice(errorMessage(error)); }
  }
  function edit(category: Category) {
    setEditingId(category.id);
    setForm(category);
  }
  function addSub(parent: Category) {
    setEditingId('');
    setForm({ ...empty, parentId: parent.id, name: `${parent.name} Alt` });
  }
  async function toggle(category: Category) {
    await apiPut(`/categories/${category.id}`, { active: !category.active });
    await onRefresh();
    onNotice('Kategori guncellendi');
  }
  async function remove(category: Category) {
    try {
      await apiDelete(`/categories/${category.id}`);
      await onRefresh();
      onNotice('Kategori silindi');
    } catch (error) { onNotice(errorMessage(error)); }
  }
  return (
    <section className="space-y-5">
      <Panel title={editingId ? 'Kategori duzenle' : 'Yeni kategori'}>
        <div className="grid gap-3 md:grid-cols-6">
          <FormInput label="Kategori adi" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <FormSelect label="Ust kategori" value={form.parentId ?? ''} onChange={(parentId) => setForm({ ...form, parentId })} options={[{ label: 'Ana kategori', value: '' }, ...categories.filter((item) => item.id !== editingId).map((item) => ({ label: item.name, value: item.id }))]} />
          <FormInput label="Aciklama" value={form.description} onChange={(description) => setForm({ ...form, description })} />
          <FormNumber label="KDV %" value={Number(form.vatRate ?? 20)} setValue={(vatRate) => setForm({ ...form, vatRate })} />
          <FormNumber label="Varsayilan kar %" value={Number(form.defaultProfitRate ?? form.dealerPriceRate ?? 25)} setValue={(defaultProfitRate) => setForm({ ...form, defaultProfitRate })} />
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active ?? true} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Aktif</label>
        </div>
        <div className="mt-4 flex gap-2"><Button onClick={saveCategory} icon={<Plus size={17} />}>{editingId ? 'Guncelle' : 'Kategori ekle'}</Button>{editingId && <Button variant="soft" onClick={() => { setEditingId(''); setForm(empty); }}>Vazgec</Button>}</div>
      </Panel>
      <DataTable title="Kategori yonetimi" headers={['Sira', 'Ikon', 'Kategori', 'Ust kategori', 'Aktif', 'Kar %', 'Iskonto %', 'KDV %', 'Kritik', 'Urun', 'Stok degeri', 'Toplam satis', 'Islem']} rows={categories.map((category) => [category.sortOrder, category.icon, category.name, categories.find((item) => item.id === category.parentId)?.name ?? '-', category.active ? 'Aktif' : 'Pasif', category.defaultProfitRate ?? category.dealerPriceRate, category.discountRate, category.vatRate, category.criticalStockLimit, category.productCount ?? 0, money(category.stockValue ?? 0), money(category.totalSales ?? 0), <Toolbar key={category.id}><Button variant="soft" onClick={() => edit(category)} icon={<Edit3 size={16} />}>Duzenle</Button><Button variant="soft" onClick={() => addSub(category)} icon={<Plus size={16} />}>Alt kategori</Button><Button variant="soft" onClick={() => toggle(category)}>{category.active ? 'Pasif yap' : 'Aktif yap'}</Button><Button variant="soft" onClick={() => remove(category)} icon={<Trash2 size={16} />}>Sil</Button></Toolbar>])} />
    </section>
  );
}

type QuoteLineDraft = { uid: string; productId: string; quantity: number; unitPriceUsd: number; unitPriceTry: number; discountRate: number; vatRate: number };
type PdfSettings = NonNullable<PdfTemplate['settings']>;
type PdfPositionKey = 'logo' | 'title' | 'qr' | 'bank' | 'signature' | 'footer';

function quoteUid() {
  return Math.random().toString(36).slice(2, 10);
}

function pdfSettings(template?: PdfTemplate): PdfSettings {
  return {
    paperType: 'A4',
    marginMm: 14,
    headerColor: template?.color ?? '#126c82',
    tableHeaderColor: '#eef8f5',
    tableBorderColor: '#d9e1e8',
    textColor: '#17202a',
    buttonColor: template?.color ?? '#126c82',
    titleSize: 24,
    bodySize: 12,
    lineHeight: 1.45,
    logoSize: 72,
    logoAlign: 'left',
    companyName: 'Bulut ERP Pro',
    subtitle: template?.title ?? 'ERP dokumani',
    contactInfo: 'info@firma.com | +90 555 000 00 00',
    footerText: template?.footer ?? 'Tesekkur ederiz.',
    showSignature: template?.signatureEnabled ?? true,
    showStamp: true,
    showBankInfo: true,
    showQr: true,
    showWhatsapp: true,
    bankInfo: 'TR00 0000 0000 0000 0000 0000 00',
    whatsapp: '+90 555 000 00 00',
    columns: ['Urun', 'Adet', 'Birim USD/TL', 'Iskonto', 'KDV', 'Toplam USD/TL'],
    positions: { logo: { x: 24, y: 24 }, title: { x: 138, y: 28 }, qr: { x: 455, y: 30 }, bank: { x: 32, y: 690 }, signature: { x: 330, y: 680 }, footer: { x: 32, y: 760 } },
    ...(template?.settings ?? {}),
  };
}

function pdfTemplateFor(templates: PdfTemplate[], type: string) {
  return templates.find((template) => template.type === type && template.active) ?? templates.find((template) => template.type === type) ?? templates[0];
}

function QuotesView({ usdRate, quotes, accounts, products, pdfTemplates, onNotice, onRefresh }: { usdRate: number; quotes: Quote[]; accounts: Account[]; products: Product[]; pdfTemplates: PdfTemplate[]; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const customers = accounts.filter((item) => item.type !== 'TEDARIKCI');
  const emptyLine = (): QuoteLineDraft => {
    const product = products[0];
    return { uid: quoteUid(), productId: product?.id ?? '', quantity: 1, unitPriceUsd: product?.saleUsd ?? 0, unitPriceTry: product?.saleTry ?? tryFromUsd(product?.saleUsd ?? 0, usdRate), discountRate: 0, vatRate: 20 };
  };
  const emptyForm = () => {
    const today = new Date();
    const due = new Date();
    due.setDate(due.getDate() + 15);
    return {
      accountId: customers[0]?.id ?? '',
      quoteDate: today.toISOString().slice(0, 10),
      validUntil: due.toISOString().slice(0, 10),
      currency: 'USD' as 'TRY' | 'USD',
      deliveryTime: '3 is gunu',
      paymentTerm: 'Pesin / Havale',
      note: '',
      internalNote: '',
      salesRep: 'Admin Kullanici',
      status: 'Taslak',
      lines: [emptyLine()],
    };
  };
  const [status, setStatus] = useState('Tumu');
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState('Tumu');
  const [showCancelled, setShowCancelled] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const statusFilters = ['Tumu', 'Taslak', 'Hazirlaniyor', 'Gonderildi', 'Musteri goruntuledi', 'Onaylandi', 'Reddedildi', 'Iptal edildi', 'Suresi gecti'];
  const account = accounts.find((item) => item.id === form.accountId);
  const totals = form.lines.reduce((sum, line) => {
    const quantity = Math.max(0, line.quantity);
    const subUsd = line.unitPriceUsd * quantity;
    const subTry = line.unitPriceTry * quantity;
    const discountUsd = subUsd * line.discountRate / 100;
    const discountTry = subTry * line.discountRate / 100;
    const vatUsd = (subUsd - discountUsd) * line.vatRate / 100;
    const vatTry = (subTry - discountTry) * line.vatRate / 100;
    return {
      subtotalUsd: sum.subtotalUsd + subUsd,
      subtotalTry: sum.subtotalTry + subTry,
      discountUsd: sum.discountUsd + discountUsd,
      discountTry: sum.discountTry + discountTry,
      vatUsd: sum.vatUsd + vatUsd,
      vatTry: sum.vatTry + vatTry,
      totalUsd: sum.totalUsd + subUsd - discountUsd + vatUsd,
      totalTry: sum.totalTry + subTry - discountTry + vatTry,
    };
  }, { subtotalUsd: 0, subtotalTry: 0, discountUsd: 0, discountTry: 0, vatUsd: 0, vatTry: 0, totalUsd: 0, totalTry: 0 });
  const filtered = quotes.filter((quote) => {
    const rowAccount = accounts.find((item) => item.id === quote.accountId);
    const text = `${quote.quoteNo ?? quote.id} ${quote.accountName ?? ''} ${rowAccount?.companyName ?? ''} ${rowAccount?.contactName ?? ''}`.toLowerCase();
    const statusOk = status === 'Tumu' || quote.status === status;
    const currencyOk = currency === 'Tumu' || quote.currency === currency;
    const cancelOk = showCancelled || quote.status !== 'Iptal edildi';
    return statusOk && currencyOk && cancelOk && text.includes(query.toLowerCase());
  });

  function setLine(uid: string, patch: Partial<QuoteLineDraft>) {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => line.uid === uid ? { ...line, ...patch } : line) }));
  }
  function selectProduct(uid: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    setLine(uid, { productId, unitPriceUsd: product?.saleUsd ?? 0, unitPriceTry: product?.saleTry ?? tryFromUsd(product?.saleUsd ?? 0, usdRate) });
  }
  function changeUsd(uid: string, value: number) {
    setLine(uid, { unitPriceUsd: value, unitPriceTry: Math.round(tryFromUsd(value, usdRate) * 100) / 100 });
  }
  function changeTry(uid: string, value: number) {
    setLine(uid, { unitPriceTry: value, unitPriceUsd: Math.round(usdFromTry(value, usdRate) * 100) / 100 });
  }
  function editQuote(quote: Quote) {
    setEditingId(quote.id);
    setSelectedQuote(null);
    setForm({
      accountId: quote.accountId,
      quoteDate: new Date(quote.createdAt).toISOString().slice(0, 10),
      validUntil: new Date(quote.validUntil).toISOString().slice(0, 10),
      currency: quote.currency,
      deliveryTime: quote.deliveryTime ?? '',
      paymentTerm: quote.paymentTerm ?? '',
      note: quote.note ?? '',
      internalNote: '',
      salesRep: quote.salesRep ?? 'Admin Kullanici',
      status: quote.status,
      lines: (quote.items ?? []).map((item) => ({ uid: quoteUid(), productId: item.productId, quantity: item.quantity, unitPriceUsd: item.unitPriceUsd ?? (quote.currency === 'USD' ? item.unitPrice : usdFromTry(item.unitPrice, quote.exchangeRate ?? usdRate)), unitPriceTry: item.unitPriceTry ?? (quote.currency === 'TRY' ? item.unitPrice : tryFromUsd(item.unitPrice, quote.exchangeRate ?? usdRate)), discountRate: item.discountRate ?? 0, vatRate: item.vatRate ?? 20 })),
    });
  }
  async function saveQuote() {
    try {
      if (!form.accountId) throw new Error('Musteri secimi zorunlu');
      if (!form.lines.length || form.lines.some((line) => !line.productId || line.quantity <= 0)) throw new Error('Teklifte en az bir gecerli urun satiri olmali');
      const payload = {
        accountId: form.accountId,
        currency: form.currency,
        validUntil: new Date(form.validUntil).toISOString(),
        deliveryTime: form.deliveryTime,
        paymentTerm: form.paymentTerm,
        salesRep: form.salesRep,
        note: form.note,
        internalNote: form.internalNote,
        status: form.status,
        items: form.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceUsd: line.unitPriceUsd, unitPriceTry: line.unitPriceTry, discountRate: line.discountRate, vatRate: line.vatRate })),
      };
      if (editingId) await apiPut(`/quotes/${editingId}`, payload);
      else await apiPost('/quotes', payload);
      await onRefresh();
      setEditingId('');
      setForm(emptyForm());
      onNotice(editingId ? 'Teklif guncellendi' : 'Teklif kaydedildi');
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  function quoteTotals(quote: Quote) {
    const rate = quote.exchangeRate && quote.exchangeRate > 1 ? quote.exchangeRate : usdRate;
    return {
      totalTry: quote.totalTry ?? (quote.currency === 'TRY' ? quote.total : tryFromUsd(quote.total, rate)),
      totalUsd: quote.totalUsd ?? (quote.currency === 'USD' ? quote.total : usdFromTry(quote.total, rate)),
      vatTry: quote.vatTry ?? (quote.currency === 'TRY' ? quote.vat ?? 0 : tryFromUsd(quote.vat ?? 0, rate)),
      vatUsd: quote.vatUsd ?? (quote.currency === 'USD' ? quote.vat ?? 0 : usdFromTry(quote.vat ?? 0, rate)),
      discountTry: quote.discountTry ?? (quote.currency === 'TRY' ? quote.discount ?? 0 : tryFromUsd(quote.discount ?? 0, rate)),
      discountUsd: quote.discountUsd ?? (quote.currency === 'USD' ? quote.discount ?? 0 : usdFromTry(quote.discount ?? 0, rate)),
      subtotalTry: quote.subtotalTry ?? (quote.currency === 'TRY' ? quote.subtotal ?? 0 : tryFromUsd(quote.subtotal ?? 0, rate)),
      subtotalUsd: quote.subtotalUsd ?? (quote.currency === 'USD' ? quote.subtotal ?? 0 : usdFromTry(quote.subtotal ?? 0, rate)),
    };
  }
  function buildQuoteDocument(quote: Quote) {
    const totals = quoteTotals(quote);
    const template = pdfTemplateFor(pdfTemplates, 'Teklif');
    const settings = pdfSettings(template);
    const rowHtml = (quote.items ?? []).map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return `<tr><td>${escapeHtml(item.productName ?? product?.name ?? item.productId)}</td><td>${item.quantity}</td><td>${escapeHtml(money(item.unitPriceUsd ?? 0, 'USD'))}<br><small>${escapeHtml(money(item.unitPriceTry ?? 0))}</small></td><td>${item.discountRate ?? 0}%</td><td>${item.vatRate ?? 20}%</td><td>${escapeHtml(money(item.lineTotalUsd ?? 0, 'USD'))}<br><small>${escapeHtml(money(item.lineTotalTry ?? 0))}</small></td></tr>`;
    }).join('');
    const fileName = `teklif-${quote.quoteNo ?? quote.id}.pdf`;
    const columns = settings.columns?.length ? settings.columns : ['Urun', 'Adet', 'Birim USD/TL', 'Iskonto', 'KDV', 'Toplam USD/TL'];
    const logoHtml = template?.logoUrl ? `<img src="${escapeHtml(template.logoUrl)}" style="max-width:${settings.logoSize}px;max-height:${settings.logoSize}px;object-fit:contain">` : `<div class="logo-mark">${escapeHtml((settings.companyName ?? 'B').slice(0, 1))}</div>`;
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(fileName)}</title><style>@page{size:${settings.paperType ?? 'A4'};margin:${settings.marginMm ?? 14}mm}body{font-family:${escapeHtml(template?.fontFamily ?? 'Inter')},Arial,sans-serif;color:${settings.textColor};font-size:${settings.bodySize}px;line-height:${settings.lineHeight}}.top{display:flex;justify-content:space-between;gap:18px;border-bottom:3px solid ${settings.headerColor};padding-bottom:16px}.brand{font-size:${settings.titleSize}px;font-weight:900;color:${settings.headerColor}}.logo-wrap{text-align:${settings.logoAlign}}.logo-mark{display:grid;place-items:center;width:${settings.logoSize}px;height:${settings.logoSize}px;border-radius:14px;background:${settings.headerColor};color:white;font-size:28px;font-weight:900}.box{border:1px solid ${settings.tableBorderColor};border-radius:10px;padding:12px;margin:14px 0}table{width:100%;border-collapse:collapse;font-size:${settings.bodySize}px}th{background:${settings.tableHeaderColor};color:${settings.headerColor}}th,td{border:1px solid ${settings.tableBorderColor};padding:9px;text-align:left}.totals{width:340px;margin-left:auto}.totals div{display:flex;justify-content:space-between;border-bottom:1px solid ${settings.tableBorderColor};padding:8px 0}.sign{height:92px;border:1px dashed #94a3b8;border-radius:10px;padding:10px;color:#64748b}.footer{margin-top:28px;border-top:2px solid ${settings.headerColor};padding-top:12px;color:#64748b}.qr{width:72px;height:72px;border:8px solid ${settings.headerColor};border-radius:8px}</style></head><body><div class="top"><div><div class="logo-wrap">${logoHtml}</div><div class="brand">${escapeHtml(settings.companyName ?? template?.title ?? 'Bulut ERP Pro')}</div><div>${escapeHtml(settings.subtitle ?? template?.title ?? 'Teklif Formu')}</div><div>${escapeHtml(settings.contactInfo ?? '')}</div></div><div><b>${escapeHtml(template?.title ?? 'Teklif')}:</b> ${escapeHtml(quote.quoteNo ?? quote.id)}<br><b>Tarih:</b> ${escapeHtml(new Date(quote.createdAt).toLocaleDateString('tr-TR'))}${settings.showQr ? '<div class="qr"></div>' : ''}</div></div><div class="box"><b>Musteri:</b> ${escapeHtml(accounts.find((a) => a.id === quote.accountId)?.companyName ?? quote.accountName ?? quote.accountId)}<br><b>Vade:</b> ${escapeHtml(new Date(quote.validUntil).toLocaleDateString('tr-TR'))}<br><b>Kur:</b> ${escapeHtml(quote.exchangeRate ?? usdRate)}</div><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rowHtml}</tbody></table><div class="totals"><div><span>Ara toplam</span><span>${escapeHtml(money(totals.subtotalUsd, 'USD'))} / ${escapeHtml(money(totals.subtotalTry))}</span></div><div><span>Iskonto</span><span>${escapeHtml(money(totals.discountUsd, 'USD'))} / ${escapeHtml(money(totals.discountTry))}</span></div><div><span>KDV</span><span>${escapeHtml(money(totals.vatUsd, 'USD'))} / ${escapeHtml(money(totals.vatTry))}</span></div><div><b>Genel toplam</b><b>${escapeHtml(money(totals.totalUsd, 'USD'))} / ${escapeHtml(money(totals.totalTry))}</b></div></div><div class="box"><b>Aciklama</b><br>${escapeHtml(quote.note ?? '-')}</div>${settings.showBankInfo ? `<div class="box"><b>Banka bilgileri</b><br>${escapeHtml(settings.bankInfo ?? '')}</div>` : ''}<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:28px">${settings.showSignature ? '<div class="sign">Imza alani</div>' : ''}${settings.showStamp ? '<div class="sign">Kase alani</div>' : ''}</div><div class="footer">${escapeHtml(settings.footerText ?? template?.footer ?? '')}${settings.showWhatsapp ? `<br>WhatsApp: ${escapeHtml(settings.whatsapp ?? '')}` : ''}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;
    return { fileName, html, totals };
  }
  function openQuotePdf(quote: Quote) {
    const document = buildQuoteDocument(quote);
    openPreviewDocument(document.fileName, document.html, onNotice, 'PDF teklif');
  }
  function sendQuoteWhatsapp(quote: Quote) {
    const rowAccount = accounts.find((item) => item.id === quote.accountId);
    const phone = normalizeWhatsappPhone(rowAccount?.whatsapp ?? rowAccount?.phone);
    if (!phone) return onNotice('Cari kartta WhatsApp numarası bulunamadı.');
    const totals = quoteTotals(quote);
    const message = `Merhaba ${rowAccount?.companyName ?? quote.accountName ?? ''},\n\n${quote.quoteNo ?? quote.id} numaralı teklifiniz hazırlanmıştır.\n\nToplam:\n${money(totals.totalTry)}\n${money(totals.totalUsd, 'USD')}\n\nTeklifi görüntülemek için:\n${window.location.origin}/teklifler/${quote.id}\n\nBulut ERP Pro`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    onNotice('WhatsApp teklif mesaji acildi');
  }
  function sendQuoteWhatsappWithPdf(quote: Quote) {
    const rowAccount = accounts.find((item) => item.id === quote.accountId);
    const phone = normalizeWhatsappPhone(rowAccount?.whatsapp ?? rowAccount?.phone);
    if (!phone) return onNotice('Cari kartta WhatsApp numarasi bulunamadi.');
    const document = buildQuoteDocument(quote);
    const pdfLink = createPreviewDocument(document.fileName, document.html);
    const totals = document.totals;
    const message = `Merhaba ${rowAccount?.companyName ?? quote.accountName ?? ''},\n\n${quote.quoteNo ?? quote.id} numaralı teklifiniz hazırlanmıştır.\n\nToplam:\n${money(totals.totalTry)}\n${money(totals.totalUsd, 'USD')}\n\nPDF: ${pdfLink.url}\n\nBulut ERP Pro`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    onNotice(`WhatsApp teklif mesaji PDF linkiyle hazirlandi: ${pdfLink.fileName}`);
  }
  async function approveQuote(quote: Quote) {
    try {
      await apiPost(`/quotes/${quote.id}/status`, { status: 'Onaylandi' });
      await onRefresh();
      onNotice('Teklif onaylandi ve satis kaydi olusturuldu');
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  return (
    <section className="space-y-5">
      <Panel title={editingId ? 'Teklif duzenle' : 'Profesyonel teklif olustur'} actions={editingId && <Button variant="soft" onClick={() => { setEditingId(''); setForm(emptyForm()); }}>Yeni teklif</Button>}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <FormSelect label="Musteri sec" value={form.accountId} onChange={(accountId) => setForm({ ...form, accountId })} options={customers.map((item) => ({ label: item.companyName, value: item.id }))} />
          <FormInput label="Yetkili kisi" value={account?.contactName ?? ''} onChange={() => undefined} />
          <FormInput label="Telefon" value={account?.phone ?? ''} onChange={() => undefined} />
          <FormInput label="Teklif tarihi" type="date" value={form.quoteDate} onChange={(quoteDate) => setForm({ ...form, quoteDate })} />
          <FormInput label="Vade tarihi" type="date" value={form.validUntil} onChange={(validUntil) => setForm({ ...form, validUntil })} />
          <FormSelect label="Para birimi" value={form.currency} onChange={(value) => setForm({ ...form, currency: value as 'TRY' | 'USD' })} options={[{ label: 'USD', value: 'USD' }, { label: 'TL', value: 'TRY' }]} />
          <FormInput label="Teslim suresi" value={form.deliveryTime} onChange={(deliveryTime) => setForm({ ...form, deliveryTime })} />
          <FormInput label="Odeme tipi" value={form.paymentTerm} onChange={(paymentTerm) => setForm({ ...form, paymentTerm })} />
          <FormInput label="Satis temsilcisi" value={form.salesRep} onChange={(salesRep) => setForm({ ...form, salesRep })} />
          <FormSelect label="Durum" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={statusFilters.slice(1).map((item) => ({ label: item, value: item }))} />
        </div>
        <div className="mt-4"><FormInput label="Aciklama" value={form.note} onChange={(note) => setForm({ ...form, note })} /></div>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold">Urun satirlari</h3><Button variant="soft" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} icon={<Plus size={17} />}>Urun ekle</Button></div>
          {form.lines.map((line) => {
            const product = products.find((item) => item.id === line.productId);
            const subUsd = line.unitPriceUsd * line.quantity;
            const subTry = line.unitPriceTry * line.quantity;
            const totalUsd = subUsd - subUsd * line.discountRate / 100 + (subUsd - subUsd * line.discountRate / 100) * line.vatRate / 100;
            const totalTry = subTry - subTry * line.discountRate / 100 + (subTry - subTry * line.discountRate / 100) * line.vatRate / 100;
            return (
              <div key={line.uid} className="grid gap-3 rounded border border-line p-3 dark:border-slate-700 xl:grid-cols-[minmax(220px,1.5fr)_80px_70px_100px_100px_85px_85px_130px_44px]">
                <FormSelect label="Urun sec" value={line.productId} onChange={(productId) => selectProduct(line.uid, productId)} options={products.map((item) => ({ label: `${item.code} - ${item.name}`, value: item.id }))} />
                <div className="text-sm"><span className="text-slate-500">Gorsel</span><div className="mt-1"><ProductThumb product={product ?? {}} /></div></div>
                <Info label="Stok" value={String(product?.stock ?? 0)} />
                <FormNumber label="Adet" value={line.quantity} setValue={(quantity) => setLine(line.uid, { quantity })} />
                <FormNumber label="Birim USD" value={line.unitPriceUsd} setValue={(value) => changeUsd(line.uid, value)} />
                <FormNumber label="Birim TL" value={line.unitPriceTry} setValue={(value) => changeTry(line.uid, value)} />
                <FormNumber label="Iskonto %" value={line.discountRate} setValue={(discountRate) => setLine(line.uid, { discountRate })} />
                <FormNumber label="KDV %" value={line.vatRate} setValue={(vatRate) => setLine(line.uid, { vatRate })} />
                <div className="text-sm"><span className="text-slate-500">Ara toplam</span><div className="mt-1"><DualMoney compact tryValue={totalTry} usdValue={totalUsd} /></div></div>
                <div className="mt-6"><IconButton title="Satir sil" onClick={() => setForm({ ...form, lines: form.lines.filter((item) => item.uid !== line.uid) })}><Trash2 size={17} /></IconButton></div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <DualSummary label="Ara toplam" tryValue={totals.subtotalTry} usdValue={totals.subtotalUsd} />
          <DualSummary label="Iskonto" tryValue={totals.discountTry} usdValue={totals.discountUsd} />
          <DualSummary label="KDV" tryValue={totals.vatTry} usdValue={totals.vatUsd} />
          <DualSummary label="Genel toplam" tryValue={totals.totalTry} usdValue={totals.totalUsd} strong />
        </div>
        <div className="mt-5 flex justify-end"><Button onClick={saveQuote} icon={<FileText size={17} />}>{editingId ? 'Teklifi guncelle' : 'Teklifi kaydet'}</Button></div>
      </Panel>
      <Panel title="Teklif filtreleri">
        <div className="grid gap-3 md:grid-cols-5">
          <FormInput label="Teklif ara" value={query} onChange={setQuery} />
          <FormSelect label="Durum" value={status} onChange={setStatus} options={statusFilters.map((item) => ({ label: item, value: item }))} />
          <FormSelect label="TL/USD" value={currency} onChange={setCurrency} options={['Tumu', 'TRY', 'USD'].map((item) => ({ label: item, value: item }))} />
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} /> Iptalleri goster</label>
        </div>
      </Panel>
      <div className="overflow-hidden rounded border border-line bg-white shadow-panel dark:border-slate-700 dark:bg-[#17202a]">
        <div className="border-b border-line p-4 dark:border-slate-700"><h2 className="text-lg font-bold">Teklif listesi</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Tarih', 'Teklif No', 'Musteri/Firma', 'Yetkili', 'Toplam TL', 'Toplam USD', 'Durum', 'Vade', 'Olusturan', 'Islemler'].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
            <tbody>{filtered.map((quote) => {
              const rowAccount = accounts.find((item) => item.id === quote.accountId);
              const totals = quoteTotals(quote);
              return <tr key={quote.id} onClick={() => setSelectedQuote(quote)} className="cursor-pointer border-t border-line transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><td className="px-4 py-3">{new Date(quote.createdAt).toLocaleDateString('tr-TR')}</td><td className="px-4 py-3 font-bold">{quote.quoteNo ?? quote.id}</td><td className="px-4 py-3">{rowAccount?.companyName ?? quote.accountName ?? quote.accountId}</td><td className="px-4 py-3">{rowAccount?.contactName ?? '-'}</td><td className="px-4 py-3">{money(totals.totalTry)}</td><td className="px-4 py-3">{money(totals.totalUsd, 'USD')}</td><td className="px-4 py-3"><Badge>{quote.status}</Badge></td><td className="px-4 py-3">{new Date(quote.validUntil).toLocaleDateString('tr-TR')}</td><td className="px-4 py-3">{quote.createdBy ?? quote.salesRep ?? '-'}</td><td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><Toolbar><Button variant="soft" onClick={() => setSelectedQuote(quote)}>Detay</Button><Button variant="soft" onClick={() => editQuote(quote)}>Duzenle</Button><Button variant="soft" onClick={() => openQuotePdf(quote)}>PDF</Button><Button variant="soft" onClick={() => sendQuoteWhatsappWithPdf(quote)}>WhatsApp</Button><Button variant="soft" onClick={() => approveQuote(quote)}>Satisa donustur</Button></Toolbar></td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>
      {selectedQuote && <QuoteDetailModal quote={selectedQuote} accounts={accounts} products={products} usdRate={usdRate} onClose={() => setSelectedQuote(null)} onEdit={editQuote} onPdf={openQuotePdf} onWhatsapp={sendQuoteWhatsappWithPdf} onApprove={approveQuote} />}
    </section>
  );
}

function QuoteDetailModal({ quote, accounts, products, usdRate, onClose, onEdit, onPdf, onWhatsapp, onApprove }: { quote: Quote; accounts: Account[]; products: Product[]; usdRate: number; onClose: () => void; onEdit: (quote: Quote) => void; onPdf: (quote: Quote) => void; onWhatsapp: (quote: Quote) => void; onApprove: (quote: Quote) => void }) {
  const account = accounts.find((item) => item.id === quote.accountId);
  const rate = quote.exchangeRate && quote.exchangeRate > 1 ? quote.exchangeRate : usdRate;
  const totals = {
    subtotalTry: quote.subtotalTry ?? (quote.currency === 'TRY' ? quote.subtotal ?? 0 : tryFromUsd(quote.subtotal ?? 0, rate)),
    subtotalUsd: quote.subtotalUsd ?? (quote.currency === 'USD' ? quote.subtotal ?? 0 : usdFromTry(quote.subtotal ?? 0, rate)),
    discountTry: quote.discountTry ?? 0,
    discountUsd: quote.discountUsd ?? 0,
    vatTry: quote.vatTry ?? (quote.currency === 'TRY' ? quote.vat ?? 0 : tryFromUsd(quote.vat ?? 0, rate)),
    vatUsd: quote.vatUsd ?? (quote.currency === 'USD' ? quote.vat ?? 0 : usdFromTry(quote.vat ?? 0, rate)),
    totalTry: quote.totalTry ?? (quote.currency === 'TRY' ? quote.total : tryFromUsd(quote.total, rate)),
    totalUsd: quote.totalUsd ?? (quote.currency === 'USD' ? quote.total : usdFromTry(quote.total, rate)),
  };
  return (
    <ModalFrame title={`Teklif detayi - ${quote.quoteNo ?? quote.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Panel title="Firma bilgileri"><Info label="Firma" value="Bulut ERP Pro" /><Info label="Teklif no" value={quote.quoteNo ?? quote.id} /><Info label="Olusturan" value={quote.createdBy ?? quote.salesRep ?? '-'} /><Info label="Kur" value={String(rate)} /></Panel>
          <Panel title="Musteri bilgileri"><Info label="Cari" value={account?.companyName ?? quote.accountName ?? quote.accountId} /><Info label="Yetkili" value={account?.contactName ?? '-'} /><Info label="Telefon" value={account?.phone ?? '-'} /><Info label="Vade" value={new Date(quote.validUntil).toLocaleDateString('tr-TR')} /></Panel>
        </div>
        <div className="overflow-x-auto rounded border border-line dark:border-slate-700">
          <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Adet', 'Birim USD/TL', 'Iskonto', 'KDV', 'Toplam USD/TL'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead><tbody>{(quote.items ?? []).map((item) => { const product = products.find((p) => p.id === item.productId); return <tr key={item.productId} className="border-t border-line dark:border-slate-700"><td className="px-3 py-2"><div className="flex items-center gap-2"><ProductThumb product={product ?? {}} /><span className="font-semibold">{item.productName ?? product?.name ?? item.productId}</span></div></td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2"><DualMoney compact tryValue={item.unitPriceTry ?? 0} usdValue={item.unitPriceUsd ?? 0} /></td><td className="px-3 py-2">{item.discountRate ?? 0}%</td><td className="px-3 py-2">{item.vatRate ?? 20}%</td><td className="px-3 py-2"><DualMoney compact tryValue={item.lineTotalTry ?? 0} usdValue={item.lineTotalUsd ?? 0} /></td></tr>; })}</tbody></table>
        </div>
        <div className="grid gap-3 md:grid-cols-4"><DualSummary label="Ara toplam" tryValue={totals.subtotalTry} usdValue={totals.subtotalUsd} /><DualSummary label="Iskonto" tryValue={totals.discountTry} usdValue={totals.discountUsd} /><DualSummary label="KDV" tryValue={totals.vatTry} usdValue={totals.vatUsd} /><DualSummary label="Genel toplam" tryValue={totals.totalTry} usdValue={totals.totalUsd} strong /></div>
        <Panel title="Aciklama ve durum gecmisi"><div className="text-sm text-slate-600 dark:text-slate-300">{quote.note ?? '-'}</div><div className="mt-3 space-y-2">{(quote.timeline ?? []).map((line) => <div key={`${line.date}-${line.action}`} className="rounded bg-slate-50 p-2 text-sm dark:bg-slate-900">{new Date(line.date).toLocaleString('tr-TR')} - {line.action} - {line.user}</div>)}</div></Panel>
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700"><Button variant="soft" onClick={() => { onEdit(quote); onClose(); }}>Duzenle</Button><Button variant="soft" onClick={() => onPdf(quote)}>PDF teklif olustur</Button><Button variant="soft" onClick={() => onWhatsapp(quote)}>WhatsApp gonder</Button><Button onClick={() => onApprove(quote)}>Satisa donustur</Button></div>
      </div>
    </ModalFrame>
  );
}

function PdfTemplatesView({ templates, onNotice, onRefresh }: { templates: PdfTemplate[]; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<PdfTemplate | null>(null);
  const [draft, setDraft] = useState<PdfTemplate | null>(null);
  const fieldOptions = ['Firma logosu', 'Firma bilgileri', 'Musteri bilgileri', 'Urun tablosu', 'Barkod', 'QR kod', 'Imza alani', 'Kase alani', 'Banka bilgileri', 'WhatsApp numarasi', 'Web sitesi', 'Sosyal medya'];
  const columnOptions = ['Urun', 'Gorsel', 'Barkod', 'Adet', 'Birim USD/TL', 'Iskonto', 'KDV', 'Ara toplam', 'Toplam USD/TL'];
  const templateTypes = ['Teklif', 'SatisFisi', 'TahsilatMakbuzu', 'AlisFisi', 'CariEkstre', 'SiparisFormu', 'Fatura'];
  function edit(template: PdfTemplate) {
    const next = { ...template, settings: pdfSettings(template) };
    setEditing(template);
    setDraft(next);
  }
  function update(patch: Partial<PdfTemplate>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  }
  function updateSettings(patch: Partial<PdfSettings>) {
    if (!draft) return;
    setDraft({ ...draft, settings: { ...pdfSettings(draft), ...patch } });
  }
  function toggleField(field: string) {
    if (!draft) return;
    const fields = draft.fields.includes(field) ? draft.fields.filter((item) => item !== field) : [...draft.fields, field];
    update({ fields });
  }
  function toggleColumn(column: string) {
    if (!draft) return;
    const settings = pdfSettings(draft);
    const columns = settings.columns?.includes(column) ? settings.columns.filter((item) => item !== column) : [...(settings.columns ?? []), column];
    updateSettings({ columns });
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    update({ logoUrl: dataUrl });
  }
  async function save() {
    if (!draft) return;
    await apiPut(`/pdf-templates/${draft.id}`, draft);
    await onRefresh();
    setEditing(draft);
    onNotice('PDF sablonu kaydedildi');
  }
  function resetDefault() {
    if (!draft) return;
    setDraft({
      ...draft,
      logoUrl: '',
      stampUrl: '',
      color: '#126c82',
      fontFamily: 'Inter',
      title: `${draft.type} Formu`,
      footer: 'Tesekkur ederiz.',
      fields: ['Firma logosu', 'Musteri bilgileri', 'Urun tablosu', 'QR kod', 'Imza alani'],
      settings: pdfSettings({ ...draft, settings: undefined, color: '#126c82', title: `${draft.type} Formu`, footer: 'Tesekkur ederiz.' }),
    });
  }
  if (draft) {
    const settings = pdfSettings(draft);
    return (
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">PDF Sablonlari &gt; {draft.name}</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">PDF sablon editoru</h1>
          </div>
          <Toolbar><Button variant="soft" onClick={() => { setDraft(null); setEditing(null); }}>Listeye don</Button><Button variant="soft" onClick={resetDefault}>Varsayilana don</Button><Button onClick={save}>Kaydet</Button></Toolbar>
        </div>
        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <Panel title="Ayarlar">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput label="Sablon adi" value={draft.name} onChange={(name) => update({ name })} />
                <FormSelect label="Sablon tipi" value={draft.type} onChange={(type) => update({ type })} options={templateTypes.map((type) => ({ label: type, value: type }))} />
                <FormSelect label="Kagit tipi" value={settings.paperType ?? 'A4'} onChange={(paperType) => updateSettings({ paperType: paperType as 'A4' | 'A5' })} options={[{ label: 'A4', value: 'A4' }, { label: 'A5', value: 'A5' }]} />
                <FormNumber label="Kenar boslugu mm" value={settings.marginMm ?? 14} setValue={(marginMm) => updateSettings({ marginMm })} />
                <label className="mt-7 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(event) => update({ active: event.target.checked })} /> Aktif</label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorInput label="Ana renk" value={draft.color} onChange={(color) => { update({ color }); updateSettings({ headerColor: color, buttonColor: color }); }} />
                <ColorInput label="Baslik rengi" value={settings.headerColor ?? draft.color} onChange={(headerColor) => updateSettings({ headerColor })} />
                <ColorInput label="Tablo baslik" value={settings.tableHeaderColor ?? '#eef8f5'} onChange={(tableHeaderColor) => updateSettings({ tableHeaderColor })} />
                <ColorInput label="Yazi rengi" value={settings.textColor ?? '#17202a'} onChange={(textColor) => updateSettings({ textColor })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormSelect label="Font" value={draft.fontFamily} onChange={(fontFamily) => update({ fontFamily })} options={['Inter', 'Arial', 'Verdana', 'Georgia', 'Times New Roman'].map((item) => ({ label: item, value: item }))} />
                <FormNumber label="Baslik boyutu" value={settings.titleSize ?? 24} setValue={(titleSize) => updateSettings({ titleSize })} />
                <FormNumber label="Icerik boyutu" value={settings.bodySize ?? 12} setValue={(bodySize) => updateSettings({ bodySize })} />
                <FormNumber label="Satir yuksekligi" value={settings.lineHeight ?? 1.45} setValue={(lineHeight) => updateSettings({ lineHeight })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Logo yukle<input type="file" accept="image/*" onChange={(event) => void uploadLogo(event.target.files?.[0])} className="mt-1.5 w-full rounded-xl border border-line bg-white/90 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/80" /></label>
                <FormNumber label="Logo boyutu" value={settings.logoSize ?? 72} setValue={(logoSize) => updateSettings({ logoSize })} />
                <FormSelect label="Logo hizalama" value={settings.logoAlign ?? 'left'} onChange={(logoAlign) => updateSettings({ logoAlign: logoAlign as 'left' | 'center' | 'right' })} options={[{ label: 'Sol', value: 'left' }, { label: 'Orta', value: 'center' }, { label: 'Sag', value: 'right' }]} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput label="Firma adi" value={settings.companyName} onChange={(companyName) => updateSettings({ companyName })} />
                <FormInput label="Baslik metni" value={draft.title} onChange={(title) => update({ title })} />
                <FormInput label="Alt baslik" value={settings.subtitle} onChange={(subtitle) => updateSettings({ subtitle })} />
                <FormInput label="Iletisim bilgileri" value={settings.contactInfo} onChange={(contactInfo) => updateSettings({ contactInfo })} />
              </div>
              <div>
                <div className="mb-2 text-sm font-black">Alanlar</div>
                <div className="grid gap-2 sm:grid-cols-2">{fieldOptions.map((field) => <label key={field} className="rounded-xl border border-line bg-white/70 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900/60"><input type="checkbox" checked={draft.fields.includes(field)} onChange={() => toggleField(field)} className="mr-2" />{field}</label>)}</div>
              </div>
              <div>
                <div className="mb-2 text-sm font-black">Tablo kolonlari</div>
                <div className="grid gap-2 sm:grid-cols-2">{columnOptions.map((column) => <label key={column} className="rounded-xl border border-line bg-white/70 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900/60"><input type="checkbox" checked={(settings.columns ?? []).includes(column)} onChange={() => toggleColumn(column)} className="mr-2" />{column}</label>)}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput label="Alt bilgi" value={settings.footerText ?? draft.footer} onChange={(footerText) => { update({ footer: footerText }); updateSettings({ footerText }); }} />
                <FormInput label="Banka bilgileri" value={settings.bankInfo} onChange={(bankInfo) => updateSettings({ bankInfo })} />
                <FormInput label="WhatsApp" value={settings.whatsapp} onChange={(whatsapp) => updateSettings({ whatsapp })} />
                {(['showSignature', 'showStamp', 'showBankInfo', 'showQr', 'showWhatsapp'] as const).map((key) => <label key={key} className="mt-2 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => updateSettings({ [key]: event.target.checked })} /> {key}</label>)}
              </div>
            </div>
          </Panel>
          <Panel title="Canli A4 onizleme" actions={<span className="text-xs font-bold text-slate-500">Bloklari surukle birak</span>}>
            <PdfLivePreview template={draft} onChange={setDraft} />
          </Panel>
        </div>
      </section>
    );
  }
  return <DataTable title="PDF sablonlari" headers={['Tur', 'Ad', 'Baslik', 'Renk', 'Font', 'Alanlar', 'Durum', 'Islem']} rows={templates.map((template) => [template.type, <button key={`${template.id}-name`} onClick={() => edit(template)} className="font-bold text-ocean hover:underline">{template.name}</button>, template.title, template.color, template.fontFamily, template.fields.join(', '), template.active ? 'Aktif' : 'Pasif', <Toolbar key={template.id}><Button variant="soft" onClick={() => edit(template)}>Duzenle</Button><Button variant="soft" onClick={() => edit(template)}>Onizle</Button></Toolbar>])} />;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}<div className="mt-1.5 flex h-11 overflow-hidden rounded-xl border border-line bg-white/90 dark:border-slate-700 dark:bg-slate-900/80"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-full w-12 cursor-pointer border-0 bg-transparent p-1" /><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-sm font-bold outline-none" /></div></label>;
}

function PdfLivePreview({ template, onChange }: { template: PdfTemplate; onChange: (template: PdfTemplate) => void }) {
  const settings = pdfSettings(template);
  const positions = settings.positions ?? {};
  const [dragging, setDragging] = useState<PdfPositionKey | null>(null);
  const pageSize = settings.paperType === 'A5' ? { width: 420, height: 595 } : { width: 595, height: 842 };
  function setPosition(key: PdfPositionKey, x: number, y: number) {
    onChange({ ...template, settings: { ...settings, positions: { ...positions, [key]: { x: Math.max(0, Math.min(pageSize.width - 90, x)), y: Math.max(0, Math.min(pageSize.height - 40, y)) } } } });
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const key = dragging ?? event.dataTransfer.getData('text/plain') as PdfPositionKey;
    if (!key) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * pageSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * pageSize.height;
    setPosition(key, x, y);
    setDragging(null);
  }
  const block = (key: PdfPositionKey, children: ReactNode, className = '') => {
    const pos = positions[key] ?? { x: 20, y: 20 };
    return <div draggable onDragStart={(event) => { setDragging(key); event.dataTransfer.setData('text/plain', key); }} className={`absolute cursor-move rounded-lg border border-dashed border-slate-300 bg-white/90 p-2 text-xs shadow-sm ${className}`} style={{ left: `${(pos.x / pageSize.width) * 100}%`, top: `${(pos.y / pageSize.height) * 100}%` }}>{children}</div>;
  };
  const columns = settings.columns?.length ? settings.columns : ['Urun', 'Adet', 'Birim USD/TL', 'Toplam USD/TL'];
  return (
    <div className="overflow-auto rounded-2xl bg-slate-100 p-4 dark:bg-slate-950">
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
        className="relative mx-auto origin-top overflow-hidden bg-white text-ink shadow-2xl"
        style={{ width: 'min(100%, 595px)', aspectRatio: `${pageSize.width}/${pageSize.height}`, color: settings.textColor, fontFamily: template.fontFamily, fontSize: settings.bodySize, lineHeight: settings.lineHeight }}
      >
        <div className="absolute inset-0" style={{ padding: `${settings.marginMm}px` }}>
          <div className="h-full rounded border" style={{ borderColor: settings.tableBorderColor }} />
        </div>
        {block('logo', template.logoUrl ? <img src={template.logoUrl} alt="" style={{ width: settings.logoSize, height: settings.logoSize, objectFit: 'contain' }} /> : <div className="grid place-items-center rounded-xl text-white" style={{ width: settings.logoSize, height: settings.logoSize, background: settings.headerColor, fontSize: 28, fontWeight: 900 }}>{(settings.companyName ?? 'B').slice(0, 1)}</div>)}
        {block('title', <div><div style={{ color: settings.headerColor, fontSize: settings.titleSize, fontWeight: 900 }}>{settings.companyName}</div><div className="font-bold">{template.title}</div><div>{settings.subtitle}</div><div className="text-slate-500">{settings.contactInfo}</div></div>, 'min-w-[220px]')}
        {settings.showQr && block('qr', <div className="grid h-20 w-20 place-items-center rounded-lg text-white" style={{ background: settings.headerColor }}>QR</div>)}
        <div className="absolute left-[5%] right-[5%] top-[22%] rounded-lg border p-3" style={{ borderColor: settings.tableBorderColor }}>
          <b>Musteri:</b> Musteri Unvani<br /><b>Tarih:</b> {new Date().toLocaleDateString('tr-TR')}<br /><b>Belge No:</b> ORN-001
        </div>
        <table className="absolute left-[5%] right-[5%] top-[34%] w-[90%] border-collapse text-left" style={{ fontSize: settings.bodySize }}>
          <thead><tr>{columns.map((column) => <th key={column} className="border p-2" style={{ background: settings.tableHeaderColor, borderColor: settings.tableBorderColor, color: settings.headerColor }}>{column}</th>)}</tr></thead>
          <tbody>{['Kamera sistemi', 'Alarm paneli'].map((name, index) => <tr key={name}>{columns.map((column) => <td key={column} className="border p-2" style={{ borderColor: settings.tableBorderColor }}>{column === 'Urun' ? name : column === 'Adet' ? index + 1 : column.includes('KDV') ? '%20' : column.includes('Toplam') ? '240 USD / 10.865 TL' : '120 USD / 5.432 TL'}</td>)}</tr>)}</tbody>
        </table>
        <div className="absolute right-[5%] top-[55%] w-56 rounded-lg p-3" style={{ background: settings.tableHeaderColor }}><div className="flex justify-between"><span>Ara toplam</span><b>200 USD</b></div><div className="flex justify-between"><span>KDV</span><b>40 USD</b></div><div className="mt-2 flex justify-between border-t pt-2" style={{ borderColor: settings.tableBorderColor }}><span>Genel toplam</span><b>240 USD</b></div></div>
        {settings.showBankInfo && block('bank', <div><b>Banka bilgileri</b><br />{settings.bankInfo}</div>, 'w-56')}
        {(settings.showSignature || settings.showStamp) && block('signature', <div className="grid grid-cols-2 gap-2"><div className="h-20 w-28 rounded border border-dashed p-2">Imza</div><div className="h-20 w-28 rounded border border-dashed p-2">Kase</div></div>)}
        {block('footer', <div>{settings.footerText}<br />{settings.showWhatsapp ? `WhatsApp: ${settings.whatsapp}` : ''}</div>, 'w-96')}
      </div>
    </div>
  );
}

function MessageTemplatesView({ templates, onNotice, onRefresh }: { templates: MessageTemplate[]; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  async function addTemplate() {
    await apiPost('/message-templates', { type: 'Teklif', name: `Yeni Sablon ${templates.length + 1}`, body: 'Merhaba {MüşteriAdı}, {TeklifNo} teklifiniz hazir.' });
    await onRefresh(); onNotice('Mesaj sablonu eklendi');
  }
  async function toggle(template: MessageTemplate) {
    await apiPut(`/message-templates/${template.id}`, { active: !template.active });
    await onRefresh(); onNotice('Sablon guncellendi');
  }
  async function copyTemplate(template: MessageTemplate) {
    await apiPost('/message-templates', { type: template.type, name: `${template.name} Kopya`, body: template.body });
    await onRefresh(); onNotice('Sablon kopyalandi');
  }
  async function makeDefault(template: MessageTemplate) {
    await apiPut(`/message-templates/${template.id}`, { default: true, active: true });
    await onRefresh(); onNotice('Varsayilan sablon guncellendi');
  }
  return <DataTable title="Mesaj sablonlari" actions={<Button onClick={addTemplate} icon={<Plus size={17} />}>Sablon olustur</Button>} headers={['Tur', 'Ad', 'Metin', 'Varsayilan', 'Durum', 'Degiskenler', 'Islem']} rows={templates.map((template) => [template.type, template.name, template.body, template.default ? 'Evet' : 'Hayir', template.active ? 'Aktif' : 'Pasif', '{MüşteriAdı}, {ToplamTL}, {ToplamUSD}, {KalanTL}, {KalanUSD}, {SiparişNo}, {TeklifNo}, {VadeTarihi}, {FirmaAdı}', <Toolbar key={template.id}><Button variant="soft" onClick={() => toggle(template)}>{template.active ? 'Pasif yap' : 'Aktif yap'}</Button><Button variant="soft" onClick={() => copyTemplate(template)}>Kopyala</Button><Button variant="soft" onClick={() => makeDefault(template)}>Varsayilan</Button></Toolbar>])} />;
}

function SalesView({ usdRate, selectedAccountId, accounts, products, categories, sales, onSale, onNotice }: { usdRate: number; selectedAccountId: string; accounts: Account[]; products: Product[]; categories: Category[]; sales: Sale[]; onSale: (accountId: string, cart: CartLine[], paid: number, discount: number, currency: 'TRY' | 'USD', paymentMethod: string) => boolean | Promise<boolean>; onNotice: (message: string) => void }) {
  const [accountId, setAccountId] = useState(selectedAccountId || accounts[0]?.id || '');
  const [barcode, setBarcode] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tumu');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY');
  const [paid, setPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [paymentMethod, setPaymentMethod] = useState('Vadeli');
  const [priceMode, setPriceMode] = useState<'net' | 'gross'>('net');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [productView, setProductView] = useState<'card' | 'list'>('list');
  const [submittingSale, setSubmittingSale] = useState(false);
  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const lineTryPrice = (product: Product) => priceMode === 'gross' ? grossFromNet(product.saleTry, product.vatRate ?? 20) : product.saleTry;
  const lineUsdPrice = (product: Product) => priceMode === 'gross' ? grossFromNet(product.saleUsd, product.vatRate ?? 20) : product.saleUsd;
  const subtotal = cart.reduce((sum, line) => sum + (currency === 'USD' ? lineUsdPrice(line.product) : lineTryPrice(line.product)) * line.quantity, 0);
  const subtotalTry = cart.reduce((sum, line) => sum + lineTryPrice(line.product) * line.quantity, 0);
  const subtotalUsd = cart.reduce((sum, line) => sum + lineUsdPrice(line.product) * line.quantity, 0);
  const discountRate = Math.min(100, Math.max(0, discount));
  const discountValue = discountMode === 'percent' ? Math.round(subtotal * discountRate) / 100 : discount;
  const discountTry = discountMode === 'percent' ? Math.round(subtotalTry * discountRate) / 100 : currency === 'TRY' ? discount : tryFromUsd(discount, usdRate);
  const discountUsd = discountMode === 'percent' ? Math.round(subtotalUsd * discountRate) / 100 : currency === 'USD' ? discount : usdFromTry(discount, usdRate);
  const vat = Math.max(0, subtotal - discountValue) * 0.2;
  const total = Math.max(0, subtotal - discountValue) + vat;
  const vatTry = Math.max(0, subtotalTry - discountTry) * 0.2;
  const vatUsd = Math.max(0, subtotalUsd - discountUsd) * 0.2;
  const totalTry = Math.max(0, subtotalTry - discountTry) + vatTry;
  const totalUsd = Math.max(0, subtotalUsd - discountUsd) + vatUsd;
  const paidTry = currency === 'TRY' ? paid : tryFromUsd(paid, usdRate);
  const paidUsd = currency === 'USD' ? paid : usdFromTry(paid, usdRate);
  const remainingTry = totalTry - paidTry;
  const remainingUsd = totalUsd - paidUsd;
  const visibleProducts = products.filter((product) => {
    const text = `${product.name} ${product.code} ${product.barcode}`.toLowerCase();
    const categoryOk = category === 'Tumu' || product.category === category || product.subCategory === category;
    return categoryOk && text.includes(query.toLowerCase());
  });
  const stockBadgeClass = (product: Product) => {
    if (product.stock <= 0) return 'bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
    if (product.stock <= product.criticalStock) return 'bg-[#ffe3e9] text-rose ring-1 ring-rose/20';
    if (product.stock <= 5) return 'bg-[#fff2cd] text-[#9b6500] ring-1 ring-saffron/20';
    return 'bg-mint text-ocean ring-1 ring-ocean/10';
  };

  useEffect(() => {
    if (selectedAccountId) setAccountId(selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        setPaymentMethod('Nakit');
        setPaid(total);
      }
      if (event.key === 'F4') {
        event.preventDefault();
        setPaymentMethod('Kredi karti');
        setPaid(total);
      }
      if (event.key === 'F10' && !submittingSale) {
        event.preventDefault();
        completeSale();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [accountId, cart, paid, discount, discountMode, currency, paymentMethod, total, totalTry, totalUsd, priceMode, submittingSale]);

  function addProduct(product: Product) {
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      if (found) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { product, quantity: 1 }];
    });
    barcodeRef.current?.focus();
  }

  function addByBarcode() {
    const product = products.find((item) => item.barcode === barcode || item.code.toLowerCase() === barcode.toLowerCase());
    if (product) addProduct(product);
    setBarcode('');
    barcodeRef.current?.focus();
  }

  function choosePayment(method: string) {
    setPaymentMethod(method);
    if (method === 'Vadeli') setPaid(0);
    else setPaid(total);
    barcodeRef.current?.focus();
  }

  async function completeSale() {
    if (submittingSale) return;
    if (!cart.length || !accountId) {
      onNotice('Satis icin cari ve urun secimi gerekli');
      return;
    }
    setSubmittingSale(true);
    const normalizedPaid = Math.min(Math.max(0, paid), total);
    if (normalizedPaid !== paid) setPaid(normalizedPaid);
    const saleCart = cart.map((line) => ({ ...line, product: { ...line.product, saleTry: lineTryPrice(line.product), saleUsd: lineUsdPrice(line.product) } }));
    try {
      const success = await onSale(accountId, saleCart, normalizedPaid, discountValue, currency, paymentMethod);
      if (success) {
        setCart([]);
        setPaid(0);
        setDiscount(0);
        setDiscountMode('amount');
      }
    } finally {
      setSubmittingSale(false);
      barcodeRef.current?.focus();
    }
  }

  return (
    <section className="space-y-6">
    <div className="grid gap-5 2xl:grid-cols-[260px_1fr_420px]">
      <Panel title="Filtre">
        <div className="space-y-3">
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-11 w-full rounded-xl border border-line bg-white/90 px-3 text-sm font-semibold outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80">
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.companyName}</option>)}
          </select>
          <FormInput label="Urun arama" value={query} onChange={setQuery} />
          <FormSelect label="Kategori" value={category} onChange={setCategory} options={[{ label: 'Tum kategoriler', value: 'Tumu' }, ...categories.map((item) => ({ label: item.name, value: item.name }))]} />
          <div className="flex gap-2">
            <input ref={barcodeRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addByBarcode()} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/90 px-3 font-semibold outline-none transition focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80" placeholder="Barkod okut" />
            <IconButton title="Barkod ekle" onClick={addByBarcode}><Barcode size={18} /></IconButton>
          </div>
          <Segment value={currency} setValue={setCurrency} />
          <FormSelect label="Satis fiyati" value={priceMode} onChange={(value) => setPriceMode(value as 'net' | 'gross')} options={[{ label: 'KDV haric fiyat', value: 'net' }, { label: 'KDV dahil fiyat', value: 'gross' }]} />
          <Info label="Secilen cari" value={accounts.find((item) => item.id === accountId)?.companyName ?? '-'} />
        </div>
      </Panel>
      <Panel title="Urun kartlari" actions={<div className="flex rounded-xl border border-line bg-white/80 p-1 text-xs font-bold dark:border-slate-700 dark:bg-slate-900/80"><button type="button" onClick={() => setProductView('card')} className={`h-8 rounded-lg px-3 ${productView === 'card' ? 'bg-ocean text-white' : 'text-slate-500'}`}>Kart</button><button type="button" onClick={() => setProductView('list')} className={`h-8 rounded-lg px-3 ${productView === 'list' ? 'bg-ocean text-white' : 'text-slate-500'}`}>Liste</button></div>}>
        {productView === 'card' ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleProducts.map((product) => (
              <button key={product.id} disabled={product.stock <= 0} onClick={() => addProduct(product)} className="group relative flex min-h-[356px] w-full flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/95 p-4 text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-ocean/60 hover:shadow-lift disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/80">
                <span className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[11px] font-black shadow-sm ${stockBadgeClass(product)}`}>{product.stock} adet</span>
                <div className="mb-4 flex h-28 items-center justify-center rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/30">
                  <SalesProductImage product={product} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="product-title-clamp product-name-safe text-sm font-black leading-tight text-ink dark:text-white">{product.name}</div>
                  <div className="product-code-clamp mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{product.code || product.barcode || 'Kodsuz'}{product.barcode ? ` / ${product.barcode}` : ''}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{product.category}</span>
                    {product.brand && <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{product.brand}</span>}
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-4 dark:border-slate-700">
                  <PriorityMoney currency={currency} tryValue={lineTryPrice(product)} usdValue={lineUsdPrice(product)} large />
                  <span className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ocean px-4 text-sm font-black text-white shadow-lg shadow-ocean/25 transition group-hover:scale-[1.02] group-hover:bg-[#0e5c70]">
                    <Plus size={16} />
                    Sepete ekle
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {visibleProducts.map((product) => (
              <button key={product.id} disabled={product.stock <= 0} onClick={() => addProduct(product)} className="group grid w-full grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-2xl border border-white/80 bg-white/95 p-3 text-left shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-ocean/60 hover:shadow-panel disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/80 sm:grid-cols-[68px_minmax(0,1fr)_230px] sm:items-center">
                <SalesProductImage product={product} compact />
                <div className="min-w-0">
                  <div className="product-code-clamp text-[11px] font-bold uppercase tracking-wide text-slate-400">{product.code || product.barcode || 'Kodsuz'}{product.barcode ? ` / ${product.barcode}` : ''}</div>
                  <div className="product-title-clamp-2 product-name-safe mt-0.5 text-sm font-black leading-tight">{product.name}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{product.category}</span>
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-2 rounded-2xl bg-slate-50/80 p-3 dark:bg-slate-950/30 sm:col-span-1 sm:items-end sm:bg-transparent sm:p-0 sm:dark:bg-transparent">
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black shadow-sm ${stockBadgeClass(product)}`}>{product.stock} adet</span>
                  <PriorityMoney currency={currency} tryValue={lineTryPrice(product)} usdValue={lineUsdPrice(product)} large />
                  <span className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ocean px-4 text-sm font-black text-white shadow-lg shadow-ocean/20 transition group-hover:scale-[1.02] group-hover:bg-[#0e5c70] sm:w-[146px]">
                    <Plus size={16} />
                    Sepete ekle
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>
      <div className="2xl:sticky 2xl:top-24 2xl:self-start">
      <Panel title="Sepet ve satis fisi">
        <div className="flex min-h-[540px] max-h-[calc(100vh-8rem)] flex-col">
          <div className="space-y-2 overflow-y-auto pr-1">
            {!cart.length && (
              <div className="rounded-2xl border border-dashed border-line bg-slate-50/80 p-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
                Sepet bos. Urun kartindan hizlica ekle.
              </div>
            )}
            {cart.map((line) => {
              const lineTryTotal = lineTryPrice(line.product) * line.quantity;
              const lineUsdTotal = lineUsdPrice(line.product) * line.quantity;
              const linePrimary = currency === 'USD' ? money(lineUsdTotal, 'USD') : money(lineTryTotal);
              const lineSecondary = currency === 'USD' ? money(lineTryTotal) : money(lineUsdTotal, 'USD');
              return (
                <div key={line.product.id} className="rounded-2xl border border-line bg-white/80 p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-ink dark:text-white">{line.product.name}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        Birim: {currency === 'USD' ? money(lineUsdPrice(line.product), 'USD') : money(lineTryPrice(line.product))}
                        <span className="text-slate-400"> / {currency === 'USD' ? money(lineTryPrice(line.product)) : money(lineUsdPrice(line.product), 'USD')}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-ocean">{linePrimary}</div>
                      <div className="text-xs font-semibold text-slate-500">{lineSecondary}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950/40">
                      <button type="button" onClick={() => setCart((current) => current.map((item) => item.product.id === line.product.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))} className="grid h-8 w-8 place-items-center text-sm font-black text-slate-600 transition hover:bg-mint hover:text-ocean">-</button>
                      <input type="number" min="1" value={line.quantity} onChange={(event) => setCart((current) => current.map((item) => item.product.id === line.product.id ? { ...item, quantity: Math.max(1, Number(event.target.value)) } : item))} className="h-8 w-12 border-x border-line bg-transparent text-center text-sm font-black outline-none dark:border-slate-700" />
                      <button type="button" onClick={() => setCart((current) => current.map((item) => item.product.id === line.product.id ? { ...item, quantity: Math.min(item.product.stock, item.quantity + 1) } : item))} className="grid h-8 w-8 place-items-center text-sm font-black text-slate-600 transition hover:bg-mint hover:text-ocean">+</button>
                    </div>
                    <button type="button" title="Satir sil" aria-label="Satir sil" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-white text-slate-500 transition hover:border-rose hover:bg-rose/10 hover:text-rose dark:border-slate-700 dark:bg-slate-950/40">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-line bg-white/70 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Iskonto</span>
                <div className="flex rounded-xl border border-line bg-slate-50 p-1 text-[11px] font-black dark:border-slate-700 dark:bg-slate-950/40">
                  <button type="button" onClick={() => setDiscountMode('amount')} className={`h-7 rounded-lg px-2.5 transition ${discountMode === 'amount' ? 'bg-ocean text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:hover:bg-slate-800'}`}>Tutar</button>
                  <button type="button" onClick={() => setDiscountMode('percent')} className={`h-7 rounded-lg px-2.5 transition ${discountMode === 'percent' ? 'bg-ocean text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:hover:bg-slate-800'}`}>%</button>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(discountMode === 'percent' ? Math.min(100, positiveNumber(event.target.value)) : positiveNumber(event.target.value))}
                className="h-11 w-full rounded-xl border border-line bg-white/90 px-3 text-ink outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                placeholder={discountMode === 'percent' ? 'Oran %' : 'Tutar'}
              />
              <div className="mt-1 text-[11px] font-semibold text-slate-500">
                {discountMode === 'percent' ? `%${discountRate} = ${currency === 'USD' ? money(discountValue, 'USD') : money(discountValue)}` : 'Tutar indirimi'}
              </div>
            </div>
            <FormNumber label="Odenen" value={paid} setValue={setPaid} />
          </div>
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Odeme turu</div>
            <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-line bg-white/80 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
              {['Nakit', 'Kredi karti', 'Havale/EFT', 'Vadeli'].map((method) => (
                <button key={method} type="button" onClick={() => choosePayment(method)} className={`h-9 rounded-xl px-2 text-[11px] font-black transition-all ${paymentMethod === method ? 'bg-ocean text-white shadow-md shadow-ocean/15' : 'text-slate-500 hover:bg-mint hover:text-ocean dark:text-slate-300 dark:hover:bg-slate-800'}`}>{method === 'Kredi karti' ? 'Kart' : method === 'Havale/EFT' ? 'Havale' : method}</button>
              ))}
            </div>
          </div>
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 border-t-2 border-dashed border-line bg-white/95 p-5 shadow-[0_-18px_35px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-700 dark:bg-[#17202a]/95">
            <button type="button" disabled={submittingSale} onClick={completeSale} className="mb-4 inline-flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-lg font-black uppercase tracking-wide text-white shadow-xl shadow-emerald-600/30 transition hover:-translate-y-1 hover:bg-emerald-700 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 size={24} /> {submittingSale ? 'Satis kaydediliyor...' : 'Satisi tamamla (F10)'}</button>
            <div className="mb-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-3 text-slate-500">
                <span className="font-bold">Ara toplam</span>
                <span className="font-black text-slate-700 dark:text-slate-200">{currency === 'USD' ? money(subtotalUsd, 'USD') : money(subtotalTry)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-500">
                <span className="font-bold">KDV</span>
                <span className="font-black text-slate-700 dark:text-slate-200">{currency === 'USD' ? money(vatUsd, 'USD') : money(vatTry)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between gap-3 text-slate-500">
                  <span className="font-bold">Iskonto</span>
                  <span className="font-black text-rose">{currency === 'USD' ? money(discountUsd, 'USD') : money(discountTry)}</span>
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-slate-950 p-4 text-white shadow-xl shadow-slate-950/20 dark:bg-black">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-slate-300">Genel toplam</div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">Kur: 1 USD = {money(usdRate)}</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black leading-none tracking-tight">{currency === 'USD' ? money(totalUsd, 'USD') : money(totalTry)}</div>
                  <div className="mt-1 text-sm font-bold text-slate-300">{currency === 'USD' ? money(totalTry) : money(totalUsd, 'USD')}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-slate-200">
                <span>Kalan</span>
                <span>{currency === 'USD' ? `${money(remainingUsd, 'USD')} / ${money(remainingTry)}` : `${money(remainingTry)} / ${money(remainingUsd, 'USD')}`}</span>
              </div>
            </div>
          </div>
        </div>
      </Panel>
      </div>
    </div>
      <div className="relative z-0 rounded border border-line bg-white/90 px-4 py-2 text-xs font-semibold text-slate-500 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-[#17202a]/90">
        <span className="mr-4"><kbd className="rounded border border-line px-1.5 py-0.5 dark:border-slate-700">F2</kbd> Nakit</span>
        <span className="mr-4"><kbd className="rounded border border-line px-1.5 py-0.5 dark:border-slate-700">F4</kbd> Kredi karti</span>
        <span><kbd className="rounded border border-line px-1.5 py-0.5 dark:border-slate-700">F10</kbd> Satisi bitir</span>
      </div>
      <DetailTable
        title="Satis kayitlari"
        headers={['Fis', 'Cari', 'Toplam', 'Kalan', 'Tarih', 'Islem']}
        rows={sales.map((sale) => ({
          date: sale.createdAt,
          onClick: () => setSelectedSale(sale),
          cells: [
            <span key={`${sale.id}-open`} className="font-semibold text-ocean">{sale.id}</span>,
            sale.accountName ?? accounts.find((item) => item.id === sale.accountId)?.companyName ?? sale.accountId,
            <DualMoney key={`${sale.id}-total`} compact tryValue={sale.totalTry ?? (sale.currency === 'TRY' ? sale.total : tryFromUsd(sale.total, usdRate))} usdValue={sale.totalUsd ?? (sale.currency === 'USD' ? sale.total : usdFromTry(sale.total, usdRate))} />,
            <DualMoney key={`${sale.id}-remaining`} compact tryValue={sale.remainingTry ?? (sale.currency === 'TRY' ? sale.remaining : tryFromUsd(sale.remaining, usdRate))} usdValue={sale.remainingUsd ?? (sale.currency === 'USD' ? sale.remaining : usdFromTry(sale.remaining, usdRate))} />,
            new Date(sale.createdAt).toLocaleDateString('tr-TR'),
            <Button key={`${sale.id}-detail`} variant="soft" onClick={() => setSelectedSale(sale)}>Detay</Button>,
          ],
        }))}
      />
      {selectedSale && <SaleDetailModal sale={selectedSale} products={products} accounts={accounts} fallbackRate={usdRate} onClose={() => setSelectedSale(null)} onNotice={onNotice} />}
    </section>
  );
}

function SaleSummaryLine({ label, currency, tryValue, usdValue, strong }: { label: string; currency: 'TRY' | 'USD'; tryValue: number; usdValue: number; strong?: boolean }) {
  const isTotal = label === 'Genel toplam';
  return <div className={`flex items-center justify-between rounded-2xl border dark:border-slate-700 ${isTotal ? 'border-ocean bg-gradient-to-br from-ocean to-[#0e5c70] p-5 text-white shadow-lg shadow-ocean/20' : strong ? 'border-line bg-slate-50 p-4 shadow-sm dark:bg-slate-900' : 'border-line bg-white/60 p-3 shadow-sm dark:bg-slate-900/40'}`}><span className={`font-bold ${isTotal ? 'text-base text-white' : 'text-sm text-slate-500'}`}>{label}</span><div className={isTotal ? 'scale-110 origin-right' : ''}><PriorityMoney currency={currency} tryValue={tryValue} usdValue={usdValue} /></div></div>;
}

function previewCollection(account: Account | undefined, tryAmount: number, usdAmount: number, rate: number) {
  let remainingTry = account?.balanceTry ?? 0;
  let remainingUsd = account?.balanceUsd ?? 0;
  if (usdAmount > 0 && tryAmount <= 0) {
    const appliedUsd = remainingUsd > 0 ? Math.min(remainingUsd, usdAmount) : 0;
    remainingUsd = Math.round((remainingUsd - appliedUsd) * 100) / 100;
    const tryCapacity = Math.round((usdAmount - appliedUsd) * rate * 100) / 100;
    const appliedTry = remainingTry > 0 ? Math.min(remainingTry, tryCapacity) : 0;
    remainingTry = Math.round((remainingTry - appliedTry) * 100) / 100;
    const extraUsd = Math.round((usdAmount - appliedUsd - appliedTry / rate) * 100) / 100;
    if (extraUsd > 0) remainingUsd = Math.round((remainingUsd - extraUsd) * 100) / 100;
  } else {
    const appliedTry = remainingTry > 0 ? Math.min(remainingTry, tryAmount) : 0;
    remainingTry = Math.round((remainingTry - appliedTry) * 100) / 100;
    const usdCapacity = Math.round(((tryAmount - appliedTry) / rate) * 100) / 100;
    const appliedUsd = remainingUsd > 0 ? Math.min(remainingUsd, usdCapacity) : 0;
    remainingUsd = Math.round((remainingUsd - appliedUsd) * 100) / 100;
    const extraTry = Math.round((tryAmount - appliedTry - appliedUsd * rate) * 100) / 100;
    if (extraTry > 0) remainingTry = Math.round((remainingTry - extraTry) * 100) / 100;
  }
  return { remainingTry, remainingUsd };
}

function CollectionsView({ usdRate, selectedAccountId, accounts, collections, paymentLogs, onCollection, onNotice, onRefresh }: { usdRate: number; selectedAccountId: string; accounts: Account[]; collections: Collection[]; paymentLogs: PaymentLog[]; onCollection: (payload: { accountId: string; method: string; currency: 'TRY' | 'USD'; amount: number; description?: string }) => void; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [accountId, setAccountId] = useState(selectedAccountId || accounts[0]?.id || '');
  const [method, setMethod] = useState('Nakit');
  const [tryAmount, setTryAmount] = useState(1000);
  const [usdAmount, setUsdAmount] = useState(0);
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (selectedAccountId) setAccountId(selectedAccountId);
  }, [selectedAccountId]);
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const amountTry = tryAmount;
  const amountUsd = usdAmount || usdFromTry(tryAmount, usdRate);
  const preview = previewCollection(selectedAccount, tryAmount, usdAmount, usdRate);

  async function runAuto(account: Account) {
    try {
      const result = await apiPost<{ status: string; collection: Collection }>(`/collections/auto/${account.id}`, {});
      await onRefresh();
      onNotice(`Otomatik tahsilat sonucu: ${result.status}`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function sendCollectionMessage(id: string) {
    try {
      const result = await apiPost<{ link: string }>(`/whatsapp/collections/${id}`);
      window.open(result.link, '_blank', 'noopener,noreferrer');
      onNotice('Tahsilat WhatsApp mesaji hazirlandi');
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function showReceipt(id: string, print = false) {
    try {
      const receipt = await apiGet<{ receiptNo: string; status: string; account: string; amountTry: number; amountUsd: number; remainingTry: number; remainingUsd: number }>(`/collections/${id}/receipt`);
      onNotice(`Makbuz ${receipt.receiptNo}: ${receipt.account}, ${money(receipt.amountTry)} / ${money(receipt.amountUsd, 'USD')}, kalan ${money(receipt.remainingTry)} / ${money(receipt.remainingUsd, 'USD')}`);
      if (print) window.print();
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Panel title="Tahsilat al">
        <div className="space-y-3">
          <FormSelect label="Cari" value={accountId} onChange={setAccountId} options={accounts.map((item) => ({ label: item.companyName, value: item.id }))} />
          <FormSelect label="Odeme turu" value={method} onChange={setMethod} options={['Nakit', 'Kredi karti', 'Havale/EFT'].map((item) => ({ label: item, value: item }))} />
          <FormNumber label="TL tutar" value={tryAmount} setValue={setTryAmount} />
          <FormNumber label="USD tutar" value={usdAmount} setValue={setUsdAmount} />
          <FormInput label="Aciklama" value={description} onChange={setDescription} />
          <DualSummary label="Tahsil edilen" tryValue={amountTry} usdValue={amountUsd} />
          <DualSummary label="Kullanilan kur" tryValue={usdRate} usdValue={1} />
          <DualSummary label="Tahsilat sonrasi bakiye" tryValue={preview.remainingTry} usdValue={preview.remainingUsd} />
          {(preview.remainingTry < 0 || preview.remainingUsd < 0) && <div className="rounded bg-[#d7f2ea] px-3 py-2 text-sm font-semibold text-emerald-700">Fazla tahsilat alacak bakiye olarak islenecek.</div>}
          <Button onClick={() => {
            const currency = usdAmount > 0 && tryAmount <= 0 ? 'USD' : 'TRY';
            onCollection({ accountId, method, currency, amount: currency === 'USD' ? usdAmount : tryAmount, description });
          }} icon={<WalletCards size={17} />}>Tahsilat kaydet</Button>
        </div>
      </Panel>
      <Panel title="Otomatik tahsilat ayarlari">
        <div className="space-y-3">
          {accounts.filter((item) => item.autoCollectionEnabled).map((account) => (
            <div key={account.id} className="rounded border border-line p-3 text-sm dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{account.companyName}</div>
                  <div className="text-slate-500">Gun {account.collectionDay} - Max {money(account.maxCollectionAmount ?? 0, account.paymentCurrency === 'USD' ? 'USD' : 'TL')}</div>
                  <div className="text-slate-500">Token: {account.cardToken ? `${account.cardToken.slice(0, 8)}...` : '3D onay gerekli'}</div>
                  {account.paymentWarning && <div className="mt-1 font-semibold text-rose">{account.paymentWarning}</div>}
                </div>
                <Button variant="soft" onClick={() => runAuto(account)} icon={<CreditCard size={16} />}>Dene</Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      </div>
      <DataTable
        title="Tahsilat listesi"
        headers={['Cari', 'Tutar TL', 'Tutar USD', 'Yontem', 'Durum', 'Tarih', 'Makbuz', 'Yazdir', 'WhatsApp']}
        rows={collections.map((item) => [
          item.accountName ?? accounts.find((account) => account.id === item.accountId)?.companyName ?? item.accountId,
          money(item.tlAmount ?? (item.currency === 'TRY' ? item.amount : 0)),
          money(item.usdAmount ?? (item.currency === 'USD' ? item.amount : 0), 'USD'),
          item.method,
          <Badge key={`${item.id}-status`}>{item.status ?? 'basarili'}</Badge>,
          new Date(item.createdAt).toLocaleDateString('tr-TR'),
          <Button key={`${item.id}-receipt`} variant="soft" onClick={() => showReceipt(item.id)} icon={<FileText size={16} />}>Makbuz</Button>,
          <Button key={`${item.id}-print`} variant="soft" onClick={() => showReceipt(item.id, true)} icon={<FileDown size={16} />}>Yazdir</Button>,
          <Button key={`${item.id}-wa`} variant="soft" onClick={() => sendCollectionMessage(item.id)} icon={<MessageCircle size={16} />}>Mesaj</Button>,
        ])}
      />
      <DataTable title="Odeme loglari" headers={['Cari', 'POS', 'Durum', 'Tutar', 'Mesaj', 'Tarih']} rows={paymentLogs.map((log) => [log.accountName ?? log.accountId, log.provider, log.status, money(log.amount, log.currency === 'USD' ? 'USD' : 'TL'), log.message, new Date(log.createdAt).toLocaleString('tr-TR')])} />
    </section>
  );
}

function DealerView({ usdRate, products, accounts, orders, initialSession, onNotice, onRefresh }: { usdRate: number; products: Product[]; accounts: Account[]; orders: Order[]; initialSession?: UserSession | null; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [session, setSession] = useState<UserSession | null>(initialSession ?? null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ open: false, token: '', password: '' });
  const dealer = session?.accountId ? accounts.find((item) => item.id === session.accountId) : undefined;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [dealerOrders, setDealerOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Havale/EFT' | 'Nakit'>('Havale/EFT');
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardForm, setCardForm] = useState({ cardHolder: '', cardNumber: '4242 4242 4242 4242', expiryMonth: '12', expiryYear: '30', cvv: '123', installments: 1, amountTry: 0 });
  const cartTry = cart.reduce((sum, line) => sum + line.product.dealerTry * line.quantity, 0);
  const cartUsd = cart.reduce((sum, line) => sum + line.product.dealerUsd * line.quantity, 0);
  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('erp_token') ?? ''}` });
  async function portalGet<T>(path: string): Promise<T> {
    const response = await fetch(apiUrl(path), { headers: authHeaders() });
    if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
    return response.json() as Promise<T>;
  }
  async function portalPost<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
    return response.json() as Promise<T>;
  }

  useEffect(() => {
    if (initialSession) setSession(initialSession);
  }, [initialSession?.id, initialSession?.accountId, initialSession?.mustChangePassword]);

  useEffect(() => {
    if (session?.accountId) {
      void (session.role === 'ADMIN' ? apiGet<AccountDetail>(`/accounts/${session.accountId}`) : portalGet<AccountDetail>('/portal/account')).then(setDetail);
      void (session.role === 'ADMIN' ? apiGet<Order[]>(`/dealer/${session.accountId}/orders`) : portalGet<Order[]>('/portal/orders')).then(setDealerOrders);
    }
  }, [session?.accountId]);

  function addToCart(product: Product) {
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      if (found) return current.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(product.stock, line.quantity + 1) } : line);
      return [...current, { product, quantity: 1 }];
    });
  }

  async function createDealerOrder() {
    try {
      if (!dealer) throw new Error('Bayi bulunamadi');
      if (!cart.length) throw new Error('Sepet bos');
      const order = session?.role === 'ADMIN'
        ? await apiPost<Order>('/orders', { accountId: dealer.id, currency: 'TRY', items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })) })
        : await portalPost<Order>('/portal/orders', { currency: 'TRY', description: 'Bayi portal siparisi', items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })) });
      setCart([]);
      await onRefresh();
      setDetail(session?.role === 'ADMIN' ? await apiGet<AccountDetail>(`/accounts/${dealer.id}`) : await portalGet<AccountDetail>('/portal/account'));
      setDealerOrders(session?.role === 'ADMIN' ? await apiGet<Order[]>(`/dealer/${dealer.id}/orders`) : await portalGet<Order[]>('/portal/orders'));
      setSelectedOrder(order);
      onNotice(`B2B siparis admin paneline dustu: ${order.id}`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function payDebt() {
    try {
      if (!dealer) throw new Error('Bayi bulunamadi');
      const amount = Math.max(0, dealer.balanceTry);
      if (!amount) throw new Error('Odenecek TL borc yok');
      const payment = session?.role === 'ADMIN'
        ? await apiPost<{ receiptId?: string; status: string; paymentLog?: PaymentLog }>('/payments/dealer', { accountId: dealer.id, currency: 'TRY', amount, method: paymentMethod })
        : await portalPost<{ receiptId?: string; status: string; paymentLog?: PaymentLog }>('/portal/payments', { currency: 'TRY', amount, method: paymentMethod });
      await onRefresh();
      setDetail(session?.role === 'ADMIN' ? await apiGet<AccountDetail>(`/accounts/${dealer.id}`) : await portalGet<AccountDetail>('/portal/account'));
      onNotice(payment.receiptId ? `Odeme alindi, tahsilat olustu: ${payment.receiptId}` : `Odeme bildirimi admin onayina gonderildi: ${payment.paymentLog?.id ?? payment.status}`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  function openCardPayment() {
    if (!dealer) return onNotice('Bayi bulunamadi');
    setCardForm((current) => ({ ...current, cardHolder: current.cardHolder || session?.name || dealer.contactName || dealer.companyName, amountTry: Math.max(0, roundMoney(dealer.balanceTry)) }));
    setCardModalOpen(true);
  }

  async function submitCardPayment() {
    try {
      if (!dealer) throw new Error('Bayi bulunamadi');
      const amount = positiveNumber(cardForm.amountTry);
      const payload = {
        currency: 'TRY' as const,
        amount,
        cardHolder: cardForm.cardHolder,
        cardNumber: cardForm.cardNumber,
        expiryMonth: cardForm.expiryMonth,
        expiryYear: cardForm.expiryYear,
        cvv: cardForm.cvv,
        installments: cardForm.installments,
      };
      const payment = session?.role === 'ADMIN'
        ? await apiPost<{ receiptId?: string; status: string; transactionNo?: string; paymentLog?: PaymentLog }>('/payments/dealer/card', { accountId: dealer.id, ...payload })
        : await portalPost<{ receiptId?: string; status: string; transactionNo?: string; paymentLog?: PaymentLog }>('/portal/payments/card', payload);
      if (payment.status !== 'basarili') throw new Error(payment.paymentLog?.message ?? 'Kart odemesi basarisiz');
      await onRefresh();
      setDetail(session?.role === 'ADMIN' ? await apiGet<AccountDetail>(`/accounts/${dealer.id}`) : await portalGet<AccountDetail>('/portal/account'));
      setCardModalOpen(false);
      onNotice(`Online kart odemesi basarili. Tahsilat olustu: ${payment.receiptId ?? payment.transactionNo}`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function loginDealer() {
    try {
      const result = await apiPost<{ accessToken: string; user: UserSession }>('/auth/login', loginForm);
      if (!['CUSTOMER', 'DEALER', 'ADMIN'].includes(result.user.role)) throw new Error('Bu panele sadece musteri/bayi kullanicisi girebilir');
      if (result.user.mustChangePassword) {
        localStorage.setItem('erp_token', result.accessToken);
        localStorage.setItem('erp_user', JSON.stringify(result.user));
        setPasswordForm({ open: true, token: result.accessToken, password: '' });
        setSession(result.user);
        onNotice('Ilk giris icin yeni sifre belirleyin');
        return;
      }
      localStorage.setItem('erp_token', result.accessToken);
      localStorage.setItem('erp_user', JSON.stringify(result.user));
      setSession(result.user);
      onNotice(`${result.user.name} olarak bayi paneline girildi`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function changeDealerPassword() {
    try {
      if (passwordForm.password.length < 6) throw new Error('Sifre en az 6 karakter olmali');
      await fetch(apiUrl('/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${passwordForm.token}` },
        body: JSON.stringify({ password: passwordForm.password }),
      }).then(async (response) => {
        if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
      });
      const fresh = await apiPost<{ accessToken: string; user: UserSession }>('/auth/login', { email: loginForm.email, password: passwordForm.password });
      localStorage.setItem('erp_token', fresh.accessToken);
      localStorage.setItem('erp_user', JSON.stringify({ ...fresh.user, mustChangePassword: false }));
      setSession({ ...fresh.user, mustChangePassword: false });
      setPasswordForm({ open: false, token: '', password: '' });
      onNotice('Sifre guncellendi, bayi paneli acildi');
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function approveOrder(order: Order) {
    try {
      const result = await apiPost<{ order: Order; sale: Sale }>(`/orders/${order.id}/approve`);
      await onRefresh();
      if (dealer) {
        setDetail(await apiGet<AccountDetail>(`/accounts/${dealer.id}`));
        setDealerOrders(await apiGet<Order[]>(`/dealer/${dealer.id}/orders`));
      }
      setSelectedOrder(result.order);
      onNotice(`Siparis onaylandi ve satisa donustu: ${result.sale.id}`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  if (!session) {
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <div className="w-full max-w-md rounded border border-line bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-[#17202a]">
          <div className="grid h-14 w-14 place-items-center rounded bg-mint text-ocean"><UserRound /></div>
          <h1 className="mt-4 text-2xl font-bold">B2B Bayi Girisi</h1>
          <p className="mt-1 text-sm text-slate-500">Musteri veya bayi hesabiyla portala gir.</p>
          <div className="mt-5 space-y-3">
            <FormInput label="E-posta" value={loginForm.email} onChange={(email) => setLoginForm({ ...loginForm, email })} />
            <FormInput label="Sifre" type="password" value={loginForm.password} onChange={(password) => setLoginForm({ ...loginForm, password })} />
            <Button onClick={loginDealer} icon={<UserRound size={17} />}>Bayi paneline gir</Button>
          </div>
        </div>
      </section>
    );
  }

  if (passwordForm.open) {
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <div className="w-full max-w-md rounded border border-line bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-[#17202a]">
          <div className="grid h-14 w-14 place-items-center rounded bg-mint text-ocean"><UserRound /></div>
          <h1 className="mt-4 text-2xl font-bold">Yeni sifre olustur</h1>
          <p className="mt-1 text-sm text-slate-500">Gecici sifreyle ilk giris yapildi. Devam etmek icin kalici sifreni belirle.</p>
          <div className="mt-5 space-y-3">
            <FormInput label="Yeni sifre" type="password" value={passwordForm.password} onChange={(password) => setPasswordForm({ ...passwordForm, password })} />
            <Button disabled={passwordForm.password.length < 6} onClick={changeDealerPassword}>Sifreyi degistir ve devam et</Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[320px_1fr_360px]">
      <Panel title="Bayi ozeti">
        <div className="space-y-3">
          <div className="grid h-14 w-14 place-items-center rounded bg-mint text-ocean"><UserRound /></div>
          <Info label="Kullanici" value={session.email} />
          <Info label="Bayi" value={dealer?.companyName ?? '-'} />
          <Info label="TL bakiye" value={money(dealer?.balanceTry ?? 0)} />
          <Info label="USD bakiye" value={money(dealer?.balanceUsd ?? 0, 'USD')} />
          <FormSelect label="Bildirim yontemi" value={paymentMethod} onChange={(value) => setPaymentMethod(value as typeof paymentMethod)} options={['Havale/EFT', 'Nakit'].map((value) => ({ label: value, value }))} />
          <Button onClick={openCardPayment} icon={<CreditCard size={17} />}>Online kart odeme</Button>
          <Button variant="soft" onClick={payDebt} icon={<Upload size={17} />}>{paymentMethod === 'Havale/EFT' ? 'Havale/EFT bildirimi gonder' : paymentMethod === 'Nakit' ? 'Nakit odeme bildirimi gonder' : 'Manuel odeme bildirimi gonder'}</Button>
          <Button variant="soft" onClick={() => window.open('https://wa.me/905320000000', '_blank', 'noopener,noreferrer')} icon={<MessageCircle size={17} />}>WhatsApp destek</Button>
        </div>
      </Panel>
      <DataTable
        title="Bayi urunleri"
        headers={['Urun', 'Stok', 'Bayi TL', 'Bayi USD', 'Siparis']}
        rows={products.map((product) => [
          <div key={`${product.id}-dealer`} className="flex items-center gap-3"><ProductThumb product={product} /><span className="font-semibold">{product.name}</span></div>,
          `${product.stock} adet`,
          money(product.dealerTry),
          money(product.dealerUsd, 'USD'),
          <Button key={product.id} disabled={product.stock <= 0} onClick={() => addToCart(product)} icon={<ShoppingCart size={16} />}>Sepete ekle</Button>,
        ])}
      />
      <Panel title="Sepet">
        <div className="space-y-3">
          {cart.map((line) => (
            <div key={line.product.id} className="rounded border border-line p-3 text-sm dark:border-slate-700">
              <div className="font-semibold">{line.product.name}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input className="h-9 w-20 rounded border border-line px-2 dark:border-slate-700 dark:bg-slate-900" value={line.quantity} onChange={(event) => setCart((current) => current.map((item) => item.product.id === line.product.id ? { ...item, quantity: Math.max(1, parseNumber(event.target.value)) } : item))} />
                <span>{money(line.product.dealerTry * line.quantity)}</span>
              </div>
            </div>
          ))}
          <Summary label="Toplam TL" value={money(cartTry)} strong />
          <Summary label="Toplam USD" value={money(cartUsd, 'USD')} />
          <Button disabled={!cart.length} onClick={createDealerOrder} icon={<ShoppingCart size={17} />}>Siparis olustur</Button>
        </div>
      </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <DataTable title="Bayi cari ekstresi" headers={['Tarih', 'Islem', 'Aciklama', 'Borc TL', 'Alacak TL']} rows={(detail?.ledger ?? []).map((line) => [new Date(line.date).toLocaleDateString('tr-TR'), line.type, line.description, money(line.debitTry), money(line.creditTry)])} />
        <DetailTable
          title={session.role === 'ADMIN' ? 'Admin siparis paneli' : 'Siparis gecmisim'}
          headers={['Siparis', 'Bayi', 'Durum', 'TL', 'USD', 'Tarih', 'Islem']}
          rows={(session.role === 'ADMIN' ? orders : dealerOrders).map((order) => ({
            date: order.createdAt,
            onClick: () => setSelectedOrder(order),
            cells: [
              order.id,
              order.accountName ?? order.dealerName ?? order.accountId,
              order.status,
              money(order.totalTry),
              money(order.totalUsd, 'USD'),
              new Date(order.createdAt).toLocaleDateString('tr-TR'),
              <Toolbar key={`${order.id}-actions`}>
                <Button variant="soft" onClick={() => setSelectedOrder(order)}>Detay</Button>
                {session.role === 'ADMIN' && order.status === 'Beklemede' && <Button variant="soft" onClick={() => approveOrder(order)}>Onayla</Button>}
              </Toolbar>,
            ],
          }))}
        />
      </div>
      {selectedOrder && <OrderDetailModal order={selectedOrder} products={products} accounts={accounts} isAdmin={session.role === 'ADMIN'} onClose={() => setSelectedOrder(null)} onApprove={approveOrder} onNotice={onNotice} onRefresh={onRefresh} />}
      {cardModalOpen && dealer && (
        <ModalFrame title="Guvenli online kart odemesi" onClose={() => setCardModalOpen(false)}>
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <FormInput label="Kart uzerindeki ad soyad" value={cardForm.cardHolder} onChange={(cardHolder) => setCardForm({ ...cardForm, cardHolder })} />
              <FormInput label="Kart numarasi" value={cardForm.cardNumber} onChange={(cardNumber) => setCardForm({ ...cardForm, cardNumber })} />
              <div className="grid gap-3 md:grid-cols-4">
                <FormInput label="Ay" value={cardForm.expiryMonth} onChange={(expiryMonth) => setCardForm({ ...cardForm, expiryMonth })} />
                <FormInput label="Yil" value={cardForm.expiryYear} onChange={(expiryYear) => setCardForm({ ...cardForm, expiryYear })} />
                <FormInput label="CVV" type="password" value={cardForm.cvv} onChange={(cvv) => setCardForm({ ...cardForm, cvv })} />
                <FormSelect label="Taksit" value={String(cardForm.installments)} onChange={(installments) => setCardForm({ ...cardForm, installments: parseNumber(installments) || 1 })} options={[1, 2, 3, 6, 9].map((value) => ({ label: `${value} taksit`, value: String(value) }))} />
              </div>
              <FormInput label="Odenecek tutar TL" type="number" value={String(cardForm.amountTry)} onChange={(amountTry) => setCardForm({ ...cardForm, amountTry: positiveNumber(amountTry) })} />
              <div className="rounded-2xl border border-line bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                Kart bilgileri veritabanina kaydedilmez. Sandbox modunda <b>4242 4242 4242 4242</b> basarili, sonu <b>0001</b> olan kart basarisiz sonucu simule eder.
              </div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-2xl">
              <div className="text-sm text-slate-300">Odenecek tutar</div>
              <div className="mt-2 text-3xl font-black">{money(positiveNumber(cardForm.amountTry))}</div>
              <div className="mt-1 text-sm text-slate-300">{money(usdFromTry(positiveNumber(cardForm.amountTry), usdRate), 'USD')}</div>
              <div className="mt-6 space-y-2 text-xs text-slate-400">
                <div>Cari: {dealer.companyName}</div>
                <div>POS: Sandbox / PayTR-iyzico-Param hazir</div>
                <div>CVV saklanmaz, sadece sonuc loglanir.</div>
              </div>
              <Button className="mt-6 w-full justify-center" onClick={submitCardPayment} icon={<CreditCard size={17} />}>Guvenli odeme yap</Button>
            </div>
          </div>
        </ModalFrame>
      )}
    </section>
  );
}

function OrderDetailModal({ order, products, accounts, isAdmin, onClose, onApprove, onNotice, onRefresh }: { order: Order; products: Product[]; accounts: Account[]; isAdmin: boolean; onClose: () => void; onApprove: (order: Order) => Promise<void>; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const account = accounts.find((item) => item.id === order.accountId);
  async function setStatus(status: string) {
    try {
      await apiPost(`/orders/${order.id}/status`, { status });
      await onRefresh();
      onNotice(`Siparis durumu guncellendi: ${status}`);
      onClose();
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  return (
    <ModalFrame title={`Siparis detayi - ${order.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Bayi/Cari" value={order.accountName ?? order.dealerName ?? account?.companyName ?? order.accountId} />
          <Info label="Kullanici" value={order.userName ?? order.userId ?? '-'} />
          <Info label="Telefon" value={order.phone ?? account?.phone ?? '-'} />
          <Info label="Durum" value={order.status} />
          <Info label="Tarih" value={new Date(order.createdAt).toLocaleString('tr-TR')} />
          <Info label="Kur" value={String(order.exchangeRate ?? '-')} />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line dark:border-slate-700">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3 text-left">Urun</th><th className="p-3">Adet</th><th className="p-3">Birim TL/USD</th><th className="p-3">Toplam TL/USD</th></tr></thead>
            <tbody>{(order.items ?? []).map((item) => {
              const product = products.find((candidate) => candidate.id === item.productId);
              return <tr key={`${order.id}-${item.productId}`} className="border-t border-line dark:border-slate-700"><td className="p-3 font-semibold">{item.productName ?? product?.name ?? item.productId}</td><td className="p-3 text-center">{item.quantity}</td><td className="p-3"><DualMoney compact tryValue={item.unitPriceTry ?? product?.dealerTry ?? 0} usdValue={item.unitPriceUsd ?? product?.dealerUsd ?? 0} /></td><td className="p-3"><DualMoney compact tryValue={item.lineTotalTry ?? 0} usdValue={item.lineTotalUsd ?? 0} /></td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DualSummary label="Genel toplam" tryValue={order.totalTry} usdValue={order.totalUsd} strong />
          <div className="rounded-2xl border border-line bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"><div className="font-bold text-slate-500">Aciklama</div><div className="mt-1">{order.description || '-'}</div></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
          {isAdmin && order.status === 'Beklemede' && <Button onClick={() => onApprove(order)}>Onayla / Satisa donustur</Button>}
          {isAdmin && <Button variant="soft" onClick={() => setStatus('Iptal edildi')}>Iptal et</Button>}
          {isAdmin && <Button variant="soft" onClick={() => setStatus('Iptal edildi')}>Reddet</Button>}
          <Button variant="soft" onClick={onClose}>Kapat</Button>
        </div>
      </div>
    </ModalFrame>
  );
}

type PurchaseLineDraft = { uid: string; productId: string; quantity: number; priceTry: number; priceUsd: number; vatRate: number; gross: boolean };

function purchaseUid() {
  return Math.random().toString(36).slice(2, 10);
}

function PurchasesView({ usdRate, accounts, products, purchases, supplierPayments, onNotice, onRefresh }: { usdRate: number; accounts: Account[]; products: Product[]; purchases: Purchase[]; supplierPayments: SupplierPayment[]; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const suppliers = accounts.filter((item) => item.type === 'TEDARIKCI');
  const emptyLine = (): PurchaseLineDraft => ({ uid: purchaseUid(), productId: '', quantity: 1, priceTry: 0, priceUsd: 0, vatRate: 20, gross: false });
  const [draft, setDraft] = useState({ supplierId: suppliers[0]?.id ?? '', currency: 'TRY', invoiceNo: '', date: new Date().toISOString().slice(0, 10), paymentStatus: 'Bekliyor', description: '' });
  const [lines, setLines] = useState<PurchaseLineDraft[]>([emptyLine()]);
  const [pasteText, setPasteText] = useState('');
  const [payment, setPayment] = useState({ supplierId: suppliers[0]?.id ?? '', method: 'Havale/EFT', currency: 'TRY', amount: 1000, description: '' });
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const filledLines = lines.filter((line) => line.productId && line.quantity > 0);
  const lineNetTry = (line: PurchaseLineDraft) => line.gross ? netFromGross(line.priceTry, line.vatRate) : line.priceTry;
  const lineNetUsd = (line: PurchaseLineDraft) => line.gross ? netFromGross(line.priceUsd, line.vatRate) : line.priceUsd;
  const lineGrossTry = (line: PurchaseLineDraft) => line.gross ? line.priceTry : grossFromNet(line.priceTry, line.vatRate);
  const lineGrossUsd = (line: PurchaseLineDraft) => line.gross ? line.priceUsd : grossFromNet(line.priceUsd, line.vatRate);
  const subtotalTry = filledLines.reduce((sum, line) => sum + lineNetTry(line) * line.quantity, 0);
  const subtotalUsd = filledLines.reduce((sum, line) => sum + lineNetUsd(line) * line.quantity, 0);
  const vatTry = filledLines.reduce((sum, line) => sum + (lineGrossTry(line) - lineNetTry(line)) * line.quantity, 0);
  const vatUsd = filledLines.reduce((sum, line) => sum + (lineGrossUsd(line) - lineNetUsd(line)) * line.quantity, 0);
  const totalTry = subtotalTry + vatTry;
  const totalUsd = subtotalUsd + vatUsd;
  function setLine(uid: string, patch: Partial<PurchaseLineDraft>) {
    setLines((current) => {
      const next = current.map((line) => line.uid === uid ? { ...line, ...patch } : line);
      const last = next[next.length - 1];
      return last?.productId ? [...next, emptyLine()] : next;
    });
  }
  function selectProduct(uid: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    setLine(uid, { productId, priceTry: product?.purchaseTry ?? 0, priceUsd: product?.purchaseUsd ?? 0, quantity: productId ? 1 : 0 });
  }
  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }
  function removeLine(uid: string) {
    setLines((current) => current.length <= 1 ? [emptyLine()] : current.filter((line) => line.uid !== uid));
  }
  function importPastedRows(text: string) {
    const imported = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => {
      const cells = row.split(/\t|;/).map((cell) => cell.trim());
      const key = (cells[0] ?? '').toLowerCase();
      const product = products.find((item) => item.code.toLowerCase() === key || item.barcode.toLowerCase() === key || item.name.toLowerCase().includes(key));
      if (!product) return null;
      return {
        uid: purchaseUid(),
        productId: product.id,
        quantity: positiveNumber(cells[1] ?? 1) || 1,
        priceTry: positiveNumber(cells[2] ?? product.purchaseTry),
        priceUsd: positiveNumber(cells[3] ?? product.purchaseUsd),
        vatRate: positiveNumber(cells[4] ?? 20),
        gross: false,
      };
    }).filter(Boolean) as PurchaseLineDraft[];
    if (!imported.length) return onNotice('Yapistirilan satirlarda eslesen urun bulunamadi');
    setLines([...imported, emptyLine()]);
    setPasteText('');
    onNotice(`${imported.length} alis satiri eklendi`);
  }
  async function createPurchase() {
    try {
      if (!draft.supplierId) throw new Error('Tedarikci secimi zorunlu');
      if (!filledLines.length) throw new Error('En az bir urun satiri eklenmeli');
      await apiPost('/purchases', {
        supplierId: draft.supplierId,
        currency: draft.currency,
        invoiceNo: draft.invoiceNo || undefined,
        date: draft.date ? new Date(draft.date).toISOString() : undefined,
        paymentStatus: draft.paymentStatus,
        description: draft.description,
        items: filledLines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceTry: lineNetTry(line), unitPriceUsd: lineNetUsd(line), vatRate: line.vatRate })),
      });
      await onRefresh();
      setLines([emptyLine()]);
      onNotice('Alis kaydi olustu, stok artti ve tedarikci bakiyesi islendi');
    } catch (error) { onNotice(errorMessage(error)); }
  }
  async function createSupplierPayment() {
    try {
      const result = await apiPost<SupplierPayment>('/supplier-payments', payment);
      await onRefresh();
      onNotice(`Tedarikci odemesi kaydedildi: ${result.receiptNo}`);
    } catch (error) { onNotice(errorMessage(error)); }
  }
  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel title="Alis faturasi olustur">
          <div className="grid gap-3 md:grid-cols-5">
            <FormSelect label="Tedarikci" value={draft.supplierId} onChange={(supplierId) => setDraft({ ...draft, supplierId })} options={suppliers.map((item) => ({ label: item.companyName, value: item.id }))} />
            <FormInput label="Fatura no" value={draft.invoiceNo} onChange={(invoiceNo) => setDraft({ ...draft, invoiceNo })} />
            <FormInput label="Alis tarihi" type="date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
            <FormSelect label="Para birimi" value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
            <FormSelect label="Odeme durumu" value={draft.paymentStatus} onChange={(paymentStatus) => setDraft({ ...draft, paymentStatus })} options={['Bekliyor', 'Kismi', 'Odendi'].map((item) => ({ label: item, value: item }))} />
          </div>
          <div className="mt-3"><FormInput label="Aciklama" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} /></div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white/70 dark:border-slate-700 dark:bg-slate-900/40">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50/90 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Adet', 'Alis TL', 'Alis USD', 'KDV', 'KDV dahil', 'Satir toplam', 'Islem'].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead>
              <tbody>
                {lines.map((line) => {
                  const product = products.find((item) => item.id === line.productId);
                  return (
                    <tr key={line.uid} className="border-t border-line dark:border-slate-700">
                      <td className="px-3 py-2"><select value={line.productId} onChange={(event) => selectProduct(line.uid, event.target.value)} className="h-10 w-full rounded-xl border border-line bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Urun sec</option>{products.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select>{product && <div className="mt-1 text-xs text-slate-500">Stok: {product.stock} adet</div>}</td>
                      <td className="px-3 py-2"><input type="number" min="1" value={line.quantity} onChange={(event) => setLine(line.uid, { quantity: positiveNumber(event.target.value) || 1 })} className="h-10 w-20 rounded-xl border border-line bg-white px-2 text-center font-bold dark:border-slate-700 dark:bg-slate-900" /></td>
                      <td className="px-3 py-2"><input value={line.priceTry} onChange={(event) => setLine(line.uid, { priceTry: positiveNumber(event.target.value) })} className="h-10 w-28 rounded-xl border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
                      <td className="px-3 py-2"><input value={line.priceUsd} onChange={(event) => setLine(line.uid, { priceUsd: positiveNumber(event.target.value) })} className="h-10 w-28 rounded-xl border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
                      <td className="px-3 py-2"><select value={line.vatRate} onChange={(event) => setLine(line.uid, { vatRate: positiveNumber(event.target.value) })} className="h-10 rounded-xl border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900">{[0, 1, 10, 20].map((rate) => <option key={rate} value={rate}>%{rate}</option>)}</select></td>
                      <td className="px-3 py-2"><input type="checkbox" checked={line.gross} onChange={(event) => setLine(line.uid, { gross: event.target.checked })} /></td>
                      <td className="px-3 py-2"><DualMoney compact tryValue={lineGrossTry(line) * line.quantity} usdValue={lineGrossUsd(line) * line.quantity} /></td>
                      <td className="px-3 py-2"><IconButton title="Satir sil" onClick={() => removeLine(line.uid)}><Trash2 size={16} /></IconButton></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
            <div className="space-y-2">
              <Toolbar><Button variant="soft" onClick={addLine} icon={<Plus size={17} />}>Satir ekle</Button><Button disabled={!filledLines.length || !draft.supplierId} onClick={createPurchase} icon={<PackagePlus size={17} />}>Alisi tamamla</Button></Toolbar>
              <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} onPaste={(event) => { const text = event.clipboardData.getData('text'); if (text) setTimeout(() => importPastedRows(text), 0); }} placeholder="Excel'den yapistir: Urun kodu/barkod/ad, adet, TL fiyat, USD fiyat, KDV" className="h-24 w-full rounded-2xl border border-line bg-white/90 p-3 text-sm outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80" />
            </div>
            <div className="rounded-2xl border border-line bg-slate-50 p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900">
              <Summary label="Ara toplam" value={draft.currency === 'USD' ? money(subtotalUsd, 'USD') : money(subtotalTry)} />
              <Summary label="KDV" value={draft.currency === 'USD' ? money(vatUsd, 'USD') : money(vatTry)} />
              <Summary label="Genel toplam" value={draft.currency === 'USD' ? money(totalUsd, 'USD') : money(totalTry)} strong />
              <div className="mt-3 text-xs font-semibold text-slate-500">Karsilik: {draft.currency === 'USD' ? money(totalTry) : money(totalUsd, 'USD')}</div>
            </div>
          </div>
        </Panel>
        <Panel title="Tedarikci odemesi">
          <div className="grid gap-3">
            <FormSelect label="Tedarikci" value={payment.supplierId} onChange={(supplierId) => setPayment({ ...payment, supplierId })} options={suppliers.map((item) => ({ label: item.companyName, value: item.id }))} />
            <FormSelect label="Odeme turu" value={payment.method} onChange={(method) => setPayment({ ...payment, method })} options={['Nakit', 'Havale/EFT', 'Kredi karti'].map((item) => ({ label: item, value: item }))} />
            <FormSelect label="Para birimi" value={payment.currency} onChange={(currency) => setPayment({ ...payment, currency })} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
            <FormNumber label="Tutar" value={payment.amount} setValue={(amount) => setPayment({ ...payment, amount })} />
            <FormInput label="Aciklama" value={payment.description} onChange={(description) => setPayment({ ...payment, description })} />
          </div>
          <div className="mt-4"><Button onClick={createSupplierPayment} icon={<WalletCards size={17} />}>Odeme yap</Button></div>
        </Panel>
      </div>
      <PurchaseRecordsTable purchases={purchases} products={products} accounts={accounts} onSelect={setSelectedPurchase} />
      <DataTable title="Tedarikci odemeleri" headers={['Makbuz', 'Tedarikci', 'Yontem', 'Tutar', 'Tarih']} rows={supplierPayments.map((item) => [item.receiptNo, item.supplierName ?? item.supplierId, item.method, money(item.amount, item.currency === 'USD' ? 'USD' : 'TL'), new Date(item.createdAt).toLocaleDateString('tr-TR')])} />
      {selectedPurchase && <PurchaseDetailModal purchase={selectedPurchase} products={products} accounts={accounts} fallbackRate={usdRate} onClose={() => setSelectedPurchase(null)} onNotice={onNotice} onSaved={async (updated) => { setSelectedPurchase(updated); await onRefresh(); }} />}
    </section>
  );
}

function PurchaseRecordsTable({ purchases, products, accounts, onSelect }: { purchases: Purchase[]; products: Product[]; accounts: Account[]; onSelect: (purchase: Purchase) => void }) {
  const [expandedId, setExpandedId] = useState(purchases[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('Son 3 Ay');
  const [showCancelled, setShowCancelled] = useState(false);
  const filtered = purchases.filter((purchase) => {
    const supplier = purchase.supplierName ?? accounts.find((account) => account.id === purchase.supplierId)?.companyName ?? purchase.supplierId;
    const text = `${supplier} ${purchase.invoiceNo ?? ''} ${purchase.id}`.toLowerCase();
    const queryOk = text.includes(query.toLowerCase());
    const cancelledOk = showCancelled || purchase.paymentStatus !== 'Iptal';
    if (!queryOk || !cancelledOk) return false;
    if (period === 'Tumu') return true;
    const days = period === 'Son 1 Ay' ? 31 : period === 'Son 6 Ay' ? 186 : 93;
    return Date.now() - new Date(purchase.createdAt).getTime() <= days * 86400000;
  });
  const expanded = filtered.find((purchase) => purchase.id === expandedId) ?? filtered[0];
  const expandedLines = expanded?.items ?? [];
  const supplierName = (purchase: Purchase) => purchase.supplierName ?? accounts.find((account) => account.id === purchase.supplierId)?.companyName ?? purchase.supplierId;
  const product = (id: string) => products.find((item) => item.id === id);
  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-panel backdrop-blur dark:border-slate-700/70 dark:bg-[#17202a]/90">
      <div className="border-b border-line/80 p-4 dark:border-slate-700/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-black tracking-tight">Alis kayitlari</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Plus size={17} />}>Kayitli tedarikciden alis gir</Button>
            <Button variant="soft" icon={<Plus size={17} />}>Yeni tedarikciden alis gir</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[320px_140px_1fr_auto]">
          <select className="h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <option>Tum belge tipleri</option>
            <option>Faturalanmis</option>
            <option>Bekleyen</option>
          </select>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {['Son 1 Ay', 'Son 3 Ay', 'Son 6 Ay', 'Tumu'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="flex min-w-0">
            <select className="h-11 rounded-l-xl border border-r-0 border-line bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
              <option>Tedarikci ismi / Belge No</option>
            </select>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="arama... (en az 3 karakter)" className="h-11 min-w-0 flex-1 rounded-r-xl border border-line bg-white px-3 text-sm outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900"><span>Iptalleri de goster</span><input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} /></label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-700 text-xs uppercase tracking-wide text-white dark:bg-slate-950"><tr>{['', 'Tarih', 'Isim/Unvan', 'Belge No', 'Tutar', 'Durumu', 'Islem'].map((header) => <th key={header} className="px-4 py-3 font-bold">{header}</th>)}</tr></thead>
          <tbody>
            {filtered.map((purchase) => {
              const isExpanded = (expanded?.id ?? expandedId) === purchase.id;
              return (
                <>
                  <tr key={purchase.id} onClick={() => setExpandedId(isExpanded ? '' : purchase.id)} className="cursor-pointer border-t border-line/70 transition hover:bg-slate-50 dark:border-slate-700/70 dark:hover:bg-slate-900">
                    <td className="px-4 py-3"><span className={`grid h-5 w-5 place-items-center rounded-full text-sm font-black text-white ${isExpanded ? 'bg-slate-600' : 'bg-emerald-500'}`}>{isExpanded ? '-' : '+'}</span></td>
                    <td className="px-4 py-3">{new Date(purchase.createdAt).toLocaleDateString('tr-TR')}</td>
                    <td className="px-4 py-3 font-semibold">{supplierName(purchase)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{purchase.invoiceNo ?? purchase.id}</td>
                    <td className="px-4 py-3 font-bold">{money(purchase.total, purchase.currency === 'USD' ? 'USD' : 'TL')}</td>
                    <td className="px-4 py-3"><span className="rounded bg-emerald-500 px-2 py-1 text-xs font-black text-white">{purchase.paymentStatus === 'Odendi' ? 'Faturalanmis' : purchase.paymentStatus ?? 'Bekliyor'}</span></td>
                    <td className="px-4 py-3"><Button variant="soft" onClick={() => onSelect(purchase)}>Detay</Button></td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${purchase.id}-expanded`} className="border-t border-line bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="mb-3 flex flex-wrap gap-2">
                          <Button variant="soft" onClick={() => onSelect(purchase)} icon={<PackagePlus size={16} />}>Alis ekranina git</Button>
                          <Button variant="soft" icon={<UserRound size={16} />}>Tedarikci ekranina git</Button>
                          <Button variant="soft" onClick={() => onSelect(purchase)} icon={<FileDown size={16} />}>Yazdir</Button>
                        </div>
                        <table className="w-full min-w-[760px] text-sm">
                          <thead><tr className="border-b border-slate-900/20 dark:border-slate-600">{['Urun', 'Birim Fiyat', 'Tutar (KDV Dahil)'].map((header) => <th key={header} className="px-3 py-2 text-left font-black">{header}</th>)}</tr></thead>
                          <tbody>
                            {expandedLines.map((line) => {
                              const item = product(line.productId);
                              const unitTry = line.unitPriceTry ?? 0;
                              const unitUsd = line.unitPriceUsd ?? 0;
                              const grossTry = grossFromNet((line.lineTotalTry ?? unitTry * line.quantity), line.vatRate ?? 20);
                              const grossUsd = grossFromNet((line.lineTotalUsd ?? unitUsd * line.quantity), line.vatRate ?? 20);
                              return (
                                <tr key={`${purchase.id}-${line.productId}`} className="border-b border-line/60 dark:border-slate-700">
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-3">
                                      <ProductThumb product={item ?? { name: line.productName ?? line.productId }} />
                                      <div><span className="font-bold">{line.quantity} x </span>{line.productName ?? item?.name ?? line.productId}<div className="mt-1 text-xs text-slate-500">{[item?.code, item?.barcode].filter(Boolean).join(' / ')}</div></div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3"><DualMoney compact tryValue={unitTry} usdValue={unitUsd} /></td>
                                  <td className="px-3 py-3"><DualMoney compact tryValue={grossTry} usdValue={grossUsd} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length && <div className="p-6 text-sm text-slate-500">Filtreye uygun alis kaydi bulunamadi.</div>}
    </section>
  );
}

type TestRow = { name: string; status: 'Basarili' | 'Hatali' | 'Uyari'; message: string };

function AccessDenied() {
  return <Panel title="Yetkisiz erisim"><p className="text-sm font-semibold text-rose">Bu ekrana erisim yetkiniz yok.</p></Panel>;
}

function UsersView({ users, accounts, onSave, onNotice }: { users: UserSession[]; accounts: Account[]; onSave: (payload: { id?: string; name: string; email: string; username?: string; password?: string; role: UserSession['role']; accountId?: string; phone?: string; active?: boolean }) => Promise<void>; onNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserSession | null>(null);
  const accountName = (id?: string) => accounts.find((account) => account.id === id)?.companyName ?? '-';
  return (
    <section className="space-y-5">
      <Panel title="Kullanicilar" actions={<Button onClick={() => { setEditing(null); setOpen(true); }} icon={<UserRound size={17} />}>Yeni kullanici</Button>}>
        <p className="text-sm text-slate-500">Admin tum kullanicilari gorur, yeni admin/personel/bayi/musteri hesabi olusturur ve aktif/pasif durumunu yonetir.</p>
      </Panel>
      <DataTable
        title="Kullanici listesi"
        headers={['Ad soyad', 'Firma/Cari', 'Telefon', 'E-posta', 'Kullanici adi', 'Rol', 'Durum', 'Islem']}
        rows={users.map((user) => [
          user.name,
          accountName(user.accountId),
          user.phone ?? '-',
          user.email,
          user.username ?? '-',
          <Badge key={`${user.id}-role`}>{user.role}</Badge>,
          user.active === false ? 'Pasif' : 'Aktif',
          <Toolbar key={`${user.id}-actions`}>
            <Button variant="soft" onClick={() => { setEditing(user); setOpen(true); }}>Duzenle</Button>
            <Button variant="soft" onClick={async () => {
              try {
                await onSave({ id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, accountId: user.accountId, phone: user.phone, active: user.active === false });
              } catch (error) {
                onNotice(errorMessage(error));
              }
            }}>{user.active === false ? 'Aktife al' : 'Pasife al'}</Button>
          </Toolbar>,
        ])}
      />
      {open && <UserEditModal user={editing} accounts={accounts} onClose={() => setOpen(false)} onSave={async (payload) => { await onSave(payload); setOpen(false); }} />}
    </section>
  );
}

function UserEditModal({ user, accounts, onClose, onSave }: { user: UserSession | null; accounts: Account[]; onClose: () => void; onSave: (payload: { id?: string; name: string; email: string; username?: string; password?: string; role: UserSession['role']; accountId?: string; phone?: string; active?: boolean }) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? '',
    accountId: user?.accountId ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    username: user?.username ?? '',
    password: '',
    role: user?.role ?? 'DEALER',
    active: user?.active !== false,
  });
  const roleOptions: { label: string; value: UserSession['role'] }[] = [
    { label: 'ADMIN', value: 'ADMIN' },
    { label: 'PERSONEL', value: 'PERSONEL' },
    { label: 'BAYI', value: 'DEALER' },
    { label: 'MUSTERI', value: 'CUSTOMER' },
  ];
  async function save() {
    if (!form.name.trim() || !form.email.trim()) return;
    if (!user && form.password.length < 6) return;
    setSaving(true);
    try {
      const portalRole = form.role === 'CUSTOMER' || form.role === 'DEALER';
      await onSave({
        id: user?.id,
        name: form.name,
        email: form.email,
        username: form.username || undefined,
        password: form.password || undefined,
        role: form.role as UserSession['role'],
        accountId: portalRole ? form.accountId : form.accountId || undefined,
        phone: form.phone || undefined,
        active: form.active,
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalFrame title={user ? 'Kullanici duzenle' : 'Yeni kullanici'} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <FormInput label="Ad soyad" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <FormSelect label="Firma / cari" value={form.accountId} onChange={(accountId) => setForm({ ...form, accountId })} options={[{ label: 'Cari baglantisi yok', value: '' }, ...accounts.map((account) => ({ label: account.companyName, value: account.id }))]} />
        <FormInput label="Telefon" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <FormInput label="E-posta" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <FormInput label="Kullanici adi" value={form.username} onChange={(username) => setForm({ ...form, username })} />
        <FormInput label={user ? 'Yeni sifre (bos birakilabilir)' : 'Gecici sifre'} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
        <FormSelect label="Rol" value={form.role} onChange={(role) => setForm({ ...form, role: role as UserSession['role'] })} options={roleOptions} />
        <label className="mt-6 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Aktif</label>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
        <Button variant="soft" onClick={onClose}>Vazgec</Button>
        <Button disabled={saving || !form.name || !form.email || (!user && form.password.length < 6) || ((form.role === 'CUSTOMER' || form.role === 'DEALER') && !form.accountId)} onClick={save}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button>
      </div>
    </ModalFrame>
  );
}

function PanelTestView({ onNotice, onRefresh }: { onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [rows, setRows] = useState<TestRow[]>([]);
  async function runTests() {
    const warning = 'Canlı sistemde test kaydı oluşturma pasif.';
    setRows([{ name: 'Panel testi', status: 'Uyari', message: warning }]);
    onNotice(warning);
    await onRefresh();
  }
  return <section className="space-y-5"><Panel title="Sistem Testi" actions={<Button variant="soft" onClick={runTests} icon={<RefreshCcw size={17} />}>Canli modda pasif</Button>}><p className="text-sm text-slate-500">Canli sistemde otomatik test kaydi olusturma kapatildi. Test islemleri yalnizca ayrilmis test ortaminda calistirilmalidir.</p></Panel><DataTable title="Test sonuclari" headers={['Test', 'Durum', 'Mesaj']} rows={rows.map((row) => [row.name, <Badge key={row.name}>{row.status}</Badge>, row.message])} /></section>;
}

function OperationsView({ usdRate, accounts, products, purchases, quotes, onDebt, onNotice, onRefresh }: { usdRate: number; accounts: Account[]; products: Product[]; purchases: Purchase[]; quotes: Quote[]; onDebt: (id: string) => void; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const supplier = accounts.find((item) => item.type === 'TEDARIKCI');
  const customer = accounts.find((item) => item.type !== 'TEDARIKCI');
  const product = products[0];
  async function createPurchase() {
    try {
      if (!supplier || !product) throw new Error('Tedarikci ve urun gerekli');
      const purchase = await apiPost<Purchase>('/purchases', { supplierId: supplier.id, currency: 'TRY', items: [{ productId: product.id, quantity: 5 }] });
      await onRefresh();
      onNotice(`Alis ${purchase.id} olustu, stok artti`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function createQuote() {
    try {
      if (!customer || !product) throw new Error('Musteri ve urun gerekli');
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 15);
      const quote = await apiPost<Quote>('/quotes', { accountId: customer.id, currency: 'TRY', discount: 100, validUntil: validUntil.toISOString(), items: [{ productId: product.id, quantity: 2 }] });
      const preview = await apiGet<{ documentNo: string }>('/quotes/' + quote.id + '/pdf-preview');
      await onRefresh();
      onNotice(`Teklif ${preview.documentNo} PDF onizlemesi hazir`);
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }

  async function backupData() {
    const data = await apiGet<Record<string, unknown>>('/backup');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
    link.download = `erp-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    onNotice('Veri yedegi indirildi');
  }

  async function importBackup(file?: File) {
    if (!file) return;
    const data = JSON.parse(await file.text());
    await apiPost('/backup/import', data);
    await onRefresh();
    onNotice('Yedek ice aktarildi');
  }

  return (
    <section className="space-y-5">
      <Panel title="Para birimi ayarlari">
        <div className="grid gap-3 md:grid-cols-4">
          <FormSelect label="Varsayilan para birimi" value="TRY" onChange={() => undefined} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
          <FormSelect label="Kur gosterimi" value="both" onChange={() => undefined} options={[{ label: 'TL/USD birlikte', value: 'both' }, { label: 'Sadece TL', value: 'try' }, { label: 'Sadece USD', value: 'usd' }]} />
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> USD bazli satis aktif</label>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> TL bazli satis aktif</label>
        </div>
        <div className="mt-3 text-sm text-slate-500">Canli kur: 1 USD = {money(usdRate)}</div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Alis akisi"><Button onClick={createPurchase} icon={<PackagePlus size={17} />}>Alis olustur</Button></Panel>
        <Panel title="Teklif akisi"><Button onClick={createQuote} icon={<FileText size={17} />}>PDF teklif onizle</Button></Panel>
        <Panel title="WhatsApp"><Button variant="soft" onClick={() => customer && onDebt(customer.id)} icon={<MessageCircle size={17} />}>Borc mesaji</Button></Panel>
        <Panel title="Veri yedekleme"><div className="space-y-3"><Button onClick={backupData} icon={<FileDown size={17} />}>Verileri yedekle</Button><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-line px-3 text-sm font-semibold text-ocean dark:border-slate-700"><Upload size={16} /> JSON ice aktar<input type="file" accept=".json" className="hidden" onChange={(event) => void importBackup(event.target.files?.[0])} /></label></div></Panel>
        <Panel title="Kullanici guvenligi"><div className="text-sm text-slate-500">Canli sistemde varsayilan test kullanicisi gosterilmez.</div></Panel>
      </div>
      <DataTable title="Alis kayitlari" headers={['Fis', 'Tedarikci', 'Tutar', 'Para', 'Tarih']} rows={purchases.map((item) => [item.id, item.supplierName ?? item.supplierId, money(item.total, item.currency === 'USD' ? 'USD' : 'TL'), item.currency, new Date(item.createdAt).toLocaleDateString('tr-TR')])} />
      <DataTable title="Teklifler" headers={['No', 'Cari', 'Tutar', 'Durum', 'Gecerlilik']} rows={quotes.map((item) => [item.id, item.accountName ?? item.accountId, money(item.total, item.currency === 'USD' ? 'USD' : 'TL'), item.status, new Date(item.validUntil).toLocaleDateString('tr-TR')])} />
      <IntegrationsView accounts={accounts} onDebt={onDebt} />
    </section>
  );
}

function IntegrationsView({ accounts, onDebt }: { accounts: Account[]; onDebt: (id: string) => void }) {
  const integrations = ['WhatsApp Business API', 'Tosla sanal POS', 'WooCommerce', 'Shopify', 'PDF/Excel', 'Webhook'];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {integrations.map((item) => (
        <div key={item} className="rounded border border-line bg-white p-5 shadow-panel transition hover:-translate-y-0.5 dark:border-slate-700 dark:bg-[#17202a]">
          <div className="flex items-center gap-3">
            <CreditCard className="text-ocean" />
            <h2 className="font-bold">{item}</h2>
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">REST endpoint, webhook ve islem log altyapisi hazir.</p>
        </div>
      ))}
      <Panel title="WhatsApp hizli aksiyon">
        <div className="space-y-3">
          {accounts.map((account) => <Button key={account.id} variant="soft" onClick={() => onDebt(account.id)} icon={<MessageCircle size={17} />}>{account.companyName}</Button>)}
        </div>
      </Panel>
    </div>
  );
}

function AccountModal({ initial, onClose, onSave }: { initial: Account | null; onClose: () => void; onSave: (payload: Partial<Account>) => void }) {
  const [form, setForm] = useState<Partial<Account>>(initial ?? { type: 'MUSTERI', dueDay: 30, riskLimit: 50000, balanceTry: 0, balanceUsd: 0 });
  return (
    <ModalFrame title={initial ? 'Cari duzenle' : 'Cari ekle'} onClose={onClose}>
      <FormGrid>
        <FormInput label="Cari kod" value={form.code} onChange={(code) => setForm({ ...form, code })} />
        <FormSelect label="Tip" value={form.type ?? 'MUSTERI'} onChange={(type) => setForm({ ...form, type })} options={['MUSTERI', 'BAYI', 'TEDARIKCI'].map((item) => ({ label: item, value: item }))} />
        <FormInput label="Firma adi" value={form.companyName} onChange={(companyName) => setForm({ ...form, companyName })} />
        <FormInput label="Yetkili" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
        <FormInput label="Telefon" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <FormInput label="WhatsApp" value={form.whatsapp} onChange={(whatsapp) => setForm({ ...form, whatsapp })} />
        <FormInput label="E-posta" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <FormInput label="Vergi no" value={form.taxNumber} onChange={(taxNumber) => setForm({ ...form, taxNumber })} />
        <FormNumber label="Risk limiti" value={Number(form.riskLimit ?? 0)} setValue={(riskLimit) => setForm({ ...form, riskLimit })} />
        <FormNumber label="Vade gunu" value={Number(form.dueDay ?? 0)} setValue={(dueDay) => setForm({ ...form, dueDay })} />
      </FormGrid>
      <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-line bg-white px-5 py-4 dark:border-slate-700 dark:bg-[#17202a]">
        <Button variant="soft" onClick={onClose}>Vazgec</Button>
        <Button disabled={!form.companyName || !form.code} onClick={() => onSave(form)} icon={<Plus size={17} />}>Cariyi kaydet</Button>
      </div>
    </ModalFrame>
  );
}

function ProductModal({ initial, products, categories, usdRate, onClose, onSave, onNotice, onRefresh }: { initial: Product | null; products: Product[]; categories: Category[]; usdRate: number; onClose: () => void; onSave: (payload: Partial<Product>) => void; onNotice: (message: string) => void; onRefresh: () => Promise<void> }) {
  const defaultCategory = categories.find((item) => item.active)?.name ?? '';
  const [form, setForm] = useState<Partial<Product>>(initial ?? { category: defaultCategory, warehouse: 'Merkez Depo', stock: 10, criticalStock: 5, fixedTryPrice: false });
  const [priceCurrency, setPriceCurrency] = useState<'TRY' | 'USD'>('TRY');
  const [localError, setLocalError] = useState('');
  const vatRate = Number(form.vatRate ?? 20);
  function setPurchaseNet(value: number) {
    const net = positiveNumber(value);
    if (priceCurrency === 'USD') setForm({ ...form, purchaseUsd: net, purchaseTry: roundMoney(tryFromUsd(net, usdRate)) });
    else setForm({ ...form, purchaseTry: net, purchaseUsd: roundMoney(usdFromTry(net, usdRate)) });
  }
  function setPurchaseGross(value: number) {
    setPurchaseNet(netFromGross(positiveNumber(value), vatRate));
  }
  function setSaleNet(value: number) {
    const net = positiveNumber(value);
    if (priceCurrency === 'USD') setForm({ ...form, saleUsd: net, saleTry: roundMoney(tryFromUsd(net, usdRate)) });
    else setForm({ ...form, saleTry: net, saleUsd: roundMoney(usdFromTry(net, usdRate)) });
  }
  function setSaleGross(value: number) {
    setSaleNet(netFromGross(positiveNumber(value), vatRate));
  }
  function priceValue(tryValue?: number, usdValue?: number) {
    return priceCurrency === 'USD' ? Number(usdValue ?? 0) : Number(tryValue ?? 0);
  }
  function counterpart(tryValue?: number, usdValue?: number) {
    return priceCurrency === 'USD' ? money(Number(tryValue ?? 0)) : money(Number(usdValue ?? 0), 'USD');
  }
  function loadImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, imageUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }
  function generateBarcode() {
    const used = new Set(products.map((product) => product.barcode));
    let barcode = '';
    do {
      barcode = `868${String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0')}`;
    } while (used.has(barcode));
    setForm((current) => ({ ...current, barcode }));
  }
  async function quickCategory() {
    try {
      const name = `Yeni Kategori ${categories.length + 1}`;
      await apiPost<Category>('/categories', { name, active: true, vatRate: 20, defaultProfitRate: 25, icon: 'Tags' });
      await onRefresh();
      setForm((current) => ({ ...current, category: name }));
      onNotice('Yeni kategori eklendi');
    } catch (error) { onNotice(errorMessage(error)); }
  }
  return (
    <ModalFrame title={initial ? 'Urun duzenle' : 'Urun ekle'} onClose={onClose}>
      <div className="mb-4 flex items-center gap-4">
        <ProductThumb product={form as Product} />
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-line px-3 text-sm font-semibold dark:border-slate-700">
          <ImagePlus size={17} /> Gorsel yukle
          <input type="file" accept="image/*" className="hidden" onChange={(event) => loadImage(event.target.files?.[0])} />
        </label>
        <Button variant="soft" onClick={generateBarcode} icon={<Barcode size={17} />}>Otomatik Barkod Olustur</Button>
      </div>
      <FormGrid>
        <FormInput label="Urun adi" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <FormInput label="Urun kodu" value={form.code} onChange={(code) => setForm({ ...form, code })} />
        <FormInput label="Barkod" value={form.barcode} onChange={(barcode) => setForm({ ...form, barcode })} />
        <div>
          <FormSelect label="Kategori" value={form.category ?? ''} onChange={(category) => setForm({ ...form, category })} options={categories.filter((item) => item.active).map((item) => ({ label: item.parentId ? `- ${item.name}` : item.name, value: item.name }))} />
          <button type="button" onClick={quickCategory} className="mt-2 text-xs font-semibold text-ocean hover:underline">Yeni kategori ekle</button>
        </div>
        <FormInput label="Marka" value={form.brand} onChange={(brand) => setForm({ ...form, brand })} />
        <FormSelect label="Depo" value={form.warehouse ?? 'Merkez Depo'} onChange={(warehouse) => setForm({ ...form, warehouse })} options={warehouses.map((item) => ({ label: item, value: item }))} />
        <FormNumber label="Stok" value={Number(form.stock ?? 0)} setValue={(stock) => setForm({ ...form, stock: positiveNumber(stock) })} />
        <FormNumber label="Kritik stok" value={Number(form.criticalStock ?? 0)} setValue={(criticalStock) => setForm({ ...form, criticalStock: positiveNumber(criticalStock) })} />
        <FormSelect label="KDV orani" value={String(vatRate)} onChange={(value) => setForm({ ...form, vatRate: Number(value) })} options={[0, 1, 10, 20].map((item) => ({ label: `%${item}`, value: String(item) }))} />
        <FormSelect label="Para birimi" value={priceCurrency} onChange={(value) => setPriceCurrency(value as 'TRY' | 'USD')} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
        <div><FormNumber label={`Alis fiyati KDV haric (${priceCurrency})`} value={priceValue(form.purchaseTry, form.purchaseUsd)} setValue={setPurchaseNet} /><div className="mt-1 text-xs text-slate-500">Karsilik: {counterpart(form.purchaseTry, form.purchaseUsd)}</div></div>
        <div><FormNumber label={`Alis fiyati KDV dahil (${priceCurrency})`} value={grossFromNet(priceValue(form.purchaseTry, form.purchaseUsd), vatRate)} setValue={setPurchaseGross} /><div className="mt-1 text-xs text-slate-500">Karsilik: {priceCurrency === 'USD' ? money(grossFromNet(Number(form.purchaseTry ?? 0), vatRate)) : money(grossFromNet(Number(form.purchaseUsd ?? 0), vatRate), 'USD')}</div></div>
        <div><FormNumber label={`Satis fiyati KDV haric (${priceCurrency})`} value={priceValue(form.saleTry, form.saleUsd)} setValue={setSaleNet} /><div className="mt-1 text-xs text-slate-500">Karsilik: {counterpart(form.saleTry, form.saleUsd)}</div></div>
        <div><FormNumber label={`Satis fiyati KDV dahil (${priceCurrency})`} value={grossFromNet(priceValue(form.saleTry, form.saleUsd), vatRate)} setValue={setSaleGross} /><div className="mt-1 text-xs text-slate-500">Karsilik: {priceCurrency === 'USD' ? money(grossFromNet(Number(form.saleTry ?? 0), vatRate)) : money(grossFromNet(Number(form.saleUsd ?? 0), vatRate), 'USD')}</div></div>
        <FormNumber label="Bayi TL" value={Number(form.dealerTry ?? 0)} setValue={(dealerTry) => setForm({ ...form, dealerTry: positiveNumber(dealerTry), dealerUsd: roundMoney(usdFromTry(positiveNumber(dealerTry), usdRate)) })} />
        <FormNumber label="Bayi USD" value={Number(form.dealerUsd ?? 0)} setValue={(dealerUsd) => setForm({ ...form, dealerUsd: positiveNumber(dealerUsd), dealerTry: form.fixedTryPrice ? form.dealerTry : roundMoney(tryFromUsd(positiveNumber(dealerUsd), usdRate)) })} />
      </FormGrid>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.fixedTryPrice)} onChange={(event) => setForm({ ...form, fixedTryPrice: event.target.checked })} /> Sabit TL fiyat kullan</label>
      <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-line bg-white px-5 py-4 dark:border-slate-700 dark:bg-[#17202a]">
        <Button variant="soft" onClick={onClose}>Vazgec</Button>
        {localError && <div className="mr-auto rounded bg-[#ffe3e9] px-3 py-2 text-sm font-semibold text-rose">{localError}</div>}
        <Button disabled={!form.name || !form.category} onClick={() => {
          if (!form.name?.trim()) return setLocalError('Urun adi zorunlu');
          if (!form.category?.trim()) return setLocalError('Kategori secimi zorunlu');
          if (positiveNumber(form.stock) < 0) return setLocalError('Stok negatif olamaz');
          if (!positiveNumber(form.saleTry) && !positiveNumber(form.saleUsd) && !positiveNumber(form.purchaseTry) && !positiveNumber(form.purchaseUsd)) return setLocalError('Satis fiyati veya alis fiyati girilmeli');
          setLocalError('');
          onSave(form);
        }} icon={<Plus size={17} />}>Urunu kaydet</Button>
      </div>
    </ModalFrame>
  );
}

function AccountDetailPage({ usdRate, detail, products, accounts, users, onCreateUser, onBack, onSale, onCollection, onPurchase, onSupplierPayment, onDebt, onNotice, onReload }: { usdRate: number; detail: AccountDetail; products: Product[]; accounts: Account[]; users: UserSession[]; onCreateUser: (payload: { name: string; email: string; username?: string; password: string; role: 'CUSTOMER' | 'DEALER'; accountId: string; phone?: string }) => Promise<UserSession>; onBack: () => void; onSale: (id: string) => void; onCollection: (id: string) => void; onPurchase: (id: string) => void; onSupplierPayment: (id: string, payload: { date: string; currency: 'TRY' | 'USD'; amount: number; method: string; description: string }) => Promise<void>; onDebt: (id: string) => void; onNotice: (message: string) => void; onReload: () => Promise<void> }) {
  const { account } = detail;
  const debtTry = account.balanceTry + tryFromUsd(account.balanceUsd, usdRate);
  const debtUsd = account.balanceUsd + usdFromTry(account.balanceTry, usdRate);
  const [tab, setTab] = useState('Cari Ekstre');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<SupplierPayment | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const accountUsers = users.filter((user) => user.accountId === account.id);
  const tabs = ['Cari Ekstre', 'Satislar', 'Tahsilatlar', 'Alislar', 'Odemeler', 'Notlar'];
  const accountSummary = [
    ['Kod', account.code],
    ['Tip', account.type],
    ['Telefon', account.phone ?? '-'],
    ['Risk limiti', money(account.riskLimit)],
    ['Vade', `${account.dueDay} gun`],
    ['TL bakiye', money(account.balanceTry), account.balanceTry > 0 ? 'debt' : account.balanceTry < 0 ? 'credit' : 'neutral'],
    ['USD bakiye', money(account.balanceUsd, 'USD'), account.balanceUsd > 0 ? 'debt' : account.balanceUsd < 0 ? 'credit' : 'neutral'],
  ] as const;
  const ledgerRows = detail.ledger.map((line) => ({
    date: line.date,
    onClick: () => {
      if (line.type === 'Satis') setSelectedSale(detail.sales.find((item) => item.id === line.id) ?? null);
      if (line.type === 'Alis') setSelectedPurchase((detail.purchases ?? []).find((item) => item.id === line.id) ?? null);
      if (line.type === 'Tahsilat') setSelectedCollection(detail.collections.find((item) => item.id === line.id) ?? null);
      if (line.type === 'Tedarikci odemesi') setSelectedPayment((detail.supplierPayments ?? []).find((item) => item.id === line.id) ?? null);
    },
    cells: [
      new Date(line.date).toLocaleDateString('tr-TR'),
      line.type,
      line.description,
      <MoneyTone key={`${line.id}-dt`} value={line.debitTry} currency="TL" tone="debt" />,
      <MoneyTone key={`${line.id}-ct`} value={line.creditTry} currency="TL" tone="credit" />,
      <MoneyTone key={`${line.id}-du`} value={line.debitUsd} currency="USD" tone="debt" />,
      <MoneyTone key={`${line.id}-cu`} value={line.creditUsd} currency="USD" tone="credit" />,
    ],
  }));
  const saleRows = detail.sales.map((sale) => {
    const rate = sale.exchangeRate && sale.exchangeRate > 1 ? sale.exchangeRate : usdRate;
    const totalTry = sale.totalTry ?? (sale.currency === 'TRY' ? sale.total : tryFromUsd(sale.total, rate));
    const totalUsd = sale.totalUsd ?? (sale.currency === 'USD' ? sale.total : usdFromTry(sale.total, rate));
    const paidTry = sale.paidTry ?? (sale.currency === 'TRY' ? sale.paid : tryFromUsd(sale.paid, rate));
    const paidUsd = sale.paidUsd ?? (sale.currency === 'USD' ? sale.paid : usdFromTry(sale.paid, rate));
    const remainingTry = sale.remainingTry ?? (sale.currency === 'TRY' ? sale.remaining : tryFromUsd(sale.remaining, rate));
    const remainingUsd = sale.remainingUsd ?? (sale.currency === 'USD' ? sale.remaining : usdFromTry(sale.remaining, rate));
    const itemCount = (sale.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
    return {
      date: sale.createdAt,
      onClick: () => setSelectedSale(sale),
      cells: [
        sale.id,
        new Date(sale.createdAt).toLocaleDateString('tr-TR'),
        itemCount,
        sale.currency,
        <DualMoney key={`${sale.id}-total`} compact tryValue={totalTry} usdValue={totalUsd} />,
        <DualMoney key={`${sale.id}-paid`} compact tryValue={paidTry} usdValue={paidUsd} />,
        <DualMoney key={`${sale.id}-remaining`} compact tryValue={remainingTry} usdValue={remainingUsd} />,
        remainingTry > 0 || remainingUsd > 0 ? 'Acik' : 'Kapandi',
        <Button key={`${sale.id}-detail`} variant="soft" onClick={() => setSelectedSale(sale)}>Detay</Button>,
      ],
    };
  });
  const collectionRows = detail.collections.map((item) => ({ date: item.createdAt, onClick: () => setSelectedCollection(item), cells: [item.receiptNo ?? item.id, new Date(item.createdAt).toLocaleDateString('tr-TR'), item.method, <MoneyTone key={`${item.id}-amount`} value={item.amount} currency={item.currency === 'USD' ? 'USD' : 'TL'} tone="credit" />, item.status ?? 'basarili', <Button key={`${item.id}-detail`} variant="soft" onClick={() => setSelectedCollection(item)}>Detay</Button>] }));
  const purchaseRows = (detail.purchases ?? []).map((item) => ({
    date: item.createdAt,
    onClick: () => setSelectedPurchase(item),
    cells: [
      item.id,
      item.invoiceNo ?? '-',
      new Date(item.createdAt).toLocaleDateString('tr-TR'),
      <MoneyTone key={`${item.id}-total`} value={item.total} currency={item.currency === 'USD' ? 'USD' : 'TL'} tone="debt" />,
      item.paymentStatus ?? '-',
      <Button key={`${item.id}-detail`} variant="soft" onClick={() => setSelectedPurchase(item)}>Detay</Button>,
    ],
  }));
  const paymentRows = (detail.supplierPayments ?? []).map((item) => ({ date: item.createdAt, onClick: () => setSelectedPayment(item), cells: [item.receiptNo, new Date(item.createdAt).toLocaleDateString('tr-TR'), item.method, <MoneyTone key={`${item.id}-amount`} value={item.amount} currency={item.currency === 'USD' ? 'USD' : 'TL'} tone="credit" />, item.description ?? '-', <Button key={`${item.id}-detail`} variant="soft" onClick={() => setSelectedPayment(item)}>Detay</Button>] }));
  const renderTable = () => {
    if (tab === 'Satislar') return <DetailTable title="Satislar" headers={['Fis no', 'Tarih', 'Urun adedi', 'Para birimi', 'Genel toplam', 'Odenen', 'Kalan', 'Durum', 'Detay']} rows={saleRows} />;
    if (tab === 'Tahsilatlar') return <DetailTable title="Tahsilatlar" headers={['Makbuz', 'Tarih', 'Yontem', 'Tutar', 'Durum', 'Detay']} rows={collectionRows} />;
    if (tab === 'Alislar') return <DetailTable title="Alislar" headers={['Fis', 'Fatura', 'Tarih', 'Tutar', 'Durum', 'Detay']} rows={purchaseRows} />;
    if (tab === 'Odemeler') return <DetailTable title="Odemeler" headers={['Makbuz', 'Tarih', 'Yontem', 'Tutar', 'Aciklama', 'Detay']} rows={paymentRows} />;
    if (tab === 'Notlar') return <Panel title="Notlar"><div className="rounded border border-line bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{account.note || 'Bu cari icin kayitli not yok.'}</div></Panel>;
    return <DetailTable title="Cari Ekstre" headers={['Tarih', 'Islem', 'Aciklama', 'Borc TL', 'Alacak TL', 'Borc USD', 'Alacak USD']} rows={ledgerRows} />;
  };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Cariler &gt; {account.companyName}</div>
          <h1 className="mt-1 text-2xl font-bold">{account.companyName}</h1>
        </div>
        <Button variant="soft" onClick={onBack}>Geri don</Button>
      </div>
      <Panel title="Cari ozeti">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {accountSummary.map(([label, value, tone]) => <SummaryCard key={label} label={label} value={value} tone={tone} />)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-line bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><div className="text-sm text-slate-500">Toplam borc</div><div className="mt-2"><DualMoney tryValue={debtTry} usdValue={debtUsd} /></div></div>
          <div className="rounded border border-line bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><div className="text-sm text-slate-500">Kalan bakiye</div><div className="mt-2"><DualMoney tryValue={account.balanceTry} usdValue={account.balanceUsd} /></div></div>
        </div>
      </Panel>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onSale(account.id)} icon={<ReceiptText size={17} />}>Satis Yap</Button>
        <Button variant="soft" onClick={() => setCollectionOpen(true)} icon={<WalletCards size={17} />}>Tahsilat Al</Button>
        <Button variant="soft" onClick={() => account.type === 'TEDARIKCI' ? setPurchaseOpen(true) : onNotice('Alis yapmak icin tedarikci cari secilmeli.')} icon={<PackagePlus size={17} />}>Alis Yap</Button>
        {account.type === 'TEDARIKCI' && <Button variant="soft" onClick={() => setPaymentOpen(true)} icon={<Banknote size={17} />}>Odeme Yap</Button>}
        <Button variant="soft" onClick={() => onDebt(account.id)} icon={<MessageCircle size={17} />}>WhatsApp</Button>
        <Button variant="soft" onClick={() => window.print()} icon={<FileDown size={17} />}>Ekstre PDF</Button>
        {account.type !== 'TEDARIKCI' && <Button variant="soft" onClick={() => setUserOpen(true)} icon={<UserRound size={17} />}>Kullanici hesabi olustur</Button>}
      </div>
      {accountUsers.length > 0 && (
        <Panel title="Portal kullanicilari">
          <div className="grid gap-3 md:grid-cols-2">
            {accountUsers.map((user) => (
              <div key={user.id} className="rounded-2xl border border-line bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="font-black">{user.name}</div>
                <div className="mt-1 text-slate-500">{user.username ?? user.email} - {user.role}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge>{user.active === false ? 'Pasif' : 'Aktif'}</Badge>
                  <Button variant="soft" onClick={async () => {
                    try {
                      await apiPut<UserSession>(`/users/${user.id}`, { active: user.active === false });
                      onNotice(user.active === false ? 'Kullanici aktife alindi' : 'Kullanici pasife alindi');
                      await onReload();
                    } catch (error) {
                      onNotice(errorMessage(error));
                    }
                  }}>{user.active === false ? 'Aktife al' : 'Pasife al'}</Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <div className="flex gap-2 overflow-x-auto rounded border border-line bg-white p-2 shadow-panel dark:border-slate-700 dark:bg-[#17202a]">
        {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`h-10 shrink-0 rounded px-4 text-sm font-semibold transition ${tab === item ? 'bg-ocean text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}>{item}</button>)}
      </div>
      {renderTable()}
      {collectionOpen && <AccountCollectionModal account={account} usdRate={usdRate} onClose={() => setCollectionOpen(false)} onSaved={async () => { setCollectionOpen(false); setTab('Tahsilatlar'); await onReload(); }} onNotice={onNotice} />}
      {purchaseOpen && <AccountPurchaseModal account={account} products={products} usdRate={usdRate} onClose={() => setPurchaseOpen(false)} onSaved={async () => { setPurchaseOpen(false); setTab('Alislar'); await onReload(); }} onNotice={onNotice} />}
      {paymentOpen && <SupplierPaymentModal account={account} onClose={() => setPaymentOpen(false)} onSave={async (payload) => { await onSupplierPayment(account.id, payload); setPaymentOpen(false); setTab('Odemeler'); }} />}
      {selectedSale && <SaleDetailModal sale={selectedSale} products={products} accounts={accounts} fallbackRate={usdRate} onClose={() => setSelectedSale(null)} onNotice={onNotice} onUpdated={async (updated) => { setSelectedSale(updated); await onReload(); }} />}
      {selectedPurchase && <PurchaseDetailModal purchase={selectedPurchase} products={products} accounts={accounts} fallbackRate={usdRate} onClose={() => setSelectedPurchase(null)} onNotice={onNotice} onSaved={async (updated) => { setSelectedPurchase(updated); await onReload(); }} />}
      {selectedCollection && <CollectionDetailModal collection={selectedCollection} account={account} usdRate={usdRate} onClose={() => setSelectedCollection(null)} onNotice={onNotice} />}
      {selectedPayment && <SupplierPaymentDetailModal payment={selectedPayment} account={account} onClose={() => setSelectedPayment(null)} />}
      {userOpen && <AccountUserModal account={account} onClose={() => setUserOpen(false)} onSave={async (payload) => { await onCreateUser(payload); setUserOpen(false); }} />}
    </section>
  );
}

function AccountUserModal({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: (payload: { name: string; email: string; username?: string; password: string; role: 'CUSTOMER' | 'DEALER'; accountId: string; phone?: string }) => Promise<void> }) {
  const temporaryPassword = `Bayi${Math.floor(100000 + Math.random() * 899999)}`;
  const [form, setForm] = useState({
    name: account.contactName || account.companyName,
    company: account.companyName,
    phone: account.phone || account.whatsapp || '',
    email: account.email || '',
    username: (account.email || account.code || account.companyName).toLocaleLowerCase('tr-TR').replace(/\s+/g, ''),
    password: temporaryPassword,
    role: account.type === 'BAYI' ? 'DEALER' : 'CUSTOMER',
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await onSave({ name: form.name, email: form.email, username: form.username, password: form.password, role: form.role as 'CUSTOMER' | 'DEALER', accountId: account.id, phone: form.phone });
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalFrame title="Kullanici hesabi olustur" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <FormInput label="Ad Soyad" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <FormInput label="Firma" value={form.company} onChange={(company) => setForm({ ...form, company })} />
          <FormInput label="Telefon" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <FormInput label="E-posta" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <FormInput label="Kullanici adi" value={form.username} onChange={(username) => setForm({ ...form, username })} />
          <FormInput label="Gecici sifre" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <FormSelect label="Rol" value={form.role} onChange={(role) => setForm({ ...form, role })} options={[{ label: 'Musteri', value: 'CUSTOMER' }, { label: 'Bayi', value: 'DEALER' }]} />
          <Info label="Bagli cari hesabi" value={account.companyName} />
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-500 dark:bg-slate-900">Ilk giriste musteri yeni sifre belirlemeye zorlanir. Sifre hashli saklanir.</div>
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
          <Button variant="soft" onClick={onClose}>Vazgec</Button>
          <Button disabled={saving || !form.name || !form.email || form.password.length < 6} onClick={save} icon={<UserRound size={17} />}>Kullanici olustur</Button>
        </div>
      </div>
    </ModalFrame>
  );
}

function AccountCollectionModal({ account, usdRate, onClose, onSaved, onNotice }: { account: Account; usdRate: number; onClose: () => void; onSaved: () => Promise<void>; onNotice: (message: string) => void }) {
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY');
  const [method, setMethod] = useState('Nakit');
  const [tryAmount, setTryAmount] = useState(0);
  const [usdAmount, setUsdAmount] = useState(0);
  const [description, setDescription] = useState('');
  const preview = previewCollection(account, tryAmount, usdAmount, usdRate);
  async function save() {
    const amount = currency === 'USD' ? usdAmount : tryAmount;
    if (amount <= 0) return onNotice('Tahsilat tutari pozitif olmali');
    try {
      await apiPost<Collection>('/collections', { accountId: account.id, method, currency, amount, description });
      onNotice('Tahsilat kaydedildi ve cari ekstresine işlendi.');
      await onSaved();
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  return (
    <ModalFrame title="Tahsilat al" onClose={onClose}>
      <div className="space-y-4">
        <Info label="Cari" value={account.companyName} />
        <div className="grid gap-3 md:grid-cols-2">
          <FormSelect label="Para birimi" value={currency} onChange={(value) => setCurrency(value as 'TRY' | 'USD')} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
          <FormSelect label="Odeme turu" value={method} onChange={setMethod} options={['Nakit', 'Havale/EFT', 'Kredi karti', 'Cek', 'Senet'].map((value) => ({ label: value, value }))} />
          <FormNumber label="TL tutar" value={tryAmount} setValue={setTryAmount} />
          <FormNumber label="USD tutar" value={usdAmount} setValue={setUsdAmount} />
        </div>
        <FormInput label="Aciklama" value={description} onChange={setDescription} />
        <div className="grid gap-3 md:grid-cols-3">
          <DualSummary label="Kullanilan kur" tryValue={usdRate} usdValue={1} />
          <DualSummary label="Tahsilat karsiligi" tryValue={currency === 'TRY' ? tryAmount : tryFromUsd(usdAmount, usdRate)} usdValue={currency === 'USD' ? usdAmount : usdFromTry(tryAmount, usdRate)} />
          <DualSummary label="Tahsilat sonrasi" tryValue={preview.remainingTry} usdValue={preview.remainingUsd} strong />
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700"><Button variant="soft" onClick={onClose}>Vazgec</Button><Button onClick={save}>Tahsilat kaydet</Button></div>
      </div>
    </ModalFrame>
  );
}

function AccountPurchaseModal({ account, products, usdRate, onClose, onSaved, onNotice }: { account: Account; products: Product[]; usdRate: number; onClose: () => void; onSaved: () => Promise<void>; onNotice: (message: string) => void }) {
  const firstProduct = products[0];
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY');
  const [invoiceNo, setInvoiceNo] = useState(`AF-${new Date().getTime().toString().slice(-5)}`);
  const [paymentStatus, setPaymentStatus] = useState('Bekliyor');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ productId: firstProduct?.id ?? '', quantity: 1, unitPriceTry: firstProduct?.purchaseTry ?? 0, unitPriceUsd: firstProduct?.purchaseUsd ?? 0, vatRate: firstProduct?.vatRate ?? 20 }]);
  const subtotalTry = lines.reduce((sum, line) => sum + Number(line.unitPriceTry || 0) * Number(line.quantity || 0), 0);
  const subtotalUsd = lines.reduce((sum, line) => sum + Number(line.unitPriceUsd || 0) * Number(line.quantity || 0), 0);
  const vatTry = subtotalTry * 0.2;
  const vatUsd = subtotalUsd * 0.2;
  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((current) => current.map((line, row) => row === index ? { ...line, ...patch } : line));
  }
  function chooseProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updateLine(index, { productId, unitPriceTry: product?.purchaseTry ?? 0, unitPriceUsd: product?.purchaseUsd ?? 0, vatRate: product?.vatRate ?? 20 });
  }
  async function save() {
    if (!lines.length || lines.some((line) => !line.productId || Number(line.quantity) <= 0)) return onNotice('Alis icin urun ve adet zorunlu');
    try {
      await apiPost<Purchase>('/purchases', {
        supplierId: account.id,
        currency,
        invoiceNo,
        paymentStatus,
        description,
        items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitPriceTry: Number(line.unitPriceTry), unitPriceUsd: Number(line.unitPriceUsd), vatRate: Number(line.vatRate) })),
      });
      onNotice('Alis kaydedildi. Stok ve tedarikci bakiyesi guncellendi.');
      await onSaved();
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  return (
    <ModalFrame title="Tedarikci alisi" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Tedarikci" value={account.companyName} />
          <FormInput label="Fatura no" value={invoiceNo} onChange={setInvoiceNo} />
          <FormSelect label="Para birimi" value={currency} onChange={(value) => setCurrency(value as 'TRY' | 'USD')} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
          <FormSelect label="Odeme durumu" value={paymentStatus} onChange={setPaymentStatus} options={['Bekliyor', 'Odendi', 'Kismi'].map((value) => ({ label: value, value }))} />
          <FormInput label="Aciklama" value={description} onChange={setDescription} />
        </div>
        <div className="overflow-x-auto rounded border border-line dark:border-slate-700">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Adet', 'Alis TL', 'Alis USD', 'KDV', 'Toplam', ''].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
            <tbody>{lines.map((line, index) => <tr key={index} className="border-t border-line dark:border-slate-700">
              <td className="px-3 py-2"><select value={line.productId} onChange={(event) => chooseProduct(index, event.target.value)} className="h-10 w-full rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900">{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></td>
              <td className="px-3 py-2"><input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="h-10 w-20 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><input type="number" step="0.01" min="0" value={line.unitPriceTry} onChange={(event) => updateLine(index, { unitPriceTry: Number(event.target.value) })} className="h-10 w-28 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><input type="number" step="0.01" min="0" value={line.unitPriceUsd} onChange={(event) => updateLine(index, { unitPriceUsd: Number(event.target.value) })} className="h-10 w-28 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><input type="number" min="0" value={line.vatRate} onChange={(event) => updateLine(index, { vatRate: Number(event.target.value) })} className="h-10 w-20 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><DualMoney compact tryValue={Number(line.unitPriceTry) * Number(line.quantity)} usdValue={Number(line.unitPriceUsd) * Number(line.quantity)} /></td>
              <td className="px-3 py-2"><IconButton title="Satir sil" onClick={() => setLines((current) => current.filter((_, row) => row !== index))}><Trash2 size={16} /></IconButton></td>
            </tr>)}</tbody>
          </table>
        </div>
        <Button variant="soft" onClick={() => setLines((current) => [...current, { productId: firstProduct?.id ?? '', quantity: 1, unitPriceTry: firstProduct?.purchaseTry ?? 0, unitPriceUsd: firstProduct?.purchaseUsd ?? 0, vatRate: firstProduct?.vatRate ?? 20 }])} icon={<Plus size={17} />}>Satir ekle</Button>
        <div className="grid gap-3 md:grid-cols-3"><DualSummary label="Ara toplam" tryValue={subtotalTry} usdValue={subtotalUsd} /><DualSummary label="KDV" tryValue={vatTry} usdValue={vatUsd} /><DualSummary label="Genel toplam" tryValue={subtotalTry + vatTry} usdValue={subtotalUsd + vatUsd} strong /></div>
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700"><Button variant="soft" onClick={onClose}>Vazgec</Button><Button onClick={save}>Alisi kaydet</Button></div>
      </div>
    </ModalFrame>
  );
}

function CollectionDetailModal({ collection, account, usdRate, onClose, onNotice }: { collection: Collection; account: Account; usdRate: number; onClose: () => void; onNotice: (message: string) => void }) {
  async function sendMessage() {
    try {
      const result = await apiPost<{ link: string }>(`/whatsapp/collections/${collection.id}`);
      window.open(result.link, '_blank', 'noopener,noreferrer');
      onNotice('Tahsilat WhatsApp mesaji acildi');
    } catch (error) {
      onNotice(errorMessage(error));
    }
  }
  return (
    <ModalFrame title={`Tahsilat detayi - ${collection.receiptNo ?? collection.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Cari" value={account.companyName} /><Info label="Tarih" value={new Date(collection.createdAt).toLocaleString('tr-TR')} /><Info label="Yontem" value={collection.method} />
          <Info label="Kur" value={String(collection.exchangeRate ?? usdRate)} /><Info label="Durum" value={collection.status ?? 'basarili'} /><Info label="Aciklama" value={collection.description ?? '-'} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <DualSummary label="Tahsil edilen" tryValue={collection.tlAmount ?? (collection.currency === 'TRY' ? collection.amount : tryFromUsd(collection.amount, usdRate))} usdValue={collection.usdAmount ?? (collection.currency === 'USD' ? collection.amount : usdFromTry(collection.amount, usdRate))} />
          <DualSummary label="Bakiyeye uygulanan" tryValue={collection.appliedToTlBalance ?? 0} usdValue={collection.appliedToUsdBalance ?? 0} />
          <DualSummary label="Kalan bakiye" tryValue={collection.remainingTlBalance ?? account.balanceTry} usdValue={collection.remainingUsdBalance ?? account.balanceUsd} strong />
        </div>
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={() => window.print()} icon={<FileDown size={17} />}>Makbuz yazdir</Button><Button onClick={sendMessage} icon={<MessageCircle size={17} />}>WhatsApp gonder</Button></div>
      </div>
    </ModalFrame>
  );
}

function SupplierPaymentDetailModal({ payment, account, onClose }: { payment: SupplierPayment; account: Account; onClose: () => void }) {
  return (
    <ModalFrame title={`Odeme detayi - ${payment.receiptNo}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Tedarikci" value={account.companyName} /><Info label="Tarih" value={new Date(payment.createdAt).toLocaleString('tr-TR')} /><Info label="Yontem" value={payment.method} />
          <Info label="Tutar" value={money(payment.amount, payment.currency === 'USD' ? 'USD' : 'TL')} /><Info label="Aciklama" value={payment.description ?? '-'} />
        </div>
        <div className="flex justify-end"><Button variant="soft" onClick={() => window.print()} icon={<FileDown size={17} />}>Odeme makbuzu yazdir</Button></div>
      </div>
    </ModalFrame>
  );
}

function SupplierPaymentModal({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: (payload: { date: string; currency: 'TRY' | 'USD'; amount: number; method: string; description: string }) => Promise<void> }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), currency: 'TRY' as 'TRY' | 'USD', amount: 1000, method: 'Havale/EFT', description: '' });
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  async function submit() {
    if (form.amount <= 0) return setLocalError('Tutar pozitif olmali');
    setSaving(true);
    setLocalError('');
    try {
      await onSave(form);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalFrame title="Tedarikci odemesi" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded border border-line bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-slate-500">Tedarikci</div>
          <div className="mt-1 font-bold">{account.companyName}</div>
        </div>
        <FormGrid>
          <FormInput label="Tarih" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
          <FormSelect label="Para birimi" value={form.currency} onChange={(currency) => setForm({ ...form, currency: currency as 'TRY' | 'USD' })} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
          <FormNumber label="Tutar" value={form.amount} setValue={(amount) => setForm({ ...form, amount })} />
          <FormSelect label="Odeme turu" value={form.method} onChange={(method) => setForm({ ...form, method })} options={['Nakit', 'Havale/EFT', 'Kredi karti'].map((item) => ({ label: item, value: item }))} />
          <FormInput label="Aciklama" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        </FormGrid>
        {localError && <div className="rounded bg-[#ffe3e9] px-3 py-2 text-sm font-semibold text-rose">{localError}</div>}
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
          <Button variant="soft" onClick={onClose}>Vazgec</Button>
          <Button disabled={saving} onClick={submit} icon={<WalletCards size={17} />}>Kaydet</Button>
        </div>
      </div>
    </ModalFrame>
  );
}

function SummaryCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'debt' | 'credit' | 'neutral' }) {
  const color = tone === 'debt' ? 'text-rose' : tone === 'credit' ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink dark:text-slate-100';
  return <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-soft dark:border-slate-700/70 dark:bg-[#17202a]/90"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-2 text-base font-black ${color}`}>{value}</div></div>;
}

function normalizeWhatsappPhone(value?: string) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createPreviewDocument(fileName: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return { fileName, url };
}

function openPreviewDocument(fileName: string, html: string, onNotice: (message: string) => void, label: string) {
  const documentLink = createPreviewDocument(fileName, html);
  const preview = window.open(documentLink.url, '_blank', 'noopener,noreferrer');
  if (!preview) {
    onNotice('PDF onizleme penceresi acilamadi. Tarayici popup iznini kontrol edin.');
    return null;
  }
  onNotice(`${label} hazirlandi: ${fileName}`);
  return documentLink;
}

function SaleDetailModal({ sale, products, accounts, fallbackRate, onClose, onNotice, onUpdated }: { sale: Sale; products: Product[]; accounts: Account[]; fallbackRate: number; onClose: () => void; onNotice: (message: string) => void; onUpdated?: (sale: Sale) => void | Promise<void> }) {
  const [salePdfTemplates, setSalePdfTemplates] = useState<PdfTemplate[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    void apiGet<PdfTemplate[]>('/pdf-templates').then(setSalePdfTemplates).catch(() => setSalePdfTemplates([]));
  }, []);
  const rate = sale.exchangeRate && sale.exchangeRate > 1 ? sale.exchangeRate : fallbackRate;
  const account = accounts.find((item) => item.id === sale.accountId || item.companyName === sale.accountName);
  const accountName = sale.accountName ?? account?.companyName ?? sale.accountId;
  const totalTry = sale.totalTry ?? (sale.currency === 'TRY' ? sale.total : tryFromUsd(sale.total, rate));
  const totalUsd = sale.totalUsd ?? (sale.currency === 'USD' ? sale.total : usdFromTry(sale.total, rate));
  const subtotalTry = sale.subtotalTry ?? (sale.currency === 'TRY' ? sale.subtotal : tryFromUsd(sale.subtotal, rate));
  const subtotalUsd = sale.subtotalUsd ?? (sale.currency === 'USD' ? sale.subtotal : usdFromTry(sale.subtotal, rate));
  const vatTry = sale.vatTry ?? (sale.currency === 'TRY' ? sale.vat : tryFromUsd(sale.vat, rate));
  const vatUsd = sale.vatUsd ?? (sale.currency === 'USD' ? sale.vat : usdFromTry(sale.vat, rate));
  const paidTry = sale.paidTry ?? (sale.currency === 'TRY' ? sale.paid : tryFromUsd(sale.paid, rate));
  const paidUsd = sale.paidUsd ?? (sale.currency === 'USD' ? sale.paid : usdFromTry(sale.paid, rate));
  const remainingTry = sale.remainingTry ?? (sale.currency === 'TRY' ? sale.remaining : tryFromUsd(sale.remaining, rate));
  const remainingUsd = sale.remainingUsd ?? (sale.currency === 'USD' ? sale.remaining : usdFromTry(sale.remaining, rate));
  const lines = sale.items ?? [];
  function lineTry(item: NonNullable<Sale['items']>[number]) {
    return item.lineTotalTry ?? (sale.currency === 'TRY' ? item.lineTotal : tryFromUsd(item.lineTotal, rate));
  }
  function lineUsd(item: NonNullable<Sale['items']>[number]) {
    return item.lineTotalUsd ?? (sale.currency === 'USD' ? item.lineTotal : usdFromTry(item.lineTotal, rate));
  }
  function unitTry(item: NonNullable<Sale['items']>[number]) {
    return item.unitPriceTry ?? (sale.currency === 'TRY' ? item.unitPrice : tryFromUsd(item.unitPrice, rate));
  }
  function unitUsd(item: NonNullable<Sale['items']>[number]) {
    return item.unitPriceUsd ?? (sale.currency === 'USD' ? item.unitPrice : usdFromTry(item.unitPrice, rate));
  }
  function productName(item: NonNullable<Sale['items']>[number]) {
    const product = products.find((p) => p.id === item.productId);
    return item.productName ?? product?.name ?? item.productId;
  }
  function buildSaleDocument(kind: 'receipt' | 'note' = 'receipt') {
    const isNote = kind === 'note';
    const fileName = isNote ? `satis-bilgi-notu-${sale.id}.pdf` : `satis-fisi-${sale.id}.pdf`;
    const template = pdfTemplateFor(salePdfTemplates, 'SatisFisi') ?? pdfTemplateFor(salePdfTemplates, 'Teklif');
    const settings = pdfSettings(template);
    const rows = lines.map((item) => `
      <tr>
        <td>${escapeHtml(productName(item))}</td>
        <td>${item.quantity}</td>
        <td>${escapeHtml(money(unitUsd(item), 'USD'))}<br><small>${escapeHtml(money(unitTry(item)))}</small></td>
        <td>%${escapeHtml(item.vatRate ?? 20)}</td>
        <td>${escapeHtml(money(lineUsd(item), 'USD'))}<br><small>${escapeHtml(money(lineTry(item)))}</small></td>
      </tr>
    `).join('');
    const columns = settings.columns?.length ? settings.columns : ['Urun', 'Adet', 'Birim fiyat USD/TL', 'KDV', 'Ara toplam USD/TL'];
    const logoHtml = template?.logoUrl ? `<img src="${escapeHtml(template.logoUrl)}" style="max-width:${settings.logoSize}px;max-height:${settings.logoSize}px;object-fit:contain">` : `<div class="logo-mark">${escapeHtml((settings.companyName ?? 'B').slice(0, 1))}</div>`;
    const html = `<!doctype html>
      <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(fileName)}</title>
        <style>
          @page { size: ${settings.paperType ?? 'A4'}; margin: ${settings.marginMm ?? 14}mm; }
          body { font-family: ${escapeHtml(template?.fontFamily ?? 'Inter')}, Arial, sans-serif; color: ${settings.textColor}; margin: 0; font-size:${settings.bodySize}px; line-height:${settings.lineHeight}; }
          .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid ${settings.headerColor}; padding-bottom: 16px; }
          .brand { font-size: ${settings.titleSize}px; font-weight: 900; color: ${settings.headerColor}; }
          .logo-mark { display:grid; place-items:center; width:${settings.logoSize}px; height:${settings.logoSize}px; border-radius:14px; background:${settings.headerColor}; color:white; font-size:28px; font-weight:900; }
          .muted { color: #64748b; font-size: 12px; }
          h1 { font-size: 20px; margin: 22px 0 12px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
          .box { border: 1px solid ${settings.tableBorderColor}; border-radius: 10px; padding: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: ${settings.bodySize}px; }
          th { background: ${settings.tableHeaderColor}; color: ${settings.headerColor}; text-align: left; }
          th, td { border: 1px solid ${settings.tableBorderColor}; padding: 9px; vertical-align: top; }
          .totals { margin-left: auto; width: 310px; margin-top: 16px; }
          .totals div { display: flex; justify-content: space-between; border-bottom: 1px solid ${settings.tableBorderColor}; padding: 7px 0; }
          .strong { font-weight: 900; color: ${settings.headerColor}; }
          .stamp { margin-top: 42px; display: flex; justify-content: space-between; gap: 24px; }
          .sign { height: 92px; flex: 1; border: 1px dashed #94a3b8; border-radius: 8px; padding: 10px; color: #64748b; }
          .footer { margin-top:28px; border-top:2px solid ${settings.headerColor}; padding-top:12px; color:#64748b; }
          .status { display:inline-block; border-radius:999px; background:#d7f2ea; color:#126c82; padding:5px 10px; font-weight:800; }
        </style>
      </head>
      <body>
        <div class="top">
          <div>${logoHtml}<div class="brand">${escapeHtml(settings.companyName ?? template?.title ?? 'Bulut ERP Pro')}</div><div class="muted">${escapeHtml(settings.contactInfo ?? '')}</div></div>
          <div><strong>Satis fis no:</strong> ${escapeHtml(sale.id)}<br><strong>Tarih:</strong> ${escapeHtml(new Date(sale.createdAt).toLocaleString('tr-TR'))}</div>
        </div>
        <h1>${escapeHtml(isNote ? 'Satış Bilgi Notu' : (template?.title ?? 'Satis Fisi'))}</h1>
        <div class="grid">
          <div class="box"><strong>Musteri bilgileri</strong><br>${escapeHtml(accountName)}<br>${escapeHtml(account?.phone ?? account?.whatsapp ?? '')}<br>${escapeHtml(account?.address ?? '')}</div>
          <div class="box"><strong>Para birimi / Kur</strong><br>${sale.currency}<br>1 USD = ${escapeHtml(rate)} TL</div>
        </div>
        ${isNote ? `<div class="box"><strong>Odeme durumu</strong><br><span class="status">${remainingTry > 0 || remainingUsd > 0 ? 'Kismi / vadeli' : 'Odenmis'}</span><br>Odenen: ${escapeHtml(money(paidUsd, 'USD'))} / ${escapeHtml(money(paidTry))}<br>Kalan: ${escapeHtml(money(remainingUsd, 'USD'))} / ${escapeHtml(money(remainingTry))}</div>` : ''}
        <table>
          <thead><tr>${columns.slice(0, 5).map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
          <tbody>${rows || '<tr><td colspan="5">Urun kaydi yok</td></tr>'}</tbody>
        </table>
        <div class="totals">
          <div><span>Ara toplam</span><span>${escapeHtml(money(subtotalUsd, 'USD'))} / ${escapeHtml(money(subtotalTry))}</span></div>
          <div><span>KDV</span><span>${escapeHtml(money(vatUsd, 'USD'))} / ${escapeHtml(money(vatTry))}</span></div>
          <div class="strong"><span>Genel toplam</span><span>${escapeHtml(money(totalUsd, 'USD'))} / ${escapeHtml(money(totalTry))}</span></div>
          <div><span>Odenen</span><span>${escapeHtml(money(paidUsd, 'USD'))} / ${escapeHtml(money(paidTry))}</span></div>
          <div><span>Kalan</span><span>${escapeHtml(money(remainingUsd, 'USD'))} / ${escapeHtml(money(remainingTry))}</span></div>
        </div>
        <div class="box" style="margin-top:18px;"><strong>Aciklama</strong><br>${escapeHtml(sale.description || '-')}</div>
        ${settings.showBankInfo ? `<div class="box" style="margin-top:18px;"><strong>Banka bilgileri</strong><br>${escapeHtml(settings.bankInfo ?? '')}</div>` : ''}
        <div class="stamp">${settings.showSignature ? '<div class="sign">Imza alani</div>' : ''}${settings.showStamp ? '<div class="sign">Kase alani</div>' : ''}</div>
        <div class="footer">${escapeHtml(settings.footerText ?? template?.footer ?? '')}${settings.showWhatsapp ? `<br>WhatsApp: ${escapeHtml(settings.whatsapp ?? '')}` : ''}</div>
        <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
      </body>
      </html>`;
    return { fileName, html };
  }
  function openSalePdfPreview() {
    const document = buildSaleDocument('receipt');
    openPreviewDocument(document.fileName, document.html, onNotice, 'PDF fis');
  }
  function openSaleInfoNotePdf() {
    const document = buildSaleDocument('note');
    openPreviewDocument(document.fileName, document.html, onNotice, 'Satis bilgi notu PDF');
  }
  function openWhatsapp() {
    const phone = normalizeWhatsappPhone(account?.whatsapp ?? account?.phone);
    if (!phone) {
      onNotice('Cari kartta WhatsApp numarası bulunamadı.');
      return;
    }
    const message = `Sayın ${accountName},\n${sale.id} numaralı satışınız oluşturulmuştur.\n\nToplam: ${money(totalUsd, 'USD')} / ${money(totalTry)}\nÖdenen: ${money(paidUsd, 'USD')} / ${money(paidTry)}\nKalan: ${money(remainingUsd, 'USD')} / ${money(remainingTry)}\nKur: ${rate}\n\nTeşekkür ederiz.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    onNotice('WhatsApp satis mesaji acildi');
  }
  function openWhatsappWithPdf() {
    const phone = normalizeWhatsappPhone(account?.whatsapp ?? account?.phone);
    if (!phone) {
      onNotice('Cari kartta WhatsApp numarasi bulunamadi.');
      return;
    }
    const document = buildSaleDocument('receipt');
    const pdfLink = createPreviewDocument(document.fileName, document.html);
    const message = `Sayın ${accountName},\n${sale.id} numaralı satış fişiniz ektedir.\n\nToplam: ${money(totalUsd, 'USD')} / ${money(totalTry)}\nÖdenen: ${money(paidUsd, 'USD')} / ${money(paidTry)}\nKalan: ${money(remainingUsd, 'USD')} / ${money(remainingTry)}\n\nPDF: ${pdfLink.url}\n\nTeşekkür ederiz.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    onNotice(`WhatsApp mesaji PDF linkiyle hazirlandi: ${pdfLink.fileName}`);
  }
  return (
    <ModalFrame title={`Satis detayi - ${sale.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Fis no" value={sale.id} />
          <Info label="Tarih" value={new Date(sale.createdAt).toLocaleString('tr-TR')} />
          <Info label="Cari" value={accountName} />
          <Info label="Cari tipi" value={account?.type ?? '-'} />
          <Info label="Kur" value={String(rate)} />
          <Info label="Odeme turu" value={sale.paymentMethod ?? '-'} />
          <Info label="Para" value={sale.currency} />
        </div>
        <div className="overflow-x-auto rounded border border-line dark:border-slate-700">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Adet', 'Birim USD/TL', 'KDV', 'Ara toplam USD/TL'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
            <tbody>{lines.map((item) => <tr key={item.productId} className="border-t border-line dark:border-slate-700"><td className="px-3 py-2 font-semibold">{productName(item)}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2"><DualMoney compact tryValue={unitTry(item)} usdValue={unitUsd(item)} /></td><td className="px-3 py-2">%{item.vatRate ?? 20}</td><td className="px-3 py-2"><DualMoney compact tryValue={lineTry(item)} usdValue={lineUsd(item)} /></td></tr>)}</tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <DualSummary label="Ara toplam" tryValue={subtotalTry} usdValue={subtotalUsd} />
          <DualSummary label="KDV" tryValue={vatTry} usdValue={vatUsd} />
          <DualSummary label="Genel toplam" tryValue={totalTry} usdValue={totalUsd} strong />
          <DualSummary label="Odenen" tryValue={paidTry} usdValue={paidUsd} />
          <DualSummary label="Kalan" tryValue={remainingTry} usdValue={remainingUsd} strong />
        </div>
        {sale.description && <div className="rounded border border-line p-3 text-sm dark:border-slate-700">{sale.description}</div>}
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700">
          <Button variant="soft" onClick={() => setEditOpen(true)} icon={<Edit3 size={17} />}>Duzenle</Button>
          <Button variant="soft" onClick={openSalePdfPreview} icon={<FileDown size={17} />}>PDF fis olustur</Button>
          <Button variant="soft" onClick={openSaleInfoNotePdf} icon={<FileDown size={17} />}>Satis bilgi notu PDF</Button>
          <Button onClick={openWhatsappWithPdf} icon={<MessageCircle size={17} />}>WhatsApp gonder</Button>
        </div>
        {editOpen && <SaleEditModal sale={sale} products={products} accounts={accounts} fallbackRate={fallbackRate} onClose={() => setEditOpen(false)} onNotice={onNotice} onSaved={async (updated) => { await onUpdated?.(updated); setEditOpen(false); }} />}
      </div>
    </ModalFrame>
  );
}

function SaleEditModal({ sale, products, accounts, fallbackRate, onClose, onNotice, onSaved }: { sale: Sale; products: Product[]; accounts: Account[]; fallbackRate: number; onClose: () => void; onNotice: (message: string) => void; onSaved: (sale: Sale) => void | Promise<void> }) {
  const [accountId, setAccountId] = useState(sale.accountId);
  const [currency, setCurrency] = useState<'TRY' | 'USD'>(sale.currency);
  const [paymentMethod, setPaymentMethod] = useState(sale.paymentMethod ?? 'Vadeli');
  const [paid, setPaid] = useState(sale.paid);
  const [discount, setDiscount] = useState(sale.discount);
  const [description, setDescription] = useState(sale.description ?? '');
  const [date, setDate] = useState(sale.createdAt.slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState(() => (sale.items?.length ? sale.items : []).map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceTry: item.unitPriceTry ?? 0,
    unitPriceUsd: item.unitPriceUsd ?? 0,
    vatRate: item.vatRate ?? 20,
  })));
  const rate = sale.exchangeRate && sale.exchangeRate > 1 ? sale.exchangeRate : fallbackRate;
  const subtotalTry = lines.reduce((sum, line) => sum + Number(line.unitPriceTry || 0) * Number(line.quantity || 0), 0);
  const subtotalUsd = lines.reduce((sum, line) => sum + Number(line.unitPriceUsd || 0) * Number(line.quantity || 0), 0);
  const subtotal = currency === 'USD' ? subtotalUsd : subtotalTry;
  const vat = Math.max(0, subtotal - discount) * 0.2;
  const total = Math.max(0, subtotal - discount) + vat;
  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }
  function chooseProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updateLine(index, { productId, unitPriceTry: product?.saleTry ?? 0, unitPriceUsd: product?.saleUsd ?? 0, vatRate: product?.vatRate ?? 20 });
  }
  async function save() {
    if (saving) return;
    if (!accountId || !lines.length || lines.some((line) => !line.productId || Number(line.quantity) <= 0)) {
      onNotice('Satis duzenlemek icin cari ve urun satirlari zorunlu');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPut<Sale>(`/sales/${sale.id}`, {
        accountId,
        currency,
        paymentMethod,
        paid,
        discount,
        description,
        date: date ? new Date(date).toISOString() : undefined,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPriceTry: Number(line.unitPriceTry),
          unitPriceUsd: Number(line.unitPriceUsd),
          vatRate: Number(line.vatRate),
        })),
      });
      onNotice('Satış güncellendi');
      await onSaved(updated);
    } catch (error) {
      console.error('Satış güncellenemedi', error);
      onNotice('Satış güncellenemedi');
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalFrame title={`Satis duzenle - ${sale.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FormSelect label="Cari" value={accountId} onChange={setAccountId} options={accounts.map((item) => ({ label: item.companyName, value: item.id }))} />
          <FormInput label="Tarih" type="date" value={date} onChange={setDate} />
          <FormSelect label="Para birimi" value={currency} onChange={(value) => setCurrency(value as 'TRY' | 'USD')} options={[{ label: 'TL', value: 'TRY' }, { label: 'USD', value: 'USD' }]} />
          <FormSelect label="Odeme tipi" value={paymentMethod} onChange={setPaymentMethod} options={['Vadeli', 'Nakit', 'Havale/EFT', 'Kredi karti'].map((value) => ({ label: value, value }))} />
          <FormNumber label="Odenen" value={paid} setValue={setPaid} />
          <FormNumber label="Iskonto" value={discount} setValue={setDiscount} />
        </div>
        <div className="overflow-x-auto rounded border border-line dark:border-slate-700">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>{['Urun', 'Adet', 'Birim TL', 'Birim USD', 'KDV', 'Toplam', ''].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
            <tbody>{lines.map((line, index) => <tr key={index} className="border-t border-line dark:border-slate-700">
              <td className="px-3 py-2"><select value={line.productId} onChange={(event) => chooseProduct(index, event.target.value)} className="h-10 w-full rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900">{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></td>
              <td className="px-3 py-2"><input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="h-10 w-20 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><input type="number" step="0.01" min="0" value={line.unitPriceTry} onChange={(event) => updateLine(index, { unitPriceTry: Number(event.target.value) })} className="h-10 w-28 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><input type="number" step="0.01" min="0" value={line.unitPriceUsd} onChange={(event) => updateLine(index, { unitPriceUsd: Number(event.target.value) })} className="h-10 w-28 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><input type="number" min="0" value={line.vatRate} onChange={(event) => updateLine(index, { vatRate: Number(event.target.value) })} className="h-10 w-20 rounded border border-line bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></td>
              <td className="px-3 py-2"><DualMoney compact tryValue={Number(line.unitPriceTry) * Number(line.quantity)} usdValue={Number(line.unitPriceUsd) * Number(line.quantity)} /></td>
              <td className="px-3 py-2"><IconButton title="Satir sil" onClick={() => setLines((current) => current.filter((_, row) => row !== index))}><Trash2 size={16} /></IconButton></td>
            </tr>)}</tbody>
          </table>
        </div>
        <Button variant="soft" onClick={() => setLines((current) => [...current, { productId: products[0]?.id ?? '', quantity: 1, unitPriceTry: products[0]?.saleTry ?? 0, unitPriceUsd: products[0]?.saleUsd ?? 0, vatRate: products[0]?.vatRate ?? 20 }])} icon={<Plus size={17} />}>Satir ekle</Button>
        <FormInput label="Aciklama" value={description} onChange={setDescription} />
        <div className="grid gap-3 md:grid-cols-3">
          <DualSummary label="Ara toplam" tryValue={subtotalTry} usdValue={subtotalUsd} />
          <DualSummary label="Genel toplam" tryValue={currency === 'TRY' ? total : tryFromUsd(total, rate)} usdValue={currency === 'USD' ? total : usdFromTry(total, rate)} strong />
          <DualSummary label="Kalan" tryValue={currency === 'TRY' ? total - paid : tryFromUsd(total - paid, rate)} usdValue={currency === 'USD' ? total - paid : usdFromTry(total - paid, rate)} />
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4 dark:border-slate-700"><Button variant="soft" onClick={onClose}>Vazgec</Button><Button onClick={save}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></div>
      </div>
    </ModalFrame>
  );
}

function MoneyTone({ value, currency, tone }: { value: number; currency: string; tone: 'debt' | 'credit' | 'neutral' }) {
  const color = tone === 'debt' ? 'bg-[#ffe3e9] text-rose' : tone === 'credit' ? 'bg-[#d7f2ea] text-emerald-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${color}`}>{money(value, currency)}</span>;
}

function DetailTable({ title, headers, rows }: { title: string; headers: string[]; rows: { date: string; cells: ReactNode[]; onClick?: () => void }[] }) {
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const filtered = rows.filter((row) => {
    const textOk = row.cells.map(nodeText).join(' ').toLowerCase().includes(query.toLowerCase());
    const dateOk = !date || row.date.startsWith(date);
    return textOk && dateOk;
  });
  return (
    <section className="rounded border border-line bg-white shadow-panel dark:border-slate-700 dark:bg-[#17202a]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 dark:border-slate-700">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-52 rounded border border-line bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Bu sekmede ara" />
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded border border-line bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </div>
      </div>
      <div className="hidden md:block">
        <table className="w-full table-auto text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead>
          <tbody>{filtered.map((row, rowIndex) => <tr key={rowIndex} onClick={row.onClick} className={`border-t border-line transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900 ${row.onClick ? 'cursor-pointer' : ''}`}>{row.cells.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 align-middle">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 md:hidden">
        {filtered.map((row, rowIndex) => <div key={rowIndex} onClick={row.onClick} className={`rounded border border-line p-3 dark:border-slate-700 ${row.onClick ? 'cursor-pointer' : ''}`}>{row.cells.map((cell, cellIndex) => <div key={cellIndex} className="flex justify-between gap-3 py-1 text-sm"><span className="text-slate-500">{headers[cellIndex]}</span><span className="text-right font-semibold">{cell}</span></div>)}</div>)}
      </div>
      {!filtered.length && <div className="p-6 text-sm text-slate-500">Bu sekmede kayit bulunamadi.</div>}
    </section>
  );
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-panel backdrop-blur transition-all duration-200 dark:border-slate-700/70 dark:bg-[#17202a]/90"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-black tracking-tight">{title}</h2>{actions}</div>{children}</section>;
}

function DataTable({ title, headers, rows, actions }: { title: string; headers: string[]; rows: ReactNode[][]; actions?: ReactNode }) {
  const [query, setQuery] = useState('');
  const filteredRows = rows.filter((row) => row.map(nodeText).join(' ').toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-panel backdrop-blur dark:border-slate-700/70 dark:bg-[#17202a]/90">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 p-5 dark:border-slate-700/70">
        <h1 className="text-lg font-black tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-52 rounded-xl border border-line bg-white/90 px-3 text-sm outline-none transition focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80" placeholder="Tabloda ara" />
          {actions}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"><tr>{headers.map((header) => <th key={header} className="px-5 py-4 font-bold">{header}</th>)}</tr></thead>
          <tbody>{filteredRows.map((row, index) => <tr key={index} className="border-t border-line/70 transition hover:bg-slate-50/90 hover:shadow-sm dark:border-slate-700/70 dark:hover:bg-slate-900/80">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-5 py-4 align-middle">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (typeof node === 'object' && 'props' in node) return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  return '';
}

function Button({ children, onClick, icon, variant = 'primary', disabled, className = '' }: { children: ReactNode; onClick?: () => void; icon?: ReactNode; variant?: 'primary' | 'soft'; disabled?: boolean; className?: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variant === 'primary' ? 'bg-ocean text-white shadow-sm shadow-ocean/15 hover:-translate-y-0.5 hover:bg-[#0e5c70] hover:shadow-lg hover:shadow-ocean/20' : 'border border-line bg-white/90 text-ocean shadow-sm hover:-translate-y-0.5 hover:bg-mint dark:border-slate-700 dark:bg-slate-900/80'} ${className}`}>{icon}{children}</button>;
}

function IconButton({ children, title, onClick }: { children: ReactNode; title: string; onClick?: () => void }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/90 text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ocean hover:bg-mint hover:text-ocean dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">{children}</button>;
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-mint px-2 py-1 text-xs font-semibold text-ocean">{children}</span>;
}

function ProductThumb({ product }: { product: Partial<Product> }) {
  const [open, setOpen] = useState(false);
  if (product.imageUrl) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="block h-14 w-14 overflow-hidden rounded-lg border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700">
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        </button>
        {open && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
            <img src={product.imageUrl} alt="" className="max-h-[82vh] max-w-[92vw] rounded-lg bg-white object-contain shadow-2xl" />
          </div>
        )}
      </>
    );
  }
  return <div className="grid h-14 w-14 place-items-center rounded-lg border border-line bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800"><Boxes size={21} /></div>;
}

function SalesProductImage({ product, compact = false }: { product: Partial<Product>; compact?: boolean }) {
  const frameClass = compact
    ? 'grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-line bg-white p-1 shadow-sm dark:border-slate-700'
    : 'grid h-24 w-24 shrink-0 place-items-center rounded-2xl border border-line bg-white p-2 shadow-sm dark:border-slate-700';
  if (product.imageUrl) {
    return (
      <div className={frameClass}>
        <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return <div className={`${frameClass} text-slate-500 dark:bg-slate-800`}><Boxes size={compact ? 20 : 28} /></div>;
}

function ModalFrame({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-4"><section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded border border-line bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#17202a]"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><IconButton title="Kapat" onClick={onClose}><X size={18} /></IconButton></div>{children}</section></div>;
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function FormInput({ label, value, onChange, type = 'text' }: { label: string; value?: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}<input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white/90 px-3 text-ink outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white" /></label>;
}

function FormNumber({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  const [text, setText] = useState(String(value ?? 0));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value ?? 0));
  }, [value, focused]);
  return <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}<input type="text" inputMode="decimal" step="0.01" value={text} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setText(String(positiveNumber(text))); }} onChange={(event) => { const normalized = event.target.value.replace(',', '.'); setText(normalized); setValue(positiveNumber(normalized)); }} className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white/90 px-3 text-ink outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white" /></label>;
}

function FormSelect({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white/90 px-3 text-ink outline-none focus:border-ocean focus:ring-4 focus:ring-ocean/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Segment({ value, setValue }: { value: 'TRY' | 'USD'; setValue: (value: 'TRY' | 'USD') => void }) {
  return <div className="flex rounded-xl border border-line bg-white/70 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">{(['TRY', 'USD'] as const).map((item) => <button key={item} onClick={() => setValue(item)} className={`h-9 flex-1 rounded-lg px-3 text-sm font-black transition ${value === item ? 'bg-ocean text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{item}</button>)}</div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? 'text-lg font-bold' : 'text-sm'}`}><span className="text-slate-500 dark:text-slate-400">{label}</span><span>{value}</span></div>;
}

function LoginPage({ mode = 'any', onLogin }: { mode?: 'any' | 'admin' | 'portal'; onLogin: (token: string, user: UserSession) => void }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [newPassword, setNewPassword] = useState('');
  const [session, setSession] = useState<{ accessToken: string; user: UserSession } | null>(null);
  const [message, setMessage] = useState(mode === 'portal' ? 'Musteri veya bayi hesabinizla giris yapin.' : 'Admin veya personel hesabinizla giris yapin.');

  async function login() {
    try {
      const result = await apiPost<{ accessToken: string; user: UserSession }>('/auth/login', form);
      const portalRole = result.user.role === 'CUSTOMER' || result.user.role === 'DEALER';
      if (mode === 'portal' && !portalRole) throw new Error('Bu sayfaya sadece musteri veya bayi kullanicisi girebilir.');
      if (mode === 'admin' && portalRole) throw new Error('Bu sayfaya sadece admin veya personel kullanicisi girebilir.');
      if (result.user.mustChangePassword) {
        setSession(result);
        setMessage('Ilk giris: lutfen yeni sifrenizi belirleyin.');
        return;
      }
      onLogin(result.accessToken, result.user);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function changePassword() {
    if (!session) return;
    try {
      const response = await fetch(apiUrl('/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
      const fresh = await apiPost<{ accessToken: string; user: UserSession }>('/auth/login', { email: form.email, password: newPassword });
      const portalRole = fresh.user.role === 'CUSTOMER' || fresh.user.role === 'DEALER';
      if (mode === 'portal' && !portalRole) throw new Error('Bu sayfaya sadece musteri veya bayi kullanicisi girebilir.');
      if (mode === 'admin' && portalRole) throw new Error('Bu sayfaya sadece admin veya personel kullanicisi girebilir.');
      onLogin(fresh.accessToken, { ...fresh.user, mustChangePassword: false });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function forgotPassword() {
    try {
      await apiPost('/auth/forgot-password', { email: form.email });
      setMessage('Sifre sifirlama SMS/e-posta altyapisina hazirlandi.');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#eaf7f4_0,#f6f8fb_42%,#eef3f7_100%)] p-4 text-ink">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-2xl backdrop-blur lg:grid-cols-[1fr_430px]">
        <div className="hidden bg-gradient-to-br from-ocean to-[#0b3f4d] p-10 text-white lg:block">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><Building2 size={28} /></div>
          <h1 className="mt-8 text-4xl font-black tracking-tight">Bulut ERP Pro</h1>
          <p className="mt-3 max-w-md text-white/75">Musteri ve bayi portali: siparis, bakiye, teklif, satis gecmisi ve odeme bildirimi tek ekranda.</p>
          <div className="mt-10 grid gap-3 text-sm font-semibold text-white/80">
            <span>JWT oturum ve rol bazli panel</span>
            <span>Her musteri sadece kendi cari verisini gorur</span>
            <span>Siparisler admin onayiyla satisa donusur</span>
          </div>
        </div>
        <div className="p-7">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint text-ocean"><UserRound /></div>
          <h2 className="mt-5 text-2xl font-black">Giris yap</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{message}</p>
          {!session ? (
            <div className="mt-6 space-y-4">
              <FormInput label="Kullanici adi veya e-posta" value={form.email} onChange={(email) => setForm({ ...form, email })} />
              <FormInput label="Sifre" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
              <Button onClick={login} icon={<UserRound size={17} />}>Giris yap</Button>
              <button type="button" onClick={forgotPassword} className="text-sm font-bold text-ocean hover:underline">Sifremi unuttum</button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <FormInput label="Yeni sifre" type="password" value={newPassword} onChange={setNewPassword} />
              <Button disabled={newPassword.length < 6} onClick={changePassword}>Sifreyi degistir ve devam et</Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function DualSummary({ label, tryValue, usdValue, strong }: { label: string; tryValue: number; usdValue: number; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line p-3 shadow-sm dark:border-slate-700 ${strong ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white/60 dark:bg-slate-900/40'}`}>
      <div className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <DualMoney tryValue={tryValue} usdValue={usdValue} compact />
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-panel transition hover:-translate-y-1 hover:shadow-lift dark:border-slate-700/70 dark:bg-[#17202a]/90"><div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</div>{icon && <span className="grid h-10 w-10 place-items-center rounded-2xl bg-mint text-ocean">{icon}</span>}</div><div className="mt-2 text-lg font-black">{value}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="text-right font-semibold">{value}</span></div>;
}
