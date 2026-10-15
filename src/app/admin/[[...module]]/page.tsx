import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { pageSession } from "@/server/auth/page-session";
import { requirePermission, type Permission } from "@/server/auth/policy";
import { getDb } from "@/server/db";
import { csrfForSession } from "@/server/security/csrf";
import { BackendAdminShell } from "@/components/backend/admin-shell";
import { BackendCampaigns } from "@/components/backend/campaigns";
import { listCampaigns, listDonations } from "@/server/domains/campaigns";
import {
  BackendRecords,
  type BackendRecord,
} from "@/components/backend/records";
import { BackendRecruitment } from "@/components/backend/recruitment";
import { listMembers, listContent } from "@/server/domains/records";
import { listPeriods, listApplicants } from "@/server/domains/recruitment";
import { BackendInventory } from "@/components/backend/inventory";
import { listEquipment } from "@/server/domains/inventory";
import { BackendUsers } from "@/components/backend/users";
import { listUsers } from "@/server/auth/users";
import { BackendManagement } from "@/components/backend/management";
import { BackendLoans } from "@/components/backend/loans";
import {
  BackendAudit,
  BackendArchives,
  BackendSettings,
} from "@/components/backend/administration";
import { BackendDashboard } from "@/components/backend/dashboard";
import { listLoans } from "@/server/domains/loans";
import { listArchives } from "@/server/domains/archives";
import { adminSummary } from "@/server/domains/admin-summary";
import { getSettings, listAudit } from "@/server/settings";
import { BackendEvents } from "@/components/backend/events";
import { listEvents } from "@/server/domains/events";
import { BackendGenerations } from "@/components/backend/generations";
import { listGenerations } from "@/server/domains/generations";
import {
  BackendMemberPortal,
  BackendMemberCorrections,
} from "@/components/backend/member-portal";
import { memberPortal, listCorrections } from "@/server/domains/member-portal";
export const metadata: Metadata = {
  title: "Portal organisasi",
  robots: { index: false, follow: false },
};
export default async function AdminPage({
  params,
}: {
  params: Promise<{ module?: string[] }>;
}) {
  const { module = [] } = await params;
  const { principal, token } = await pageSession();
  if (!module.length) {
    if (principal.role === "ANGGOTA") redirect("/admin/anggota");
    const [user, counts] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      adminSummary(principal),
    ]);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module=""
        csrfToken={csrfForSession(token)}
      >
        <BackendDashboard name={user.name} counts={counts} />
      </BackendAdminShell>
    );
  }
  const permissions: Record<string, Permission> = {
    angkatan: "generations:write",
    koreksi: "corrections:review",
    anggota:
      principal.role === "ANGGOTA" ? "members:directory" : "members:read",
    konten: "content:write",
    galeri: "content:write",
    buku: "content:write",
    or: "recruitment:read",
    inventaris: "inventory:write",
    peminjaman: "loans:write",
    donasi: "campaigns:write",
    event: "events:write",
    pengguna: "users:read",
    pengaturan: "settings:read",
    kepengurusan: "users:write",
    arsip: "users:write",
    audit: "audit:read",
  };
  const permission = permissions[module[0] || ""];
  if (permission) requirePermission(principal, permission);
  if (
    module[0] === "angkatan" ||
    module[0] === "koreksi" ||
    (module[0] === "anggota" && principal.role === "ANGGOTA")
  ) {
    const user = await getDb().user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { name: true },
    });
    const csrfToken = csrfForSession(token);
    const view =
      module[0] === "angkatan" ? (
        <BackendGenerations
          initialGenerations={await listGenerations(principal)}
          csrfToken={csrfToken}
        />
      ) : module[0] === "koreksi" ? (
        <BackendMemberCorrections
          initialRequests={await listCorrections(principal)}
          csrfToken={csrfToken}
        />
      ) : (
        <BackendMemberPortal
          initial={await memberPortal(principal)}
          csrfToken={csrfToken}
        />
      );
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module={module[0]}
        csrfToken={csrfToken}
      >
        {view}
      </BackendAdminShell>
    );
  }
  if (module[0] === "event") {
    const [user, events] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      listEvents(principal),
    ]);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module="event"
        csrfToken={csrfForSession(token)}
      >
        <BackendEvents
          initialEvents={events}
          csrfToken={csrfForSession(token)}
        />
      </BackendAdminShell>
    );
  }
  if (["peminjaman", "pengaturan", "arsip", "audit"].includes(module[0])) {
    const user = await getDb().user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { name: true },
    });
    const csrfToken = csrfForSession(token);
    let view;
    if (module[0] === "peminjaman")
      view = (
        <BackendLoans
          initialLoans={await listLoans(principal)}
          csrfToken={csrfToken}
        />
      );
    else if (module[0] === "pengaturan") {
      const settings = await getSettings(principal),
        config: Record<string, string> = {};
      if (
        settings.config &&
        typeof settings.config === "object" &&
        !Array.isArray(settings.config)
      )
        for (const [key, value] of Object.entries(settings.config))
          if (typeof value === "string") config[key] = value;
      view = <BackendSettings initialConfig={config} csrfToken={csrfToken} />;
    } else if (module[0] === "arsip")
      view = (
        <BackendArchives
          rows={await listArchives(principal)}
          csrfToken={csrfToken}
        />
      );
    else {
      const audit = await listAudit(principal, { limit: 50 });
      view = (
        <BackendAudit
          initial={{
            rows: audit.rows.map((row) => ({
              id: row.id,
              action: row.action,
              actorType: row.actorType,
              actorId: row.actorId,
              entityId: row.entityId,
              summary: row.summary,
              createdAt: row.createdAt.toISOString(),
            })),
            cursor: audit.cursor,
          }}
          csrfToken={csrfToken}
        />
      );
    }
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module={module[0]}
        csrfToken={csrfToken}
      >
        {view}
      </BackendAdminShell>
    );
  }
  if (module[0] === "kepengurusan") {
    const [user, users, settings] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      listUsers(principal),
      getDb().siteSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { managementYear: true },
      }),
    ]);
    const csrfToken = csrfForSession(token);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module="kepengurusan"
        csrfToken={csrfToken}
      >
        <BackendManagement
          initialYear={settings.managementYear}
          users={users}
          csrfToken={csrfToken}
        />
      </BackendAdminShell>
    );
  }
  if (module[0] === "pengguna") {
    const [user, users] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      listUsers(principal),
    ]);
    const csrfToken = csrfForSession(token);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module="pengguna"
        csrfToken={csrfToken}
      >
        <BackendUsers
          initialUsers={users}
          members={(await listMembers(principal))
            .filter((m) => !m.archived)
            .map((m) => ({ id: m.id, name: m.fields.nama, nia: m.fields.nia }))}
          currentUserId={principal.userId}
          csrfToken={csrfToken}
        />
      </BackendAdminShell>
    );
  }
  if (module[0] === "inventaris") {
    const [user, equipment] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      listEquipment(principal),
    ]);
    const csrfToken = csrfForSession(token);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module="inventaris"
        csrfToken={csrfToken}
      >
        <BackendInventory
          initialEquipment={equipment}
          csrfToken={csrfToken}
          canReset={principal.role === "SUPER_USER"}
        />
      </BackendAdminShell>
    );
  }
  if (module[0] === "donasi") {
    const [user, campaigns, donations] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      listCampaigns(principal),
      listDonations(principal),
    ]);
    const csrfToken = csrfForSession(token);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module="donasi"
        csrfToken={csrfToken}
      >
        <BackendCampaigns
          initialCampaigns={campaigns}
          initialDonations={donations}
          csrfToken={csrfToken}
        />
      </BackendAdminShell>
    );
  }
  if (["anggota", "konten", "galeri", "buku"].includes(module[0])) {
    const kind = module[0] as "anggota" | "konten" | "galeri" | "buku";
    const [user, source] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      kind === "anggota"
        ? listMembers(principal)
        : listContent(principal, kind),
    ]);
    const records: BackendRecord[] = source.map((row) => {
      const fields: Record<string, string | string[]> = {};
      if (
        row.fields &&
        typeof row.fields === "object" &&
        !Array.isArray(row.fields)
      )
        for (const [key, value] of Object.entries(row.fields)) {
          if (
            typeof value === "string" ||
            (Array.isArray(value) && value.every((v) => typeof v === "string"))
          )
            fields[key] = value as string | string[];
        }
      return {
        id: row.id,
        version: row.version,
        archived: row.archived,
        fields,
      };
    });
    const csrfToken = csrfForSession(token);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module={kind}
        csrfToken={csrfToken}
      >
        <BackendRecords
          kind={kind}
          canReset={principal.role === "SUPER_USER"}
          initialRecords={records}
          csrfToken={csrfToken}
        />
      </BackendAdminShell>
    );
  }
  if (module[0] === "or") {
    const [user, periods] = await Promise.all([
      getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { name: true },
      }),
      listPeriods(principal),
    ]);
    const year =
      periods.find((p) => p.active)?.year ||
      periods[0]?.year ||
      new Date().getFullYear();
    const applicants = await listApplicants(principal, year),
      csrfToken = csrfForSession(token);
    return (
      <BackendAdminShell
        role={principal.role}
        name={user.name}
        module="or"
        csrfToken={csrfToken}
      >
        <BackendRecruitment
          initialPeriods={periods}
          initialApplicants={applicants}
          initialYear={year}
          canWrite={
            principal.role === "SUPER_USER" || principal.role === "MULTIMEDIA"
          }
          csrfToken={csrfToken}
        />
      </BackendAdminShell>
    );
  }
  notFound();
}
