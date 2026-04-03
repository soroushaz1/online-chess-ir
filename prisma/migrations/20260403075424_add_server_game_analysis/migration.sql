-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "analysisCompletedAt" TIMESTAMP(3),
ADD COLUMN     "analysisError" TEXT,
ADD COLUMN     "analysisStartedAt" TIMESTAMP(3),
ADD COLUMN     "analysisStatus" TEXT NOT NULL DEFAULT 'idle';

-- CreateTable
CREATE TABLE "GameAnalysisPosition" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "fen" TEXT NOT NULL,
    "depthReached" INTEGER NOT NULL DEFAULT 0,
    "scoreCp" INTEGER,
    "mate" INTEGER,
    "bestMoveUci" TEXT,
    "bestMoveSan" TEXT,
    "pv" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAnalysisPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAnalysisMove" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "moveNumber" INTEGER NOT NULL,
    "classification" TEXT,
    "evalLossCp" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAnalysisMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameAnalysisPosition_gameId_idx" ON "GameAnalysisPosition"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameAnalysisPosition_gameId_ply_key" ON "GameAnalysisPosition"("gameId", "ply");

-- CreateIndex
CREATE UNIQUE INDEX "GameAnalysisMove_moveId_key" ON "GameAnalysisMove"("moveId");

-- CreateIndex
CREATE INDEX "GameAnalysisMove_gameId_moveNumber_idx" ON "GameAnalysisMove"("gameId", "moveNumber");

-- AddForeignKey
ALTER TABLE "GameAnalysisPosition" ADD CONSTRAINT "GameAnalysisPosition_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAnalysisMove" ADD CONSTRAINT "GameAnalysisMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAnalysisMove" ADD CONSTRAINT "GameAnalysisMove_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "Move"("id") ON DELETE CASCADE ON UPDATE CASCADE;
