-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'openrouter';

-- CreateTable
CREATE TABLE "UserDailyFreeUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyFreeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalDailyFreeUsage" (
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalDailyFreeUsage_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyFreeUsage_userId_day_key" ON "UserDailyFreeUsage"("userId", "day");

-- CreateIndex
CREATE INDEX "UserDailyFreeUsage_day_idx" ON "UserDailyFreeUsage"("day");

-- AddForeignKey
ALTER TABLE "UserDailyFreeUsage" ADD CONSTRAINT "UserDailyFreeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
