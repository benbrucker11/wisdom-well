-- CreateEnum
CREATE TYPE "ReminderFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'OFF');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('SIGN_IN', 'INVITE', 'SET_PASSWORD', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "PromptVisibility" AS ENUM ('PRIVATE', 'FAMILY');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
ALTER TYPE "RelationshipType" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordPromptSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderFrequency" "ReminderFrequency" NOT NULL DEFAULT 'BIWEEKLY',
ADD COLUMN     "unsubscribeToken" TEXT;

-- AlterTable
ALTER TABLE "MagicLinkToken" ADD COLUMN     "purpose" "TokenPurpose" NOT NULL DEFAULT 'SIGN_IN';

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "joinCode" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "detailsConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Relationship" ADD COLUMN     "customLabel" TEXT;

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "promptBucket" TEXT,
ADD COLUMN     "promptId" TEXT,
ADD COLUMN     "promptSubtopic" TEXT;

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "authorMemberId" TEXT NOT NULL,
    "askedOfMemberId" TEXT,
    "text" TEXT NOT NULL,
    "visibility" "PromptVisibility" NOT NULL DEFAULT 'PRIVATE',
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "relationNote" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prompt_familyId_idx" ON "Prompt"("familyId");

-- CreateIndex
CREATE INDEX "Prompt_askedOfMemberId_idx" ON "Prompt"("askedOfMemberId");

-- CreateIndex
CREATE INDEX "JoinRequest_familyId_status_idx" ON "JoinRequest"("familyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_unsubscribeToken_key" ON "User"("unsubscribeToken");

-- CreateIndex
CREATE UNIQUE INDEX "Family_joinCode_key" ON "Family"("joinCode");

-- CreateIndex
CREATE INDEX "Entry_promptId_idx" ON "Entry"("promptId");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_askedOfMemberId_fkey" FOREIGN KEY ("askedOfMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

