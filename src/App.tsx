import { useCallback, useEffect, useMemo, useState } from "react";

/* ============================================================
   DASHBOARD KEPALA PKBM – Monitoring Absensi & Kinerja Guru
   Sumber data: Google Apps Script (sheet AbsenSiswa, DataSiswa, DataGuru)
   Isi URL tiap guru pada GURU_LIST di bawah.
   ============================================================ */

type Status = "Hadir" | "Izin" | "Sakit" | "Alpha";
// [tanggal, jam, kelas, nama, nisn, status, mapel, adaFoto]
type AbsenRow = [
  string,
  string,
  number,
  string,
  string,
  string,
  string,
  number
];
// [nisn, nama, kelas]
type SiswaRow = [string, string, number];

// URL Web App Apps Script (hasil Deploy). Jika kosong, ditampilkan "Belum ada data".
const GURU_LIST: { nama: string; url: string }[] = [
  {
    nama: "ANNISA",
    url: "https://script.google.com/macros/s/AKfycbxChfavNkLpw-jvlGD4J2NdvOHooUCJbmY859jb7X3AOmlf5Rsl1CRyPF4QhxfPv8kE/exec",
  },
  {
    nama: "NURFIANA AGUSTINA",
    url: "https://script.google.com/macros/s/AKfycbz2GsL1qXKmqLCEX4atv-7-VI-VwRtZT2jrRpoMdSlgdoLFGjt4399S72Nk-0ph_mN3/exec",
  },
  {
    nama: "ROSMIATI",
    url: "https://script.google.com/macros/s/AKfycbxrdiVFUhQ0iK92zUO5o4_DbC1ukPrBs1BFwHuKouJkGGZsYQ9qORA8xNuAZ6BRVs_S/exec",
  },
];

type Data = {
  ab: AbsenRow[];
  sw: SiswaRow[];
  guru?: { nama: string; nomorInduk: string };
};

// Ubah berbagai format tanggal/jam dari Sheet menjadi "yyyy-mm-dd" dan "HH:mm"
const p2 = (n: number) => (n < 10 ? "0" : "") + n;
function normTgl(v: unknown): string {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/); // dd/mm/yy atau dd/mm/yyyy
  if (m)
    return `${+m[3] < 100 ? 2000 + +m[3] : m[3]}-${p2(+m[2])}-${p2(+m[1])}`;
  const d = new Date(s);
  return isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function normJam(v: unknown): string {
  const m = String(v ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${p2(+m[1])}:${m[2]}` : "";
}
const normAb = (r: unknown[]): AbsenRow => [
  normTgl(r[0]),
  normJam(r[1]),
  Number(r[2]),
  String(r[3] ?? "").trim(),
  String(r[4] ?? ""),
  String(r[5] ?? ""),
  String(r[6] ?? "").trim(),
  r[7] ? 1 : 0,
];

function useData(apiUrl: string) {
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [loading, setLoading] = useState(!!apiUrl);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!apiUrl) {
      setData(EMPTY_DATA);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData({ ab: [], sw: [] });
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setData({
        ab: (j.ab ?? []).map(normAb).filter((r: AbsenRow) => r[0] && r[3]),
        sw: (j.sw ?? []).map(
          (r: unknown[]) =>
            [String(r[0]), String(r[1]).trim(), Number(r[2])] as SiswaRow
        ),
        guru: j.guru,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload };
}

const TARGET_HADIR = 85; // target % kehadiran siswa
const AMBANG_RISIKO = 75; // siswa di bawah ini ditandai perlu perhatian

const EMPTY_DATA: Data = { ab: [], sw: [] };

const STATUSES: Status[] = ["Hadir", "Izin", "Sakit", "Alpha"];
const COLORS: Record<Status, string> = {
  Hadir: "#16a34a",
  Izin: "#2563eb",
  Sakit: "#d97706",
  Alpha: "#dc2626",
};
const BULAN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const norm = (s: string): Status => {
  const x = s.trim().toLowerCase();
  if (x === "hadir") return "Hadir";
  if (x === "izin") return "Izin";
  if (x === "sakit") return "Sakit";
  return "Alpha";
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const fmtTgl = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};
const bulanLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${BULAN[m - 1]} ${y}`;
};
const tone = (p: number) =>
  p >= TARGET_HADIR ? "good" : p >= AMBANG_RISIKO ? "warn" : "bad";

type Counts = Record<Status, number> & { total: number };
const emptyCounts = (): Counts => ({
  Hadir: 0,
  Izin: 0,
  Sakit: 0,
  Alpha: 0,
  total: 0,
});

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [idx, setIdx] = useState(0);
  const aktif = GURU_LIST[idx];
  const apiUrl = aktif.url;
  const { data: DATA, loading, error, reload } = useData(apiUrl);
  const [kelas, setKelas] = useState<string>("all");
  const [bulan, setBulan] = useState<string>("all");
  const [mapel, setMapel] = useState<string>("all");
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<"nama" | "persen" | "alpha">("persen");
  const [hanyaRisiko, setHanyaRisiko] = useState(false);

  const records = useMemo(
    () =>
      DATA.ab.map((r) => ({
        tgl: r[0],
        jam: r[1],
        kelas: r[2],
        nama: r[3],
        nisn: r[4],
        status: norm(r[5]),
        mapel: r[6],
        foto: r[7] === 1,
        bulan: r[0].slice(0, 7),
      })),
    [DATA]
  );

  const opsi = useMemo(
    () => ({
      kelas: Array.from(new Set(DATA.sw.map((s) => s[2]))).sort(
        (a, b) => a - b
      ),
      bulan: Array.from(new Set(records.map((r) => r.bulan))).sort(),
      mapel: Array.from(new Set(records.map((r) => r.mapel))).sort(),
    }),
    [records]
  );

  const f = useMemo(
    () =>
      records.filter(
        (r) =>
          (kelas === "all" || r.kelas === Number(kelas)) &&
          (bulan === "all" || r.bulan === bulan) &&
          (mapel === "all" || r.mapel === mapel)
      ),
    [records, kelas, bulan, mapel]
  );

  const totalSiswaScope = useMemo(
    () =>
      DATA.sw.filter((s) => kelas === "all" || s[2] === Number(kelas)).length,
    [kelas, DATA]
  );

  /* ---------- ringkasan ---------- */
  const ringkas = useMemo(() => {
    const c = emptyCounts();
    f.forEach((r) => {
      c[r.status]++;
      c.total++;
    });
    const sesi = new Map<
      string,
      {
        tgl: string;
        kelas: number;
        mapel: string;
        jam: string;
        c: Counts;
        foto: number;
      }
    >();
    f.forEach((r) => {
      const k = `${r.tgl}|${r.kelas}|${r.mapel}`;
      if (!sesi.has(k))
        sesi.set(k, {
          tgl: r.tgl,
          kelas: r.kelas,
          mapel: r.mapel,
          jam: r.jam,
          c: emptyCounts(),
          foto: 0,
        });
      const s = sesi.get(k)!;
      s.c[r.status]++;
      s.c.total++;
      if (r.foto) s.foto++;
      if (r.jam < s.jam) s.jam = r.jam;
    });
    const sesiArr = Array.from(sesi.values()).sort((a, b) =>
      a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : a.kelas - b.kelas
    );
    const hari = new Set(f.map((r) => r.tgl)).size;
    const siswaTercatat = new Set(f.map((r) => r.nisn)).size;
    const foto = f.filter((r) => r.foto).length;
    return {
      c,
      sesiArr,
      hari,
      siswaTercatat,
      foto,
      persen: pct(c.Hadir, c.total),
    };
  }, [f]);

  /* ---------- per kelas ---------- */
  const perKelas = useMemo(
    () =>
      opsi.kelas.map((k) => {
        const rs = f.filter((r) => r.kelas === k);
        const c = emptyCounts();
        rs.forEach((r) => {
          c[r.status]++;
          c.total++;
        });
        const sesi = new Set(rs.map((r) => `${r.tgl}|${r.mapel}`)).size;
        const jml = DATA.sw.filter((s) => s[2] === k).length;
        const tercatat = new Set(rs.map((r) => r.nisn)).size;
        return {
          kelas: k,
          c,
          sesi,
          jml,
          tercatat,
          persen: pct(c.Hadir, c.total),
          cakupan: pct(tercatat, jml),
        };
      }),
    [f, opsi.kelas]
  );

  /* ---------- tren bulanan (abaikan filter bulan agar tren utuh) ---------- */
  const tren = useMemo(() => {
    const base = records.filter(
      (r) =>
        (kelas === "all" || r.kelas === Number(kelas)) &&
        (mapel === "all" || r.mapel === mapel)
    );
    return opsi.bulan.map((b) => {
      const rs = base.filter((r) => r.bulan === b);
      const c = emptyCounts();
      rs.forEach((r) => {
        c[r.status]++;
        c.total++;
      });
      return {
        b,
        c,
        sesi: new Set(rs.map((r) => `${r.tgl}|${r.kelas}|${r.mapel}`)).size,
        persen: pct(c.Hadir, c.total),
      };
    });
  }, [records, kelas, mapel, opsi.bulan]);

  /* ---------- per siswa ---------- */
  const siswa = useMemo(() => {
    const m = new Map<
      string,
      { nisn: string; nama: string; kelas: number; c: Counts }
    >();
    DATA.sw
      .filter((s) => kelas === "all" || s[2] === Number(kelas))
      .forEach((s) =>
        m.set(s[0], { nisn: s[0], nama: s[1], kelas: s[2], c: emptyCounts() })
      );
    f.forEach((r) => {
      const x = m.get(r.nisn);
      if (x) {
        x.c[r.status]++;
        x.c.total++;
      }
    });
    return Array.from(m.values()).map((x) => ({
      ...x,
      persen: pct(x.c.Hadir, x.c.total),
    }));
  }, [f, kelas]);

  const siswaTampil = useMemo(() => {
    let a = siswa.filter(
      (s) =>
        s.nama.toLowerCase().includes(cari.toLowerCase()) ||
        s.nisn.includes(cari)
    );
    if (hanyaRisiko)
      a = a.filter((s) => s.c.total === 0 || s.persen < AMBANG_RISIKO);
    return a.sort((x, y) =>
      urut === "nama"
        ? x.nama.localeCompare(y.nama)
        : urut === "alpha"
        ? y.c.Alpha - x.c.Alpha || x.persen - y.persen
        : (x.c.total === 0 ? -1 : x.persen) - (y.c.total === 0 ? -1 : y.persen)
    );
  }, [siswa, cari, urut, hanyaRisiko]);

  const belumAbsen = siswa.filter((s) => s.c.total === 0).length;
  const berisiko = siswa.filter(
    (s) => s.c.total > 0 && s.persen < AMBANG_RISIKO
  ).length;
  const cakupan = pct(ringkas.siswaTercatat, totalSiswaScope);
  const kelengkapanFoto = pct(ringkas.foto, ringkas.c.Hadir);
  const rataPerSesi = ringkas.sesiArr.length
    ? Math.round((ringkas.c.total / ringkas.sesiArr.length) * 10) / 10
    : 0;

  /* ---------- skor kinerja guru (0-100) ----------
     40% kehadiran siswa vs target, 30% cakupan siswa tercatat,
     20% kelengkapan foto bukti, 10% konsistensi pertemuan (>= 1 sesi/bln aktif) */
  const skor = useMemo(() => {
    const a = Math.min(100, (ringkas.persen / TARGET_HADIR) * 100);
    const bln = tren.filter((t) => t.sesi > 0).length;
    const k = Math.min(100, (bln / Math.max(1, tren.length)) * 100);
    return Math.round(
      a * 0.4 + cakupan * 0.3 + kelengkapanFoto * 0.2 + k * 0.1
    );
  }, [ringkas.persen, cakupan, kelengkapanFoto, tren]);
  const skorLabel =
    skor >= 85
      ? "Sangat Baik"
      : skor >= 70
      ? "Baik"
      : skor >= 55
      ? "Cukup"
      : "Perlu Pembinaan";

  /* ---------- insight otomatis ---------- */
  const insight: string[] = [];
  if (ringkas.c.total === 0)
    insight.push("Tidak ada data pada filter yang dipilih.");
  else {
    insight.push(
      `Kehadiran siswa ${ringkas.persen}% ${
        ringkas.persen >= TARGET_HADIR ? "memenuhi" : "belum memenuhi"
      } target ${TARGET_HADIR}%.`
    );
    if (belumAbsen)
      insight.push(
        `${belumAbsen} dari ${totalSiswaScope} siswa belum memiliki catatan absensi sama sekali.`
      );
    const kb = perKelas
      .filter((k) => k.c.total > 0)
      .sort((a, b) => a.persen - b.persen)[0];
    if (kb && perKelas.length > 1)
      insight.push(
        `Kelas ${kb.kelas} memiliki kehadiran terendah (${kb.persen}%).`
      );
    if (ringkas.c.Alpha)
      insight.push(
        `Tercatat ${ringkas.c.Alpha} siswa alpha — perlu tindak lanjut wali kelas.`
      );
    const bulanAktif = tren.filter((t) => t.sesi > 0).length;
    if (bulanAktif < tren.length)
      insight.push(
        `Absensi hanya dilakukan pada ${bulanAktif} dari ${
          tren.length
        } bulan rentang data (${tren.map((t) => bulanLabel(t.b)).join(", ")}).`
      );
  }

  const kosong = DATA.ab.length === 0;

  return (
    <div className="app">
      <style>{CSS}</style>
      {(loading || error || apiUrl) && (
        <div className={`card statusbar ${error ? "err" : ""}`}>
          <span>
            {loading
              ? "MEMUAT DATA"
              : error
              ? `Gagal memuat data: ${error}`
              : "DATA SUDAH DIMUAT"}
          </span>
          <button onClick={reload} disabled={loading}>
            Muat ulang
          </button>
        </div>
      )}

      <header className="top">
        <div>
          <div className="eyebrow">Dashboard Kepala PKBM</div>
          <h1>Progres Absensi &amp; Kinerja Guru</h1>
          <p className="sub">
            {DATA.guru?.nama ?? aktif.nama} · No. Induk{" "}
            {DATA.guru?.nomorInduk ?? "-"} · Mapel {opsi.mapel.join(", ")}
          </p>
        </div>
        <div className="filters">
          <label>
            Guru
            <select
              value={idx}
              onChange={(e) => {
                setIdx(Number(e.target.value));
                setKelas("all");
                setBulan("all");
                setMapel("all");
                setCari("");
              }}
            >
              {GURU_LIST.map((g, i) => (
                <option key={g.nama} value={i}>
                  {g.nama}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kelas
            <select value={kelas} onChange={(e) => setKelas(e.target.value)}>
              <option value="all">Semua</option>
              {opsi.kelas.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bulan
            <select value={bulan} onChange={(e) => setBulan(e.target.value)}>
              <option value="all">Semua</option>
              {opsi.bulan.map((b) => (
                <option key={b} value={b}>
                  {bulanLabel(b)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mapel
            <select value={mapel} onChange={(e) => setMapel(e.target.value)}>
              <option value="all">Semua</option>
              {opsi.mapel.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <button className="logout" onClick={onLogout}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      {kosong ? (
        <div className="card center muted" style={{ padding: 40 }}>
          {loading
            ? "Memuat data…"
            : error
            ? "Data tidak dapat ditampilkan."
            : "Belum ada data."}
        </div>
      ) : (
        <>
          {/* KPI */}
          <section className="kpis">
            <div className="card score">
              <Gauge value={skor} />
              <div>
                <div className="lbl">Skor Kinerja Guru</div>
                <div className="big">{skorLabel}</div>
                <div className="muted small">
                  Kehadiran 40% · Cakupan siswa 30% · Foto bukti 20% ·
                  Konsistensi bulanan 10%
                </div>
              </div>
            </div>
            <Kpi
              label="Kehadiran Siswa"
              value={`${ringkas.persen}%`}
              note={`Target ${TARGET_HADIR}%`}
              tone={tone(ringkas.persen)}
            />
            <Kpi
              label="Pertemuan Tercatat"
              value={String(ringkas.sesiArr.length)}
              note={`${ringkas.hari} hari · rata-rata ${rataPerSesi} siswa/sesi`}
            />
            <Kpi
              label="Cakupan Siswa"
              value={`${cakupan}%`}
              note={`${ringkas.siswaTercatat}/${totalSiswaScope} siswa pernah diabsen`}
              tone={cakupan >= 80 ? "good" : cakupan >= 50 ? "warn" : "bad"}
            />
            <Kpi
              label="Foto Bukti Hadir"
              value={`${kelengkapanFoto}%`}
              note={`${ringkas.foto}/${ringkas.c.Hadir} absen hadir berfoto`}
              tone={kelengkapanFoto >= 90 ? "good" : "warn"}
            />
          </section>

          {/* Insight */}
          <section className="card insight">
            <h2>Ringkasan untuk Kepala PKBM</h2>
            <ul>
              {insight.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>

          <section className="grid2">
            {/* Komposisi */}
            <div className="card">
              <h2>Komposisi Status Kehadiran</h2>
              {STATUSES.map((s) => (
                <div className="row" key={s}>
                  <span className="dot" style={{ background: COLORS[s] }} />
                  <span className="rl">{s}</span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${pct(ringkas.c[s], ringkas.c.total)}%`,
                        background: COLORS[s],
                      }}
                    />
                  </div>
                  <span className="rv">
                    {ringkas.c[s]}{" "}
                    <small>({pct(ringkas.c[s], ringkas.c.total)}%)</small>
                  </span>
                </div>
              ))}
            </div>

            {/* Tren bulanan */}
            <div className="card">
              <h2>Tren Bulanan</h2>
              <TrenChart data={tren} />
            </div>
          </section>

          {/* Per kelas */}
          <section className="card">
            <h2>Progres per Kelas</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Kelas</th>
                    <th>Pertemuan</th>
                    <th>Siswa tercatat</th>
                    <th>Hadir</th>
                    <th>Izin</th>
                    <th>Sakit</th>
                    <th>Alpha</th>
                    <th style={{ minWidth: 160 }}>% Hadir</th>
                  </tr>
                </thead>
                <tbody>
                  {perKelas
                    .filter((k) => kelas === "all" || k.kelas === Number(kelas))
                    .map((k) => (
                      <tr key={k.kelas}>
                        <td>
                          <b>Kelas {k.kelas}</b>
                        </td>
                        <td>{k.sesi}</td>
                        <td>
                          {k.tercatat}/{k.jml}{" "}
                          <small className="muted">({k.cakupan}%)</small>
                        </td>
                        <td>{k.c.Hadir}</td>
                        <td>{k.c.Izin}</td>
                        <td>{k.c.Sakit}</td>
                        <td>{k.c.Alpha}</td>
                        <td>
                          <Bar value={k.persen} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Siswa */}
          <section className="card">
            <div className="head">
              <h2>
                Rekap Siswa{" "}
                <small className="muted">
                  · {berisiko} berisiko (&lt;{AMBANG_RISIKO}%) · {belumAbsen}{" "}
                  belum pernah diabsen
                </small>
              </h2>
              <div className="tools">
                <input
                  placeholder="Cari nama / NISN…"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                />
                <select
                  value={urut}
                  onChange={(e) => setUrut(e.target.value as typeof urut)}
                >
                  <option value="persen">Urut: % hadir terendah</option>
                  <option value="alpha">Urut: alpha terbanyak</option>
                  <option value="nama">Urut: nama A–Z</option>
                </select>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={hanyaRisiko}
                    onChange={(e) => setHanyaRisiko(e.target.checked)}
                  />{" "}
                  Perlu perhatian
                </label>
              </div>
            </div>
            <div className="tablewrap tall">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>NISN</th>
                    <th>Kls</th>
                    <th>H</th>
                    <th>I</th>
                    <th>S</th>
                    <th>A</th>
                    <th style={{ minWidth: 160 }}>% Hadir</th>
                  </tr>
                </thead>
                <tbody>
                  {siswaTampil.map((s) => (
                    <tr key={s.nisn}>
                      <td>{s.nama}</td>
                      <td className="muted">{s.nisn}</td>
                      <td>{s.kelas}</td>
                      <td>{s.c.Hadir}</td>
                      <td>{s.c.Izin}</td>
                      <td>{s.c.Sakit}</td>
                      <td>{s.c.Alpha}</td>
                      <td>
                        {s.c.total === 0 ? (
                          <span className="tag bad">Belum diabsen</span>
                        ) : (
                          <Bar value={s.persen} />
                        )}
                      </td>
                    </tr>
                  ))}
                  {!siswaTampil.length && (
                    <tr>
                      <td colSpan={8} className="muted center">
                        Tidak ada siswa yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Log pertemuan */}
          <section className="card">
            <h2>Riwayat Pertemuan</h2>
            <div className="tablewrap tall">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Mulai</th>
                    <th>Kelas</th>
                    <th>Mapel</th>
                    <th>Hadir</th>
                    <th>Izin</th>
                    <th>Sakit</th>
                    <th>Alpha</th>
                    <th>% Hadir</th>
                  </tr>
                </thead>
                <tbody>
                  {ringkas.sesiArr.map((s, i) => (
                    <tr key={i}>
                      <td>{fmtTgl(s.tgl)}</td>
                      <td>{s.jam}</td>
                      <td>{s.kelas}</td>
                      <td>{s.mapel}</td>
                      <td>{s.c.Hadir}</td>
                      <td>{s.c.Izin}</td>
                      <td>{s.c.Sakit}</td>
                      <td>{s.c.Alpha}</td>
                      <td>
                        <span
                          className={`tag ${tone(pct(s.c.Hadir, s.c.total))}`}
                        >
                          {pct(s.c.Hadir, s.c.total)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer>
        Data: {DATA.ab.length} catatan absensi · {DATA.sw.length} siswa
        {DATA.ab.length > 0 &&
          ` · ${fmtTgl(DATA.ab.map((r) => r[0]).sort()[0])} s.d. ${fmtTgl(
            DATA.ab
              .map((r) => r[0])
              .sort()
              .slice(-1)[0]
          )}`}
      </footer>
    </div>
  );
}

/* ---------------- komponen kecil ---------------- */
function Kpi({
  label,
  value,
  note,
  tone: t,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className={`card kpi ${t ?? ""}`}>
      <div className="lbl">{label}</div>
      <div className="big">{value}</div>
      {note && <div className="muted small">{note}</div>}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const c =
    value >= TARGET_HADIR
      ? "#16a34a"
      : value >= AMBANG_RISIKO
      ? "#d97706"
      : "#dc2626";
  return (
    <div className="row" style={{ margin: 0 }}>
      <div className="track">
        <div
          className="fill"
          style={{ width: `${Math.min(100, value)}%`, background: c }}
        />
      </div>
      <span className="rv" style={{ minWidth: 44 }}>
        {value}%
      </span>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 38,
    c = 2 * Math.PI * r;
  const col =
    value >= 85
      ? "#16a34a"
      : value >= 70
      ? "#2563eb"
      : value >= 55
      ? "#d97706"
      : "#dc2626";
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      role="img"
      aria-label={`Skor ${value}`}
    >
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="10"
      />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke={col}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 48 48)"
      />
      <text
        x="48"
        y="54"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill="currentColor"
      >
        {value}
      </text>
    </svg>
  );
}

function TrenChart({
  data,
}: {
  data: { b: string; c: Counts; sesi: number; persen: number }[];
}) {
  const W = 520,
    H = 220,
    pad = { l: 34, r: 10, t: 14, b: 40 };
  const iw = W - pad.l - pad.r,
    ih = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.c.total));
  const bw = Math.min(56, iw / Math.max(1, data.length) - 14);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto" }}
      role="img"
      aria-label="Tren absensi bulanan"
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + ih * (1 - t)}
            y2={pad.t + ih * (1 - t)}
            stroke="#e5e7eb"
          />
          <text
            x={pad.l - 6}
            y={pad.t + ih * (1 - t) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#6b7280"
          >
            {Math.round(max * t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.l + (iw / data.length) * (i + 0.5) - bw / 2;
        let y = pad.t + ih;
        return (
          <g key={d.b}>
            {STATUSES.map((s) => {
              const h = (d.c[s] / max) * ih;
              y -= h;
              return h > 0 ? (
                <rect
                  key={s}
                  x={x}
                  y={y}
                  width={bw}
                  height={h}
                  fill={COLORS[s]}
                  rx="2"
                />
              ) : null;
            })}
            <text
              x={x + bw / 2}
              y={H - 22}
              textAnchor="middle"
              fontSize="11"
              fill="#374151"
            >
              {bulanLabel(d.b)}
            </text>
            <text
              x={x + bw / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {d.persen}% · {d.sesi} sesi
            </text>
          </g>
        );
      })}
      <g>
        {STATUSES.map((s, i) => (
          <g key={s} transform={`translate(${pad.l + i * 70},0)`}>
            <rect y="0" width="8" height="8" fill={COLORS[s]} rx="2" />
            <text x="12" y="8" fontSize="10" fill="#6b7280">
              {s}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ---------------- gaya ---------------- */
const CSS = `
:root{--bg:#f4f6fa;--card:#fff;--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--acc:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--card:#1e293b;--ink:#f1f5f9;--mut:#94a3b8;--line:#334155;--acc:#60a5fa}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.app{max-width:1200px;margin:0 auto;padding:20px 16px 40px;display:flex;flex-direction:column;gap:16px}
.top{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);font-weight:700}
h1{margin:2px 0 4px;font-size:26px}
h2{margin:0 0 12px;font-size:16px}
.sub{margin:0;color:var(--mut);font-size:14px}
.filters{display:flex;gap:10px;flex-wrap:wrap}
.filters label{display:flex;flex-direction:column;font-size:12px;color:var(--mut);gap:4px}
select,input[type=text],input:not([type]){padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.kpis .score{grid-column:span 2;display:flex;gap:14px;align-items:center}
@media(max-width:560px){.kpis .score{grid-column:span 1}}
.lbl{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
.big{font-size:28px;font-weight:700;margin:2px 0}
.small{font-size:12px}.muted{color:var(--mut)}.center{text-align:center}
.kpi.good .big{color:#16a34a}.kpi.warn .big{color:#d97706}.kpi.bad .big{color:#dc2626}
.insight ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.row{display:flex;align-items:center;gap:8px;margin:10px 0}
.dot{width:10px;height:10px;border-radius:50%}
.rl{width:48px;font-size:14px}
.track{flex:1;height:10px;background:var(--line);border-radius:99px;overflow:hidden}
.fill{height:100%;border-radius:99px;transition:width .3s}
.rv{font-size:13px;font-variant-numeric:tabular-nums;min-width:80px;text-align:right}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
.head h2{margin:0}
.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.chk{font-size:13px;display:flex;gap:6px;align-items:center}
.tablewrap{overflow:auto}.tall{max-height:420px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
th{position:sticky;top:0;background:var(--card);font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.tag{padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600}
.tag.good{background:#dcfce7;color:#166534}.tag.warn{background:#fef3c7;color:#92400e}.tag.bad{background:#fee2e2;color:#991b1b}
.statusbar{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;padding:10px 14px}
.statusbar.err{border-color:#dc2626;color:#dc2626}
.statusbar button{padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.login form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px}
.login h1{font-size:22px;margin:0}
.login label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--mut)}
.login input{width:100%}
.login .btn{padding:10px;border-radius:8px;border:0;background:var(--acc);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.login .err{color:#dc2626;font-size:13px}
.logout{align-self:flex-end;display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:12px 24px;border:0;border-radius:12px;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;font-size:16px;font-weight:700;letter-spacing:.02em;cursor:pointer;box-shadow:0 6px 16px rgba(220,38,38,.35);transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
.logout svg{width:20px;height:20px;flex-shrink:0}
.logout:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(220,38,38,.45);filter:brightness(1.05)}
.logout:active{transform:translateY(0);box-shadow:0 3px 8px rgba(220,38,38,.35)}
.logout:focus-visible{outline:3px solid #fca5a5;outline-offset:2px}
@media(max-width:560px){.logout{width:100%}}
.linkbtn{background:none;border:0;padding:0;color:var(--acc);font:inherit;text-decoration:underline;cursor:pointer;text-transform:none;letter-spacing:0}
footer{text-align:center;color:var(--mut);font-size:12px}
`;

/* ---------------- login ---------------- */
// Catatan: login ini hanya di sisi browser (bukan keamanan sungguhan).
const LOGIN_USER = "PKBM";
const LOGIN_PASS = "1234";
const SESSION_KEY = "isLoggedIn";

// Jika dibuka di dalam iframe portal/launcher, kirim pesan ke induknya.
// PKBM_KEMBALI = kembali ke halaman awal launcher, SISWA_KEMBALI = kembali ke halaman sebelumnya
function kembaliKePortal(
  type: "PKBM_KEMBALI" | "SISWA_KEMBALI" = "SISWA_KEMBALI"
) {
  try {
    if (window.parent !== window) window.parent.postMessage({ type }, "*");
  } catch (e) {
    /* abaikan */
  }
}
const diIframe = (() => {
  try {
    return window.parent !== window;
  } catch (e) {
    return true;
  }
})();

function readSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  } catch (e) {
    return false;
  }
}

export default function App() {
  const [masuk, setMasuk] = useState<boolean>(readSession);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  if (masuk) {
    return (
      <Dashboard
        onLogout={() => {
          try {
            sessionStorage.removeItem(SESSION_KEY);
          } catch (e) {
            /* abaikan */
          }
          setUser("");
          setPass("");
          setErr("");
          setMasuk(false);
          // Kalau dibuka lewat launcher (iframe), kembali ke halaman awal launcher
          kembaliKePortal("PKBM_KEMBALI");
        }}
      />
    );
  }

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (
      user.trim().toLowerCase() === LOGIN_USER.toLowerCase() &&
      pass === LOGIN_PASS
    ) {
      try {
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch (e2) {
        /* abaikan */
      }
      setErr("");
      setMasuk(true);
    } else {
      setErr("Username atau password salah.");
    }
  };

  return (
    <div className="app login">
      <style>{CSS}</style>
      <form className="card" onSubmit={submit}>
        {diIframe && (
          <button
            type="button"
            className="linkbtn"
            style={{ alignSelf: "flex-start" }}
            onClick={() => kembaliKePortal("SISWA_KEMBALI")}
          >
            ← Kembali
          </button>
        )}
        <div className="eyebrow">Dashboard Kepala PKBM</div>
        <h1>Masuk</h1>
        <label>
          Username
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {err && <div className="err">{err}</div>}
        <button className="btn" type="submit">
          Masuk
        </button>
      </form>
    </div>
  );
}
