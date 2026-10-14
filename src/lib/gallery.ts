import { albums, date } from "./content";
import type { RecordRow } from "./types";
export interface PublicAlbum {
  photoCaptions?: string[];
  sourceYear?: string;
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  image: string;
  images: string[];
  photoOrders: number[];
  activityDate: string;
  uploadedAt: string;
  dateIsDemo: boolean;
  highlight: boolean;
}
// One source for the public catalog and slideshow; archived albums never reappear in the hero.
export function getPublicAlbums(
  records: RecordRow[],
  includePreview = true,
): PublicAlbum[] {
  const source: PublicAlbum[] = (includePreview ? albums : []).map((a) => ({
    ...a,
    images: a.images,
    activityDate: "",
    uploadedAt: "",
    dateIsDemo: false,
    highlight: false,
  }));
  for (const record of records) {
    const index = source.findIndex((a) => a.id === record.id);
    if (record.archived) {
      if (index >= 0) source.splice(index, 1);
      continue;
    }
    const f = record.fields;
    const base = index >= 0 ? source[index] : undefined;
    const image = f.sampul || base?.image || "";
    let registeredImages: string[] = [];
    if (f.gambar) {
      try {
        const parsed: unknown = JSON.parse(f.gambar);
        if (Array.isArray(parsed))
          registeredImages = parsed.filter(
            (v): v is string => typeof v === "string" && !!v,
          );
      } catch {
        /* Older preview records may have no serialized image list. */
      }
    }
    const images = [
      ...new Set(
        [
          image,
          ...(registeredImages.length ? registeredImages : base?.images || []),
        ].filter(Boolean),
      ),
    ];
    const entry: PublicAlbum = {
      photoCaptions: (() => { try { const value: unknown = JSON.parse(f.keterangan_foto || "[]"); return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; } catch { return []; } })(),
      sourceYear: f.tahun_sumber || "",
      id: record.id,
      title: f.judul || base?.title || "Album kegiatan",
      description: f.deskripsi || base?.description || "",
      category: f.kategori || base?.category || "Kegiatan",
      location: f.lokasi || base?.location || "",
      image,
      images,
      photoOrders: base
        ? base.images.includes(image)
          ? base.photoOrders
          : [0, ...base.photoOrders]
        : [],
      activityDate: f.tanggal || "",
      uploadedAt: f.tanggal_upload || "",
      dateIsDemo: f.tanggal_contoh === "Ya",
      highlight: f.highlight === "Ya",
    };
    if (index >= 0) source[index] = entry;
    else source.push(entry);
  }
  return source.filter((a) => Boolean(a.image));
}
export function getRecentGalleryPhotos(albums: PublicAlbum[]) {
  const photos = albums.flatMap((album) =>
    album.images.map((image, i) => ({
      image,
      album,
      order:
        album.uploadedAt && Number.isFinite(Date.parse(album.uploadedAt))
          ? Date.parse(album.uploadedAt) / 1000
          : album.photoOrders[i] || 0,
    })),
  );
  const seen = new Set<string>();
  return photos
    .sort((a, b) => b.order - a.order)
    .filter((photo) => {
      if (seen.has(photo.image)) return false;
      seen.add(photo.image);
      return true;
    })
    .slice(0, 10);
}
export function albumDate(
  album: Pick<PublicAlbum, "activityDate" | "uploadedAt" | "dateIsDemo" | "sourceYear">,
) {
  const value = album.activityDate || album.uploadedAt;
  if (!value || !Number.isFinite(Date.parse(value)))
    return album.sourceYear ? "Tahun " + album.sourceYear + " · Tanggal belum tersedia" : "Tanggal belum tersedia";
  if (album.dateIsDemo) return "Tanggal contoh · " + date(value);
  return (album.activityDate ? "Kegiatan " : "Diunggah ") + date(value);
}
export function getHeroGalleryPhotos(albums: PublicAlbum[]) {
  const pinned = albums
    .filter((a) => a.highlight)
    .map((album) => ({ image: album.image, album, order: 0, highlight: true }));
  const recent = getRecentGalleryPhotos(albums).map((photo) => ({
    ...photo,
    highlight: false,
  }));
  const seen = new Set<string>();
  return [...pinned, ...recent].filter((photo) => {
    if (seen.has(photo.image)) return false;
    seen.add(photo.image);
    return true;
  });
}
export function canAutoplaySlideshow(state: {
  paused: boolean;
  hovered: boolean;
  focused: boolean;
  reduced: boolean;
  visible: boolean;
  modalOpen: boolean;
  explicitPlay: boolean;
}) {
  return (
    !state.paused &&
    !state.reduced &&
    state.visible &&
    !state.modalOpen &&
    (state.explicitPlay || (!state.hovered && !state.focused))
  );
}
export function getCategoryGalleryPhotos(albums: PublicAlbum[]) {
  const candidates = albums
    .map((album) => ({
      album,
      image: album.image,
      order:
        album.uploadedAt && Number.isFinite(Date.parse(album.uploadedAt))
          ? Date.parse(album.uploadedAt) / 1000
          : Math.max(...album.photoOrders, 0),
    }))
    .sort((a, b) => b.order - a.order);
  const seen = new Set<string>();
  return candidates
    .filter((p) => {
      const key = p.album.category.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}
