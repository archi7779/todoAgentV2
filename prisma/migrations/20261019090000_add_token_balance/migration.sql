-- Баланс токенов + журнал списаний.
-- Вручную: prisma migrate dev в этом проекте конфликтует из-за отдельной
-- схемы langgraph, поэтому применяем через `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenBalance" INTEGER NOT NULL DEFAULT 100000;

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenUsage_userId_createdAt_idx" ON "TokenUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenUsage_threadId_createdAt_idx" ON "TokenUsage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
