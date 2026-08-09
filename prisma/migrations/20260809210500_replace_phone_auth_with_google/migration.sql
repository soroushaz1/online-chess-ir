-- Make the legacy phone field optional so Google-only accounts can be created.
ALTER TABLE "User" ALTER COLUMN "phoneNumber" DROP NOT NULL;

-- Add Google identity/profile fields.
ALTER TABLE "User"
ADD COLUMN "googleId" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "avatarUrl" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- The SMS OTP flow is no longer used.
DROP TABLE IF EXISTS "OtpCode";
