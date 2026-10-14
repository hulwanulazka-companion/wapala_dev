"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  MapPin,
  Mail,
  ChevronLeft,
  ChevronRight,
  X,
  BookOpen,
} from "lucide-react";
import { useDemo } from "@/lib/store";
import { divisions, history, missions, vision, date } from "@/lib/content";
import { Empty, Pagination } from "./ui";
import type { RecordRow, Settings } from "@/lib/types";
import dynamic from "next/dynamic";
import { Generations } from "./generations";
import { HeroGallery } from "./hero-gallery";
import { CategoryGallery } from "./category-gallery";
import { getPublicAlbums, albumDate } from "@/lib/gallery";
import { PageIntro } from "./page-intro";
import { EventPages } from "./events/event-pages";
const LoanForm = dynamic(() => import("./forms").then((m) => m.LoanForm));
const LoanTracking = dynamic(() =>
  import("./forms").then((m) => m.LoanTracking),
);
const Invoice = dynamic(() => import("./forms").then((m) => m.Invoice));
const Recruitment = dynamic(() => import("./forms").then((m) => m.Recruitment));
const CampaignPages = dynamic(() =>
  import("./campaign-pages").then((m) => m.CampaignPages),
);
const BookReader = dynamic(
  () => import("./book-reader").then((m) => m.BookReader),
  {
    ssr: false,
    loading: () => (
      <div className="container section reader-loading">
        Memuat viewer buku…
      </div>
    ),
  },
);
function divisionImage(settings: Settings, index: number) {
  return (
    [
      settings.divisionImageUrl1,
      settings.divisionImageUrl2,
      settings.divisionImageUrl3,
      settings.divisionImageUrl4,
    ][index] || settings.divisionImageUrl || ""
  );
}
function SectionHead({
  title,
  href,
  label,
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {href && (
        <Link className="text-link" href={href}>
          {label}
          <ArrowUpRight size={18} />
        </Link>
      )}
    </div>
  );
}
export function Editorial({
  post,
  large = false,
}: {
  post: RecordRow;
  large?: boolean;
}) {
  const p = post.fields;
  return (
    <article className={"editorial-card" + (large ? " featured" : "")}>
      <Link className="editorial-image" href={"/berita/" + p.slug}>
        <img
          src={p.sampul}
          alt={p.judul}
          width={600}
          height={450}
          loading="lazy"
        />
      </Link>
      <div className="editorial-meta">
        <span>{p.kategori}</span>
        <time dateTime={p.tanggal}>{date(p.tanggal)}</time>
      </div>
      <h3>
        <Link href={"/berita/" + p.slug}>{p.judul}</Link>
      </h3>
      {large && <p>{p.ringkasan}</p>}
    </article>
  );
}
function Home() {
  const { settings: s, records } = useDemo();
  const posts = records.konten.filter(
    (p) =>
      !p.archived && p.fields.status === "Publik" && p.fields.tipe === "Berita",
  );
  const announcement = records.konten.find(
    (p) =>
      !p.archived &&
      p.fields.status === "Publik" &&
      p.fields.tipe === "Announcement",
  );
  return (
    <>
      <HeroGallery />
      <section className="container section home-about">
        <div>
          <h2>
            Satu ikatan.
            <br />
            Banyak perjalanan.
          </h2>
          <p className="lead">
            Sejak 28 September 2004, WAPALA menjadi ruang bagi mahasiswa untuk
            belajar, berpetualang, dan menjaga alam bersama.
          </p>
          <Link className="text-link" href="/profil">
            Cerita tentang kami
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <figure>
          <img
            src={s.identityImageUrl || "/assets/placeholder.svg"}
            width={400}
            height={400}
            alt="Detail lambang WAPALA pada seragam anggota"
          />
          <figcaption>Identitas yang selalu kita bawa.</figcaption>
        </figure>
      </section>
      <section className="muted-section">
        <div className="container section">
          <SectionHead
            title="Belajar langsung dari alam."
            href="/divisi"
            label="Kenali divisi"
          />
          <div className="division-grid division-strip" data-scroll-divisions>
            {divisions.map((d, index) => {
              const image = divisionImage(s, index);
              return (
              <Link
                href={"/divisi/" + d.slug}
                key={d.slug}
                className="division-card"
              >
                <div
                  className={"division-photo" + (image ? " has-image" : "")}
                  style={
                    image
                      ? {
                          backgroundImage: `url("${image}")`,
                          backgroundPosition: d.position,
                        }
                      : { backgroundPosition: d.position }
                  }
                  role="img"
                  aria-label={"Dokumentasi divisi " + d.name}
                />
                <div className="division-strip-copy">
                  <h3>{d.name}</h3>
                  <p>{d.description}</p>
                </div>
              </Link>
              );
            })}
          </div>
        </div>
      </section>
      <section className="container section">
        <SectionHead
          title="Cerita dari perjalanan kami."
          href="/berita"
          label="Semua berita"
        />
        <div className="journal-grid">
          {posts.slice(0, 3).map((post, i) => (
            <Editorial key={post.id} post={post} large={i === 0} />
          ))}
        </div>
        {announcement && (
          <Link
            className="announcement-strip"
            href={"/announcement/" + announcement.fields.slug}
          >
            <span>Pengumuman</span>
            <strong>{announcement.fields.judul}</strong>
            <ArrowUpRight />
          </Link>
        )}
      </section>
      <section className="gallery-feature">
        <div className="container section">
          <div className="gallery-feature-copy">
            <h2>
              Momen yang
              <br />
              kita bawa pulang.
            </h2>
            <p>
              Setiap langkah menyimpan cerita.
              <br />
              Ini beberapa jejaknya.
            </p>
            <Link className="text-link" href="/galeri">
              Jelajahi galeri
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <CategoryGallery />
        </div>
      </section>
      <section className="container section public-services">
        <div>
          <h2>
            Bekal untuk
            <br />
            langkah berikutnya.
          </h2>
          <p>
            Pendidikan, peralatan, dan ikatan yang mendukung perjalanan kita.
          </p>
        </div>
        <div className="service-list">
          <Link href="/peminjaman">
            <div>
              <h3>Peminjaman alat</h3>
              <p>Ajukan peralatan untuk kegiatan lembagamu.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <Link href="/buku">
            <div>
              <h3>Bahan bacaan</h3>
              <p>Pelajari teknik dan keselamatan sebelum berangkat.</p>
            </div>
            <ArrowUpRight />
          </Link>
        </div>
      </section>
      {s.recruitmentActive && (
        <section className="recruitment-banner recruitment-jumbotron">
          <img
            src={s.jumbotronUrl || "/assets/placeholder.svg"}
            alt=""
            className="recruitment-art"
            width={4032}
            height={2419}
            loading="lazy"
          />
          <div className="container">
            <div>
              <p>Open Recruitment</p>
              <h2>
                Perjalanan berikutnya
                <br />
                bisa dimulai dari sini.
              </h2>
            </div>
            <Link href="/or" className="btn white">
              Gabung WAPALA
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
function Profile() {
  const { settings } = useDemo();
  return (
    <>
      <PageIntro
        title={"Dari ikatan,\nmenjadi perjalanan."}
        description="Wahana Pencinta Alam Telkom University. Ruang untuk belajar, tumbuh, dan melangkah bersama."
      />
      <nav className="container section-subnav" aria-label="Bagian profil">
        {["Sejarah", "Visi & misi", "Divisi", "Arti logo", "Angkatan"].map(
          (v, i) => (
            <a
              key={v}
              href={"#" + ["sejarah", "visi", "divisi", "logo", "angkatan"][i]}
            >
              {v}
            </a>
          ),
        )}
      </nav>
      <section className="container section profile-history" id="sejarah">
        <img
          src={settings.identityImageUrl || "/assets/placeholder.svg"}
          alt="Identitas WAPALA"
          width={400}
          height={400}
        />
        <div>
          <h2>Bermula pada 2004.</h2>
          <p>
            WAPALA dibentuk pada 28 September 2004 dengan nama WAPALA Akatel.
            Nama organisasi berkembang bersama perubahan institusi; ikatan dan
            semangatnya terus dibawa.
          </p>
          <ol className="history-list">
            {settings.profileHistory ? (
              <li>
                <p>{settings.profileHistory}</p>
              </li>
            ) : (
              history.map(([when, name]) => (
                <li key={when}>
                  <time>{when}</time>
                  <strong>{name}</strong>
                </li>
              ))
            )}
          </ol>
        </div>
      </section>
      <section className="muted-section" id="visi">
        <div className="container section vision-mission">
          <div>
            <h2>Visi</h2>
            <p className="lead">{settings.profileVision || vision}</p>
          </div>
          <div>
            <h2>Misi</h2>
            <ol>
              {(settings.profileMissions
                ? settings.profileMissions.split("\n").filter(Boolean)
                : missions
              ).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>
      <section className="container section" id="divisi">
        <SectionHead
          title="Alam adalah ruang belajar kita."
          href="/divisi"
          label="Lihat divisi"
        />
        <div className="division-grid">
          {divisions.map((d, index) => {
            const image = divisionImage(settings, index);
            return (
            <Link
              href={"/divisi/" + d.slug}
              className="division-card"
              key={d.slug}
            >
              <div
                className={"division-photo" + (image ? " has-image" : "")}
                style={
                  image
                    ? {
                        backgroundImage: `url("${image}")`,
                        backgroundPosition: d.position,
                      }
                    : { backgroundPosition: d.position }
                }
                role="img"
                aria-label={d.name}
              />
              <h3>{d.name}</h3>
              <p>{d.detail}</p>
            </Link>
            );
          })}
        </div>
      </section>
      <section className="container section logo-meaning" id="logo">
        <h2>Identitas yang menyatukan.</h2>
        <img
          src={settings.logoMeaningImageUrl || "/assets/placeholder.svg"}
          alt="Arti logo WAPALA: rantai persaudaraan, biru langit, puncak putih, padang hijau, dan jejak kaki merah"
          width={1200}
          height={760}
          loading="lazy"
        />
      </section>
      <section className="muted-section" id="angkatan">
        <div className="container section">
          <SectionHead title="Ikatan lintas angkatan." />
          <Generations />
        </div>
      </section>
    </>
  );
}
function Divisions({ slug }: { slug?: string }) {
  const { settings } = useDemo();
  const current = divisions.find((d) => d.slug === slug);
  return (
    <>
      <PageIntro
        title={current?.name || "Alam adalah\nruang belajar kita."}
        description={
          current?.detail ||
          "Setiap divisi mempertemukan pengetahuan, latihan, dan pengalaman lapangan."
        }
      />
      <div className="container section">
        <div className="division-grid">
          {(current ? [current] : divisions).map((d) => {
            const image = divisionImage(settings, divisions.indexOf(d));
            return (
              <article className="division-card" key={d.slug}>
                <div
                  className={"division-photo" + (image ? " has-image" : "")}
                  style={
                    image
                      ? {
                          backgroundImage: `url("${image}")`,
                          backgroundPosition: d.position,
                        }
                      : { backgroundPosition: d.position }
                  }
                  role="img"
                  aria-label={d.name}
                />
                <h2>{d.name}</h2>
                <p>{d.description}</p>
                <Link className="text-link" href="/galeri">
                  Dokumentasi kegiatan
                  <ArrowUpRight size={18} />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
function News({
  slug,
  announcement = false,
}: {
  slug?: string;
  announcement?: boolean;
}) {
  const { records } = useDemo();
  const [filter, setFilter] = useState(announcement ? "Announcement" : "Semua");
  const [page, setPage] = useState(1);
  const posts = records.konten.filter(
    (p) => !p.archived && p.fields.status === "Publik",
  );
  if (slug) {
    const post = posts.find((p) => p.fields.slug === slug);
    if (!post)
      return (
        <div className="container section">
          <Empty
            title="Konten tidak ditemukan"
            description="Artikel mungkin telah diarsipkan."
            action={
              <Link href="/berita" className="btn secondary">
                Lihat berita lainnya
              </Link>
            }
          />
        </div>
      );
    const p = post.fields;
    return (
      <article>
        <div className="container article-header">
          <Link className="text-link" href="/berita">
            <ChevronLeft size={18} />
            Kembali ke berita
          </Link>
          <div className="editorial-meta">
            <span>
              {p.tipe} / {p.kategori}
            </span>
            <time dateTime={p.tanggal}>{date(p.tanggal)}</time>
          </div>
          <h1>{p.judul}</h1>
          <p className="lead">{p.ringkasan}</p>
          <p className="article-author">Ditulis oleh {p.penulis}</p>
        </div>
        <figure className="container article-cover">
          <img src={p.sampul} alt={p.judul} width={1280} height={750} />
          <figcaption>Dokumentasi WAPALA</figcaption>
        </figure>
        <div className="article-body">
          {p.isi.split("\n\n").map((txt, i) => (
            <p key={i}>{txt}</p>
          ))}
        </div>
        <div className="container section">
          <SectionHead title="Perjalanan lainnya." />
          <div className="editorial-grid">
            {posts
              .filter((q) => q.id !== post.id)
              .slice(0, 3)
              .map((q) => (
                <Editorial key={q.id} post={q} />
              ))}
          </div>
        </div>
      </article>
    );
  }
  const filtered = posts.filter(
    (p) => filter === "Semua" || p.fields.tipe === filter,
  );
  return (
    <>
      <PageIntro
        title="Catatan perjalanan."
        description="Kegiatan, pengetahuan, dan kabar terbaru dari WAPALA."
      />
      <section className="container section compact-top">
        <div className="filter-tabs" aria-label="Tipe konten">
          {["Semua", "Berita", "Announcement"].map((n) => (
            <button
              key={n}
              className={filter === n ? "active" : ""}
              onClick={() => {
                setFilter(n);
                setPage(1);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {filtered.length ? (
          <div className="editorial-grid">
            {filtered.slice((page - 1) * 6, page * 6).map((p) => (
              <Editorial key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <Empty
            title="Belum ada konten"
            description="Kabar organisasi akan muncul di sini setelah diterbitkan."
          />
        )}
        <Pagination page={page} total={filtered.length} onChange={setPage} />
      </section>
    </>
  );
}
function Gallery({ id }: { id?: string }) {
  const state = useDemo();
  const source = getPublicAlbums(state.records.galeri, !state.backend);
  const [category, setCategory] = useState("Semua kegiatan");
  const [location, setLocation] = useState("Semua lokasi");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const album = source.find((a) => a.id === id);
  const images = album?.images || [];
  const filtered = source.filter(
    (a) =>
      (category === "Semua kegiatan" || a.category === category) &&
      (location === "Semua lokasi" || a.location === location),
  );
  return (
    <>
      {album ? (
        <>
          <PageIntro title={album.title} description={album.description}>
            <p className="location-label">
              <MapPin size={16} />
              {album.location} / {album.category}
            </p>
            <p className="album-date">{albumDate(album)}</p>
          </PageIntro>
          <div className="container section compact-top album-images">
            {images.map((img, i) => (
              <button
                key={img}
                onClick={() => setLightbox(i)}
                aria-label={"Lihat foto " + (i + 1)}
              >
                <img
                  src={img}
                  alt={album.photoCaptions?.[i] || (i === 0 ? album.title : "Dokumentasi kegiatan WAPALA")}
                  width={900}
                  height={650}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <PageIntro
            title={"Jejak yang\ntersimpan."}
            description="Dokumentasi kegiatan, ekspedisi, dan kebersamaan WAPALA."
          />
          <section className="container section compact-top">
            <div className="filters">
              <label>
                Kategori
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {[
                    "Semua kegiatan",
                    ...new Set(source.map((a) => a.category)),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Lokasi
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  {[
                    "Semua lokasi",
                    ...new Set(source.map((a) => a.location)),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <span>{filtered.length} album</span>
            </div>
            {filtered.length ? (
              <div className="album-grid">
                {filtered.map((a) => (
                  <Link
                    className="album-card"
                    key={a.id}
                    href={"/galeri/" + a.id}
                  >
                    <img
                      src={a.image}
                      alt={a.title}
                      width={600}
                      height={700}
                      loading="lazy"
                    />
                    <div>
                      <p>{a.category}</p>
                      <h2>{a.title}</h2>
                      <span>
                        <MapPin size={14} />
                        {a.location}
                      </span>
                      <p className="album-date">{albumDate(a)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title="Belum ada album untuk filter ini"
                description="Ubah kategori atau lokasi untuk menemukan dokumentasi lainnya."
                action={
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setCategory("Semua kegiatan");
                      setLocation("Semua lokasi");
                    }}
                  >
                    Hapus filter
                  </button>
                }
              />
            )}
          </section>
        </>
      )}
      {lightbox !== null && (
        <Lightbox
          images={images}
          index={lightbox}
          setIndex={setLightbox}
          title={album?.title || "Dokumentasi"}
          captions={album?.photoCaptions}
        />
      )}
    </>
  );
}
function Lightbox({
  images,
  index,
  setIndex,
  title,
  captions,
}: {
  images: string[];
  index: number;
  setIndex: (v: number | null) => void;
  title: string;
  captions?: string[];
}) {
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape") setIndex(null);
        if (e.key === "ArrowLeft")
          setIndex((index + images.length - 1) % images.length);
        if (e.key === "ArrowRight") setIndex((index + 1) % images.length);
      }}
    >
      <button
        className="icon-btn close-lightbox"
        autoFocus
        onClick={() => setIndex(null)}
        aria-label="Tutup foto"
      >
        <X />
      </button>
      <button
        className="icon-btn"
        onClick={() => setIndex((index + images.length - 1) % images.length)}
        aria-label="Foto sebelumnya"
      >
        <ChevronLeft />
      </button>
      <figure>
        <img src={images[index]} alt={captions?.[index] || title} />
        <figcaption>
          {title} / {index + 1} dari {images.length}
          {captions?.[index] && <p>{captions[index]}</p>}
        </figcaption>
      </figure>
      <button
        className="icon-btn"
        onClick={() => setIndex((index + 1) % images.length)}
        aria-label="Foto berikutnya"
      >
        <ChevronRight />
      </button>
    </div>
  );
}
function BookCatalog() {
  const { records } = useDemo();
  const books = records.buku
    .filter((book) => !book.archived && book.fields.status === "Publik")
    .map((book) => ({
      id: book.id,
      title: book.fields.judul,
      category: book.fields.kategori,
      description: book.fields.deskripsi,
    }));
  return (
    <>
      <PageIntro
        title={"Bekal sebelum\nmelangkah."}
        description="Bahan bacaan WAPALA untuk belajar teknik, keselamatan, dan pengetahuan alam."
      />
      <div className="container section compact-top book-grid">
        {!books.length && (
          <Empty
            title="Belum ada buku yang dipublikasikan"
            description="Buku akan tampil setelah ditambahkan oleh pengelola."
          />
        )}
        {books.map((book, i) => (
          <article className="book-card" key={book.id}>
            <Link
              href={"/buku/" + book.id}
              className={"book-cover book-color-" + i}
            >
              <BookOpen size={26} />
              <span>{book.category}</span>
              <h2>{book.title}</h2>
              <p>
                WAPALA
                <br />
                Telkom University
              </p>
            </Link>
            <h3>{book.title}</h3>
            <p>{book.description}</p>
            <Link className="text-link" href={"/buku/" + book.id}>
              Baca di browser
              <ArrowUpRight size={18} />
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
function Contact() {
  const { settings: s } = useDemo();
  return (
    <>
      <PageIntro
        title="Mari terhubung."
        description="Untuk kolaborasi, kegiatan, dan informasi organisasi."
      />
      <section className="container section compact-top contact-grid">
        <div>
          <h2>Sekretariat WAPALA</h2>
          <p className="lead">{s.address}</p>
          <h3>Email organisasi</h3>
          <a className="contact-email" href={"mailto:" + s.email}>
            <Mail size={20} />
            {s.email}
          </a>
          <div className="contact-channels">
            <a href={s.instagram} target="_blank" rel="noreferrer">
              Instagram
              <ArrowUpRight size={18} />
            </a>
            <a href={s.tiktok} target="_blank" rel="noreferrer">
              TikTok
              <ArrowUpRight size={18} />
            </a>
            <a href={s.youtube} target="_blank" rel="noreferrer">
              YouTube
              <ArrowUpRight size={18} />
            </a>
            {s.whatsapp && (
              <a
                href={
                  "https://wa.me/" +
                  s.whatsapp.replace(/\D/g, "").replace(/^0/, "62")
                }
              >
                WhatsApp
                <ArrowUpRight size={18} />
              </a>
            )}
          </div>
        </div>
        <div className="contact-location">
          <iframe
            title="Lokasi Sekretariat WAPALA Telkom University"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3425.682358203325!2d109.2488294750014!3d-7.434595892576215!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e655f0030693f0d%3A0xf85ada912a35aba8!2sWapala%20Telkom%20University!5e1!3m2!1sid!2sid!4v1789620986271!5m2!1sid!2sid"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <div className="contact-map-caption">
            <MapPin size={24} />
            <div>
              <h3>Sekretariat WAPALA</h3>
              <p>Telkom University Purwokerto</p>
            </div>
          </div>
          <p>
            <MapPin size={18} />
            {s.address}
          </p>
          <a
            className="btn secondary"
            href={s.map}
            target="_blank"
            rel="noreferrer"
          >
            Buka lokasi di Maps
            <ArrowUpRight size={18} />
          </a>
        </div>
      </section>
    </>
  );
}
function Privacy() {
  return (
    <>
      <PageIntro
        title="Kebijakan privasi."
        description="Cara WAPALA menggunakan data pada layanan ini."
      />
      <div className="container section legal-copy">
        <h2>Data yang diproses</h2>
        <p>
          Data pendaftaran digunakan untuk Open Recruitment dan event. Kontak
          peminjam digunakan untuk pengelolaan peminjaman serta pengembalian.
          Bukti transfer digunakan untuk verifikasi donasi; daftar donatur tidak
          dipublikasikan.
        </p>
        <h2>Penyimpanan dan akses</h2>
        <p>
          Data disimpan pada sistem WAPALA dan hanya diakses pengelola yang
          berwenang sesuai tugasnya. Berkas pribadi, bukti pembayaran, dan
          dokumen peserta tidak tersedia sebagai media publik.
        </p>
        <h2>Hubungi organisasi</h2>
        <p>
          Untuk pertanyaan atau permintaan terkait data pribadi, hubungi
          organisasi pada <Link href="/kontak">halaman kontak</Link>.
        </p>
      </div>
    </>
  );
}
export function PublicPage({ path }: { path: string[] }) {
  switch (path[0]) {
    case "event":
      return <EventPages key={path[1] ?? "list"} id={path[1]} />;
    case undefined:
      return <Home />;
    case "profil":
      return <Profile />;
    case "divisi":
      return <Divisions slug={path[1]} />;
    case "berita":
      return <News slug={path[1]} />;
    case "announcement":
      return <News slug={path[1]} announcement />;
    case "galeri":
      return <Gallery id={path[1]} />;
    case "buku":
      return path[1] ? (
        <BookReader key={path[1]} id={path[1]} />
      ) : (
        <BookCatalog />
      );
    case "kontak":
      return <Contact />;
    case "privasi":
      return <Privacy />;
    case "or":
      return <Recruitment />;
    case "donasi":
      return <CampaignPages id={path[1]} />;
    case "peminjaman":
      return path[1] === "status" ? (
        <LoanTracking initialCode={path[2]} />
      ) : path[1] === "invoice" ? (
        <Invoice code={path[2] || ""} />
      ) : (
        <LoanForm />
      );
    default:
      return null;
  }
}
