import { useCollection } from '../../hooks/useCollection';
import { addDays, localDate } from '../../lib/localdate';
import type { TalepRecord } from '../../lib/types';
import type { ResolvedRecord } from '../../lib/models';

function countBy<T>(list: T[], key: (x: T) => string | undefined): [string, number][] {
  const m: Record<string, number> = {};
  list.forEach((x) => {
    const k = key(x);
    if (k) m[k] = (m[k] || 0) + 1;
  });
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function Bars({ items, color }: { items: [string, number][]; color?: string }) {
  if (!items.length) return <div className="x-empty">Henüz veri yok.</div>;
  const max = items[0][1];
  return (
    <div>
      {items.map(([k, v]) => (
        <div className="x-bar-row" key={k}>
          <span className="x-bar-label" title={k}>
            {k}
          </span>
          <div className="x-bar-track">
            <div className="x-bar-fill" style={{ width: `${Math.round((v / max) * 100)}%`, background: color }} />
          </div>
          <span className="x-bar-val" style={{ color }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function Spark({ counts, labels, color }: { counts: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...counts, 1);
  return (
    <>
      <div className="x-spark">
        {counts.map((c, i) => (
          <div key={i} title={String(c)} style={{ height: Math.max(4, Math.round((c / max) * 48)), background: color }} />
        ))}
      </div>
      <div className="x-spark-labels">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="x-stat">
      <div className="x-stat-label">{label}</div>
      <div className="x-stat-val">{value}</div>
      <div className="x-stat-sub">{sub}</div>
      <i style={{ background: color }} />
    </div>
  );
}

export function DashboardPage() {
  const records = useCollection<TalepRecord>('records').data;
  const resolved = useCollection<ResolvedRecord>('resolvedRecords').data;

  const t = localDate();
  const weekStart = localDate(addDays(new Date(), -7));
  const todayLabel = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
  const dayKeys = days.map((d) => localDate(d));
  const labels = days.map((d) => d.toLocaleDateString('tr-TR', { weekday: 'short' }));

  const recent = [...records]
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .slice(0, 6);
  const recentResolved = [...resolved].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 6);
  const rate = records.length ? Math.round((resolved.length / records.length) * 100) : 0;

  return (
    <div>
      <div className="page-hdr">
        <h2>
          Genel <em>Bakış</em>
        </h2>
        <p>Anlık istatistikler ve departman dağılımı</p>
      </div>

      <div className="x-stats">
        <Stat label="Toplam Talep" value={records.length} sub="Tüm zamanlar" color="var(--hi)" />
        <Stat label="Bugün" value={records.filter((r) => r.date === t).length} sub={todayLabel} color="var(--hi3)" />
        <Stat label="Bu Hafta" value={records.filter((r) => r.date >= weekStart).length} sub="Son 7 gün" color="var(--hi2)" />
        <Stat
          label="Departman"
          value={new Set(records.map((r) => r.dept).filter(Boolean)).size}
          sub="Aktif bölüm"
          color="var(--hi4)"
        />
      </div>

      <div className="x-two">
        <div className="x-panel">
          <h3>📊 Departman Bazlı Dağılım</h3>
          <Bars items={countBy(records, (r) => r.dept)} />
        </div>
        <div className="x-panel">
          <h3>🕐 Son Talepler</h3>
          {recent.length === 0 && <div className="x-empty">Henüz talep yok.</div>}
          {recent.map((r) => (
            <div className="x-recent" key={r.id}>
              <span className="x-no">#{r.no}</span>
              <div className="x-recent-info">
                <div className="x-recent-sub">{r.dept || '—'}</div>
                <div className="x-recent-txt">{r.desc || '—'}</div>
              </div>
              <span className="x-recent-time">{r.time || r.date}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="x-panel">
        <h3>📈 Son 7 Günlük Aktivite</h3>
        <Spark counts={dayKeys.map((k) => records.filter((r) => r.date === k).length)} labels={labels} />
      </div>

      <h2 className="x-sect">
        Çözülen <em>Talepler Analizi</em>
      </h2>

      <div className="x-stats">
        <Stat label="Toplam Çözülen" value={resolved.length} sub="Tüm zamanlar" color="var(--ok)" />
        <Stat label="Bugün Çözülen" value={resolved.filter((r) => r.date === t).length} sub={todayLabel} color="var(--hi3)" />
        <Stat
          label="Bu Hafta Çözülen"
          value={resolved.filter((r) => (r.date ?? '') >= weekStart).length}
          sub="Son 7 gün"
          color="var(--hi2)"
        />
        <Stat label="Çözüm Oranı" value={rate + '%'} sub="Toplam talebe oran" color="var(--hi4)" />
      </div>

      <div className="x-two">
        <div className="x-panel">
          <h3>🏆 Kullanıcı Bazlı Çözüm Performansı</h3>
          <Bars items={countBy(resolved, (r) => r.user)} color="var(--ok)" />
        </div>
        <div className="x-panel">
          <h3>✅ Son Çözülen Talepler</h3>
          {recentResolved.length === 0 && <div className="x-empty">Henüz çözülen talep yok.</div>}
          {recentResolved.map((r) => (
            <div className="x-recent" key={r.id}>
              <span className="x-no">#{r.no}</span>
              <div className="x-recent-info">
                <div className="x-recent-sub">{r.user || '—'}</div>
                <div className="x-recent-txt">{r.desc || '—'}</div>
              </div>
              <span className="x-recent-time">{r.date}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="x-panel">
        <h3>📈 Son 7 Günlük Çözüm Aktivitesi</h3>
        <Spark
          counts={dayKeys.map((k) => resolved.filter((r) => r.date === k).length)}
          labels={labels}
          color="var(--ok)"
        />
      </div>
    </div>
  );
}