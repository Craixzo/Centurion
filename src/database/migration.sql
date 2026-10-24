-- AlterTable
ALTER TABLE "NewsArticle" ADD COLUMN "previewKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_previewKey_key" ON "NewsArticle"("previewKey");
