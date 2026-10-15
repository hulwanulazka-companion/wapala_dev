import "server-only";
import QRCode from "qrcode";
import type { Prisma } from "../../generated/prisma/client";
import {
  buildInvoiceDocument,
  type InvoiceAssets,
} from "@/lib/invoice-document";
import { emptyState } from "@/lib/empty-state";
import type { Condition, Loan, LoanStatus } from "@/lib/types";
import { getDb } from "@/server/db";
import { readMedia } from "@/server/media/storage";
import { loanItemsForHistory } from "@/server/domains/loan-history-items";

const include = {
  items: { include: { equipment: { select: { name: true, code: true } } } },
} satisfies Prisma.LoanInclude;

export type InvoiceLoanRow = Prisma.LoanGetPayload<{ include: typeof include }>;

const strings = (value: Prisma.JsonValue): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (Object.fromEntries(
        Object.entries(value).filter(([, item]) => typeof item === "string"),
      ) as Record<string, string>)
    : {};

const mediaId = (url: string) =>
  /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1];

async function mediaAsset(
  url: string,
): Promise<Pick<InvoiceAssets, "logo" | "logoFormat" | "logoRatio">> {
  const id = mediaId(url);
  if (!id) return {};
  try {
    const media = await readMedia(id, null);
    if (!media.mime.startsWith("image/")) return {};
    return {
      logo: `data:${media.mime};base64,${media.bytes.toString("base64")}`,
      logoFormat:
        media.mime === "image/jpeg"
          ? "JPEG"
          : media.mime === "image/png"
            ? "PNG"
            : "WEBP",
      logoRatio:
        media.width && media.height ? media.width / media.height : undefined,
    };
  } catch {
    return {};
  }
}

function toLoan(row: InvoiceLoanRow): Loan {
  return {
    id: row.id,
    code: row.code,
    institution: row.institution,
    pic: row.pic,
    phone: row.phone,
    email: row.email,
    start: row.start.toISOString().slice(0, 10),
    end: row.end.toISOString().slice(0, 10),
    purpose: row.purpose,
    event: row.event,
    collateral: row.collateral,
    collateralStatus:
      row.collateralStatus === "held"
        ? "Ditahan"
        : row.collateralStatus === "returned"
          ? "Dikembalikan"
          : "Belum Diserahkan",
    status: row.status as LoanStatus,
    notes: row.notes,
    originPeriod: String(row.originYear),
    managementPeriod: String(row.managementYear),
    penalty: Number(row.penalty),
    penaltyStatus:
      row.penaltyStatus === "paid"
        ? "Lunas"
        : row.penaltyStatus === "pending"
          ? "Belum Lunas"
          : "Tidak Ada",
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    createdAt: row.createdAt.toISOString(),
    history: [],
    items: loanItemsForHistory(row).map((item) => ({
      equipmentId: item.equipmentId,
      requested: item.requested,
      approved: item.approved,
      reason: item.reason,
      outCondition: item.outCondition as Condition,
      returnCondition: item.returnCondition as Condition,
    })),
  };
}

export async function findInvoiceLoan(id: string) {
  return getDb().$transaction(
    (tx) => tx.loan.findUnique({ where: { id }, include }),
    { isolationLevel: "RepeatableRead" },
  );
}

export async function renderLoanInvoice(row: InvoiceLoanRow, origin: string) {
  const settings = await getDb().siteSettings.findUnique({ where: { id: 1 } });
  const config = strings(settings?.config ?? {});
  const [logo, telLogo, qr] = await Promise.all([
    mediaAsset(config.logoUrl || ""),
    mediaAsset(config.telULogoUrl || ""),
    QRCode.toDataURL(
      `${origin}/peminjaman/status/${encodeURIComponent(row.code)}`,
    ),
  ]);
  const state = emptyState();
  state.settings.address = config.address || "";
  state.settings.email = config.email || "";
  state.equipment = loanItemsForHistory(row).map((item) => ({
    id: item.equipmentId,
    code: item.code,
    name: item.name,
    category: "",
    brand: "",
    total: 0,
    fit: 0,
    condition: "Baik" as Condition,
    location: "",
    available: true,
    maxDays: 0,
    maxQuantity: 0,
    notes: "",
  }));
  const doc = buildInvoiceDocument(toLoan(row), state, {
    ...logo,
    telLogo: telLogo.logo,
    telLogoFormat: telLogo.logoFormat,
    telLogoRatio: telLogo.logoRatio,
    qr,
  });
  return new Uint8Array(doc.output("arraybuffer"));
}
