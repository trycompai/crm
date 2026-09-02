CREATE FUNCTION "better_auth_jwt_payload"(token TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
    payload TEXT;
BEGIN
    payload := translate(split_part(token, '.', 2), '-_', '+/');
    payload := payload || repeat('=', (4 - length(payload) % 4) % 4);
    RETURN convert_from(decode(payload, 'base64'), 'UTF8')::JSONB;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

UPDATE "account"
SET "issuer" = 'local:credential',
    "accountId" = "userId"
WHERE "providerId" = 'credential';

UPDATE "account"
SET "issuer" = 'https://accounts.google.com'
WHERE "providerId" = 'google';

UPDATE "account"
SET "issuer" = 'local:oauth:slack'
WHERE "providerId" = 'slack';

WITH "microsoftIdentity" AS MATERIALIZED (
    SELECT "id", "better_auth_jwt_payload"("idToken") AS "payload"
    FROM "account"
    WHERE "providerId" = 'microsoft'
      AND "idToken" IS NOT NULL
)
UPDATE "account" AS account
SET "issuer" = identity."payload"->>'iss',
    "accountId" = identity."payload"->>'oid'
FROM "microsoftIdentity" AS identity
WHERE account."id" = identity."id"
  AND jsonb_typeof(identity."payload"->'iss') = 'string'
  AND length(identity."payload"->>'iss') > 0
  AND jsonb_typeof(identity."payload"->'oid') = 'string'
  AND length(identity."payload"->>'oid') > 0;

UPDATE "account" AS account
SET "issuer" = provider."issuer"
FROM "ssoProvider" AS provider
WHERE account."providerId" = provider."providerId"
  AND account."issuer" IS NULL
  AND length(provider."issuer") > 0;

DELETE FROM "account" AS account
WHERE account."issuer" IS NULL
  AND account."providerId" NOT IN ('credential', 'google', 'microsoft', 'slack')
  AND NOT EXISTS (
      SELECT 1
      FROM "ssoProvider" AS provider
      WHERE provider."providerId" = account."providerId"
  );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "account"
        WHERE "issuer" IS NULL OR length("issuer") = 0
    ) THEN
        RAISE EXCEPTION 'Better Auth account issuer backfill is incomplete';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "account"
        WHERE "providerId" = 'microsoft'
          AND (
              "idToken" IS NULL
              OR "issuer" IS DISTINCT FROM "better_auth_jwt_payload"("idToken")->>'iss'
              OR "accountId" IS DISTINCT FROM "better_auth_jwt_payload"("idToken")->>'oid'
          )
    ) THEN
        RAISE EXCEPTION 'Microsoft account identity needs a verified oid mapping before Better Auth 1.7';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "account"
        GROUP BY "issuer", "accountId"
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Better Auth account identity backfill found duplicate issuer and accountId pairs';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "account"
        GROUP BY "userId", "providerId"
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Mailbox account identity backfill found duplicate userId and providerId pairs';
    END IF;
END;
$$;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
ON "account"("issuer", "accountId");

CREATE UNIQUE INDEX "account_userId_providerId_uidx"
ON "account"("userId", "providerId");

DROP FUNCTION "better_auth_jwt_payload"(TEXT);
