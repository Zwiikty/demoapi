-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "CourtTimeSlot" ADD COLUMN     "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE';
