import { Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Put } from '@nestjs/common';
import { DataService } from './data.service';
import { Account, Category, MessageTemplate, PdfTemplate, Product } from './types';

@Controller()
export class BusinessController {
  constructor(private readonly data: DataService) {}

  private normalizeSaleUpdate(body: {
    accountId?: string;
    cariId?: string;
    items?: { productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number }[];
    currency?: 'TRY' | 'USD';
    paraBirimi?: 'TRY' | 'USD';
    paid?: number;
    odenen?: number;
    discount?: number;
    iskonto?: number;
    date?: string;
    tarih?: string;
    paymentMethod?: 'Nakit' | 'Havale/EFT' | 'Kredi karti' | 'Cek' | 'Senet' | 'Vadeli';
    odemeTipi?: 'Nakit' | 'Havale/EFT' | 'Kredi karti' | 'Cek' | 'Senet' | 'Vadeli';
    description?: string;
    aciklama?: string;
  }) {
    return {
      accountId: body.accountId ?? body.cariId,
      items: body.items,
      currency: body.currency ?? body.paraBirimi,
      paid: body.paid ?? body.odenen,
      discount: body.discount ?? body.iskonto,
      date: body.date ?? body.tarih,
      paymentMethod: body.paymentMethod ?? body.odemeTipi,
      description: body.description ?? body.aciklama,
    };
  }

  @Get('dashboard')
  dashboard() {
    return this.data.dashboard();
  }

  @Get('users')
  users() {
    return this.data.listUsers();
  }

  @Post('users')
  createUser(@Body() body: { name: string; email: string; username?: string; password: string; role: 'CUSTOMER' | 'DEALER' | 'ADMIN' | 'ACCOUNTING' | 'SALES' | 'WAREHOUSE' | 'VIEWER'; accountId?: string; phone?: string; mustChangePassword?: boolean; active?: boolean }) {
    return this.data.createUser(body);
  }

  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() body: { name?: string; email?: string; username?: string; password?: string; role?: 'CUSTOMER' | 'DEALER' | 'ADMIN' | 'ACCOUNTING' | 'SALES' | 'WAREHOUSE' | 'VIEWER'; accountId?: string; phone?: string; mustChangePassword?: boolean; active?: boolean }) {
    return this.data.updateUser(id, body);
  }

  @Get('exchange-rate')
  exchangeRate() {
    return this.data.exchangeRate();
  }

  @Post('exchange-rate/update')
  updateExchangeRate(@Body() body: { rate?: number }) {
    return this.data.updateExchangeRate(body);
  }

  @Get('backup')
  backup() {
    return this.data.exportStore();
  }

  @Post('backup/import')
  importBackup(@Body() body: ReturnType<DataService['exportStore']>) {
    return this.data.importStore(body);
  }

  @Get('accounts')
  accounts() {
    return this.data.listAccounts();
  }

  @Post('accounts')
  createAccount(@Body() body: Partial<Account> & Record<string, unknown>) {
    return this.data.createAccount(body);
  }

  @Put('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() body: Partial<Account>) {
    return this.data.updateAccount(id, body);
  }

  @Delete('accounts/:id')
  deleteAccount(@Param('id') id: string) {
    return this.data.deleteAccount(id);
  }

  @Get('accounts/:id')
  accountDetail(@Param('id') id: string) {
    return this.data.accountDetail(id);
  }

  @Get('products')
  products() {
    return this.data.listProducts();
  }

  @Get('categories')
  categories() {
    return this.data.listCategories();
  }

  @Post('categories')
  createCategory(@Body() body: Partial<Category>) {
    return this.data.createCategory(body);
  }

  @Put('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: Partial<Category>) {
    return this.data.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.data.deleteCategory(id);
  }

  @Post('products')
  createProduct(@Body() body: Partial<Product> & Record<string, unknown>) {
    return this.data.createProduct(body);
  }

  @Get('products/export')
  exportProducts() {
    return this.data.listProducts();
  }

  @Get('products/import-template')
  productImportTemplate() {
    return this.data.productImportTemplate();
  }

  @Post('products/import')
  importProducts(@Body() body: { rows: Partial<Product>[] }) {
    return this.data.importProducts(body.rows ?? []);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() body: Partial<Product>) {
    return this.data.updateProduct(id, body);
  }

  @Put('products/:id/archive')
  archiveProduct(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.data.archiveProduct(id, Boolean(body.active));
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.data.deleteProduct(id);
  }

  @Get('sales')
  sales() {
    return this.data.listSales();
  }

  @Post('sales')
  createSale(@Body() body: { accountId: string; items: { productId: string; quantity: number }[]; currency: 'TRY' | 'USD'; paid?: number; discount?: number }) {
    return this.data.createSale(body);
  }

  @Put('sales/:id')
  updateSale(@Param('id') id: string, @Body() body: Parameters<BusinessController['normalizeSaleUpdate']>[0]) {
    return this.data.updateSale(id, this.normalizeSaleUpdate(body));
  }

  @Patch('sales/:id')
  patchSale(@Param('id') id: string, @Body() body: Parameters<BusinessController['normalizeSaleUpdate']>[0]) {
    return this.data.updateSale(id, this.normalizeSaleUpdate(body));
  }

  @Get('collections')
  collections() {
    return this.data.listCollections();
  }

  @Get('payments/logs')
  paymentLogs() {
    return this.data.listPaymentLogs();
  }

  @Post('collections')
  createCollection(@Body() body: { accountId: string; method: 'Nakit' | 'Havale/EFT' | 'Kredi karti' | 'Cek' | 'Senet'; currency: 'TRY' | 'USD'; amount: number; description?: string }) {
    return this.data.createCollection(body);
  }

  @Post('collections/auto/:accountId')
  autoCollection(@Param('accountId') accountId: string, @Body() body: { result?: 'success' | 'fail' }) {
    return this.data.runAutoCollection(accountId, body.result);
  }

  @Get('collections/:id/receipt')
  collectionReceipt(@Param('id') id: string) {
    return this.data.collectionReceipt(id);
  }

  @Get('receipts/collections/:id')
  collectionReceiptAlias(@Param('id') id: string) {
    return this.data.collectionReceipt(id);
  }

  @Post('whatsapp/collections/:id')
  collectionWhatsapp(@Param('id') id: string) {
    return this.data.collectionWhatsapp(id);
  }

  @Get('orders')
  orders() {
    return this.data.listOrders();
  }

  @Get('dealer/:accountId/orders')
  dealerOrders(@Param('accountId') accountId: string) {
    return this.data.listDealerOrders(accountId);
  }

  @Get('purchases')
  purchases() {
    return this.data.listPurchases();
  }

  @Post('purchases')
  createPurchase(@Body() body: { supplierId: string; items: { productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number }[]; currency: 'TRY' | 'USD'; date?: string; invoiceNo?: string; paymentStatus?: 'Odendi' | 'Bekliyor' | 'Kismi'; description?: string }) {
    return this.data.createPurchase(body);
  }

  @Put('purchases/:id')
  updatePurchase(@Param('id') id: string, @Body() body: { supplierId?: string; items?: { productId: string; quantity: number; unitPrice?: number; unitPriceTry?: number; unitPriceUsd?: number; vatRate?: number }[]; currency?: 'TRY' | 'USD'; date?: string; invoiceNo?: string; paymentStatus?: 'Odendi' | 'Bekliyor' | 'Kismi'; description?: string }) {
    return this.data.updatePurchase(id, body);
  }

  @Get('supplier-payments')
  supplierPayments() {
    return this.data.listSupplierPayments();
  }

  @Post('supplier-payments')
  createSupplierPayment(@Body() body: { supplierId: string; method: 'Nakit' | 'Havale/EFT' | 'Kredi karti'; currency: 'TRY' | 'USD'; amount: number; date?: string; description?: string }) {
    return this.data.createSupplierPayment(body);
  }

  @Get('quotes')
  quotes() {
    return this.data.listQuotes();
  }

  @Post('quotes')
  createQuote(@Body() body: { accountId: string; items: { productId: string; quantity: number; unitPriceTry?: number; unitPriceUsd?: number; discountRate?: number; vatRate?: number }[]; currency: 'TRY' | 'USD'; discount?: number; validUntil: string }) {
    return this.data.createQuote(body);
  }

  @Put('quotes/:id')
  updateQuote(@Param('id') id: string, @Body() body: { accountId: string; items: { productId: string; quantity: number; unitPriceTry?: number; unitPriceUsd?: number; discountRate?: number; vatRate?: number }[]; currency: 'TRY' | 'USD'; validUntil: string }) {
    return this.data.updateQuote(id, body);
  }

  @Post('quotes/:id/status')
  updateQuoteStatus(@Param('id') id: string, @Body() body: { status: 'Taslak' | 'Hazirlaniyor' | 'Gonderildi' | 'Musteri goruntuledi' | 'Onaylandi' | 'Reddedildi' | 'Iptal edildi' | 'Suresi gecti' }) {
    return this.data.updateQuoteStatus(id, body.status);
  }

  @Post('quotes/:id/clone')
  cloneQuote(@Param('id') id: string) {
    return this.data.cloneQuote(id);
  }

  @Get('quotes/:id/pdf-preview')
  quotePreview(@Param('id') id: string) {
    return this.data.quotePreview(id);
  }

  @Get('pdf-templates')
  pdfTemplates() {
    return this.data.listPdfTemplates();
  }

  @Put('pdf-templates/:id')
  updatePdfTemplate(@Param('id') id: string, @Body() body: Partial<PdfTemplate>) {
    return this.data.updatePdfTemplate(id, body);
  }

  @Get('message-templates')
  messageTemplates() {
    return this.data.listMessageTemplates();
  }

  @Post('message-templates')
  createMessageTemplate(@Body() body: Partial<MessageTemplate>) {
    return this.data.createMessageTemplate(body);
  }

  @Put('message-templates/:id')
  updateMessageTemplate(@Param('id') id: string, @Body() body: Partial<MessageTemplate>) {
    return this.data.updateMessageTemplate(id, body);
  }

  @Post('orders')
  createOrder(@Body() body: { accountId: string; items: { productId: string; quantity: number }[]; currency?: 'TRY' | 'USD' }) {
    return this.data.createOrder(body);
  }

  @Get('portal/account')
  portalAccount(@Headers('authorization') authorization?: string) {
    return this.data.portalAccount(authorization);
  }

  @Get('portal/orders')
  portalOrders(@Headers('authorization') authorization?: string) {
    return this.data.portalOrders(authorization);
  }

  @Post('portal/orders')
  createPortalOrder(@Headers('authorization') authorization: string | undefined, @Body() body: { items: { productId: string; quantity: number }[]; currency?: 'TRY' | 'USD' }) {
    return this.data.createPortalOrder(authorization, body);
  }

  @Post('portal/payments')
  createPortalPayment(@Headers('authorization') authorization: string | undefined, @Body() body: { amount: number; currency: 'TRY' | 'USD'; method?: 'Nakit' | 'Havale/EFT' | 'Kredi karti' | 'Cek' | 'Senet' }) {
    return this.data.createPortalPayment(authorization, body);
  }

  @Post('portal/payments/card')
  createPortalCardPayment(@Headers('authorization') authorization: string | undefined, @Body() body: { amount: number; currency: 'TRY' | 'USD'; cardHolder: string; cardNumber: string; expiryMonth: string; expiryYear: string; cvv: string; installments?: number }) {
    return this.data.createPortalCardPayment(authorization, body);
  }

  @Post('orders/:id/approve')
  approveOrder(@Param('id') id: string) {
    return this.data.approveOrder(id);
  }

  @Post('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() body: { status: 'Beklemede' | 'Onaylandi' | 'Hazirlaniyor' | 'Kargoda' | 'Teslim edildi' | 'Iptal edildi' }) {
    return this.data.updateOrderStatus(id, body.status);
  }

  @Post('whatsapp/sales/:id')
  saleMessage(@Param('id') id: string) {
    return this.data.whatsappSaleNote(id);
  }

  @Post('whatsapp/debt/:accountId')
  debtMessage(@Param('accountId') accountId: string) {
    return this.data.whatsappDebtReminder(accountId);
  }

  @Post('payments/tosla/link')
  toslaPaymentLink(@Body() body: { accountId: string; amount: number; currency: 'TRY' | 'USD' }) {
    return this.data.createToslaPaymentLink(body);
  }

  @Post('payments/dealer')
  dealerPayment(@Body() body: { accountId: string; amount: number; currency: 'TRY' | 'USD'; method?: 'Nakit' | 'Havale/EFT' | 'Kredi karti' | 'Cek' | 'Senet' }) {
    return this.data.createDealerPayment(body);
  }

  @Post('payments/dealer/card')
  dealerCardPayment(@Body() body: { accountId: string; amount: number; currency: 'TRY' | 'USD'; cardHolder: string; cardNumber: string; expiryMonth: string; expiryYear: string; cvv: string; installments?: number }) {
    return this.data.createDealerCardPayment(body);
  }

  @Post('payments/dealer/:id/approve')
  approveDealerPayment(@Param('id') id: string) {
    return this.data.approveDealerPayment(id);
  }

  @Post('payments/tosla/webhook')
  toslaWebhook(@Body() body: unknown) {
    return { received: true, body };
  }

  @Get('exports/accounts.xlsx')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cariler.csv"')
  exportAccounts() {
    const rows = this.data.listAccounts();
    const headers = ['Cari kod', 'Tip', 'Firma', 'Yetkili', 'Telefon', 'TL bakiye', 'USD bakiye', 'Risk limiti', 'Vade'];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.map(escape).join(';'), ...rows.map((account) => [
      account.code,
      account.type,
      account.companyName,
      account.contactName,
      account.phone,
      account.balanceTry,
      account.balanceUsd,
      account.riskLimit,
      account.dueDay,
    ].map(escape).join(';'))].join('\n');
  }

  @Get('documents/sales/:id.pdf')
  salePdf(@Param('id') id: string) {
    return this.data.saleReceipt(id);
  }

  @Get('receipts/sales/:id')
  saleReceipt(@Param('id') id: string) {
    return this.data.saleReceipt(id);
  }
}
