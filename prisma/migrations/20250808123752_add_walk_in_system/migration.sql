-- CreateEnum
CREATE TYPE "WalkInStatus" AS ENUM ('APPROVE', 'CANCEL');

-- AlterTable
ALTER TABLE "BookingTimeSlot" ADD COLUMN     "walkInBookingId" INTEGER;

-- CreateTable
CREATE TABLE "WalkInBooking" (
    "id" SERIAL NOT NULL,
    "courtId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "people" INTEGER NOT NULL,
    "status" "WalkInStatus" NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalkInBooking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BookingTimeSlot" ADD CONSTRAINT "BookingTimeSlot_walkInBookingId_fkey" FOREIGN KEY ("walkInBookingId") REFERENCES "WalkInBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkInBooking" ADD CONSTRAINT "WalkInBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
