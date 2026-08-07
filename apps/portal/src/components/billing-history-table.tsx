import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Icons } from "@/components/icons";

// Shared between the organization and individual platform-detail billing tabs — the
// `invoices` row shape (specs/billing-integrity-plan.md) is identical for both, only the
// owning-side TS interface names differ (PlatformOrganizationInvoice vs
// PlatformIndividualInvoice), so this takes the plain structural shape rather than
// either specific type.
export interface BillingHistoryInvoice {
  id: string;
  planId: string;
  amountTotal: number;
  currency: string;
  status: string;
  receiptUrl: string | null;
  issuedAt: string | Date;
}

function formatAmount(amountTotal: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountTotal / 100);
}

function statusBadgeVariant(status: string): "outline" | "destructive" | "secondary" {
  if (status === "paid") return "outline";
  if (status === "refunded" || status === "partially_refunded") return "destructive";
  return "secondary";
}

export function BillingHistoryTable({ invoices }: { invoices: BillingHistoryInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Icons.billing className="text-muted-foreground/40 mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-sm">No billing history yet.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Receipt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="text-sm whitespace-nowrap">
              {new Date(invoice.issuedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </TableCell>
            <TableCell className="text-sm capitalize">{invoice.planId}</TableCell>
            <TableCell className="text-sm whitespace-nowrap">
              {formatAmount(invoice.amountTotal, invoice.currency)}
            </TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(invoice.status)} className="capitalize">
                {invoice.status.replace("_", " ")}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              {invoice.receiptUrl ? (
                <a
                  href={invoice.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded text-sm hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  View <Icons.externalLink className="size-3" />
                </a>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
