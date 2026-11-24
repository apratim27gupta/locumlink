-- Remember the selected audience on a saved broadcast draft.
ALTER TABLE "broadcast_drafts"
  ADD COLUMN "recipient_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
