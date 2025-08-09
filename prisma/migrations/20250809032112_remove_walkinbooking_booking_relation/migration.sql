/*
  Warnings:

  - You are about to drop the column `bookingId` on the `WalkInBooking` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "WalkInBooking" DROP CONSTRAINT "WalkInBooking_bookingId_fkey";

-- DropIndex
DROP INDEX "WalkInBooking_bookingId_key";

-- AlterTable
ALTER TABLE "WalkInBooking" DROP COLUMN "bookingId";
