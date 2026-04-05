-- CreateTable
CREATE TABLE "GameChatMessage" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameChatMessage_gameId_createdAt_idx" ON "GameChatMessage"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameChatMessage_userId_createdAt_idx" ON "GameChatMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameChatMessage" ADD CONSTRAINT "GameChatMessage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameChatMessage" ADD CONSTRAINT "GameChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
