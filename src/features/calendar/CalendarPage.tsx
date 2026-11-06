import { useState } from 'react';
import { useCollection } from '../../hooks/useCollection';
import { addDays, localDate } from '../../lib/localdate';
import type { Assignment } from '../../lib/models';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const pad = (n: number) => String(n).padStart(2, '0');

export function CalendarPage() {
  const assigns = useCollection<Assignment>('distAssignments').data;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const byDate: Record<string, string[]> = {};
  assigns.forEach((a) => {
    (byDate[a.date] ||= []).push(a.personName);
  });

  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prefix = `${year}-${pad(month + 1)}`;
  const counts: Record<string, number> = {};
  assigns
    .filter((a) => a.date.startsWith(prefix))
    .forEach((a) => {
      counts[a.personName] = (counts[a.personName] || 0) + 1;
    });
  const stats = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const upcoming: { date: string; name: string; day: string }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(new Date(), i);
    const key = localDate(d);
    (byDate[key] || []).forEach((name) => upcoming.push({ date: key, name, day: DAYS[(d.getDay() + 6) % 7] }));
  }

  const todayKey = localDate();

  function prev() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  }
  function next() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>
          Talep <em>Dağıtım Takvimi</em>
        </h2>
        <p>Personel görev planlaması ve aylık dağıtım görünümü</p>
      </div>
      <div className="x-cal-grid">
        <div className="x-panel">
          <div className="x-cal-nav">
            <button type="button" onClick={prev}>
              ‹
            </button>
            <div className="x-cal-title">
              {MONTHS[month]} <em>{year}</em>
            </div>
            <button type="button" onClick={next}>
              ›
            </button>
          </div>
          <div className="x-cal-wd">
            {DAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="x-cal">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="x-cell off" />;
              const key = `${prefix}-${pad(d)}`;
              const names = byDate[key] || [];
              const cls = ['x-cell', key === todayKey ? 'today' : '', names.length ? 'has' : ''].join(' ');
              return (
                <div key={i} className={cls}>
                  <b>{d}</b>
                  {names.map((n, j) => (
                    <div className="x-tag" key={j}>
                      {n}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="x-panel">
            <h3>Bu Ay Görevli Personel</h3>
            {stats.length === 0 && <div className="x-note">Bu ay atama bulunmuyor.</div>}
            {stats.map(([name, c]) => (
              <div className="x-row" key={name}>
                <span>{name}</span>
                <span className="x-chip">{c} gün</span>
              </div>
            ))}
          </div>
          <div className="x-panel">
            <h3>Yaklaşan Görevler (14 Gün)</h3>
            {upcoming.length === 0 && <div className="x-note">Önümüzdeki 14 günde görev yok.</div>}
            {upcoming.map((u, i) => (
              <div className="x-row" key={i}>
                <span className="x-chip">{u.date.slice(5)}</span>
                <span style={{ flex: 1 }}>{u.name}</span>
                <span className="x-note" style={{ margin: 0 }}>
                  {u.day}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}