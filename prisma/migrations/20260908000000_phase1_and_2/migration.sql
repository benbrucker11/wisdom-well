-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('PARENT_OF', 'SPOUSE_OF', 'SIBLING_OF');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('TEXT', 'AUDIO', 'VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('NONE', 'PROCESSING', 'DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ReleaseTargetType" AS ENUM ('IMMEDIATE', 'SPECIFIC_MEMBER', 'ROLE');

-- CreateEnum
CREATE TYPE "ReleaseTargetRole" AS ENUM ('CHILD', 'GRANDCHILD', 'GREAT_GRANDCHILD', 'ANY_DESCENDANT', 'ALL_FAMILY');

-- CreateEnum
CREATE TYPE "ReleaseTriggerType" AS ENUM ('NONE', 'AGE', 'DATE', 'EVENT');

-- CreateEnum
CREATE TYPE "ReleaseTriggerEvent" AS ENUM ('MARRIAGE', 'GRADUATION', 'BIRTH_OF_FIRST_CHILD', 'DEATH_OF_AUTHOR', 'CUSTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stewardMemberId" TEXT,
    "inactivityThresholdDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "dateOfDeath" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "authorMemberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'TEXT',
    "mediaUrl" TEXT,
    "rawAudioUrl" TEXT,
    "transcriptRaw" TEXT,
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'NONE',
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseRule" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "targetType" "ReleaseTargetType" NOT NULL,
    "targetMemberId" TEXT,
    "targetRole" "ReleaseTargetRole",
    "triggerType" "ReleaseTriggerType" NOT NULL DEFAULT 'NONE',
    "triggerAge" INTEGER,
    "triggerDate" TIMESTAMP(3),
    "triggerEvent" "ReleaseTriggerEvent",
    "triggerEventLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "recipientMemberId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConfirmation" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "subjectMemberId" TEXT NOT NULL,
    "confirmedByMemberId" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_idx" ON "MagicLinkToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Family_stewardMemberId_key" ON "Family"("stewardMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_key" ON "Member"("userId");

-- CreateIndex
CREATE INDEX "Member_familyId_idx" ON "Member"("familyId");

-- CreateIndex
CREATE INDEX "Relationship_familyId_idx" ON "Relationship"("familyId");

-- CreateIndex
CREATE INDEX "Relationship_fromMemberId_idx" ON "Relationship"("fromMemberId");

-- CreateIndex
CREATE INDEX "Relationship_toMemberId_idx" ON "Relationship"("toMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_fromMemberId_toMemberId_type_key" ON "Relationship"("fromMemberId", "toMemberId", "type");

-- CreateIndex
CREATE INDEX "Entry_familyId_idx" ON "Entry"("familyId");

-- CreateIndex
CREATE INDEX "Entry_authorMemberId_idx" ON "Entry"("authorMemberId");

-- CreateIndex
CREATE INDEX "Entry_status_idx" ON "Entry"("status");

-- CreateIndex
CREATE INDEX "ReleaseRule_entryId_idx" ON "ReleaseRule"("entryId");

-- CreateIndex
CREATE INDEX "Release_recipientMemberId_idx" ON "Release"("recipientMemberId");

-- CreateIndex
CREATE INDEX "Release_entryId_idx" ON "Release"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "Release_entryId_recipientMemberId_key" ON "Release"("entryId", "recipientMemberId");

-- CreateIndex
CREATE INDEX "EventConfirmation_ruleId_idx" ON "EventConfirmation"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "EventConfirmation_ruleId_subjectMemberId_key" ON "EventConfirmation"("ruleId", "subjectMemberId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_stewardMemberId_fkey" FOREIGN KEY ("stewardMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRule" ADD CONSTRAINT "ReleaseRule_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRule" ADD CONSTRAINT "ReleaseRule_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReleaseRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_recipientMemberId_fkey" FOREIGN KEY ("recipientMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfirmation" ADD CONSTRAINT "EventConfirmation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReleaseRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfirmation" ADD CONSTRAINT "EventConfirmation_subjectMemberId_fkey" FOREIGN KEY ("subjectMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

