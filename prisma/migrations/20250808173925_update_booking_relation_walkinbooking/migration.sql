/*
  Warnings:

  - A unique constraint covering the columns `[bookingId]` on the table `WalkInBooking` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WalkInBooking" ADD COLUMN     "bookingId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "WalkInBooking_bookingId_key" ON "WalkInBooking"("bookingId");

-- AddForeignKey
ALTER TABLE "WalkInBooking" ADD CONSTRAINT "WalkInBooking_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
