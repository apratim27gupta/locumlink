-- Invoice history: host ticket lifecycle events on match fee invoices.
ALTER TYPE "MatchFeeInvoiceEventType" ADD VALUE IF NOT EXISTS 'TICKET_OPENED';
ALTER TYPE "MatchFeeInvoiceEventType" ADD VALUE IF NOT EXISTS 'TICKET_RESOLVED';
