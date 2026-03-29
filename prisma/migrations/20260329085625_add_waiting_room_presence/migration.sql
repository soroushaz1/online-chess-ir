-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "blackConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whiteConnected" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'waiting';
