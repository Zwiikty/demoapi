-- DropForeignKey
ALTER TABLE "BookingTimeSlot" DROP CONSTRAINT "BookingTimeSlot_bookingId_fkey";

-- AlterTable
ALTER TABLE "BookingTimeSlot" ALTER COLUMN "bookingId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "BookingTimeSlot" ADD CONSTRAINT "BookingTimeSlot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
