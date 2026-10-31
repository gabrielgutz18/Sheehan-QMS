// the Order sheet copied to Google Sheets, laid out like the loading schedule sales keeps there: every few seconds the
// orders that changed are sent to the Google Apps Script web app (tools/google-apps-script/salesTemp.gs), which adds
// or updates their rows in the spreadsheet; Google can't reach the server on the company network, so the server sends
// set GOOGLE_SHEET_URL (the web app's /exec link) and GOOGLE_SHEET_TOKEN (the script's SYNC_TOKEN) in .env to turn it on
import { assistedBy, invoicesByColumn, sheetDate, sheetTime } from '../src/admin/data/sheetColumns.js';
import { whereNow } from '../src/admin/data/orderStage.js';
import formatQueueNum, { markOf } from '../src/data/queueNum.js';

// rows per request, so one request stays well inside Apps Script's time limit on the first sync of a large sheet
const CHUNK = 300;
const REQUEST_TIMEOUT_MS = 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");
// a moment (ISO 8601) as the schedule writes a time, by the server's clock: "0734H"; "" for none
const clockTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${pad2(d.getHours())}${pad2(d.getMinutes())}H`;
};

// when the last of the order's areas finished loading, once every one has; an order loaded before areas were kept
// has only when loading pressed Done
const loadedAt = (order) => {
    const areas = order.areas ?? [];
    if (!areas.length) return order.loaded?.at;
    return areas.every((area) => area.loaded) ? areas.map((area) => area.loaded.at).toSorted().at(-1) : undefined;
};

// who checked the items again: the 2nd checker of each column, each name once
const doubleCheckedBy = (checkers = {}) =>
    [...new Set(Object.values(checkers).map(([, second = ""]) => second.trim()).filter(Boolean))].join(", ");

// where an order goes in its day's rows on the sheet: the priority orders first, then the TBA priority ones, then the
// rest, each group in number order; the script sorts the rows by this text: "2026-10-29 0 0003"
const GROUPS = { "*": 0, "**": 1, "": 2 };
export const sortKey = (order) =>
    `${order.date} ${GROUPS[markOf(order)]} ${String(order.queueNum).padStart(4, "0")}`;

// an order from the Order sheet (toHistory's shape) as one row of the Google sheet, { [column key]: text }; id is
// how the script finds the row again, and several invoice numbers in a column go one above the other; a priority
// order's QUE is just its mark, "*", and a TBA priority one's "**", in place of the number
export const sheetRow = (order) => {
    const invoices = invoicesByColumn(order);
    const stacked = (key) => invoices[key].join("\n");
    return {
        id: String(order.id),
        date: sheetDate(order.createdAt),
        que: markOf(order) || formatQueueNum(order.queueNum, order.purpose),
        team: order.team ?? "",
        salesman: order.salesman ?? "",
        assistedBy: assistedBy(order),
        customer: order.name,
        roofing: stacked("roofing"),
        construction: stacked("construction"),
        tba: stacked("tba"),
        chassis: stacked("chassis"),
        others: stacked("others"),
        terms: order.paymentStatus ?? "",
        salesTimeIn: sheetTime(order.salesTimeIn),
        salesTimeOut: sheetTime(order.salesTimeOut),
        runner: order.runner ?? "",
        receiver: order.receiver ?? "",
        // in to loading when sales handed them over, out when the last area finished
        loadingTimeIn: clockTime(order.handedOver?.at),
        loadingTimeOut: clockTime(loadedAt(order)),
        status: whereNow(order, { named: false }),
        doubleCheckedBy: doubleCheckedBy(order.checkers),
        sortKey: sortKey(order),
    };
};

// keeps the Google sheet up to date: every intervalMs, listOrders() (the Order sheet's orders) is turned into rows and
// the ones that changed since the last time are sent, oldest first so new rows are added in order; orders that are
// gone (deleted) are taken out of the sheet. The first sync after a start sends every row (the script only rewrites
// the ones that differ) and the ids to keep, so an order deleted while the server was off goes too
export function createSheetSync({ url, token, listOrders, intervalMs = 15000, fetch = globalThis.fetch, log = console }) {
    // id -> the row as last sent (JSON)
    const sent = new Map();
    let firstSync = true;
    let running = false;
    let timer = null;
    // the last error logged, so a sheet that stays unreachable is logged once, not every few seconds
    let lastError = "";

    const post = async (payload) => {
        const res = await fetch(url, {
            method: "POST",
            // text/plain needs no preflight and Apps Script reads it the same
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ token, ...payload }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`the web app answered ${res.status}`);
        // a Google sign-in page instead of JSON: the web app isn't deployed for "Anyone"
        const answer = await res.json().catch(() => {
            throw new Error("the web app didn't answer with JSON; deploy it with access for Anyone");
        });
        if (!answer.ok) throw new Error(answer.error ?? "the web app refused the rows");
        return answer;
    };

    async function syncOnce() {
        if (running) return;
        running = true;
        try {
            const rows = listOrders()
                .toSorted((a, b) => a.date.localeCompare(b.date) || a.queueNum - b.queueNum)
                .map(sheetRow);
            const changed = rows.filter((row) => sent.get(row.id) !== JSON.stringify(row));
            for (let i = 0; i < changed.length; i += CHUNK) {
                const chunk = changed.slice(i, i + CHUNK);
                await post({ rows: chunk });
                for (const row of chunk) sent.set(row.id, JSON.stringify(row));
            }

            const ids = new Set(rows.map((row) => row.id));
            const gone = [...sent.keys()].filter((id) => !ids.has(id));
            if (firstSync) await post({ keep: [...ids] });
            else if (gone.length) await post({ remove: gone });
            for (const id of gone) sent.delete(id);
            firstSync = false;

            if (lastError) log.log("Google sheet: back in sync");
            lastError = "";
        } catch (err) {
            if (err.message !== lastError) log.error(`Google sheet: couldn't sync the orders: ${err.message}`);
            lastError = err.message;
        } finally {
            running = false;
        }
    }

    return {
        syncOnce,
        start() {
            syncOnce();
            timer = setInterval(syncOnce, intervalMs);
            // never keeps the process (or a test) running on its own
            timer.unref();
        },
        stop() {
            clearInterval(timer);
        },
    };
}
