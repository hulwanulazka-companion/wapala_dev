"use client";
import { useState } from "react";
import Image from "next/image";
import { useDemo } from "@/lib/store";
import { Empty, Modal } from "./ui";
export function Generations() {
  const generations = useDemo().generations || [];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof generations)[number] | null>(
    null,
  );
  const list = generations.filter((g) =>
    (g.name + " " + g.number + " " + g.label)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="generation-toolbar">
        <p>{generations.length} angkatan. Satu ikatan yang terus berjalan.</p>
        <input
          aria-label="Cari angkatan"
          placeholder="Cari nama atau nomor angkatan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {list.length ? (
        <div className="generation-grid">
          {list.map((g) => (
            <button
              className="generation-card"
              key={g.number}
              onClick={() => setSelected(g)}
              aria-label={"Lihat foto " + g.name}
            >
              {g.image && <Image
                src={g.image}
                alt={"Foto angkatan " + g.name}
                width={620}
                height={450}
                sizes="(max-width: 760px) 45vw, (max-width: 1000px) 30vw, 23vw"
              />}
              <span className="generation-number">{g.number}</span>
              <span className="generation-caption">
                <strong>{g.name}</strong>
                <span>{g.label}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="Angkatan tidak ditemukan"
          description="Coba nama atau nomor angkatan lain."
        />
      )}
      <Modal
        open={!!selected}
        title={selected?.name || "Angkatan"}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <figure className="generation-detail">
            {selected.image && <Image
              src={selected.image}
              alt={"Foto " + selected.name}
              width={1100}
              height={850}
              sizes="(max-width: 760px) 95vw, 720px"
            />}
            <figcaption>{selected.label}{selected.year ? " · " + selected.year : ""}{selected.description && <p>{selected.description}</p>}</figcaption>
          </figure>
        )}
      </Modal>
    </>
  );
}
