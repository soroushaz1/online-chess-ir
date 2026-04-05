-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "blackRatingAfter" INTEGER,
ADD COLUMN     "blackRatingBefore" INTEGER,
ADD COLUMN     "blackRatingDelta" INTEGER,
ADD COLUMN     "ratingProcessedAt" TIMESTAMP(3),
ADD COLUMN     "whiteRatingAfter" INTEGER,
ADD COLUMN     "whiteRatingBefore" INTEGER,
ADD COLUMN     "whiteRatingDelta" INTEGER;
