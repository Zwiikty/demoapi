-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_startTime_idx" ON "Booking"("startTime");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_remindedAt_idx" ON "Booking"("remindedAt");
