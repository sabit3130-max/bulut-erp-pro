-- Initial PostgreSQL schema for Bulut ERP Pro.
-- Prisma can regenerate this migration from schema.prisma; this file is kept
-- explicit so production setup is not a placeholder.

CREATE TYPE "Role" AS ENUM ('ADMIN', 'ACCOUNTING', 'SALES', 'WAREHOUSE', 'DEALER', 'VIEWER');
CREATE TYPE "AccountType" AS ENUM ('MUSTERI', 'BAYI', 'TEDARIKCI');
CREATE TYPE "Currency" AS ENUM ('TRY', 'USD');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'EFT', 'CREDIT_CARD', 'CHECK', 'NOTE');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'APPROVED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED');

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "AccountType" NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "whatsapp" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "taxOffice" TEXT NOT NULL,
  "taxNumber" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "balanceTry" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "balanceUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "riskLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "dueDay" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "accountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "barcode" TEXT,
  "category" TEXT NOT NULL,
  "brand" TEXT,
  "description" TEXT,
  "imageUrl" TEXT,
  "warehouse" TEXT NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "criticalStock" INTEGER NOT NULL DEFAULT 0,
  "purchaseTry" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "purchaseUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "saleTry" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "saleUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "dealerTry" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "dealerUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "fixedTryPrice" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sale" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "subtotal" DECIMAL(18,2) NOT NULL,
  "vat" DECIMAL(18,2) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL,
  "total" DECIMAL(18,2) NOT NULL,
  "paid" DECIMAL(18,2) NOT NULL,
  "remaining" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "subtotal" DECIMAL(18,2) NOT NULL,
  "vat" DECIMAL(18,2) NOT NULL,
  "total" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "subtotal" DECIMAL(18,2) NOT NULL,
  "vat" DECIMAL(18,2) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL,
  "total" DECIMAL(18,2) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "currency" "Currency" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "provider" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "totalTry" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
