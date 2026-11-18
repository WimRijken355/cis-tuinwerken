-- User.email: required + unique. Existing users are backfilled: the admin
-- "wim" gets his real address, any other user a placeholder on the reserved
-- ".invalid" domain (never deliverable) that must be replaced via Gebruikers.
ALTER TABLE "User" ADD COLUMN "email" TEXT;
UPDATE "User" SET "email" = 'wim.rijken@wirico.be' WHERE "username" = 'wim';
UPDATE "User" SET "email" = lower("username") || '@geen-email.invalid' WHERE "email" IS NULL;
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- "Wachtwoord vergeten" links (only the token hash is stored).
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
