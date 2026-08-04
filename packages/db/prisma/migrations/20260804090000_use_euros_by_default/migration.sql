ALTER TABLE "deal" ALTER COLUMN "currency" SET DEFAULT 'EUR';

UPDATE "deal"
SET "currency" = 'EUR'
WHERE UPPER("currency") = 'USD';
