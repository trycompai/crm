CREATE TYPE "QuoteStatus" AS ENUM ('NOT_READY', 'READY', 'SENT', 'REJECTED');

CREATE TYPE "InvoiceStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'SENT');

CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'FULLY_PAID');

CREATE TYPE "CalendarStatus" AS ENUM ('NOT_ADDED', 'ADDED', 'FAILED');

ALTER TABLE "deal"
    ADD COLUMN "quoteStatus" "QuoteStatus" NOT NULL DEFAULT 'NOT_READY',
    ADD COLUMN "invoiceStatus" "InvoiceStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN "calendarStatus" "CalendarStatus" NOT NULL DEFAULT 'NOT_ADDED',
    ADD COLUMN "googleCalendarEventId" TEXT,
    ADD COLUMN "quoteSentAt" TIMESTAMP(3),
    ADD COLUMN "invoiceRequestedAt" TIMESTAMP(3),
    ADD COLUMN "invoiceSentAt" TIMESTAMP(3),
    ADD COLUMN "depositPaidAt" TIMESTAMP(3),
    ADD COLUMN "fullyPaidAt" TIMESTAMP(3),
    ADD COLUMN "calendarAddedAt" TIMESTAMP(3),
    ADD COLUMN "depositAmount" DECIMAL(14,2),
    ADD COLUMN "balanceAmount" DECIMAL(14,2);
