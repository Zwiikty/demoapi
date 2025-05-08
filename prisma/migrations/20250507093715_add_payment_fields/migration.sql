-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "paymentSlipAmount" DOUBLE PRECISION,
ADD COLUMN     "paymentVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qrCodeRef" TEXT;
