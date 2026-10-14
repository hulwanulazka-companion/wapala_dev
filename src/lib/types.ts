export type Role = "Super User" | "POH" | "Multimedia" | "Inventaris";
export type LoanStatus =
  | "Diajukan"
  | "Ditolak"
  | "Disetujui"
  | "Dipinjam"
  | "Menunggu Verifikasi Pengembalian"
  | "Terlambat"
  | "Dikembalikan";
export type Condition =
  "Baik" | "Kotor" | "Rusak Ringan" | "Rusak Berat" | "Hilang";
export type Module =
  | "anggota"
  | "konten"
  | "galeri"
  | "buku"
  | "or"
  | "inventaris"
  | "peminjaman"
  | "donasi"
  | "pengguna"
  | "pengaturan"
  | "arsip"
  | "audit"
  | "kepengurusan";
// Management rollover is separate from recruitment periods.
export interface RecordRow {
  id: string;
  fields: Record<string, string>;
  archived?: boolean;
}
export interface Equipment {
  typeColor?: string;
  source?: string;
  yearEntered?: string;
  photo?: string;
  id: string;
  code: string;
  name: string;
  category: string;
  brand: string;
  total: number;
  fit: number;
  condition: Condition;
  location: string;
  available: boolean;
  maxDays: number;
  maxQuantity: number;
  notes: string;
  archived?: boolean;
}
export interface PublicEquipment {
  id: string;
  name: string;
  category: string;
  photo: string;
  available: boolean;
  maxDays: number;
  maxQuantity: number;
}
export interface LoanItem {
  equipmentId: string;
  requested: number;
  approved: number;
  reason: string;
  outCondition: Condition;
  returnCondition: Condition;
}
export interface History {
  status: LoanStatus;
  at: string;
  note: string;
}
export interface Loan {
  originPeriod?: string;
  managementPeriod?: string;
  id: string;
  code: string;
  institution: string;
  pic: string;
  phone: string;
  email: string;
  start: string;
  end: string;
  purpose: string;
  event: string;
  collateral: string;
  collateralStatus: "Belum Diserahkan" | "Ditahan" | "Dikembalikan";
  items: LoanItem[];
  status: LoanStatus;
  notes: string;
  createdAt: string;
  history: History[];
  attachments: string[];
  penalty: number;
  penaltyStatus: "Tidak Ada" | "Belum Lunas" | "Lunas";
  archived?: boolean;
}
export interface Applicant {
  id: string;
  code: string;
  period: string;
  fields: Record<string, string>;
  photoName: string;
  createdAt: string;
  revisions: number;
  archived?: boolean;
}
export interface Donation {
  bankAccountId?: string;
  bankAccountLabel?: string;
  id: string;
  campaignId: string;
  name: string;
  amount: number;
  method: string;
  at: string;
  proof: string;
  status: "Menunggu" | "Terverifikasi" | "Ditolak";
  note: string;
  archived?: boolean;
}
export interface Audit {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  reason: string;
}
export interface Settings {
  managementPeriod: string;
  superUserResetRequestedAt?: string;
  recruitmentActive: boolean;
  donationActive: boolean;
  period: string;
  periods: string[];
  email: string;
  whatsapp: string;
  address: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  map: string;
  profileHistory?: string;
  logoUrl?: string;
  telULogoUrl?: string;
  identityImageUrl?: string;
  divisionImageUrl?: string;
  divisionImageUrl1?: string;
  divisionImageUrl2?: string;
  divisionImageUrl3?: string;
  divisionImageUrl4?: string;
  jumbotronUrl?: string;
  logoMeaningImageUrl?: string;
  profileVision?: string;
  profileMissions?: string;
  campaignTitle: string;
  campaignDescription: string;
  campaignTarget: number;
  campaignBank: string;
  campaignAccount: string;
  campaignCollaborator: string;
  campaignEnd: string;
}
export interface DemoState {
  generations?: Array<{ number: string; name: string; label: string; image: string; year: number | null; description: string }>;
  events?: import("./event-types").EventPublicDto[];
  backend?: boolean;
  publicEquipment?: PublicEquipment[];
  campaignTotals?: Record<string, number>;
  campaigns: Campaign[];
  settings: Settings;
  equipment: Equipment[];
  loans: Loan[];
  applicants: Applicant[];
  donations: Donation[];
  records: Record<string, RecordRow[]>;
  audit: Audit[];
}
export interface Campaign {
  bankAccounts?: BankAccount[];
  poster?: string;
  id: string;
  title: string;
  description: string;
  cover: string;
  qrisImage: string;
  target: number;
  bank: string;
  account: string;
  collaborator: string;
  start: string;
  end: string;
  status: "draft" | "active" | "closed" | "archived";
}
export interface BankAccount {
  id: string;
  bank: string;
  number: string;
  holder: string;
}
