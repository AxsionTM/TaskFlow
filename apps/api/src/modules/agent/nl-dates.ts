/**
 * Парсинг естественных русских дат/времени с учётом timezone пользователя.
 * Без внешних зависимостей: только Intl.
 */

const RU_MONTHS: Record<string, number> = {
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6,
  'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
};

const RU_WEEKDAYS: Record<string, number> = {
  // JS: 0=вс..6=сб
  'воскресенье': 0, 'воскресенья': 0,
  'понедельник': 1, 'понедельника': 1, 'понедельникам': 1,
  'вторник': 2, 'вторника': 2, 'вторникам': 2,
  'среду': 3, 'среды': 3, 'среда': 3, 'средам': 3,
  'четверг': 4, 'четверга': 4, 'четвергам': 4,
  'пятницу': 5, 'пятницы': 5, 'пятница': 5, 'пятницам': 5,
  'субботу': 6, 'субботы': 6, 'суббота': 6, 'субботам': 6,
};

function partsInTz(tz: string, at: Date): { y: number; mo: number; d: number; h: number; mi: number; wd: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day),
    h: Number(parts.hour) % 24, mi: Number(parts.minute),
    wd: wdMap[parts.weekday] ?? 0,
  };
}

/** Смещение timezone (мс) для момента UTC. */
function tzOffsetMs(tz: string, utc: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    });
    const parts = Object.fromEntries(dtf.formatToParts(utc).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
    );
    return asUtc - utc.getTime();
  } catch {
    return 0;
  }
}

/** Локальное wall-время в tz -> ISO UTC. */
export function zonedToISO(tz: string, y: number, mo: number, d: number, h: number, mi: number): string {
  let guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 2; i++) {
    guess = Date.UTC(y, mo - 1, d, h, mi, 0) - tzOffsetMs(tz || 'UTC', new Date(guess));
  }
  return new Date(guess).toISOString();
}

export function dayStartISO(tz: string, y: number, mo: number, d: number): string {
  return zonedToISO(tz || 'UTC', y, mo, d, 0, 0);
}

/** Завтра 12:00 в timezone — дефолт для массовых переносов. */
export function zonedTomorrowNoon(tz: string, now: Date = new Date()): string {
  const key = dayKeyInTz(new Date(now.getTime() + 86400000), tz || 'UTC').split('-').map(Number);
  return zonedToISO(tz || 'UTC', key[0], key[1], key[2], 12, 0);
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export interface ParsedDateTime {
  iso: string;
  hasTime: boolean;
  label: string;
}

/**
 * Ищет в тексте дату/время. Возвращает null если ничего нет.
 * now — текущий момент (серверный), tz — timezone пользователя.
 */
export function parseRuDateTime(rawText: string, tz: string, now: Date = new Date()): ParsedDateTime | null {
  const text = ` ${rawText.toLowerCase().replace(/ё/g, 'е')} `;
  const zone = tz || 'UTC';
  const cur = partsInTz(zone, now);

  let ty = cur.y;
  let tm = cur.mo;
  let td = cur.d;
  let foundDay = false;
  let label = '';

  const shiftDay = (n: number) => {
    const base = Date.UTC(ty, tm - 1, td) + n * 86400000;
    const d = new Date(base);
    ty = d.getUTCFullYear();
    tm = d.getUTCMonth() + 1;
    td = d.getUTCDate();
  };

  if (/послезавтра/.test(text)) {
    shiftDay(2);
    foundDay = true;
    label = 'послезавтра';
  } else if (/[^а-я]завтра[^а-я]/.test(text)) {
    shiftDay(1);
    foundDay = true;
    label = 'завтра';
  } else if (/сегодня/.test(text)) {
    foundDay = true;
    label = 'сегодня';
  }

  if (!foundDay) {
    // "через 3 дня / через 2 недели"
    const rel = text.match(/через\s+(\d+)\s+(день|дня|дней|неделю|недели|недель)/);
    if (rel) {
      const n = Number(rel[1]);
      const unit = rel[2].startsWith('нед') ? 7 : 1;
      shiftDay(Math.min(n, 365) * unit);
      foundDay = true;
      label = rel[0].trim();
    }
  }

  if (!foundDay) {
    // "20 сентября" / "20.09"
    const md = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/);
    const nd = !md && text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
    if (md) {
      const day = Number(md[1]);
      const mon = RU_MONTHS[md[2]];
      if (day >= 1 && day <= daysInMonth(ty, mon)) {
        tm = mon;
        td = day;
        if (Date.UTC(ty, tm - 1, td) < Date.UTC(cur.y, cur.mo - 1, cur.d)) ty += 1;
        foundDay = true;
        label = md[0];
      }
    } else if (nd) {
      const day = Number(nd[1]);
      const mon = Number(nd[2]);
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= daysInMonth(ty, mon)) {
        tm = mon;
        td = day;
        if (nd[3]) {
          let yy = Number(nd[3]);
          if (yy < 100) yy += 2000;
          ty = yy;
        } else if (Date.UTC(ty, tm - 1, td) < Date.UTC(cur.y, cur.mo - 1, cur.d)) {
          ty += 1;
        }
        foundDay = true;
        label = nd[0];
      }
    }
  }

  if (!foundDay) {
    // дни недели: "в понедельник", "к пятнице", "на следующей неделе"
    const nextWeek = /на следующей неделе/.test(text);
    const wm = text.match(/(?:в|во|к|до)\s+([а-я]+)/);
    const wd = wm ? RU_WEEKDAYS[wm[1]] : undefined;
    if (wd !== undefined) {
      let delta = (wd - cur.wd + 7) % 7;
      if (delta === 0) delta = 7; // "в понедельник" в понедельник = следующий
      if (nextWeek) delta += 7;
      shiftDay(delta);
      foundDay = true;
      label = (nextWeek ? 'на следующей неделе' : '') + (wm ? ` ${wm[1]}` : '');
    } else if (nextWeek) {
      // ближайший понедельник следующей недели
      let delta = (1 - cur.wd + 7) % 7;
      if (delta === 0) delta = 7;
      shiftDay(delta + 7);
      foundDay = true;
      label = 'на следующей неделе';
    }
  }

  if (!foundDay) return null;

  // Время: "в 16:00", "на 16:00", "в 16", "утром", "днём", "вечером"
  let hh = 12;
  let mm = 0;
  let hasTime = false;
  const tmMatch = text.match(/(?:в|к|на)\s+(\d{1,2})(?::(\d{2}))?/);
  if (tmMatch) {
    const h = Number(tmMatch[1]);
    const m = tmMatch[2] !== undefined ? Number(tmMatch[2]) : 0;
    if (h <= 23 && m <= 59) {
      hh = h;
      mm = m;
      hasTime = true;
    }
  } else if (/утром|утра/.test(text)) {
    hh = 9;
    mm = 0;
    hasTime = true;
  } else if (/днем|днём|обед/.test(text)) {
    hh = 13;
    mm = 0;
    hasTime = true;
  } else if (/вечером|вечера/.test(text)) {
    hh = 19;
    mm = 0;
    hasTime = true;
  }

  return { iso: zonedToISO(zone, ty, tm, td, hh, mm), hasTime, label: label.trim() };
}

/** Человекочитаемая дата ISO в timezone пользователя. */
export function formatInTz(iso: string | null | undefined, tz: string): string {
  if (!iso) return 'без срока';
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: tz || 'UTC', day: 'numeric', month: 'long' }).format(d);
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit' }).format(d);
    return `${date}, ${time}`;
  } catch {
    return String(iso);
  }
}

/** Ключ дня YYYY-MM-DD в timezone. */
export function dayKeyInTz(d: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return parts;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
