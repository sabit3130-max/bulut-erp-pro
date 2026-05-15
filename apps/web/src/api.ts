export interface Account {
  id: string;
  code: string;
  type: string;
  companyName: string;
  contactName: string;
  phone?: string;
  whatsapp: string;
  email?: string;
  taxOffice?: string;
  taxNumber?: string;
  address?: string;
  city?: string;
  district?: string;
  balanceTry: number;
  balanceUsd: number;
  riskLimit: number;
  dueDay: number;
  note?: string;
  autoCollectionEnabled?: boolean;
  collectionDay?: number;
  maxCollectionAmount?: number;
  paymentCurrency?: 'TRY' | 'USD';
  cardToken?: string;
  lastCollectionDate?: string;
  lastCollectionStatus?: string;
  paymentWarning?: string;
  lastSaleDate?: string;
  lastPurchaseDate?: string;
  lastTransactionDate?: string;
  totalRevenueTry?: number;
  totalRevenueUsd?: number;
  totalRevenueDisplayTry?: number;
  totalRevenueDisplayUsd?: number;
  balanceDisplayTry?: number;
  balanceDisplayUsd?: number;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  role: 'ADMIN' | 'PERSONEL' | 'ACCOUNTING' | 'SALES' | 'WAREHOUSE' | 'CUSTOMER' | 'DEALER' | 'VIEWER';
  accountId?: string;
  active?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  barcode: string;
  category: string;
  subCategory?: string;
  brand: string;
  description?: string;
  imageUrl?: string;
  warehouse: string;
  stock: number;
  criticalStock: number;
  vatRate?: number;
  purchaseTry?: number;
  purchaseUsd?: number;
  saleTry: number;
  saleUsd: number;
  dealerTry: number;
  dealerUsd: number;
  fixedTryPrice: boolean;
  active?: boolean;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  icon: string;
  imageUrl?: string;
  description?: string;
  sortOrder: number;
  active: boolean;
  defaultProfitRate?: number;
  dealerPriceRate: number;
  discountRate: number;
  vatRate: number;
  criticalStockLimit: number;
  productCount?: number;
  stockValue?: number;
  totalSales?: number;
}

export interface Sale {
  id: string;
  accountId: string;
  accountName?: string;
  items?: TransactionItem[];
  currency: 'TRY' | 'USD';
  exchangeRate?: number;
  paymentMethod?: string;
  description?: string;
  status?: 'Aktif' | 'Iptal';
  subtotal: number;
  vat: number;
  discount: number;
  total: number;
  subtotalTry?: number;
  subtotalUsd?: number;
  vatTry?: number;
  vatUsd?: number;
  totalTry?: number;
  totalUsd?: number;
  paidTry?: number;
  paidUsd?: number;
  remainingTry?: number;
  remainingUsd?: number;
  paid: number;
  remaining: number;
  createdAt: string;
}

export interface TransactionItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitPriceTry?: number;
  unitPriceUsd?: number;
  discountRate?: number;
  vatRate?: number;
  discountTry?: number;
  discountUsd?: number;
  vatTry?: number;
  vatUsd?: number;
  lineTotalTry?: number;
  lineTotalUsd?: number;
}

export interface Collection {
  id: string;
  accountId: string;
  method: string;
  currency: 'TRY' | 'USD';
  amount: number;
  tlAmount?: number;
  usdAmount?: number;
  exchangeRate?: number;
  appliedToTlBalance?: number;
  appliedToUsdBalance?: number;
  remainingTlBalance?: number;
  remainingUsdBalance?: number;
  createdAt: string;
  accountName?: string;
  status?: string;
  receiptNo?: string;
  paymentLink?: string;
  failureReason?: string;
  description?: string;
}

export interface PaymentLog {
  id: string;
  accountId: string;
  accountName?: string;
  provider: string;
  status: string;
  amount: number;
  currency: 'TRY' | 'USD';
  message: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName?: string;
  currency: 'TRY' | 'USD';
  exchangeRate?: number;
  subtotal: number;
  vat: number;
  total: number;
  invoiceNo?: string;
  paymentStatus?: string;
  description?: string;
  items?: TransactionItem[];
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName?: string;
  method: string;
  currency: 'TRY' | 'USD';
  amount: number;
  receiptNo: string;
  description?: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  quoteNo?: string;
  accountId: string;
  accountName?: string;
  currency: 'TRY' | 'USD';
  exchangeRate?: number;
  subtotal?: number;
  vat?: number;
  discount?: number;
  total: number;
  subtotalTry?: number;
  subtotalUsd?: number;
  vatTry?: number;
  vatUsd?: number;
  discountTry?: number;
  discountUsd?: number;
  totalTry?: number;
  totalUsd?: number;
  validUntil: string;
  status: string;
  note?: string;
  deliveryTime?: string;
  paymentTerm?: string;
  warranty?: string;
  assemblyIncluded?: boolean;
  salesRep?: string;
  createdBy?: string;
  revision?: number;
  items?: TransactionItem[];
  timeline?: { date: string; action: string; user: string }[];
  messageHistory?: { date: string; channel: string; message: string }[];
  pdfHistory?: { date: string; fileName: string }[];
  revisions?: string[];
  createdAt: string;
}

export interface PdfTemplate {
  id: string;
  type: string;
  name: string;
  logoUrl?: string;
  stampUrl?: string;
  signatureEnabled?: boolean;
  color: string;
  fontFamily: string;
  title: string;
  footer: string;
  fields: string[];
  active: boolean;
  settings?: {
    paperType?: 'A4' | 'A5';
    marginMm?: number;
    headerColor?: string;
    tableHeaderColor?: string;
    tableBorderColor?: string;
    textColor?: string;
    buttonColor?: string;
    titleSize?: number;
    bodySize?: number;
    lineHeight?: number;
    logoSize?: number;
    logoAlign?: 'left' | 'center' | 'right';
    companyName?: string;
    subtitle?: string;
    contactInfo?: string;
    footerText?: string;
    showSignature?: boolean;
    showStamp?: boolean;
    showBankInfo?: boolean;
    showQr?: boolean;
    showWhatsapp?: boolean;
    bankInfo?: string;
    whatsapp?: string;
    columns?: string[];
    positions?: Record<string, { x: number; y: number }>;
  };
}

export interface MessageTemplate {
  id: string;
  type: string;
  channel?: string;
  name: string;
  body: string;
  default: boolean;
  active: boolean;
}

export interface LedgerLine {
  id: string;
  date: string;
  type: string;
  description: string;
  debitTry: number;
  debitUsd: number;
  creditTry: number;
  creditUsd: number;
}

export interface AccountDetail {
  account: Account;
  sales: Sale[];
  collections: Collection[];
  purchases?: Purchase[];
  supplierPayments?: SupplierPayment[];
  ledger: LedgerLine[];
}

export interface Dashboard {
  usdRate: number;
  usdRateUpdatedAt: string;
  dailySales: number;
  weeklySales: number;
  monthlySales: number;
  totalRevenue: number;
  totalCollected: number;
  cashStatus: number;
  bankStatus: number;
  balanceTry: number;
  balanceUsd: number;
  overduePayments: Account[];
  criticalStocks: Product[];
  latestSales: Sale[];
  latestOrders: { id: string; status: string; totalTry: number; totalUsd: number }[];
  latestCollections: { id: string; method: string; amount: number; currency: string }[];
  counts?: { customers: number; suppliers: number; products: number; purchases: number; quotes: number };
  chart: { label: string; sales: number; collections: number }[];
}

export interface Order {
  id: string;
  accountId: string;
  accountName?: string;
  userId?: string;
  dealerName?: string;
  userName?: string;
  phone?: string;
  items?: TransactionItem[];
  status: string;
  currency?: 'TRY' | 'USD';
  exchangeRate?: number;
  totalTry: number;
  totalUsd: number;
  description?: string;
  createdAt: string;
}

declare global {
  interface Window {
    __ERP_CONFIG__?: { VITE_API_URL?: string };
  }
}

function configuredApiBaseUrl() {
  const runtimeUrl = typeof window !== 'undefined' ? window.__ERP_CONFIG__?.VITE_API_URL : '';
  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('erp_api_url') : '';
  const envUrl = import.meta.env.VITE_API_URL;
  if (runtimeUrl) return runtimeUrl;
  if (storedUrl) return storedUrl;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000') {
    return 'http://localhost:3000';
  }
  return '';
}

export const API_BASE_URL = configuredApiBaseUrl();
console.log('API_BASE_URL:', API_BASE_URL);

const jsonHeaders = { 'Content-Type': 'application/json' };

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('erp_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiUrl(path: string) {
  const normalizedBase = API_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}/api${normalizedPath}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { headers: authHeaders() });
  if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
  return parseJsonResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { ...jsonHeaders, ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
  return parseJsonResponse<T>(response);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: { ...jsonHeaders, ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
  return parseJsonResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error((await response.text()) || 'API ba\u011Flant\u0131s\u0131 kurulamad\u0131');
  return parseJsonResponse<T>(response);
}

export async function apiHealthCheck(): Promise<{ status: 'ok' }> {
  const url = apiUrl('/health');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API ba\u011Flant\u0131s\u0131 kurulamad\u0131: ${url}`);
  const data = await parseJsonResponse<{ status?: string }>(response);
  if (data.status !== 'ok') throw new Error(`API health yan\u0131t\u0131 hatal\u0131: ${url}`);
  return { status: 'ok' };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const preview = (await response.text()).slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(`API JSON yerine farkli yanit dondu. Adres: ${response.url}. Yanit: ${preview}`);
  }
  return response.json() as Promise<T>;
}
