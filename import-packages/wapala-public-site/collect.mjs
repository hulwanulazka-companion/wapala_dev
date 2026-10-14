import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const base = "https://www.wapalatelkomuniversity.org";
const allowedHosts = new Set(["www.wapalatelkomuniversity.org", "wapalatelkomuniversity.org", "dskozecjuuogndcaqguc.supabase.co"]);
const sha = (value) => createHash("sha256").update(value).digest("hex");
export const clean = (value = "") => value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#039|#39);/g, (e) => ({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'","&#039;":"'","&#39;":"'","&nbsp;":" "}[e]))
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1),16) : Number(n))).trim();
const attr = (html, name) => clean(html.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] || "");
export function generationsFromHtml(html) {
  return [...html.matchAll(/<div class="angkatan-card">([\s\S]*?)<\/h5>([\s\S]*?)<\/p>/g)].map((m) => ({
    sourceKey: "generation:" + clean(m[1].match(/class="angkatan-no">([\s\S]*?)<\/span>/)?.[1]),
    number: clean(m[1].match(/class="angkatan-no">([\s\S]*?)<\/span>/)?.[1]),
    name: clean(m[1].match(/<h5[^>]*>([\s\S]*)$/)?.[1]),
    label: clean(m[2]), year: null, description: "", sourceUrl: base + "/profil",
    imageUrl: attr(m[1].match(/<img\b[^>]*>/)?.[0] || "", "src"),
  }));
}
export function albumsFromHtml(html, pageUrl) {
  const categories = new Map([...html.matchAll(/<li[^>]*data-filter="\.(\d+)"[^>]*>([\s\S]*?)<\/li>/g)].map(m => [m[1], clean(m[2])]));
  const cards = [...html.matchAll(/<div class="item\s+([^"\s]+)[^"]*">\s*<div class="album-card"[\s\S]*?data-bs-target="#modalAlbum([^"<>]+)"([\s\S]*?)<\/small>/g)];
  return cards.map((m) => {
    const id = m[2], start = html.indexOf(`id="modalAlbum${id}"`);
    if (start < 0) throw Error("Missing album modal: " + id);
    const next = html.indexOf('<div class="modal fade"', start + 10);
    const section = html.slice(start, next < 0 ? html.length : next);
    const photos = [...section.matchAll(/<div class="carousel-item[^"<>]*">([\s\S]*?)(?=<div class="carousel-item|<\/div>\s*<\/div>\s*<button|<\/div>\s*<\/div>\s*<\/div>)/g)].map(p => {
      const image = p[1].match(/<img\b[^>]*>/)?.[0] || "";
      return { url: attr(image,"src"), caption: clean(p[1].match(/class="foto-caption">([\s\S]*?)<\/div>/)?.[1]) || attr(image,"alt") };
    }).filter(p => p.url);
    // Bound every image to this modal even if the surrounding markup changes.
    const images = [...section.matchAll(/<img\b[^>]*>/g)].map(p => ({url:attr(p[0],"src"),caption:attr(p[0],"alt")})).filter(p => p.url);
    const unique = [...new Map((photos.length === images.length ? photos : images).map(p => [p.url,p])).values()];
    const expectedPhotos = Number(clean(m[3].match(/(\d+)\s*Foto/)?.[1]));
    if (!unique.length || unique.length !== expectedPhotos) throw Error(`Photo count mismatch for ${id}: ${unique.length}/${expectedPhotos}`);
    const coverUrl = attr(m[3].match(/<img\b[^>]*>/)?.[0] || "", "src");
    return { sourceKey:"album:"+id, sourceId:id, sourceUrl:pageUrl,
      title:clean(m[3].match(/class="album-title">([\s\S]*?)<\/div>/)?.[1]),
      description:clean(m[3].match(/class="album-desc">([\s\S]*?)<\/div>/)?.[1]),
      category:categories.get(m[1]) || "", categorySourceId:m[1], location:"", activityDate:"", uploadedAt:"", year:null,
      expectedPhotos, coverUrl, photos:unique,
    };
  });
}
export function paginationUrls(html) {
  return [...new Set([...html.matchAll(/href="([^"]*\/album\?page=\d+)"/g)].map(m => clean(m[1])))];
}
async function download(url, max) {
  let current = new URL(url, base);
  for(let redirects=0;redirects<5;redirects++) {
    if(current.protocol!=="https:" || !allowedHosts.has(current.hostname) || current.username || current.password || current.port) throw Error("Unapproved source URL");
    const res=await fetch(current,{redirect:"manual",signal:AbortSignal.timeout(60000)});
    if([301,302,303,307,308].includes(res.status)){current=new URL(res.headers.get("location"),current);continue;}
    if(!res.ok)throw Error(`Source HTTP ${res.status}: ${current.pathname}`);
    const parts=[];let size=0;
    for await(const part of res.body){size+=part.length;if(size>max)throw Error("Source size exceeds limit");parts.push(part);}
    return {bytes:Buffer.concat(parts),mime:(res.headers.get("content-type")||"").split(";")[0],url:current.href};
  }
  throw Error("Too many source redirects");
}
export async function collect(root) {
  await mkdir(join(root,"source-pages"),{recursive:true});
  const profile=await download(base+"/profil",2*1024*1024);
  await writeFile(join(root,"source-pages/profil.html"),profile.bytes);
  const generations=generationsFromHtml(profile.bytes.toString());
  if(!generations.length || generations.some(g=>!g.name || !g.imageUrl || !/^\d+$/.test(g.number)))throw Error("Incomplete generations");
  const queue=[base+"/album"],seen=new Set(),allAlbums=new Map(),pages=[];
  let expectedAlbums=0;
  while(queue.length) {
    const url=queue.shift();if(seen.has(url))continue;seen.add(url);
    if(seen.size>50)throw Error("Pagination scope exceeded");
    const page=await download(url,4*1024*1024),html=page.bytes.toString();
    pages.push({url,sha256:sha(page.bytes)});
    await writeFile(join(root,`source-pages/album-${seen.size}.html`),page.bytes);
    for(const row of albumsFromHtml(html,url))allAlbums.set(row.sourceKey,row);
    for(const next of paginationUrls(html))if(!seen.has(next))queue.push(next);
    const count=html.match(/of\s*<span[^>]*>(\d+)<\/span>\s*results/);
    if(count)expectedAlbums=Math.max(expectedAlbums,Number(count[1]));
  }
  const albums=[...allAlbums.values()];
  if(!albums.length || (expectedAlbums && expectedAlbums!==albums.length))throw Error(`Incomplete album coverage ${albums.length}/${expectedAlbums}`);
  // Only a year explicitly returned by the source's year filter is recorded.
  const firstHtml=await readFile(join(root,"source-pages/album-1.html"),"utf8");
  const years=[...firstHtml.matchAll(/<option value="(\d{4})"/g)].map(m=>Number(m[1]));
  for(const year of [...new Set(years)]) {
    const yearQueue=[base+"/album?tahun="+year],yearSeen=new Set();
    while(yearQueue.length) {
      const url=yearQueue.shift();if(yearSeen.has(url))continue;yearSeen.add(url);if(yearSeen.size>50)throw Error("Year pagination scope exceeded");
      const data=await download(url,4*1024*1024),html=data.bytes.toString();
      await writeFile(join(root,`source-pages/album-year-${year}-${yearSeen.size}.html`),data.bytes);
      for(const row of albumsFromHtml(html,url)){const found=allAlbums.get(row.sourceKey);if(found)found.year=year;}
      for(const href of [...html.matchAll(/href="([^"]+)"/g)].map(m=>clean(m[1]))) {
        const next=new URL(href,base);if(next.pathname==="/album" && next.searchParams.get("tahun")===String(year) && next.searchParams.has("page") && !yearSeen.has(next.href))yearQueue.push(next.href);
      }
    }
  }
  const assets=new Map();
  for(const url of [...generations.map(g=>g.imageUrl),...albums.flatMap(a=>[a.coverUrl,...a.photos.map(p=>p.url)])]) {
    if(assets.has(url))continue;
    const data=await download(url,20*1024*1024);
    if(!["image/png","image/jpeg","image/webp"].includes(data.mime))throw Error("Unsupported source image MIME: "+data.mime);
    const extension={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"}[data.mime];
    const checksum=sha(data.bytes),file=`assets/${checksum}.${extension}`;
    await mkdir(join(root,"assets"),{recursive:true});await writeFile(join(root,file),data.bytes);
    assets.set(url,{sourceUrl:url,file,sha256:checksum,mime:data.mime,bytes:data.bytes.length});
    console.log(`Downloaded ${assets.size} images`);
  }
  const manifest={version:1,source:base,fetchedAt:new Date().toISOString(),coverage:{generations:generations.length,albums:albums.length,expectedAlbums,pages:pages.length,photos:albums.reduce((n,a)=>n+a.photos.length,0)},pages,generations,albums,assets:[...assets.values()]};
  const json=JSON.stringify(manifest,null,2)+"\n";await writeFile(join(root,"manifest.json"),json);await writeFile(join(root,"manifest.sha256"),sha(json)+"\n");
  console.log(JSON.stringify(manifest.coverage));return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))collect(dirname(fileURLToPath(import.meta.url))).catch(e=>{console.error(e.message);process.exitCode=1;});
