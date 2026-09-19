ALTER TABLE "applications" ADD COLUMN "availability_kind" TEXT;
ALTER TABLE "applications" ADD COLUMN "available_dates" TEXT[] NOT NULL DEFAULT '{}';
