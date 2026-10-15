import { z } from "zod";
import { route } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import { publicFormRequest, verifyPublicCapability } from "@/server/domains/public-forms";
import { DomainError } from "@/server/errors";
import { loanItemsForHistory } from "@/server/domains/loan-history-items";
import {
  findInvoiceLoan,
  renderLoanInvoice,
} from "@/server/invoices/loan-invoice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ capability: z.string().min(1).max(2048) }).strict();
export function POST(request: Request) {
  return route(request, async ctx => {
    const owner = await publicFormRequest(request, ctx, "invoice");
    const { capability } = await readJson(request, schema), cap = verifyPublicCapability(capability, owner, "loan");
    const row = await findInvoiceLoan(cap.id);
    if (!row || row.archivedAt || row.status === "requested" || row.status === "rejected" || !loanItemsForHistory(row).some(i => i.approved > 0)) throw new DomainError("INVOICE_UNAVAILABLE",409,"Invoice tersedia setelah pengajuan disetujui.");
    return new Response(await renderLoanInvoice(row, new URL(request.url).origin), { headers: {
      "Content-Type":"application/pdf", "Content-Disposition":`attachment; filename="invoice-${row.code}.pdf"`,
      "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer", "X-Content-Type-Options":"nosniff",
    } });
  });
}
