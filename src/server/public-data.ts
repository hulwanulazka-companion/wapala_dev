import "server-only";
import { getDb } from "./db";
import { publicContent } from "./domains/records";
import { publicCampaigns } from "./domains/campaigns";
import { publicEvents } from "./domains/events";
import { emptyState } from "../lib/empty-state";
import type { RecordRow } from "../lib/types";
import type { Prisma } from "../generated/prisma/client";
const strings = (value: Prisma.JsonValue): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => typeof v === "string" || Array.isArray(v))
      .map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : String(v)]),
  );
};
// Branding read-only untuk segmen non-publik (portal login, admin) supaya logo
// memakai sumber logoUrl yang sama dengan website publik.
// Fail-soft: logo adalah branding non-kritis; bila database tidak terjangkau,
// halaman login tetap dapat dibuka dengan logo fallback.
export async function brandLogoUrl() {
  try {
    const settings = await getDb().siteSettings.findUnique({
      where: { id: 1 },
      select: { config: true },
    });
    return strings(settings?.config || {}).logoUrl || "";
  } catch {
    return "";
  }
}
export async function publicState() {
  const db = getDb(),
    state = emptyState();
  const [
    settings,
    period,
    periods,
    posts,
    galleries,
    books,
    campaigns,
    equipment,
    generations,
  ] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: 1 } }),
    db.recruitmentPeriod.findFirst({
      where: { active: true },
      select: { year: true },
    }),
    db.recruitmentPeriod.findMany({
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    publicContent("konten"),
    publicContent("galeri"),
    publicContent("buku"),
    publicCampaigns(),
    db.equipment.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        category: true,
        photo: true,
        available: true,
        maxDays: true,
        maxQuantity: true,
      },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.generation.findMany({ where: { archivedAt: null }, orderBy: { number: "desc" }, take: 500 }),
  ]);
  const config = strings(settings?.config || {});
  for (const key of [
    "email",
    "whatsapp",
    "address",
    "instagram",
    "tiktok",
    "youtube",
    "map",
    "profileHistory",
    "logoUrl",
    "telULogoUrl",
    "identityImageUrl",
    "divisionImageUrl",
    "divisionImageUrl1",
    "divisionImageUrl2",
    "divisionImageUrl3",
    "divisionImageUrl4",
    "jumbotronUrl",
    "logoMeaningImageUrl",
    "profileVision",
    "profileMissions",
  ] as const)
    state.settings[key] = config[key] || "";
  state.settings.managementPeriod = settings
    ? String(settings.managementYear)
    : "";
  state.settings.recruitmentActive = !!period;
  state.settings.period = period ? String(period.year) : "";
  state.settings.periods = periods.map((p) => String(p.year));
  state.settings.donationActive = campaigns.length > 0;
  const rows = (items: typeof posts): RecordRow[] =>
    items.map((r) => ({ id: r.id, fields: strings(r.fields) }));
  state.records.konten = rows(posts);
  state.records.galeri = rows(galleries);
  state.records.buku = rows(books);
  state.campaigns = campaigns.map((c) => ({ ...c, bank: "", account: "" }));
  state.campaignTotals = Object.fromEntries(
    campaigns.map((c) => [c.id, c.total]),
  );
  state.publicEquipment = equipment;
  state.generations = generations.map(g => ({ number: String(g.number).padStart(2,"0"), name:g.name, label:g.label, image:g.photo, year:g.year, description:g.description }));
  state.events = await publicEvents();
  return state;
}
