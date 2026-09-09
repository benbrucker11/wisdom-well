-- CreateEnum
CREATE TYPE "SuccessionPolicy" AS ENUM ('NAMED_ONLY', 'NAMED_THEN_ELDEST_DESCENDANT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DEPARTED');

-- CreateEnum
CREATE TYPE "ParentKind" AS ENUM ('BIOLOGICAL', 'ADOPTIVE', 'STEP', 'GUARDIAN');

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "founderMemberId" TEXT,
ADD COLUMN     "successionPolicy" "SuccessionPolicy" NOT NULL DEFAULT 'NAMED_THEN_ELDEST_DESCENDANT';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "departedAt" TIMESTAMP(3),
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Relationship" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "parentKind" "ParentKind";

-- AlterTable
ALTER TABLE "ReleaseRule" ADD COLUMN     "includeStepDescendants" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Successor" ADD COLUMN     "acceptedAt" TIMESTAMP(3);

