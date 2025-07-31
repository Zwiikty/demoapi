-- CreateTable
CREATE TABLE "BookingTimeSlot" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "courtTimeSlotId" INTEGER NOT NULL,

    CONSTRAINT "BookingTimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingTimeSlot_bookingId_courtTimeSlotId_key" ON "BookingTimeSlot"("bookingId", "courtTimeSlotId");

-- AddForeignKey
ALTER TABLE "BookingTimeSlot" ADD CONSTRAINT "BookingTimeSlot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTimeSlot" ADD CONSTRAINT "BookingTimeSlot_courtTimeSlotId_fkey" FOREIGN KEY ("courtTimeSlotId") REFERENCES "CourtTimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
