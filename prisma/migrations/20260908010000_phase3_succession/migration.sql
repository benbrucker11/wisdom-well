-- CreateEnum
CREATE TYPE "StewardTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StewardTransferCancelReason" AS ENUM ('STEWARD_RETURNED', 'STEWARD_DECLINED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "successionGraceDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Successor" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Successor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StewardTransfer" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "fromMemberId" TEXT,
    "toMemberId" TEXT NOT NULL,
    "status" "StewardTransferStatus" NOT NULL DEFAULT 'PENDING',
    "stewardLastSeenAt" TIMESTAMP(3) NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graceEndsAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" "StewardTransferCancelReason",

    CONSTRAINT "StewardTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Successor_memberId_key" ON "Successor"("memberId");

-- CreateIndex
CREATE INDEX "Successor_familyId_idx" ON "Successor"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Successor_familyId_position_key" ON "Successor"("familyId", "position");

-- CreateIndex
CREATE INDEX "StewardTransfer_familyId_status_idx" ON "StewardTransfer"("familyId", "status");

-- AddForeignKey
ALTER TABLE "Successor" ADD CONSTRAINT "Successor_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Successor" ADD CONSTRAINT "Successor_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StewardTransfer" ADD CONSTRAINT "StewardTransfer_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StewardTransfer" ADD CONSTRAINT "StewardTransfer_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StewardTransfer" ADD CONSTRAINT "StewardTransfer_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

