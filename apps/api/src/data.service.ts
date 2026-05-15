import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Account, Category, Collection, Currency, MessageTemplate, Order, PaymentLog, PdfTemplate, Product, Purchase, Quote, Sale, SupplierPayment, TransactionItem, User } from './types';

@Injectable()
export class DataService {
  private readonly storePath = process.env.ERP_STORE_PATH || join(__dirname, '..', '..', '..', 'data', 'erp-store.json');
  private usdRate = 45.2714;
  private usdRateUpdatedAt = new Date().toISOString();

  private users: User[] = [];
  private accounts: Account[] = [];
  private products: Product[] = [];
  private categories: Category[] = [];
  private sales: Sale[] = [];
  private collections: Collection[] = [];
  private paymentLogs: PaymentLog[] = [];
  private purchases: Purchase[] = [];
  private supplierPayments: SupplierPayment[] = [];
  private quotes: Quote[] = [];
  private pdfTemplates: PdfTemplate[] = [];
  private messageTemplates: MessageTemplate[] = [];
  private orders: Order[] = [];

  constructor(private readonly jwt: JwtService) {
    this.assertProductionStoreSafety();
    this.loadFromDisk();
    this.bootstrapAdminFromEnv();
    this.setupAutoBackup();
  }

  login(identifier: string, password: string) {
    const normalized = String(identifier ?? '').trim().toLocaleLowerCase('tr-TR');
    const user = this.users.find((item) => [item.email, item.username].filter(Boolean).some((value) => String(value).trim().toLocaleLowerCase('tr-TR') === normalized) && compareSync(password, item.passwordHash));
    if (!user) throw new UnauthorizedException('E-posta veya sifre hatali');
    if (user.active === false) throw new UnauthorizedException('Kullanici hesabi pasif');
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { accessToken: this.jwt.sign(safeUser), user: safeUser };
  }

  me(token?: string) {
    if (!token) throw new UnauthorizedException('Oturum bulunamadi');
    try {
      const payload = this.jwt.verify(token.replace(/^Bearer\s+/i, '')) as { id: string };
      const user = this.users.find((item) => item.id === payload.id);
      if (!user) throw new UnauthorizedException('Kullanici bulunamadi');
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return safeUser;
    } catch {
      throw new UnauthorizedException('Oturum gecersiz');
    }
  }

  dashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const activeSales = this.sales.filter((sale) => sale.status !== 'Iptal');
    const totalRevenue = activeSales.reduce((sum, sale) => sum + this.toTry(sale.total, sale.currency), 0);
    const totalCollected = this.collections.filter((item) => item.status !== 'basarisiz').reduce((sum, item) => sum + this.toTry(item.amount, item.currency), 0);
    const dailySales = activeSales.filter((sale) => sale.createdAt.startsWith(today)).reduce((sum, sale) => sum + this.toTry(sale.total, sale.currency), 0);
    return {
      usdRate: this.usdRate,
      usdRateUpdatedAt: this.usdRateUpdatedAt,
      dailySales,
      weeklySales: Math.round(totalRevenue * 0.38),
      monthlySales: totalRevenue,
      totalRevenue,
      totalCollected,
      cashStatus: Math.round(totalCollected * 0.28),
      bankStatus: Math.round(totalCollected * 0.72),
      balanceTry: this.accounts.reduce((sum, account) => sum + account.balanceTry, 0),
      balanceUsd: this.accounts.reduce((sum, account) => sum + account.balanceUsd, 0),
      overduePayments: this.accounts.filter((account) => account.type !== 'TEDARIKCI' && (account.balanceTry > 0 || account.balanceUsd > 0)).slice(0, 8),
      criticalStocks: this.products.filter((product) => product.active !== false && product.stock <= product.criticalStock),
      latestSales: this.listSales().slice(0, 10),
      latestOrders: this.orders,
      latestCollections: this.collections.filter((item) => item.status !== 'basarisiz').slice(0, 10),
      counts: {
        customers: this.accounts.filter((item) => item.type !== 'TEDARIKCI').length,
        suppliers: this.accounts.filter((item) => item.type === 'TEDARIKCI').length,
        products: this.products.length,
        purchases: this.purchases.length,
        quotes: this.quotes.length,
        categories: this.categories.length,
      },
      chart: ['Pzt', 'Sali', 'Cars', 'Pers', 'Cuma', 'Cmt'].map((label, index) => ({
        label,
        sales: 18000 + index * 4200,
        collections: 11000 + index * 3100,
      })),
    };
  }

  listUsers(authorization?: string) {
    this.requireAdmin(authorization);
    return this.users.map(({ passwordHash: _passwordHash, ...user }) => user);
  }

  createUser(authorization: string | undefined, input: { name: string; email: string; username?: string; password: string; role: 'CUSTOMER' | 'DEALER' | 'ADMIN' | 'PERSONEL' | 'ACCOUNTING' | 'SALES' | 'WAREHOUSE' | 'VIEWER'; accountId?: string; phone?: string; mustChangePassword?: boolean; active?: boolean }) {
    this.requireAdmin(authorization);
    const name = String(input.name ?? '').trim();
    const email = String(input.email ?? '').trim().toLocaleLowerCase('tr-TR');
    const username = String(input.username ?? email).trim().toLocaleLowerCase('tr-TR');
    if (!name) throw new BadRequestException('Ad soyad zorunlu');
    if (!email) throw new BadRequestException('E-posta zorunlu');
    if (!input.password || input.password.length < 6) throw new BadRequestException('Sifre en az 6 karakter olmali');
    if (this.users.some((item) => item.email.toLocaleLowerCase('tr-TR') === email || item.username?.toLocaleLowerCase('tr-TR') === username)) throw new BadRequestException('Bu e-posta veya kullanici adi zaten var');
    if (input.accountId) this.findAccount(input.accountId);
    if (['CUSTOMER', 'DEALER'].includes(input.role) && !input.accountId) throw new BadRequestException('Musteri/bayi kullanicisi cari hesabina bagli olmali');
    const user: User = {
      id: this.nextId('u', this.users),
      name,
      email,
      username,
      phone: input.phone ?? '',
      passwordHash: hashSync(input.password, 10),
      role: input.role,
      accountId: input.accountId,
      active: input.active ?? true,
      mustChangePassword: input.mustChangePassword ?? true,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    this.persist();
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  updateUser(authorization: string | undefined, id: string, input: Partial<User> & { password?: string }) {
    this.requireAdmin(authorization);
    const user = this.users.find((item) => item.id === id);
    if (!user) throw new NotFoundException('Kullanici bulunamadi');
    if (input.email && this.users.some((item) => item.id !== id && item.email.toLocaleLowerCase('tr-TR') === input.email!.toLocaleLowerCase('tr-TR'))) throw new BadRequestException('E-posta zaten kullanimda');
    if (input.username && this.users.some((item) => item.id !== id && item.username?.toLocaleLowerCase('tr-TR') === input.username!.toLocaleLowerCase('tr-TR'))) throw new BadRequestException('Kullanici adi zaten kullanimda');
    Object.assign(user, {
      name: input.name ?? user.name,
      email: input.email ?? user.email,
      username: input.username ?? user.username,
      phone: input.phone ?? user.phone,
      role: input.role ?? user.role,
      accountId: input.accountId ?? user.accountId,
      active: input.active ?? user.active,
      mustChangePassword: input.mustChangePassword ?? user.mustChangePassword,
    });
    if (input.password) user.passwordHash = hashSync(input.password, 10);
    this.persist();
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  changePassword(authorization: string | undefined, password: string) {
    if (!password || password.length < 6) throw new BadRequestException('Sifre en az 6 karakter olmali');
    const safeUser = this.me(authorization);
    const user = this.users.find((item) => item.id === safeUser.id);
    if (!user) throw new NotFoundException('Kullanici bulunamadi');
    user.passwordHash = hashSync(password, 10);
    user.mustChangePassword = false;
    this.persist();
    return { ok: true };
  }

  forgotPassword(email: string) {
    return { ok: true, message: `${email} icin sifre sifirlama SMS/e-posta altyapisina hazirlandi.` };
  }

  exchangeRate() {
    return { usdTry: this.usdRate, updatedAt: this.usdRateUpdatedAt };
  }

  exportStore(authorization?: string) {
    this.requireAdmin(authorization);
    return {
      exportedAt: new Date().toISOString(),
      usdRate: this.usdRate,
      usdRateUpdatedAt: this.usdRateUpdatedAt,
      accounts: this.accounts,
      products: this.products,
      categories: this.categories,
      sales: this.sales,
      collections: this.collections,
      paymentLogs: this.paymentLogs,
      purchases: this.purchases,
      supplierPayments: this.supplierPayments,
      quotes: this.quotes,
      pdfTemplates: this.pdfTemplates,
      messageTemplates: this.messageTemplates,
      orders: this.orders,
      users: this.users,
    };
  }

  importStore(authorization: string | undefined, input: ReturnType<DataService['exportStore']>) {
    this.requireAdmin(authorization);
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DATA_IMPORT !== 'true') {
      throw new BadRequestException('Production ortaminda yedek import kapali. Veri overwrite riskine karsi ALLOW_DATA_IMPORT=true olmadan calismaz.');
    }
    if (!input || !Array.isArray(input.accounts) || !Array.isArray(input.products)) throw new BadRequestException('Yedek dosyasi hatali');
    this.usdRate = this.number(input.usdRate, this.usdRate);
    this.usdRateUpdatedAt = input.usdRateUpdatedAt || new Date().toISOString();
    this.accounts = input.accounts;
    this.products = input.products;
    this.categories = input.categories ?? this.categories;
    this.sales = input.sales ?? [];
    this.collections = input.collections ?? [];
    this.paymentLogs = input.paymentLogs ?? [];
    this.purchases = input.purchases ?? [];
    this.supplierPayments = input.supplierPayments ?? [];
    this.quotes = input.quotes ?? [];
    this.pdfTemplates = input.pdfTemplates ?? this.pdfTemplates;
    this.messageTemplates = input.messageTemplates ?? this.messageTemplates;
    this.orders = input.orders ?? [];
    this.users = (input as unknown as { users?: User[] }).users ?? this.users;
    this.persist();
    return { ok: true, accounts: this.accounts.length, products: this.products.length, sales: this.sales.length };
  }

  async updateExchangeRate(input?: { rate?: number }) {
    let rate = Number(input?.rate ?? 0);
    let source = 'manual';
    if (!rate) {
      const response = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml');
      if (!response.ok) throw new BadRequestException('Kur servisine ulasilamadi, manuel kur girin');
      const xml = await response.text();
      const match = xml.match(/Currency CrossOrder="0"[^]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);
      if (!match) throw new BadRequestException('TCMB kuru okunamadi, manuel kur girin');
      rate = Number(match[1]);
      source = 'TCMB';
    }
    if (!Number.isFinite(rate) || rate <= 0) throw new BadRequestException('Kur pozitif olmali');
    this.usdRate = Math.round(rate * 10000) / 10000;
    this.usdRateUpdatedAt = new Date().toISOString();
    this.products = this.products.map((product) => product.fixedTryPrice ? product : ({
      ...product,
      purchaseTry: Math.round(product.purchaseUsd * this.usdRate),
      saleTry: Math.round(product.saleUsd * this.usdRate),
      dealerTry: Math.round(product.dealerUsd * this.usdRate),
    }));
    this.persist();
    return { usdTry: this.usdRate, updatedAt: this.usdRateUpdatedAt, source };
  }

  listAccounts(query = '') {
    const needle = this.normalizeSearch(query);
    return this.accounts
      .filter((account) => {
        if (!needle) return true;
        return [
          account.companyName,
          account.code,
          account.phone,
          account.whatsapp,
          account.email,
          account.contactName,
          account.taxNumber,
          account.taxOffice,
        ].some((value) => this.normalizeSearch(value).includes(needle));
      })
      .map((account) => this.enrichAccount(account));
  }

  createAccount(input: Partial<Account> & Record<string, unknown>) {
    const type = input.type ?? 'MUSTERI';
    const requestedCode = String(input.code ?? '').trim();
    const autoCode = input.autoCode === true || !requestedCode;
    const code = autoCode ? this.generateAccountCode(type) : requestedCode;
    this.validateAccount({ ...input, type, code });
    if (this.accounts.some((item) => item.code.toLocaleLowerCase('tr-TR') === code.toLocaleLowerCase('tr-TR'))) throw new BadRequestException('Bu cari kodu zaten kullaniliyor.');
    const account: Account = {
      id: this.nextId('a', this.accounts),
      code,
      type,
      companyName: input.companyName || '',
      contactName: input.contactName || '',
      phone: input.phone || '',
      whatsapp: input.whatsapp || '',
      email: input.email || '',
      taxOffice: input.taxOffice || '',
      taxNumber: input.taxNumber || '',
      address: input.address || '',
      city: String(input.city ?? ''),
      district: String(input.district ?? ''),
      balanceTry: Number(input.balanceTry ?? 0),
      balanceUsd: Number(input.balanceUsd ?? 0),
      riskLimit: Number(input.riskLimit ?? 0),
      dueDay: Number(input.dueDay ?? 21),
      note: input.note || '',
    };
    this.accounts.unshift(account);
    this.persist();
    return account;
  }

  updateAccount(id: string, input: Partial<Account>) {
    const account = this.findAccount(id);
    const nextCode = String(input.code ?? '').trim();
    if (nextCode && this.accounts.some((item) => item.id !== id && item.code.toLocaleLowerCase('tr-TR') === nextCode.toLocaleLowerCase('tr-TR'))) throw new BadRequestException('Bu cari kodu zaten kullaniliyor.');
    Object.assign(account, {
      ...input,
      code: nextCode || account.code,
      balanceTry: input.balanceTry === undefined ? account.balanceTry : Number(input.balanceTry),
      balanceUsd: input.balanceUsd === undefined ? account.balanceUsd : Number(input.balanceUsd),
      riskLimit: input.riskLimit === undefined ? account.riskLimit : Number(input.riskLimit),
      dueDay: input.dueDay === undefined ? account.dueDay : Number(input.dueDay),
    });
    this.validateAccount(account);
    this.persist();
    return account;
  }

  deleteAccount(id: string) {
    if (this.sales.some((item) => item.accountId === id) || this.collections.some((item) => item.accountId === id)) {
      throw new BadRequestException('Hareketi olan cari silinemez');
    }
    this.accounts = this.accounts.filter((item) => item.id !== id);
    this.persist();
    return { deleted: true };
  }

  accountDetail(id: string) {
    const account = this.findAccount(id);
    const sales = this.sales
      .filter((sale) => this.saleBelongsToAccount(sale, account))
      .map((sale) => this.enrichSale(sale))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const collections = this.collections.filter((collection) => collection.accountId === id);
    const purchases = this.listPurchases().filter((purchase) => purchase.supplierId === id);
    const supplierPayments = this.listSupplierPayments().filter((payment) => payment.supplierId === id);
    const ledger = [
      ...sales.map((sale) => {
        const totals = this.saleDualTotals(sale);
        const cancelled = sale.status === 'Iptal';
        return {
          id: sale.id,
          date: sale.createdAt,
          type: cancelled ? 'Satis iptal edildi' : 'Satis',
          description: cancelled ? `Satis fisi ${sale.id} iptal edildi` : `Satis fisi ${sale.id}`,
          debitTry: cancelled ? 0 : totals.totalTry,
          debitUsd: cancelled ? 0 : totals.totalUsd,
          creditTry: 0,
          creditUsd: 0,
        };
      }),
      ...collections.map((collection) => ({
        id: collection.id,
        date: collection.createdAt,
        type: 'Tahsilat',
        description: this.collectionLedgerDescription(collection),
        debitTry: 0,
        debitUsd: 0,
        creditTry: collection.appliedToTlBalance ?? (collection.currency === 'TRY' ? collection.amount : 0),
        creditUsd: collection.appliedToUsdBalance ?? (collection.currency === 'USD' ? collection.amount : 0),
      })),
      ...purchases.map((purchase) => ({
        id: purchase.id,
        date: purchase.createdAt,
        type: 'Alis',
        description: `Alis faturasi ${purchase.invoiceNo || purchase.id}`,
        debitTry: 0,
        debitUsd: 0,
        creditTry: purchase.currency === 'TRY' ? purchase.total : 0,
        creditUsd: purchase.currency === 'USD' ? purchase.total : 0,
      })),
      ...supplierPayments.map((payment) => ({
        id: payment.id,
        date: payment.createdAt,
        type: 'Tedarikci odemesi',
        description: `${payment.method} odeme`,
        debitTry: payment.currency === 'TRY' ? payment.amount : 0,
        debitUsd: payment.currency === 'USD' ? payment.amount : 0,
        creditTry: 0,
        creditUsd: 0,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return { account: this.enrichAccount(account), sales, collections, purchases, supplierPayments, ledger };
  }

  listProducts() {
    return this.products.map((product) => ({ ...product, active: product.active !== false }));
  }

  listCategories() {
    return this.categories.map((category) => {
      const categoryNames = this.categoryNameTree(category);
      const products = this.products.filter((product) => categoryNames.has(product.category) || (product.subCategory ? categoryNames.has(product.subCategory) : false));
      return {
        ...category,
        productCount: products.length,
        stockValue: products.reduce((sum, product) => sum + product.stock * product.saleTry, 0),
        totalSales: this.sales.reduce((sum, sale) => sum + (sale.items ?? []).filter((item) => products.some((product) => product.id === item.productId)).reduce((lineSum, item) => lineSum + item.lineTotal, 0), 0),
      };
    });
  }

  createCategory(input: Partial<Category>) {
    if (!input.name?.trim()) throw new BadRequestException('Kategori adi zorunlu');
    if (this.categories.some((item) => item.name.toLocaleLowerCase('tr') === input.name!.trim().toLocaleLowerCase('tr'))) throw new BadRequestException('Kategori adi zaten kullaniliyor');
    const category: Category = {
      id: this.nextId('cat', this.categories),
      name: input.name,
      parentId: input.parentId || '',
      icon: input.icon || 'Boxes',
      imageUrl: input.imageUrl || '',
      sortOrder: this.number(input.sortOrder, this.categories.length + 1),
      active: input.active ?? true,
      dealerPriceRate: this.number(input.dealerPriceRate, 0),
      discountRate: this.number(input.discountRate, 0),
      vatRate: this.number(input.vatRate, 20),
      defaultProfitRate: this.number(input.defaultProfitRate, this.number(input.dealerPriceRate, 0)),
      description: input.description || '',
      criticalStockLimit: this.number(input.criticalStockLimit, 10),
    };
    this.categories.push(category);
    this.persist();
    return category;
  }

  updateCategory(id: string, input: Partial<Category>) {
    const category = this.findCategory(id);
    const oldName = category.name;
    const nextName = input.name?.trim() ?? category.name;
    if (!nextName) throw new BadRequestException('Kategori adi zorunlu');
    if (this.categories.some((item) => item.id !== id && item.name.toLocaleLowerCase('tr') === nextName.toLocaleLowerCase('tr'))) throw new BadRequestException('Kategori adi zaten kullaniliyor');
    Object.assign(category, input);
    category.name = nextName;
    if (oldName !== nextName) {
      this.products = this.products.map((product) => ({
        ...product,
        category: product.category === oldName ? nextName : product.category,
        subCategory: product.subCategory === oldName ? nextName : product.subCategory,
      }));
    }
    this.persist();
    return category;
  }

  deleteCategory(id: string) {
    const category = this.findCategory(id);
    if (this.categories.some((item) => item.parentId === id)) throw new BadRequestException('Bu kategorinin alt kategorileri var. Once alt kategorileri tasiyin veya pasife alin.');
    if (this.products.some((product) => product.category === category.name || product.subCategory === category.name)) throw new BadRequestException('Bu kategoride urun var');
    this.categories = this.categories.filter((item) => item.id !== id);
    this.persist();
    return { deleted: true };
  }

  createProduct(input: Partial<Product> & Record<string, unknown>) {
    this.validateProduct(input);
    const requestedCode = String(input.code ?? '').trim();
    if (requestedCode && this.products.some((item) => item.code === requestedCode)) throw new BadRequestException('Urun kodu zaten kullaniliyor');
    const saleUsd = this.number(input.saleUsd);
    const dealerUsd = this.number(input.dealerUsd);
    const purchaseUsd = this.number(input.purchaseUsd);
    const saleTry = this.number(input.saleTry) || Math.round(saleUsd * this.usdRate * 100) / 100;
    const dealerTry = this.number(input.dealerTry) || Math.round(dealerUsd * this.usdRate * 100) / 100;
    const purchaseTry = this.number(input.purchaseTry) || Math.round(purchaseUsd * this.usdRate * 100) / 100;
    const product: Product = {
      id: this.nextId('p', this.products),
      name: input.name || '',
      code: requestedCode || this.generateProductCode(),
      barcode: input.barcode || '',
      category: input.category || '',
      brand: input.brand || '',
      description: input.description || '',
      imageUrl: input.imageUrl || '',
      warehouse: input.warehouse || 'Merkez Depo',
      stock: this.number(input.stock, 0),
      criticalStock: this.number(input.criticalStock, 5),
      vatRate: this.number(input.vatRate, this.findCategoryByName(String(input.category)).vatRate),
      purchaseTry,
      purchaseUsd,
      saleTry,
      saleUsd,
      dealerTry,
      dealerUsd,
      fixedTryPrice: Boolean(input.fixedTryPrice ?? false),
      active: input.active ?? true,
    };
    this.products.unshift(product);
    this.persist();
    return product;
  }

  updateProduct(id: string, input: Partial<Product>) {
    const product = this.findProduct(id);
    if (input.code && this.products.some((item) => item.id !== id && item.code === input.code)) throw new BadRequestException('Urun kodu zaten kullaniliyor');
    const nextCode = input.code === undefined ? product.code : String(input.code).trim() || this.generateProductCode();
    Object.assign(product, {
      ...input,
      code: nextCode,
      stock: input.stock === undefined ? product.stock : this.number(input.stock),
      criticalStock: input.criticalStock === undefined ? product.criticalStock : this.number(input.criticalStock),
      purchaseTry: input.purchaseTry === undefined ? product.purchaseTry : this.number(input.purchaseTry),
      purchaseUsd: input.purchaseUsd === undefined ? product.purchaseUsd : this.number(input.purchaseUsd),
      saleTry: input.saleTry === undefined ? product.saleTry : this.number(input.saleTry),
      saleUsd: input.saleUsd === undefined ? product.saleUsd : this.number(input.saleUsd),
      dealerTry: input.dealerTry === undefined ? product.dealerTry : this.number(input.dealerTry),
      dealerUsd: input.dealerUsd === undefined ? product.dealerUsd : this.number(input.dealerUsd),
    });
    this.validateProduct(product);
    this.persist();
    return product;
  }

  deleteProduct(id: string) {
    if (this.productHasMovements(id)) throw new BadRequestException('Bu urunun hareket gecmisi oldugu icin silinemez. Urunu pasife almak ister misiniz?');
    this.products = this.products.filter((item) => item.id !== id);
    this.persist();
    return { deleted: true };
  }

  archiveProduct(id: string, active: boolean) {
    const product = this.findProduct(id);
    product.active = active;
    this.persist();
    return product;
  }

  listSales() {
    return this.sales.map((sale) => this.enrichSale(sale));
  }

  listCollections() {
    return this.collections.map((item) => ({ ...item, accountName: this.accounts.find((account) => account.id === item.accountId)?.companyName ?? item.accountId }));
  }

  listPaymentLogs() {
    return this.paymentLogs.map((item) => ({ ...item, accountName: this.accounts.find((account) => account.id === item.accountId)?.companyName ?? item.accountId }));
  }

  listPurchases() {
    return this.purchases.map((item) => ({ ...item, supplierName: this.accounts.find((account) => account.id === item.supplierId)?.companyName ?? item.supplierId }));
  }

  listSupplierPayments() {
    return this.supplierPayments.map((item) => ({ ...item, supplierName: this.accounts.find((account) => account.id === item.supplierId)?.companyName ?? item.supplierId }));
  }

  listQuotes() {
    return this.quotes.map((item) => ({ ...item, accountName: this.accounts.find((account) => account.id === item.accountId)?.companyName ?? item.accountId }));
  }

  listOrders() {
    return this.orders.map((order) => {
      const account = this.findAccount(order.accountId);
      const enriched = this.enrichOrderPrices(order);
      return {
        ...enriched,
        accountName: account.companyName,
        dealerName: order.dealerName ?? account.companyName,
        phone: order.phone ?? account.phone ?? account.whatsapp,
      };
    });
  }

  listDealerOrders(accountId: string) {
    const account = this.findAccount(accountId);
    if (account.type !== 'BAYI' && account.type !== 'MUSTERI') throw new BadRequestException('Musteri veya bayi carisi gerekli');
    return this.listOrders().filter((order) => order.accountId === account.id);
  }

  private portalUser(authorization?: string) {
    const user = this.me(authorization);
    if (!['CUSTOMER', 'DEALER', 'ADMIN'].includes(user.role)) throw new UnauthorizedException('Portal yetkisi yok');
    if (!user.accountId && user.role !== 'ADMIN') throw new UnauthorizedException('Kullanici cari hesabina bagli degil');
    return user;
  }

  portalAccount(authorization?: string) {
    const user = this.portalUser(authorization);
    if (user.role === 'ADMIN') return undefined;
    return this.accountDetail(user.accountId!);
  }

  portalOrders(authorization?: string) {
    const user = this.portalUser(authorization);
    if (user.role === 'ADMIN') return this.listOrders();
    return this.listDealerOrders(user.accountId!);
  }

  createPortalOrder(authorization: string | undefined, input: { items: { productId: string; quantity: number }[]; currency?: Currency; description?: string }) {
    const user = this.portalUser(authorization);
    if (user.role === 'ADMIN') throw new BadRequestException('Admin portal siparisi icin cari secmeli');
    return this.createOrder({ accountId: user.accountId!, items: input.items, currency: input.currency, userId: user.id, description: input.description });
  }

  createPortalPayment(authorization: string | undefined, input: { amount: number; currency: Currency; method?: Collection['method'] }) {
    const user = this.portalUser(authorization);
    if (user.role === 'ADMIN') throw new BadRequestException('Admin portal odemesi icin cari secmeli');
    return this.createDealerPayment({ accountId: user.accountId!, amount: input.amount, currency: input.currency, method: input.method });
  }

  createPortalCardPayment(authorization: string | undefined, input: { amount: number; currency: Currency; cardHolder: string; cardNumber: string; expiryMonth: string; expiryYear: string; cvv: string; installments?: number }) {
    const user = this.portalUser(authorization);
    if (user.role === 'ADMIN') throw new BadRequestException('Admin kart odemesi icin cari secmeli');
    return this.createDealerCardPayment({ accountId: user.accountId!, ...input });
  }

  createSale(input: { accountId: string; items: { productId: string; quantity: number; unitPriceTry?: number; unitPriceUsd?: number; unitPrice?: number }[]; currency: Currency; paid?: number; discount?: number; date?: string; paymentMethod?: Collection['method'] | 'Vadeli' }) {
    const account = this.findAccount(input.accountId);
    if (!input.items?.length) throw new BadRequestException('Urun secmeden satis yapilamaz');
    if (input.date && Number.isNaN(Date.parse(input.date))) throw new BadRequestException('Tarih hatali');
    const items = this.makeTransactionItems(input.items, input.currency, 'sale');
    const subtotal = this.sum(items);
    const discount = Number(input.discount ?? 0);
    if (discount < 0) throw new BadRequestException('Iskonto negatif olamaz');
    const vat = Math.round((subtotal - discount) * 0.2 * 100) / 100;
    const total = subtotal - discount + vat;
    const paid = Number(input.paid ?? 0);
    if (paid < 0) throw new BadRequestException('Odenen tutar negatif olamaz');
    if (paid > total) throw new BadRequestException('Odenen tutar toplamdan buyuk olamaz');
    const sale: Sale = {
      id: this.nextId('s', this.sales),
      accountId: account.id,
      items,
      currency: input.currency,
      exchangeRate: this.usdRate,
      paymentMethod: input.paymentMethod ?? 'Vadeli',
      description: '',
      status: 'Aktif',
      subtotal,
      vat,
      discount,
      total,
      subtotalTry: input.currency === 'TRY' ? subtotal : Math.round(subtotal * this.usdRate * 100) / 100,
      subtotalUsd: input.currency === 'USD' ? subtotal : Math.round((subtotal / this.usdRate) * 100) / 100,
      vatTry: input.currency === 'TRY' ? vat : Math.round(vat * this.usdRate * 100) / 100,
      vatUsd: input.currency === 'USD' ? vat : Math.round((vat / this.usdRate) * 100) / 100,
      totalTry: input.currency === 'TRY' ? total : Math.round(total * this.usdRate * 100) / 100,
      totalUsd: input.currency === 'USD' ? total : Math.round((total / this.usdRate) * 100) / 100,
      paidTry: input.currency === 'TRY' ? paid : Math.round(paid * this.usdRate * 100) / 100,
      paidUsd: input.currency === 'USD' ? paid : Math.round((paid / this.usdRate) * 100) / 100,
      remainingTry: input.currency === 'TRY' ? total - paid : Math.round((total - paid) * this.usdRate * 100) / 100,
      remainingUsd: input.currency === 'USD' ? total - paid : Math.round(((total - paid) / this.usdRate) * 100) / 100,
      paid,
      remaining: total - paid,
      createdAt: input.date ?? new Date().toISOString(),
    };
    items.forEach((item) => {
      this.findProduct(item.productId).stock -= item.quantity;
    });
    if (input.currency === 'USD') account.balanceUsd += sale.remaining;
    else account.balanceTry += sale.remaining;
    this.sales.unshift(sale);
    if (paid > 0) {
      this.collections.unshift({
        id: this.nextId('c', this.collections),
        accountId: account.id,
        method: input.paymentMethod === 'Vadeli' || !input.paymentMethod ? 'Nakit' : input.paymentMethod,
        currency: input.currency,
        amount: paid,
        createdAt: sale.createdAt,
      });
    }
    this.persist();
    return sale;
  }

  updateSale(id: string, input: { accountId?: string; items?: { productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number }[]; currency?: Currency; paid?: number; discount?: number; date?: string; paymentMethod?: Collection['method'] | 'Vadeli'; description?: string }) {
    const sale = this.sales.find((item) => item.id === id);
    if (!sale) throw new NotFoundException('Satis kaydi bulunamadi');
    if (sale.status === 'Iptal') throw new BadRequestException('Iptal edilmis satis duzenlenemez');
    const previousAccount = this.findAccount(sale.accountId);
    const account = this.findAccount(input.accountId ?? sale.accountId);
    const currency = input.currency ?? sale.currency;
    if (input.date && Number.isNaN(Date.parse(input.date))) throw new BadRequestException('Tarih hatali');

    (sale.items ?? []).forEach((item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      if (product) product.stock += item.quantity;
    });
    if (sale.currency === 'USD') previousAccount.balanceUsd -= sale.remaining;
    else previousAccount.balanceTry -= sale.remaining;

    const items = this.makeTransactionItems(input.items?.length ? input.items : (sale.items ?? []), currency, 'sale');
    const subtotal = this.sum(items);
    const discount = this.number(input.discount ?? sale.discount);
    if (discount < 0) throw new BadRequestException('Iskonto negatif olamaz');
    const vat = Math.round((subtotal - discount) * 0.2 * 100) / 100;
    const total = subtotal - discount + vat;
    const paid = this.number(input.paid ?? sale.paid);
    if (paid < 0) throw new BadRequestException('Odenen tutar negatif olamaz');
    if (paid > total) throw new BadRequestException('Odenen tutar toplamdan buyuk olamaz');
    const exchangeRate = sale.exchangeRate && sale.exchangeRate > 1 ? sale.exchangeRate : this.usdRate;

    Object.assign(sale, {
      accountId: account.id,
      items,
      currency,
      exchangeRate,
      paymentMethod: input.paymentMethod ?? sale.paymentMethod ?? 'Vadeli',
      description: input.description ?? sale.description ?? '',
      subtotal,
      vat,
      discount,
      total,
      subtotalTry: currency === 'TRY' ? subtotal : Math.round(subtotal * exchangeRate * 100) / 100,
      subtotalUsd: currency === 'USD' ? subtotal : Math.round((subtotal / exchangeRate) * 100) / 100,
      vatTry: currency === 'TRY' ? vat : Math.round(vat * exchangeRate * 100) / 100,
      vatUsd: currency === 'USD' ? vat : Math.round((vat / exchangeRate) * 100) / 100,
      totalTry: currency === 'TRY' ? total : Math.round(total * exchangeRate * 100) / 100,
      totalUsd: currency === 'USD' ? total : Math.round((total / exchangeRate) * 100) / 100,
      paidTry: currency === 'TRY' ? paid : Math.round(paid * exchangeRate * 100) / 100,
      paidUsd: currency === 'USD' ? paid : Math.round((paid / exchangeRate) * 100) / 100,
      remainingTry: currency === 'TRY' ? total - paid : Math.round((total - paid) * exchangeRate * 100) / 100,
      remainingUsd: currency === 'USD' ? total - paid : Math.round(((total - paid) / exchangeRate) * 100) / 100,
      paid,
      remaining: total - paid,
      createdAt: input.date ?? sale.createdAt,
    });

    items.forEach((item) => {
      this.findProduct(item.productId).stock -= item.quantity;
    });
    if (currency === 'USD') account.balanceUsd += sale.remaining;
    else account.balanceTry += sale.remaining;
    this.persist();
    return this.enrichSale(sale);
  }

  cancelSale(id: string) {
    const sale = this.sales.find((item) => item.id === id);
    if (!sale) throw new NotFoundException('Satis kaydi bulunamadi');
    if (sale.status === 'Iptal') throw new BadRequestException('Bu satis zaten iptal edilmis');
    const account = this.findAccount(sale.accountId);
    (sale.items ?? []).forEach((item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      if (product) product.stock += item.quantity;
    });
    if (sale.currency === 'USD') account.balanceUsd = this.round(account.balanceUsd - sale.remaining);
    else account.balanceTry = this.round(account.balanceTry - sale.remaining);
    sale.status = 'Iptal';
    sale.description = [sale.description, `Satis iptal edildi: ${new Date().toLocaleString('tr-TR')}`].filter(Boolean).join('\n');
    this.persist();
    return this.enrichSale(sale);
  }

  createCollection(input: { accountId: string; method: Collection['method']; currency: Currency; amount: number; date?: string; description?: string }) {
    const account = this.findAccount(input.accountId);
    if (Number(input.amount) <= 0) throw new BadRequestException('Tahsilat tutari pozitif olmali');
    if (input.date && Number.isNaN(Date.parse(input.date))) throw new BadRequestException('Tarih hatali');
    const amount = this.number(input.amount);
    const tlAmount = input.currency === 'TRY' ? amount : Math.round(amount * this.usdRate * 100) / 100;
    const usdAmount = input.currency === 'USD' ? amount : Math.round((amount / this.usdRate) * 100) / 100;
    const balanceResult = this.applyCollectionToAccount(account, input.currency, amount, this.usdRate);
    const collection: Collection = {
      id: this.nextId('c', this.collections),
      createdAt: input.date ?? new Date().toISOString(),
      ...input,
      amount,
      tlAmount,
      usdAmount,
      exchangeRate: this.usdRate,
      appliedToTlBalance: balanceResult.appliedToTlBalance,
      appliedToUsdBalance: balanceResult.appliedToUsdBalance,
      remainingTlBalance: account.balanceTry,
      remainingUsdBalance: account.balanceUsd,
      status: 'basarili',
      receiptNo: `MKB-${this.collections.length + 1}`,
    };
    this.collections.unshift(collection);
    this.persist();
    return collection;
  }

  createPurchase(input: { supplierId: string; items: ({ productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number })[]; currency: Currency; date?: string; invoiceNo?: string; paymentStatus?: Purchase['paymentStatus']; description?: string }) {
    const supplier = this.findAccount(input.supplierId);
    if (supplier.type !== 'TEDARIKCI') throw new BadRequestException('Alis icin tedarikci secilmeli');
    if (!input.items?.length) throw new BadRequestException('Urun secmeden alis yapilamaz');
    if (input.date && Number.isNaN(Date.parse(input.date))) throw new BadRequestException('Tarih hatali');
    const items = this.makeTransactionItems(input.items, input.currency, 'purchase');
    const subtotal = this.sum(items);
    const vat = Math.round(items.reduce((sum, item) => sum + item.lineTotal * ((item.vatRate ?? 20) / 100), 0) * 100) / 100;
    const purchase: Purchase = { id: this.nextId('pr', this.purchases), supplierId: supplier.id, items, currency: input.currency, exchangeRate: this.usdRate, subtotal, vat, total: subtotal + vat, invoiceNo: input.invoiceNo || `AF-${this.purchases.length + 1}`, paymentStatus: input.paymentStatus ?? 'Bekliyor', description: input.description || '', createdAt: input.date ?? new Date().toISOString() };
    items.forEach((item) => {
      const product = this.findProduct(item.productId);
      product.stock += item.quantity;
      if (input.currency === 'USD') product.purchaseUsd = item.unitPrice;
      else product.purchaseTry = item.unitPrice;
    });
    if (input.currency === 'USD') supplier.balanceUsd -= purchase.total;
    else supplier.balanceTry -= purchase.total;
    this.purchases.unshift(purchase);
    this.persist();
    return purchase;
  }

  updatePurchase(id: string, input: { supplierId?: string; items?: ({ productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number })[]; currency?: Currency; date?: string; invoiceNo?: string; paymentStatus?: Purchase['paymentStatus']; description?: string }) {
    const purchase = this.purchases.find((item) => item.id === id);
    if (!purchase) throw new NotFoundException('Alis kaydi bulunamadi');
    const supplier = this.findAccount(input.supplierId ?? purchase.supplierId);
    if (supplier.type !== 'TEDARIKCI') throw new BadRequestException('Alis icin tedarikci secilmeli');
    const currency = input.currency ?? purchase.currency;
    if (input.date && Number.isNaN(Date.parse(input.date))) throw new BadRequestException('Tarih hatali');
    const items = this.makeTransactionItems(input.items?.length ? input.items : purchase.items, currency, 'purchase');
    const subtotal = this.sum(items);
    const vat = Math.round(items.reduce((sum, item) => sum + item.lineTotal * ((item.vatRate ?? 20) / 100), 0) * 100) / 100;
    const previousSupplier = this.findAccount(purchase.supplierId);
    (purchase.items ?? []).forEach((item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      if (product) product.stock -= item.quantity;
    });
    if (purchase.currency === 'USD') previousSupplier.balanceUsd += purchase.total;
    else previousSupplier.balanceTry += purchase.total;
    Object.assign(purchase, {
      supplierId: supplier.id,
      items,
      currency,
      exchangeRate: this.usdRate,
      subtotal,
      vat,
      total: subtotal + vat,
      invoiceNo: input.invoiceNo ?? purchase.invoiceNo,
      paymentStatus: input.paymentStatus ?? purchase.paymentStatus,
      description: input.description ?? purchase.description,
      createdAt: input.date ?? purchase.createdAt,
    });
    items.forEach((item) => {
      const product = this.findProduct(item.productId);
      product.stock += item.quantity;
      if (currency === 'USD') product.purchaseUsd = item.unitPrice;
      else product.purchaseTry = item.unitPrice;
    });
    if (currency === 'USD') supplier.balanceUsd -= purchase.total;
    else supplier.balanceTry -= purchase.total;
    this.persist();
    return { ...purchase, supplierName: supplier.companyName };
  }

  createSupplierPayment(input: { supplierId: string; method: SupplierPayment['method']; currency: Currency; amount: number; date?: string; description?: string }) {
    const supplier = this.findAccount(input.supplierId);
    if (supplier.type !== 'TEDARIKCI') throw new BadRequestException('Odeme icin tedarikci secilmeli');
    const amount = this.number(input.amount);
    if (amount <= 0) throw new BadRequestException('Odeme tutari pozitif olmali');
    const payment: SupplierPayment = {
      id: this.nextId('sp', this.supplierPayments),
      supplierId: supplier.id,
      method: input.method,
      currency: input.currency,
      amount,
      receiptNo: `TOD-${this.supplierPayments.length + 1}`,
      description: input.description || '',
      createdAt: input.date ?? new Date().toISOString(),
    };
    if (input.currency === 'USD') supplier.balanceUsd += amount;
    else supplier.balanceTry += amount;
    this.supplierPayments.unshift(payment);
    this.persist();
    return payment;
  }

  importProducts(rows: Partial<Product>[]) {
    const errors: { row: number; message: string }[] = [];
    let created = 0;
    let updated = 0;
    rows.forEach((row, index) => {
      try {
        const existing = this.products.find((product) => (row.barcode && product.barcode === row.barcode) || (row.code && product.code === row.code));
        if (existing) {
          this.updateProduct(existing.id, row);
          updated += 1;
        } else {
          this.createProduct(row as Partial<Product> & Record<string, unknown>);
          created += 1;
        }
      } catch (error) {
        errors.push({ row: index + 1, message: error instanceof Error ? error.message : 'Hatali satir' });
      }
    });
    this.persist();
    return { created, updated, errors };
  }

  productImportTemplate() {
    return ['Urun adi', 'Urun kodu', 'Barkod', 'Kategori', 'Alt kategori', 'Marka', 'Depo', 'Stok adedi', 'Alis fiyat TL', 'Alis fiyat USD', 'Satis fiyat TL', 'Satis fiyat USD', 'Bayi fiyat TL', 'Bayi fiyat USD', 'KDV orani', 'Kritik stok limiti', 'Urun gorsel URL', 'Aktif'];
  }

  private buildQuotePayload(input: { accountId: string; items: (Partial<TransactionItem> & { productId: string; quantity: number })[]; currency: Currency; discount?: number; validUntil: string; deliveryTime?: string; paymentTerm?: string; salesRep?: string; note?: string; internalNote?: string; warranty?: string; assemblyIncluded?: boolean }) {
    const account = this.findAccount(input.accountId);
    if (!input.items?.length) throw new BadRequestException('Urun secmeden teklif olusturulamaz');
    if (!input.validUntil || Number.isNaN(Date.parse(input.validUntil))) throw new BadRequestException('Gecerlilik tarihi hatali');
    let subtotalTry = 0;
    let subtotalUsd = 0;
    let discountTry = 0;
    let discountUsd = 0;
    let vatTry = 0;
    let vatUsd = 0;
    const items: TransactionItem[] = input.items.map((line) => {
      const product = this.findProduct(line.productId);
      if (product.active === false) throw new BadRequestException('Pasif urun teklife eklenemez');
      const quantity = Number(line.quantity);
      if (!quantity || quantity <= 0) throw new BadRequestException('Teklif urun adedi pozitif olmali');
      const unitPriceUsd = Number(line.unitPriceUsd ?? product.saleUsd ?? (product.saleTry / this.usdRate));
      const unitPriceTry = Number(line.unitPriceTry ?? product.saleTry ?? (unitPriceUsd * this.usdRate));
      const lineSubtotalUsd = unitPriceUsd * quantity;
      const lineSubtotalTry = unitPriceTry * quantity;
      const discountRate = Number(line.discountRate ?? 0);
      const vatRate = Number(line.vatRate ?? 20);
      const lineDiscountUsd = Math.round(lineSubtotalUsd * discountRate) / 100;
      const lineDiscountTry = Math.round(lineSubtotalTry * discountRate) / 100;
      const lineVatUsd = Math.round((lineSubtotalUsd - lineDiscountUsd) * vatRate) / 100;
      const lineVatTry = Math.round((lineSubtotalTry - lineDiscountTry) * vatRate) / 100;
      const lineTotalUsd = Math.round((lineSubtotalUsd - lineDiscountUsd + lineVatUsd) * 100) / 100;
      const lineTotalTry = Math.round((lineSubtotalTry - lineDiscountTry + lineVatTry) * 100) / 100;
      subtotalTry += lineSubtotalTry;
      subtotalUsd += lineSubtotalUsd;
      discountTry += lineDiscountTry;
      discountUsd += lineDiscountUsd;
      vatTry += lineVatTry;
      vatUsd += lineVatUsd;
      return {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: input.currency === 'USD' ? unitPriceUsd : unitPriceTry,
        unitPriceTry,
        unitPriceUsd,
        discountRate,
        vatRate,
        discountTry: Math.round(lineDiscountTry * 100) / 100,
        discountUsd: Math.round(lineDiscountUsd * 100) / 100,
        vatTry: Math.round(lineVatTry * 100) / 100,
        vatUsd: Math.round(lineVatUsd * 100) / 100,
        lineTotal: input.currency === 'USD' ? lineTotalUsd : lineTotalTry,
        lineTotalTry,
        lineTotalUsd,
      };
    });
    const subtotal = Math.round((input.currency === 'USD' ? subtotalUsd : subtotalTry) * 100) / 100;
    const discount = Math.round((input.currency === 'USD' ? discountUsd : discountTry) * 100) / 100;
    const vat = Math.round((input.currency === 'USD' ? vatUsd : vatTry) * 100) / 100;
    const totalTry = Math.round((subtotalTry - discountTry + vatTry) * 100) / 100;
    const totalUsd = Math.round((subtotalUsd - discountUsd + vatUsd) * 100) / 100;
    return {
      account,
      items,
      subtotal,
      discount,
      vat,
      total: input.currency === 'USD' ? totalUsd : totalTry,
      subtotalTry: Math.round(subtotalTry * 100) / 100,
      subtotalUsd: Math.round(subtotalUsd * 100) / 100,
      discountTry: Math.round(discountTry * 100) / 100,
      discountUsd: Math.round(discountUsd * 100) / 100,
      vatTry: Math.round(vatTry * 100) / 100,
      vatUsd: Math.round(vatUsd * 100) / 100,
      totalTry,
      totalUsd,
    };
  }

  createQuote(input: { accountId: string; items: (Partial<TransactionItem> & { productId: string; quantity: number })[]; currency: Currency; discount?: number; validUntil: string; deliveryTime?: string; paymentTerm?: string; salesRep?: string; note?: string; internalNote?: string; warranty?: string; assemblyIncluded?: boolean }) {
    const built = this.buildQuotePayload(input);
    const id = this.nextId('q', this.quotes);
    const quoteNo = `TKF-2026-${String(this.quotes.length + 1).padStart(3, '0')}`;
    const quote: Quote = { id, quoteNo, accountId: built.account.id, items: built.items, currency: input.currency, exchangeRate: this.usdRate, subtotal: built.subtotal, vat: built.vat, discount: built.discount, total: built.total, subtotalTry: built.subtotalTry, subtotalUsd: built.subtotalUsd, discountTry: built.discountTry, discountUsd: built.discountUsd, vatTry: built.vatTry, vatUsd: built.vatUsd, totalTry: built.totalTry, totalUsd: built.totalUsd, validUntil: input.validUntil, status: 'Taslak', note: input.note ?? '', internalNote: input.internalNote ?? '', deliveryTime: input.deliveryTime ?? '', paymentTerm: input.paymentTerm ?? '', warranty: input.warranty ?? '', assemblyIncluded: Boolean(input.assemblyIncluded), salesRep: input.salesRep ?? '', createdBy: 'Admin Kullanici', revision: 0, timeline: [{ date: new Date().toISOString(), action: 'Teklif olusturuldu', user: 'Admin Kullanici' }], messageHistory: [], pdfHistory: [], revisions: [], createdAt: new Date().toISOString() };
    this.quotes.unshift(quote);
    this.persist();
    return quote;
  }

  updateQuote(id: string, input: { accountId: string; items: (Partial<TransactionItem> & { productId: string; quantity: number })[]; currency: Currency; validUntil: string; deliveryTime?: string; paymentTerm?: string; salesRep?: string; note?: string; internalNote?: string; warranty?: string; assemblyIncluded?: boolean; status?: Quote['status'] }) {
    const quote = this.quotes.find((item) => item.id === id);
    if (!quote) throw new NotFoundException('Teklif bulunamadi');
    const built = this.buildQuotePayload(input);
    Object.assign(quote, {
      accountId: built.account.id,
      items: built.items,
      currency: input.currency,
      exchangeRate: this.usdRate,
      subtotal: built.subtotal,
      vat: built.vat,
      discount: built.discount,
      total: built.total,
      subtotalTry: built.subtotalTry,
      subtotalUsd: built.subtotalUsd,
      discountTry: built.discountTry,
      discountUsd: built.discountUsd,
      vatTry: built.vatTry,
      vatUsd: built.vatUsd,
      totalTry: built.totalTry,
      totalUsd: built.totalUsd,
      validUntil: input.validUntil,
      deliveryTime: input.deliveryTime ?? quote.deliveryTime,
      paymentTerm: input.paymentTerm ?? quote.paymentTerm,
      salesRep: input.salesRep ?? quote.salesRep,
      note: input.note ?? quote.note,
      internalNote: input.internalNote ?? quote.internalNote,
      warranty: input.warranty ?? quote.warranty,
      assemblyIncluded: input.assemblyIncluded ?? quote.assemblyIncluded,
      status: input.status ?? quote.status,
      revision: (quote.revision ?? 0) + 1,
    });
    quote.timeline?.unshift({ date: new Date().toISOString(), action: `Teklif duzenlendi R${quote.revision}`, user: 'Admin Kullanici' });
    this.persist();
    return quote;
  }

  updateQuoteStatus(id: string, status: Quote['status']) {
    const quote = this.quotes.find((item) => item.id === id);
    if (!quote) throw new NotFoundException('Teklif bulunamadi');
    quote.status = status;
    quote.timeline?.unshift({ date: new Date().toISOString(), action: `Durum degisti: ${status}`, user: 'Admin Kullanici' });
    if (status === 'Onaylandi') {
      this.createSale({ accountId: quote.accountId, currency: quote.currency, discount: quote.discount, paid: 0, paymentMethod: 'Vadeli', items: quote.items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPriceTry: item.unitPriceTry, unitPriceUsd: item.unitPriceUsd, unitPrice: item.unitPrice })) });
    }
    this.persist();
    return quote;
  }

  cloneQuote(id: string) {
    const quote = this.quotes.find((item) => item.id === id);
    if (!quote) throw new NotFoundException('Teklif bulunamadi');
    const copy: Quote = { ...quote, id: this.nextId('q', this.quotes), quoteNo: `${quote.quoteNo ?? quote.id}-R${(quote.revision ?? 0) + 1}`, revision: (quote.revision ?? 0) + 1, status: 'Taslak', revisions: [...(quote.revisions ?? []), quote.quoteNo ?? quote.id], timeline: [{ date: new Date().toISOString(), action: 'Revizyon olusturuldu', user: 'Admin Kullanici' }, ...(quote.timeline ?? [])], createdAt: new Date().toISOString() };
    this.quotes.unshift(copy);
    this.persist();
    return copy;
  }

  listPdfTemplates() {
    return this.pdfTemplates;
  }

  updatePdfTemplate(id: string, input: Partial<PdfTemplate>) {
    const template = this.pdfTemplates.find((item) => item.id === id);
    if (!template) throw new NotFoundException('PDF sablonu bulunamadi');
    Object.assign(template, input);
    this.persist();
    return template;
  }

  listMessageTemplates() {
    return this.messageTemplates;
  }

  createMessageTemplate(input: Partial<MessageTemplate>) {
    if (!input.name || !input.body || !input.type) throw new BadRequestException('Sablon adi, turu ve metni zorunlu');
    const template: MessageTemplate = { id: this.nextId('mt', this.messageTemplates), type: input.type, channel: input.channel ?? 'WhatsApp', name: input.name, body: input.body, default: Boolean(input.default), active: input.active ?? true };
    this.messageTemplates.unshift(template);
    this.persist();
    return template;
  }

  updateMessageTemplate(id: string, input: Partial<MessageTemplate>) {
    const template = this.messageTemplates.find((item) => item.id === id);
    if (!template) throw new NotFoundException('Mesaj sablonu bulunamadi');
    if (input.default) this.messageTemplates.forEach((item) => { if (item.type === template.type) item.default = false; });
    Object.assign(template, input);
    this.persist();
    return template;
  }

  deleteMessageTemplate(id: string) {
    const exists = this.messageTemplates.some((item) => item.id === id);
    if (!exists) throw new NotFoundException('Mesaj sablonu bulunamadi');
    this.messageTemplates = this.messageTemplates.filter((item) => item.id !== id);
    this.persist();
    return { deleted: true };
  }

  createOrder(input: { accountId: string; items: { productId: string; quantity: number }[]; currency?: Currency; userId?: string; description?: string }) {
    const account = this.findAccount(input.accountId);
    if (!input.items?.length) throw new BadRequestException('Urun secmeden siparis olusturulamaz');
    const lines = input.items.map((item) => {
      const product = this.findProduct(item.productId);
      if (product.active === false) throw new BadRequestException('Pasif urun siparise eklenemez');
      const quantity = this.number(item.quantity);
      if (quantity <= 0) throw new BadRequestException('Adet pozitif olmali');
      if (product.stock < quantity) throw new BadRequestException(`${product.name} icin stok yetersiz`);
      return { product, quantity };
    });
    const dealerPrice = (product: Product) => this.productDealerPrice(product);
    const totalTry = lines.reduce((sum, item) => sum + dealerPrice(item.product).tryValue * item.quantity, 0);
    const totalUsd = lines.reduce((sum, item) => sum + dealerPrice(item.product).usdValue * item.quantity, 0);
    const user = input.userId ? this.users.find((item) => item.id === input.userId) : undefined;
    const orderItems = this.makeTransactionItems(input.items, input.currency ?? 'TRY', 'sale', false).map((item) => {
      const product = this.findProduct(item.productId);
      const price = dealerPrice(product);
      return {
        ...item,
        unitPriceTry: price.tryValue,
        unitPriceUsd: price.usdValue,
        lineTotalTry: price.tryValue * item.quantity,
        lineTotalUsd: price.usdValue * item.quantity,
      };
    });
    const order: Order = {
      id: this.nextId('o', this.orders),
      accountId: account.id,
      userId: user?.id,
      dealerName: account.companyName,
      userName: user?.username ?? user?.email ?? user?.name,
      phone: account.phone || account.whatsapp || user?.phone,
      currency: input.currency ?? 'TRY',
      exchangeRate: this.usdRate,
      items: orderItems,
      status: 'Beklemede',
      totalTry,
      totalUsd,
      description: input.description ?? '',
      createdAt: new Date().toISOString(),
    };
    this.orders.unshift(order);
    this.persist();
    return { ...order, accountName: account.companyName };
  }

  approveOrder(orderId: string) {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) throw new NotFoundException('Siparis bulunamadi');
    if (order.status === 'Onaylandi') throw new BadRequestException('Siparis zaten onaylanmis');
    if (order.status === 'Iptal edildi') throw new BadRequestException('Iptal edilen siparis onaylanamaz');
    const pricedOrder = this.enrichOrderPrices(order);
    const sale = this.createSale({
      accountId: order.accountId,
      currency: pricedOrder.totalUsd > 0 ? 'USD' : 'TRY',
      discount: 0,
      paid: 0,
      paymentMethod: 'Vadeli',
      items: (pricedOrder.items ?? []).map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceTry: item.unitPriceTry,
        unitPriceUsd: item.unitPriceUsd,
      })),
    });
    order.status = 'Onaylandi';
    this.persist();
    return { order: { ...order, accountName: this.findAccount(order.accountId).companyName }, sale: this.enrichSale(sale) };
  }

  updateOrderStatus(orderId: string, status: Order['status']) {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) throw new NotFoundException('Siparis bulunamadi');
    order.status = status;
    this.persist();
    return { ...order, accountName: this.findAccount(order.accountId).companyName };
  }

  createDealerPayment(input: { accountId: string; amount: number; currency: Currency; method?: Collection['method'] }) {
    const account = this.findAccount(input.accountId);
    const amount = this.number(input.amount);
    if (amount <= 0) throw new BadRequestException('Odeme tutari pozitif olmali');
    const log: PaymentLog = {
      id: this.nextId('plog', this.paymentLogs),
      accountId: account.id,
      provider: 'TOSLA',
      status: input.method === 'Kredi karti' ? 'basarili' : 'beklemede',
      amount,
      currency: input.currency,
      message: input.method === 'Kredi karti' ? 'Kart odemesi basarili, tahsilat olustu' : 'Musteri odeme bildirimi bekliyor',
      createdAt: new Date().toISOString(),
    };
    this.paymentLogs.unshift(log);
    let collection: Collection | undefined;
    if (log.status === 'basarili') {
      collection = this.createCollection({ accountId: account.id, amount, currency: input.currency, method: input.method ?? 'Kredi karti' });
    } else {
      this.persist();
    }
    return { provider: 'TOSLA', status: log.status, receiptId: collection?.id, collection, paymentLog: { ...log, accountName: account.companyName } };
  }

  createDealerCardPayment(input: { accountId: string; amount: number; currency: Currency; cardHolder: string; cardNumber: string; expiryMonth: string; expiryYear: string; cvv: string; installments?: number }) {
    const account = this.findAccount(input.accountId);
    const amount = this.number(input.amount);
    const cardNumber = String(input.cardNumber ?? '').replace(/\D/g, '');
    const cardHolder = String(input.cardHolder ?? '').trim();
    const expiryMonth = String(input.expiryMonth ?? '').padStart(2, '0');
    const expiryYear = String(input.expiryYear ?? '').trim();
    const cvv = String(input.cvv ?? '').trim();
    if (amount <= 0) throw new BadRequestException('Odeme tutari pozitif olmali');
    if (!cardHolder) throw new BadRequestException('Kart uzerindeki ad soyad zorunlu');
    if (cardNumber.length < 12 || cardNumber.length > 19) throw new BadRequestException('Kart numarasi hatali');
    if (!/^(0[1-9]|1[0-2])$/.test(expiryMonth)) throw new BadRequestException('Son kullanma ayi hatali');
    if (!/^\d{2,4}$/.test(expiryYear)) throw new BadRequestException('Son kullanma yili hatali');
    if (!/^\d{3,4}$/.test(cvv)) throw new BadRequestException('CVV hatali');
    const last4 = cardNumber.slice(-4);
    const failed = last4 === '0001' || cvv === '000';
    const transactionNo = `POS-${Date.now()}-${last4}`;
    const log: PaymentLog = {
      id: this.nextId('plog', this.paymentLogs),
      accountId: account.id,
      provider: 'TOSLA',
      status: failed ? 'basarisiz' : 'basarili',
      amount,
      currency: input.currency,
      message: failed ? `Sandbox kart odemesi basarisiz (${transactionNo})` : `Online kart odemesi basarili (${transactionNo}, **** ${last4}, ${input.installments ?? 1} taksit)`,
      createdAt: new Date().toISOString(),
    };
    this.paymentLogs.unshift(log);
    if (failed) {
      this.persist();
      return { provider: 'TOSLA', status: 'basarisiz', transactionNo, paymentLog: { ...log, accountName: account.companyName } };
    }
    const collection = this.createCollection({ accountId: account.id, amount, currency: input.currency, method: 'Kredi karti', description: `Online kart odemesi: ${transactionNo}` });
    return { provider: 'TOSLA', status: 'basarili', transactionNo, receiptId: collection.id, collection, paymentLog: { ...log, accountName: account.companyName } };
  }

  approveDealerPayment(logId: string) {
    const log = this.paymentLogs.find((item) => item.id === logId);
    if (!log) throw new NotFoundException('Odeme bildirimi bulunamadi');
    if (log.status === 'basarili') throw new BadRequestException('Odeme zaten onaylanmis');
    const collection = this.createCollection({ accountId: log.accountId, amount: log.amount, currency: log.currency, method: 'Havale/EFT', description: `Odeme bildirimi onayi: ${log.id}` });
    log.status = 'basarili';
    log.message = `Admin onayladi, tahsilat olustu: ${collection.receiptNo ?? collection.id}`;
    this.persist();
    return { paymentLog: { ...log, accountName: this.findAccount(log.accountId).companyName }, collection };
  }

  runAutoCollection(accountId: string, forceResult?: 'success' | 'fail') {
    const account = this.findAccount(accountId);
    if (!account.autoCollectionEnabled) throw new BadRequestException('Otomatik tahsilat aktif degil');
    const currency = account.paymentCurrency ?? 'TRY';
    const balance = currency === 'USD' ? account.balanceUsd : account.balanceTry;
    const amount = Math.min(Math.max(0, balance), account.maxCollectionAmount ?? balance);
    if (amount <= 0) throw new BadRequestException('Tahsil edilecek bakiye yok');
    const needs3d = !account.cardToken;
    const success = forceResult ? forceResult === 'success' : Boolean(account.cardToken) && account.cardToken?.includes('success');
    const paymentLink = `https://pos.tosla.example/3d/pay-${account.id}-${Date.now()}`;
    if (success && !needs3d) {
      const collection = this.createCollection({ accountId: account.id, method: 'Kredi karti', currency, amount });
      account.lastCollectionDate = collection.createdAt;
      account.lastCollectionStatus = 'basarili';
      account.paymentWarning = '';
      this.paymentLogs.unshift({ id: this.nextId('pl', this.paymentLogs), accountId: account.id, provider: 'TOSLA', status: 'basarili', amount, currency, message: 'Otomatik kart tahsilati basarili', createdAt: collection.createdAt });
      this.persist();
      return { status: 'basarili', collection, receipt: this.collectionReceipt(collection.id), whatsapp: this.collectionWhatsapp(collection.id) };
    }
    const failed: Collection = {
      id: this.nextId('c', this.collections),
      accountId: account.id,
      method: 'Kredi karti',
      currency,
      amount,
      createdAt: new Date().toISOString(),
      status: needs3d ? 'beklemede' : 'basarisiz',
      receiptNo: '',
      paymentLink,
      failureReason: needs3d ? '3D Secure onayi gerekli' : 'POS tahsilati basarisiz',
    };
    this.collections.unshift(failed);
    account.lastCollectionDate = failed.createdAt;
    account.lastCollectionStatus = failed.status;
    account.paymentWarning = failed.failureReason;
    this.paymentLogs.unshift({ id: this.nextId('pl', this.paymentLogs), accountId: account.id, provider: 'TOSLA', status: failed.status ?? 'basarisiz', amount, currency, message: failed.failureReason ?? 'Basarisiz tahsilat', createdAt: failed.createdAt });
    this.persist();
    return { status: failed.status, collection: failed, paymentLink, whatsapp: this.collectionWhatsapp(failed.id) };
  }

  collectionReceipt(collectionId: string) {
    const collection = this.collections.find((item) => item.id === collectionId);
    if (!collection) throw new NotFoundException('Tahsilat bulunamadi');
    const account = this.findAccount(collection.accountId);
    const values = this.collectionDualValues(collection, account);
    return {
      company: 'Firma',
      receiptNo: collection.receiptNo || `MKB-${collection.id.toUpperCase()}`,
      account: account.companyName,
      accountCode: account.code,
      accountPhone: account.phone,
      accountTaxOffice: account.taxOffice,
      accountTaxNumber: account.taxNumber,
      accountAddress: account.address,
      accountCity: account.city,
      accountDistrict: account.district,
      method: collection.method,
      amount: collection.amount,
      amountTry: values.tlAmount,
      amountUsd: values.usdAmount,
      exchangeRate: values.rate,
      appliedToTlBalance: values.appliedToTlBalance,
      appliedToUsdBalance: values.appliedToUsdBalance,
      remainingTry: values.remainingDisplayTry,
      remainingUsd: values.remainingDisplayUsd,
      remainingRawTry: values.remainingTry,
      remainingRawUsd: values.remainingUsd,
      description: collection.description || '',
      currency: collection.currency,
      status: collection.status ?? 'basarili',
      date: collection.createdAt,
      signature: 'Imza / kase alani',
    };
  }

  collectionWhatsapp(collectionId: string) {
    const collection = this.collections.find((item) => item.id === collectionId);
    if (!collection) throw new NotFoundException('Tahsilat bulunamadi');
    const account = this.findAccount(collection.accountId);
    const date = new Date(collection.createdAt).toLocaleDateString('tr-TR');
    const values = this.collectionDualValues(collection, account);
    const fallback = collection.status === 'basarisiz' || collection.status === 'beklemede'
      ? `Merhaba ${account.contactName || account.companyName},\n${date} tarihinde otomatik tahsilat islemi basarisiz olmustur.\n\nOdenmesi gereken tutar:\n${this.moneyText(values.tlAmount, 'TL')}\n${this.moneyText(values.usdAmount, 'USD')}\n\nOdeme yapmak icin:\n${collection.paymentLink}\n\nFirma`
      : `Merhaba ${account.contactName || account.companyName},\n\n${date} tarihinde\n${this.moneyText(values.tlAmount, 'TL')} / ${this.moneyText(values.usdAmount, 'USD')} karsiligi odemeniz basariyla alinmistir.\n\nKalan bakiyeniz:\n${this.moneyText(values.remainingDisplayTry, 'TL')}\n${this.moneyText(values.remainingDisplayUsd, 'USD')}\n\nTesekkur ederiz.\nFirma`;
    const message = this.renderMessageTemplate('Tahsilat', fallback, {
      cariAdi: account.contactName || account.companyName,
      tlBakiye: this.moneyText(values.remainingDisplayTry, 'TL'),
      usdBakiye: this.moneyText(values.remainingDisplayUsd, 'USD'),
      toplamTL: this.moneyText(values.tlAmount, 'TL'),
      toplamUSD: this.moneyText(values.usdAmount, 'USD'),
      fisNo: collection.receiptNo ?? collection.id,
      tarih: date,
      firmaAdi: 'Firma',
    });
    return { to: account.whatsapp, message, link: this.whatsappLink(account.whatsapp, message) };
  }

  whatsappSaleNote(saleId: string) {
    const sale = this.sales.find((item) => item.id === saleId);
    if (!sale) throw new NotFoundException('Satis bulunamadi');
    const account = this.findAccount(sale.accountId);
    const totalTry = sale.currency === 'TRY' ? sale.total : Math.round(sale.total * this.usdRate * 100) / 100;
    const totalUsd = sale.currency === 'USD' ? sale.total : Math.round((sale.total / this.usdRate) * 100) / 100;
    const remainingTry = sale.currency === 'TRY' ? sale.remaining : Math.round(sale.remaining * this.usdRate * 100) / 100;
    const remainingUsd = sale.currency === 'USD' ? sale.remaining : Math.round((sale.remaining / this.usdRate) * 100) / 100;
    const fallback = `Merhaba ${account.contactName}, satis bilgi notunuz:\nToplam:\n${totalTry} TL\n${totalUsd} USD\nKalan:\n${remainingTry} TL\n${remainingUsd} USD\nGuncel kur: ${this.usdRate}\nFirma`;
    const message = this.renderMessageTemplate('WhatsAppSatis', fallback, {
      cariAdi: account.contactName || account.companyName,
      tlBakiye: this.moneyText(remainingTry, 'TL'),
      usdBakiye: this.moneyText(remainingUsd, 'USD'),
      toplamTL: this.moneyText(totalTry, 'TL'),
      toplamUSD: this.moneyText(totalUsd, 'USD'),
      fisNo: sale.id,
      tarih: new Date(sale.createdAt).toLocaleDateString('tr-TR'),
      firmaAdi: 'Firma',
    });
    return { to: account.whatsapp, message, link: this.whatsappLink(account.whatsapp, message) };
  }

  whatsappDebtReminder(accountId: string) {
    const account = this.findAccount(accountId);
    const balance = this.accountBalanceSummary(account);
    const fallback = `Sayin ${account.contactName || account.companyName},\n\nGuncel cari bakiyeniz:\nTL bakiye: ${balance.displayTry} TL\nUSD bakiye: ${balance.displayUsd} USD\n\nIyi calismalar.`;
    const message = this.renderMessageTemplate('BorcHatirlatma', fallback, {
      cariAdi: account.contactName || account.companyName,
      tlBakiye: this.moneyText(balance.displayTry, 'TL'),
      usdBakiye: this.moneyText(balance.displayUsd, 'USD'),
      toplamTL: this.moneyText(balance.displayTry, 'TL'),
      toplamUSD: this.moneyText(balance.displayUsd, 'USD'),
      fisNo: '',
      tarih: new Date().toLocaleDateString('tr-TR'),
      firmaAdi: 'Firma',
    });
    return { to: account.whatsapp, message, link: this.whatsappLink(account.whatsapp, message) };
  }

  saleReceipt(saleId: string) {
    const sale = this.sales.find((item) => item.id === saleId);
    if (!sale) throw new NotFoundException('Satis bulunamadi');
    return {
      receiptNo: sale.id.toUpperCase(),
      title: 'Satis Fisi',
      account: this.findAccount(sale.accountId).companyName,
      lines: sale.items?.map((item) => ({ product: this.findProduct(item.productId).name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.lineTotal })) ?? [],
      totals: sale,
    };
  }

  quotePreview(quoteId: string) {
    const quote = this.quotes.find((item) => item.id === quoteId);
    if (!quote) throw new NotFoundException('Teklif bulunamadi');
    return {
      documentNo: quote.quoteNo ?? quote.id.toUpperCase(),
      fileName: `${quote.quoteNo ?? quote.id.toUpperCase()}_${this.findAccount(quote.accountId).companyName.replace(/\s+/g, '_')}.pdf`,
      title: 'PDF Teklif Onizleme',
      account: this.findAccount(quote.accountId).companyName,
      logo: 'Firma Logosu',
      stamp: 'Kase alani',
      signature: 'Imza alani',
      bankInfo: 'TR00 0000 0000 0000 0000 0000 00',
      whatsapp: '+90 532 000 00 00',
      qrCode: `/quotes/${quote.id}`,
      validUntil: quote.validUntil,
      lines: quote.items.map((item) => ({ product: this.findProduct(item.productId).name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.lineTotal })),
      totals: {
        ...quote,
        totalTry: quote.currency === 'TRY' ? quote.total : Math.round(quote.total * this.usdRate * 100) / 100,
        totalUsd: quote.currency === 'USD' ? quote.total : Math.round((quote.total / this.usdRate) * 100) / 100,
      },
    };
  }

  createToslaPaymentLink(input: { accountId: string; amount: number; currency: Currency }) {
    const account = this.findAccount(input.accountId);
    if (input.amount <= 0) throw new BadRequestException('Odeme tutari pozitif olmali');
    return {
      provider: 'TOSLA',
      status: 'CREATED',
      accountId: account.id,
      amount: input.amount,
      currency: input.currency,
      paymentUrl: `https://pos.tosla.example/pay/pay-${Date.now()}`,
      callbackUrl: '/api/payments/tosla/webhook',
    };
  }

  private makePdfTemplates(): PdfTemplate[] {
    return [
      { id: 'pdf1', type: 'Teklif', name: 'Kurumsal Teklif', signatureEnabled: true, color: '#126c82', fontFamily: 'Inter', title: 'Teklif Formu', footer: 'Tesekkur ederiz', fields: ['Firma logosu', 'Musteri bilgileri', 'Urun tablosu', 'QR kod', 'Imza alani'], active: true, settings: this.defaultPdfSettings('Teklif') },
      { id: 'pdf2', type: 'TahsilatMakbuzu', name: 'Standart Makbuz', signatureEnabled: false, color: '#17202a', fontFamily: 'Inter', title: 'Tahsilat Makbuzu', footer: 'Bu belge elektronik olusturulmustur', fields: ['Firma bilgileri', 'Banka bilgileri', 'WhatsApp numarasi'], active: true, settings: this.defaultPdfSettings('TahsilatMakbuzu') },
    ];
  }

  private defaultPdfSettings(type: PdfTemplate['type']): PdfTemplate['settings'] {
    return {
      paperType: 'A4',
      marginMm: 14,
      headerColor: '#126c82',
      tableHeaderColor: '#eef8f5',
      tableBorderColor: '#d9e1e8',
      textColor: '#17202a',
      buttonColor: '#126c82',
      titleSize: 24,
      bodySize: 12,
      lineHeight: 1.45,
      logoSize: 72,
      logoAlign: 'left',
      companyName: 'Bulut ERP Pro',
      subtitle: `${type} dokumani`,
      contactInfo: 'info@firma.com | +90 555 000 00 00',
      footerText: 'Tesekkur ederiz.',
      showSignature: true,
      showStamp: true,
      showBankInfo: true,
      showQr: true,
      showWhatsapp: true,
      bankInfo: 'TR00 0000 0000 0000 0000 0000 00',
      whatsapp: '+90 555 000 00 00',
      columns: ['Urun', 'Adet', 'Birim USD/TL', 'Iskonto', 'KDV', 'Toplam USD/TL'],
      positions: {
        logo: { x: 24, y: 24 },
        title: { x: 138, y: 28 },
        qr: { x: 455, y: 30 },
        bank: { x: 32, y: 690 },
        signature: { x: 330, y: 680 },
        footer: { x: 32, y: 760 },
      },
    };
  }

  private makeMessageTemplates(): MessageTemplate[] {
    return [
      { id: 'mt1', type: 'WhatsAppSatis', name: 'Satis Bilgi Mesaji', body: 'Merhaba {MüşteriAdı}, toplam {ToplamTL} TL / {ToplamUSD} USD satisiniz olustu.', default: true, active: true },
      { id: 'mt2', type: 'BorcHatirlatma', name: 'Borc Hatirlatma', body: 'Merhaba {MüşteriAdı}, kalan bakiyeniz {KalanTL} TL / {KalanUSD} USD.', default: true, active: true },
      { id: 'mt3', type: 'Teklif', name: 'Teklif Mesaji', body: 'Merhaba {MüşteriAdı}, {TeklifNo} numarali teklifiniz hazir.', default: true, active: true },
    ];
  }

  private makeTransactionItems(lines: { productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number }[], currency: Currency, mode: 'sale' | 'purchase', enforceStock = true): TransactionItem[] {
    return lines.map((line) => {
      const quantity = Number(line.quantity);
      if (!line.productId) throw new BadRequestException('Urun secimi zorunlu');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Adet pozitif olmali');
      const product = this.findProduct(line.productId);
      if (product.active === false) throw new BadRequestException('Pasif urun isleme eklenemez');
      if (mode === 'sale' && enforceStock && product.stock < quantity) throw new BadRequestException(`${product.name} icin stok yetersiz`);
      const customPrice = currency === 'USD' ? line.unitPriceUsd ?? line.unitPrice : line.unitPriceTry ?? line.unitPrice;
      const unitPrice = customPrice !== undefined
        ? this.number(customPrice)
        : currency === 'USD'
        ? mode === 'sale' ? product.saleUsd : product.purchaseUsd
        : mode === 'sale' ? product.saleTry : product.purchaseTry;
      const unitPriceTry = line.unitPriceTry !== undefined ? this.number(line.unitPriceTry) : mode === 'sale' ? product.saleTry : product.purchaseTry;
      const unitPriceUsd = line.unitPriceUsd !== undefined ? this.number(line.unitPriceUsd) : mode === 'sale' ? product.saleUsd : product.purchaseUsd;
      return {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        unitPriceTry,
        unitPriceUsd,
        vatRate: line.vatRate ?? product.vatRate ?? 20,
        lineTotalTry: unitPriceTry * quantity,
        lineTotalUsd: unitPriceUsd * quantity,
      };
    });
  }

  private productHasMovements(id: string) {
    const product = this.findProduct(id);
    const values = [product.id, product.name, product.code, product.barcode].filter(Boolean).map((value) => String(value).trim().toLocaleLowerCase('tr-TR'));
    const inItems = (items?: TransactionItem[]) => (items ?? []).some((item) => {
      const itemValues = [item.productId, item.productName].filter(Boolean).map((value) => String(value).trim().toLocaleLowerCase('tr-TR'));
      return itemValues.some((value) => values.includes(value));
    });
    return this.sales.some((sale) => inItems(sale.items))
      || this.purchases.some((purchase) => inItems(purchase.items))
      || this.quotes.some((quote) => inItems(quote.items))
      || this.orders.some((order) => inItems(order.items));
  }

  private loadFromDisk() {
    if (!existsSync(this.storePath)) return false;
    try {
      const data = JSON.parse(readFileSync(this.storePath, 'utf8')) as Partial<{
        usdRate: number;
        usdRateUpdatedAt: string;
        accounts: Account[];
        products: Product[];
        categories: Category[];
        sales: Sale[];
        collections: Collection[];
        paymentLogs: PaymentLog[];
        purchases: Purchase[];
        supplierPayments: SupplierPayment[];
        quotes: Quote[];
        pdfTemplates: PdfTemplate[];
        messageTemplates: MessageTemplate[];
        orders: Order[];
        users: User[];
      }>;
      this.usdRate = this.number(data.usdRate, this.usdRate);
      this.usdRateUpdatedAt = data.usdRateUpdatedAt || this.usdRateUpdatedAt;
      this.accounts = data.accounts ?? this.accounts;
      this.products = data.products ?? this.products;
      this.categories = data.categories ?? this.categories;
      this.sales = data.sales ?? this.sales;
      this.collections = data.collections ?? this.collections;
      this.paymentLogs = data.paymentLogs ?? this.paymentLogs;
      this.purchases = data.purchases ?? this.purchases;
      this.supplierPayments = data.supplierPayments ?? this.supplierPayments;
      this.quotes = data.quotes ?? this.quotes;
      this.pdfTemplates = data.pdfTemplates ?? this.pdfTemplates;
      this.messageTemplates = data.messageTemplates ?? this.messageTemplates;
      this.orders = data.orders ?? this.orders;
      this.users = data.users ?? this.users;
      return true;
    } catch (error) {
      console.error('ERP veri deposu okunamadi, canli veri korunuyor.', error);
      throw new InternalServerErrorException('ERP veri deposu okunamadi');
    }
  }

  private assertProductionStoreSafety() {
    if (process.env.NODE_ENV !== 'production') return;
    if (!process.env.ERP_STORE_PATH) {
      throw new InternalServerErrorException('Canli veri koruma kilidi: NODE_ENV=production iken ERP_STORE_PATH kalici volume yolu olarak tanimlanmali. Varsayilan repo ici data/erp-store.json kullanilamaz.');
    }
  }

  private bootstrapAdminFromEnv() {
    if (this.users.some((user) => user.role === 'ADMIN')) return;
    const email = String(process.env.ADMIN_EMAIL || 'admin@buluterp.local').trim().toLocaleLowerCase('tr-TR');
    const password = String(process.env.ADMIN_PASSWORD || 'Admin123!');
    if (password.length < 8) {
      console.warn('ADMIN_PASSWORD en az 8 karakter olmali; admin bootstrap atlandi.');
      return;
    }
    const username = String(process.env.ADMIN_USERNAME ?? email).trim().toLocaleLowerCase('tr-TR');
    this.users.push({
      id: this.nextId('u', this.users),
      name: process.env.ADMIN_NAME || 'Sistem Yoneticisi',
      email,
      username,
      phone: process.env.ADMIN_PHONE || '',
      passwordHash: hashSync(password, 10),
      role: 'ADMIN',
      active: true,
      mustChangePassword: process.env.ADMIN_MUST_CHANGE_PASSWORD !== 'false',
      createdAt: new Date().toISOString(),
    });
    this.persist();
    console.log(`Admin kullanici olusturuldu: ${email}`);
  }

  private setupAutoBackup() {
    if (process.env.AUTO_BACKUP_ENABLED !== 'true') return;
    const intervalHours = Math.max(1, this.number(process.env.AUTO_BACKUP_INTERVAL_HOURS, 24));
    this.writeBackupFile('startup');
    setInterval(() => this.writeBackupFile('auto'), intervalHours * 60 * 60 * 1000).unref();
  }

  private writeBackupFile(reason: string) {
    try {
      const backupDir = join(dirname(this.storePath), 'backups');
      mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(join(backupDir, `erp-${reason}-${stamp}.json`), JSON.stringify({
        exportedAt: new Date().toISOString(),
        usdRate: this.usdRate,
        usdRateUpdatedAt: this.usdRateUpdatedAt,
        accounts: this.accounts,
        products: this.products,
        categories: this.categories,
        sales: this.sales,
        collections: this.collections,
        paymentLogs: this.paymentLogs,
        purchases: this.purchases,
        supplierPayments: this.supplierPayments,
        quotes: this.quotes,
        pdfTemplates: this.pdfTemplates,
        messageTemplates: this.messageTemplates,
        orders: this.orders,
        users: this.users,
      }, null, 2), 'utf8');
    } catch (error) {
      console.error('Otomatik yedek yazilamadi.', error);
    }
  }

  private requireAdmin(authorization?: string) {
    const user = this.me(authorization);
    if (user.role !== 'ADMIN') throw new UnauthorizedException('Admin yetkisi gerekli');
    return user;
  }

  private persist() {
    try {
      mkdirSync(dirname(this.storePath), { recursive: true });
      this.backupCurrentStoreBeforeWrite();
      const tempPath = `${this.storePath}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tempPath, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        usdRate: this.usdRate,
        usdRateUpdatedAt: this.usdRateUpdatedAt,
        accounts: this.accounts,
        products: this.products,
        categories: this.categories,
        sales: this.sales,
        collections: this.collections,
        paymentLogs: this.paymentLogs,
        purchases: this.purchases,
        supplierPayments: this.supplierPayments,
        quotes: this.quotes,
        pdfTemplates: this.pdfTemplates,
        messageTemplates: this.messageTemplates,
        orders: this.orders,
        users: this.users,
      }, null, 2), 'utf8');
      renameSync(tempPath, this.storePath);
    } catch {
      throw new InternalServerErrorException('ERP veri deposu yazilamadi');
    }
  }

  private backupCurrentStoreBeforeWrite() {
    if (!existsSync(this.storePath)) return;
    const backupDir = join(dirname(this.storePath), 'write-backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(this.storePath, join(backupDir, `${basename(this.storePath)}.${stamp}.bak`));
  }

  private validateAccount(input: Partial<Account>) {
    if (!input.companyName?.trim()) throw new BadRequestException('Firma adi zorunlu');
    if (!input.code?.trim()) throw new BadRequestException('Cari kod zorunlu');
    if (Number(input.dueDay ?? 0) < 0) throw new BadRequestException('Vade negatif olamaz');
  }

  private generateAccountCode(type: Account['type']) {
    const config = type === 'TEDARIKCI'
      ? { prefix: 'TD', start: 2001 }
      : type === 'BAYI'
        ? { prefix: 'BY', start: 3001 }
        : { prefix: 'CR', start: 1001 };
    const used = new Set(this.accounts.map((account) => account.code));
    let next = this.accounts
      .filter((account) => account.code.startsWith(`${config.prefix}-`))
      .reduce((highest, account) => {
        const numeric = Number(account.code.replace(`${config.prefix}-`, ''));
        return Number.isFinite(numeric) ? Math.max(highest, numeric + 1) : highest;
      }, config.start);
    let code = `${config.prefix}-${next}`;
    while (used.has(code)) {
      next += 1;
      code = `${config.prefix}-${next}`;
    }
    return code;
  }

  private validateProduct(input: Partial<Product>) {
    if (!input.name?.trim()) throw new BadRequestException('Urun adi zorunlu');
    if (!input.category?.trim()) throw new BadRequestException('Kategori secimi zorunlu');
    this.findCategoryByName(input.category);
    const stockValue = (input as Record<string, unknown>).stock;
    if (stockValue === undefined || stockValue === null || stockValue === '') throw new BadRequestException('Stok adedi zorunlu');
    if (this.number(input.stock) < 0) throw new BadRequestException('Stok negatif olamaz');
    if (this.number(input.criticalStock) < 0) throw new BadRequestException('Kritik stok negatif olamaz');
    const saleTry = this.number(input.saleTry);
    const saleUsd = this.number(input.saleUsd);
    const purchaseTry = this.number(input.purchaseTry);
    const purchaseUsd = this.number(input.purchaseUsd);
    if ([saleTry, saleUsd, purchaseTry, purchaseUsd].some((value) => value < 0)) throw new BadRequestException('Fiyat negatif olamaz');
    if (!saleTry && !saleUsd && !purchaseTry && !purchaseUsd) throw new BadRequestException('Satis fiyati veya alis fiyati girilmeli');
  }

  private generateProductCode() {
    let index = this.products.length + 1;
    let code = '';
    do {
      code = `PRD-${String(index).padStart(4, '0')}`;
      index += 1;
    } while (this.products.some((item) => item.code === code));
    return code;
  }

  private findAccount(id: string) {
    const account = this.accounts.find((item) => item.id === id);
    if (!account) throw new NotFoundException('Cari bulunamadi');
    return account;
  }

  private normalizeName(value?: string) {
    return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
  }

  private normalizeSearch(value?: string) {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private renderMessageTemplate(type: MessageTemplate['type'], fallback: string, variables: Record<string, string>) {
    const template = this.messageTemplates.find((item) => item.type === type && item.active && item.default)
      ?? this.messageTemplates.find((item) => item.type === type && item.active);
    const source = template?.body || fallback;
    return Object.entries(variables).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, value), source);
  }

  private saleBelongsToAccount(sale: Sale, account: Account) {
    const legacySale = sale as Sale & { accountName?: string };
    return sale.accountId === account.id
      || this.normalizeName(legacySale.accountName) === this.normalizeName(account.companyName)
      || this.normalizeName(sale.accountId) === this.normalizeName(account.companyName);
  }

  private enrichSale(sale: Sale) {
    const legacySale = sale as Sale & { accountName?: string };
    const account = this.accounts.find((item) => item.id === sale.accountId)
      ?? this.accounts.find((item) => this.normalizeName(item.companyName) === this.normalizeName(legacySale.accountName));
    return {
      ...sale,
      accountId: sale.accountId || account?.id || '',
      accountName: account?.companyName ?? legacySale.accountName ?? sale.accountId,
    };
  }

  private findProduct(id: string) {
    const product = this.products.find((item) => item.id === id);
    if (!product) throw new NotFoundException('Urun bulunamadi');
    return product;
  }

  private findCategory(id: string) {
    const category = this.categories.find((item) => item.id === id);
    if (!category) throw new NotFoundException('Kategori bulunamadi');
    return category;
  }

  private findCategoryByName(name: string) {
    const category = this.categories.find((item) => item.name === name && item.active);
    if (!category) throw new BadRequestException('Aktif kategori secimi zorunlu');
    return category;
  }

  private categoryNameTree(category: Category) {
    const names = new Set<string>([category.name]);
    const visit = (parentId: string) => {
      this.categories.filter((item) => item.parentId === parentId).forEach((child) => {
        names.add(child.name);
        visit(child.id);
      });
    };
    visit(category.id);
    return names;
  }

  private applyCollectionToAccount(account: Account, currency: Currency, amount: number, rate: number) {
    let appliedToTlBalance = 0;
    let appliedToUsdBalance = 0;

    if (currency === 'TRY') {
      let remainingTryPayment = amount;
      if (account.balanceTry > 0) {
        appliedToTlBalance = Math.min(account.balanceTry, remainingTryPayment);
        account.balanceTry = this.round(account.balanceTry - appliedToTlBalance);
        remainingTryPayment = this.round(remainingTryPayment - appliedToTlBalance);
      }
      if (remainingTryPayment > 0 && account.balanceUsd > 0) {
        const usdCapacity = this.round(remainingTryPayment / rate);
        appliedToUsdBalance = Math.min(account.balanceUsd, usdCapacity);
        account.balanceUsd = this.round(account.balanceUsd - appliedToUsdBalance);
      }
    } else {
      let remainingUsdPayment = amount;
      if (account.balanceUsd > 0) {
        appliedToUsdBalance = Math.min(account.balanceUsd, remainingUsdPayment);
        account.balanceUsd = this.round(account.balanceUsd - appliedToUsdBalance);
        remainingUsdPayment = this.round(remainingUsdPayment - appliedToUsdBalance);
      }
      if (remainingUsdPayment > 0 && account.balanceTry > 0) {
        const tryCapacity = this.round(remainingUsdPayment * rate);
        appliedToTlBalance = Math.min(account.balanceTry, tryCapacity);
        account.balanceTry = this.round(account.balanceTry - appliedToTlBalance);
      }
    }

    return {
      appliedToTlBalance: this.round(appliedToTlBalance),
      appliedToUsdBalance: this.round(appliedToUsdBalance),
    };
  }

  private collectionLedgerDescription(collection: Collection) {
    const rate = collection.exchangeRate || this.usdRate;
    const tlAmount = collection.tlAmount ?? (collection.currency === 'TRY' ? collection.amount : this.round(collection.amount * rate));
    const usdAmount = collection.usdAmount ?? (collection.currency === 'USD' ? collection.amount : this.round(collection.amount / rate));
    if (collection.currency === 'TRY' && (collection.appliedToUsdBalance ?? 0) > 0) {
      return `${collection.method} tahsilat - ${tlAmount} TL tahsilat / ${usdAmount} USD karsiligi`;
    }
    if (collection.currency === 'USD' && (collection.appliedToTlBalance ?? 0) > 0) {
      return `${collection.method} tahsilat - ${usdAmount} USD tahsilat / ${tlAmount} TL karsiligi`;
    }
    return `${collection.method} tahsilat - ${tlAmount} TL / ${usdAmount} USD`;
  }

  private enrichAccount(account: Account) {
    const saleDates = this.sales.filter((item) => this.saleBelongsToAccount(item, account)).map((item) => item.createdAt);
    const collectionDates = this.collections.filter((item) => item.accountId === account.id && item.status !== 'basarisiz').map((item) => item.createdAt);
    const purchaseDates = this.purchases.filter((item) => item.supplierId === account.id).map((item) => item.createdAt);
    const allDates = [...saleDates, ...collectionDates, ...purchaseDates, ...this.supplierPayments.filter((item) => item.supplierId === account.id).map((item) => item.createdAt)].sort((a, b) => b.localeCompare(a));
    const sales = this.sales.filter((item) => this.saleBelongsToAccount(item, account) && item.status !== 'Iptal');
    const balance = this.accountBalanceSummary(account);
    const revenue = this.accountRevenueSummary(sales);
    return {
      ...account,
      balanceTry: balance.balanceTry,
      balanceUsd: balance.balanceUsd,
      balanceDisplayTry: balance.displayTry,
      balanceDisplayUsd: balance.displayUsd,
      totalRevenueTry: revenue.totalTry,
      totalRevenueUsd: revenue.totalUsd,
      totalRevenueDisplayTry: revenue.displayTry,
      totalRevenueDisplayUsd: revenue.displayUsd,
      lastSaleDate: saleDates.sort((a, b) => b.localeCompare(a))[0] || account.lastSaleDate,
      lastCollectionDate: collectionDates.sort((a, b) => b.localeCompare(a))[0] || account.lastCollectionDate,
      lastPurchaseDate: purchaseDates.sort((a, b) => b.localeCompare(a))[0] || account.lastPurchaseDate,
      lastTransactionDate: allDates[0],
    };
  }

  private sum(items: TransactionItem[]) {
    return items.reduce((total, item) => total + item.lineTotal, 0);
  }

  private toTry(value: number, currency: Currency) {
    return currency === 'USD' ? value * this.usdRate : value;
  }

  private accountBalanceSummary(account: Account) {
    let balanceTry = this.round(account.balanceTry);
    let balanceUsd = this.round(account.balanceUsd);
    if (balanceTry < 0 && balanceUsd > 0) {
      const usdOffset = Math.min(balanceUsd, this.round(Math.abs(balanceTry) / this.usdRate));
      balanceUsd = this.round(balanceUsd - usdOffset);
      balanceTry = 0;
    }
    if (balanceUsd < 0 && balanceTry > 0) {
      const tryOffset = Math.min(balanceTry, this.round(Math.abs(balanceUsd) * this.usdRate));
      balanceTry = this.round(balanceTry - tryOffset);
      balanceUsd = 0;
    }
    return {
      balanceTry,
      balanceUsd,
      ...this.dualDisplay(balanceTry, balanceUsd),
    };
  }

  private accountRevenueSummary(sales: Sale[]) {
    const totalTry = this.round(sales.filter((sale) => sale.currency === 'TRY').reduce((sum, sale) => sum + sale.total, 0));
    const totalUsd = this.round(sales.filter((sale) => sale.currency === 'USD').reduce((sum, sale) => sum + sale.total, 0));
    return {
      totalTry,
      totalUsd,
      ...this.dualDisplay(totalTry, totalUsd),
    };
  }

  private saleDualTotals(sale: Sale) {
    const rate = sale.exchangeRate && sale.exchangeRate > 1 ? sale.exchangeRate : this.usdRate;
    return {
      totalTry: this.round(sale.totalTry ?? (sale.currency === 'TRY' ? sale.total : sale.total * rate)),
      totalUsd: this.round(sale.totalUsd ?? (sale.currency === 'USD' ? sale.total : sale.total / rate)),
      paidTry: this.round(sale.paidTry ?? (sale.currency === 'TRY' ? sale.paid : sale.paid * rate)),
      paidUsd: this.round(sale.paidUsd ?? (sale.currency === 'USD' ? sale.paid : sale.paid / rate)),
      remainingTry: this.round(sale.remainingTry ?? (sale.currency === 'TRY' ? sale.remaining : sale.remaining * rate)),
      remainingUsd: this.round(sale.remainingUsd ?? (sale.currency === 'USD' ? sale.remaining : sale.remaining / rate)),
    };
  }

  private collectionDualValues(collection: Collection, account?: Account) {
    const targetAccount = account ?? this.findAccount(collection.accountId);
    const rate = collection.exchangeRate && collection.exchangeRate > 1 ? collection.exchangeRate : this.usdRate;
    const tlAmount = this.round(collection.tlAmount ?? (collection.currency === 'TRY' ? collection.amount : collection.amount * rate));
    const usdAmount = this.round(collection.usdAmount ?? (collection.currency === 'USD' ? collection.amount : collection.amount / rate));
    const remainingTry = this.round(collection.remainingTlBalance ?? targetAccount.balanceTry);
    const remainingUsd = this.round(collection.remainingUsdBalance ?? targetAccount.balanceUsd);
    const remainingDisplayTry = remainingTry > 0 ? remainingTry : this.round(remainingUsd * rate);
    const remainingDisplayUsd = remainingUsd > 0 ? remainingUsd : (remainingTry > 0 ? this.round(remainingTry / rate) : 0);
    return {
      rate,
      tlAmount,
      usdAmount,
      appliedToTlBalance: this.round(collection.appliedToTlBalance ?? (collection.currency === 'TRY' ? collection.amount : 0)),
      appliedToUsdBalance: this.round(collection.appliedToUsdBalance ?? (collection.currency === 'USD' ? collection.amount : 0)),
      remainingTry,
      remainingUsd,
      remainingDisplayTry,
      remainingDisplayUsd,
    };
  }

  private productDealerPrice(product: Product) {
    const tryValue = this.round(product.dealerTry || product.saleTry || ((product.dealerUsd || product.saleUsd || 0) * this.usdRate));
    const usdValue = this.round(product.dealerUsd || product.saleUsd || (tryValue > 0 ? tryValue / this.usdRate : 0));
    return { tryValue, usdValue };
  }

  private enrichOrderPrices(order: Order) {
    const items = (order.items ?? []).map((item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      const price = product ? this.productDealerPrice(product) : { tryValue: this.round(item.unitPriceTry ?? 0), usdValue: this.round(item.unitPriceUsd ?? 0) };
      const unitPriceTry = this.round(item.unitPriceTry || price.tryValue);
      const unitPriceUsd = this.round(item.unitPriceUsd || price.usdValue);
      return {
        ...item,
        productName: item.productName ?? product?.name ?? item.productId,
        unitPriceTry,
        unitPriceUsd,
        lineTotalTry: this.round(item.lineTotalTry || unitPriceTry * item.quantity),
        lineTotalUsd: this.round(item.lineTotalUsd || unitPriceUsd * item.quantity),
      };
    });
    return {
      ...order,
      items,
      totalTry: this.round(order.totalTry || items.reduce((sum, item) => sum + (item.lineTotalTry ?? 0), 0)),
      totalUsd: this.round(order.totalUsd || items.reduce((sum, item) => sum + (item.lineTotalUsd ?? 0), 0)),
    };
  }

  private dualDisplay(tryValue: number, usdValue: number) {
    const positiveTry = Math.max(0, this.round(tryValue));
    const positiveUsd = Math.max(0, this.round(usdValue));
    return {
      displayTry: this.round(positiveTry + (positiveUsd * this.usdRate)),
      displayUsd: this.round(positiveUsd + (positiveTry > 0 ? positiveTry / this.usdRate : 0)),
    };
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }

  private moneyText(value: number, currency: 'TL' | 'USD') {
    return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(this.round(value))} ${currency}`;
  }

  private number(value: unknown, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed)) throw new BadRequestException('Sayisal alan hatali');
    return parsed;
  }

  private daysAgo(day: number) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    return date.toISOString();
  }

  private nextId(prefix: string, list: { id: string }[]) {
    const max = list.reduce((highest, item) => {
      const number = Number(item.id.replace(prefix, ''));
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 0);
    return `${prefix}${max + 1}`;
  }

  private whatsappLink(phone: string, message: string) {
    const digits = phone.replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }
}
