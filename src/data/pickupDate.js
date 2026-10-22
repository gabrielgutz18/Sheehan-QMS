// a returning customer's pick-up day (YYYY-MM-DD): the day they come back for the items

const pad2 = (n) => String(n).padStart(2, "0");

// today by this computer's clock, the earliest day the form offers
export const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// "2026-10-24" → "Sat, 24 Oct 2026"
export const formatPickup = (day) =>
    new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
