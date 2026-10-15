import { z } from "zod";
import { route, authenticated } from "@/server/http/auth-handler";
import { DomainError } from "@/server/errors";
import { loanItemsForHistory } from "@/server/domains/loan-history-items";
import {
  findInvoiceLoan,
  renderLoanInvoice,
} from "@/server/invoices/loan-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(request, async () => {
    await authenticated(request, "loans:write");
    const id = z.uuid().parse((await params).id);
    const row = await findInvoiceLoan(id);
    if (!row || row.archivedAt || !loanItemsForHistory(row).some((item) => item.approved > 0))
      throw new DomainError("INVOICE_UNAVAILABLE", 409, "Invoice belum tersedia.");
    return new Response(
      await renderLoanInvoice(row, new URL(request.url).origin),
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="invoice-${row.code}.pdf"`,
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  });
}
