-- AlterTable
ALTER TABLE "MagicLinkToken" ADD COLUMN     "memberId" TEXT;

-- CreateIndex
CREATE INDEX "MagicLinkToken_memberId_idx" ON "MagicLinkToken"("memberId");

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
