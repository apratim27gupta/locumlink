-- CreateTable
CREATE TABLE "admin_notification_events" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "payload" JSONB,
    "delivery_status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "delivered_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_notification_events_admin_id_idx" ON "admin_notification_events"("admin_id");

-- AddForeignKey
ALTER TABLE "admin_notification_events" ADD CONSTRAINT "admin_notification_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
