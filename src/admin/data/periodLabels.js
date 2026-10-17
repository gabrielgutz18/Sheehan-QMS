// labels for the time slots the graphs use: "08" (an hour), "2026-10-12" (a day), "2026-10" (a month)

export const asDate = (key) => new Date(`${key}T00:00`);
const asMonth = (key) => new Date(`${key}-01T00:00`);
const asHour = (key) => new Date(2000, 0, 1, Number(key));

// short labels under a graph: "8 AM", "Tue 6", "6 Oct", "Oct"
export const shortLabel = (period, key) => ({
    day: () => asHour(key).toLocaleTimeString(undefined, { hour: "numeric" }),
    week: () => `${asDate(key).toLocaleDateString(undefined, { weekday: "short" })} ${asDate(key).getDate()}`,
    month: () => asDate(key).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    year: () => asMonth(key).toLocaleDateString(undefined, { month: "short" }),
})[period]();

// long labels for tooltips and Excel rows: "8:00 AM", "Tue, 6 Oct 2026", "October 2026"
export const longLabel = (period, key) => ({
    day: () => asHour(key).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    week: () => asDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    month: () => asDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    year: () => asMonth(key).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
})[period]();
