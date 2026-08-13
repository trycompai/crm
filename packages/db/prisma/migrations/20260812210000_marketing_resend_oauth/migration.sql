-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "marketingResendClientId" TEXT,
ADD COLUMN     "marketingResendClientSecret" TEXT,
ADD COLUMN     "marketingResendAccessToken" TEXT,
ADD COLUMN     "marketingResendRefreshToken" TEXT,
ADD COLUMN     "marketingResendTokenExpires" TIMESTAMP(3),
ADD COLUMN     "marketingResendAuthState" TEXT,
ADD COLUMN     "marketingResendAuthVerifier" TEXT;
