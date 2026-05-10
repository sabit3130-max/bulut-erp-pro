export type Role = 'ADMIN' | 'PERSONEL' | 'ACCOUNTING' | 'SALES' | 'WAREHOUSE' | 'CUSTOMER' | 'DEALER' | 'VIEWER';
export type Currency = 'TRY' | 'USD';
export type OrderStatus = 'Beklemede' | 'Onaylandi' | 'Hazirlaniyor' | 'Kargoda' | 'Teslim edildi' | 'Iptal edildi';

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  passwordHash: string;
  role: Role;
  accountId?: string;
  active?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface Account {
  id: string;
  code: string;
  type: 'MUSTERI' | 'BAYI' | 'TEDARIKCI';
  companyName: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
  taxOffice: string;
  taxNumber: string;
  address: string;
  balanceTry: number;
  balanceUsd: number;
  riskLimit: number;
  dueDay: number;
  note: string;
  autoCollectionEnabled?: boolean;
  collectionDay?: number;
  maxCollectionAmount?: number;
  paymentCurrency?: Currency;
  cardToken?: string;
  lastCollectionDate?: string;
  lastCollectionStatus?: 'basarili' | 'basarisiz' | 'beklemede';
  paymentWarning?: string;
  lastSaleDate?: string;
  lastPurchaseDate?: string;
  lastTransactionDate?: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  barcode: string;
  category: string;
  subCategory?: string;
  brand: string;
  description: string;
  imageUrl?: string;
  warehouse: string;
  stock: number;
  criticalStock: number;
  vatRate?: number;
  purchaseTry: number;
  purchaseUsd: number;
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
}

export interface Sale {
  id: string;
  accountId: string;
  items?: TransactionItem[];
  currency: Currency;
  exchangeRate?: number;
  paymentMethod?: string;
  description?: string;
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
  method: 'Nakit' | 'Havale/EFT' | 'Kredi karti' | 'Cek' | 'Senet';
  currency: Currency;
  amount: number;
  tlAmount?: number;
  usdAmount?: number;
  exchangeRate?: number;
  appliedToTlBalance?: number;
  appliedToUsdBalance?: number;
  remainingTlBalance?: number;
  remainingUsdBalance?: number;
  createdAt: string;
  status?: 'basarili' | 'basarisiz' | 'beklemede';
  receiptNo?: string;
  paymentLink?: string;
  failureReason?: string;
  description?: string;
}

export interface PaymentLog {
  id: string;
  accountId: string;
  provider: 'TOSLA';
  status: 'basarili' | 'basarisiz' | 'beklemede';
  amount: number;
  currency: Currency;
  message: string;
  createdAt: string;
}

export interface Order {
  id: string;
  accountId: string;
  userId?: string;
  dealerName?: string;
  userName?: string;
  phone?: string;
  items?: TransactionItem[];
  status: OrderStatus;
  currency?: Currency;
  exchangeRate?: number;
  totalTry: number;
  totalUsd: number;
  description?: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  items: TransactionItem[];
  currency: Currency;
  exchangeRate?: number;
  subtotal: number;
  vat: number;
  total: number;
  invoiceNo?: string;
  paymentStatus?: 'Odendi' | 'Bekliyor' | 'Kismi';
  description?: string;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  method: 'Nakit' | 'Havale/EFT' | 'Kredi karti';
  currency: Currency;
  amount: number;
  receiptNo: string;
  description?: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  quoteNo?: string;
  accountId: string;
  items: TransactionItem[];
  currency: Currency;
  exchangeRate?: number;
  subtotal: number;
  vat: number;
  discount: number;
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
  status: 'Taslak' | 'Hazirlaniyor' | 'Gonderildi' | 'Musteri goruntuledi' | 'Onaylandi' | 'Reddedildi' | 'Iptal edildi' | 'Suresi gecti';
  note?: string;
  internalNote?: string;
  deliveryTime?: string;
  paymentTerm?: string;
  warranty?: string;
  assemblyIncluded?: boolean;
  salesRep?: string;
  createdBy?: string;
  revision?: number;
  timeline?: { date: string; action: string; user: string }[];
  messageHistory?: { date: string; channel: string; message: string }[];
  pdfHistory?: { date: string; fileName: string }[];
  revisions?: string[];
  createdAt: string;
}

export interface PdfTemplateSettings {
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
}

export interface PdfTemplate {
  id: string;
  type: 'Teklif' | 'SatisFisi' | 'TahsilatMakbuzu' | 'Fatura' | 'CariEkstre' | 'AlisFisi' | 'SiparisFormu';
  name: string;
  logoUrl?: string;
  stampUrl?: string;
  signatureEnabled: boolean;
  color: string;
  fontFamily: string;
  title: string;
  footer: string;
  fields: string[];
  active: boolean;
  settings?: PdfTemplateSettings;
}

export interface MessageTemplate {
  id: string;
  type: 'WhatsAppSatis' | 'BorcHatirlatma' | 'Tahsilat' | 'SiparisDurumu' | 'Teklif' | 'Mail';
  name: string;
  body: string;
  default: boolean;
  active: boolean;
}
