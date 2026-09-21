-- AlterTable
ALTER TABLE "AutomationExecution" ADD COLUMN     "stockLevelId" TEXT;

-- CreateIndex
CREATE INDEX "AutomationExecution_businessId_stockLevelId_idx" ON "AutomationExecution"("businessId", "stockLevelId");

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_stockLevelId_fkey" FOREIGN KEY ("stockLevelId") REFERENCES "StockLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
