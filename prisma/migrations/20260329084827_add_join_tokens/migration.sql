/*
  Warnings:

  - A unique constraint covering the columns `[whiteJoinToken]` on the table `Game` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[blackJoinToken]` on the table `Game` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `blackJoinToken` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `whiteJoinToken` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "blackJoinToken" TEXT NOT NULL,
ADD COLUMN     "whiteJoinToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Game_whiteJoinToken_key" ON "Game"("whiteJoinToken");

-- CreateIndex
CREATE UNIQUE INDEX "Game_blackJoinToken_key" ON "Game"("blackJoinToken");
