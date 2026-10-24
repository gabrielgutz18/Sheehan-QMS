import { useState } from 'react';

import { listHistory } from '../api/adminOrderController.js';
import { DAY_LIMIT, MAX_EXPORT_DAYS, daysBetween, orderExportRows } from '../export/orderRows.js';
import { downloadFile, fileAsDataUrl } from '../export/download.js';
import { todayKey } from '../../data/pickupDate.js';
import logoUrl from '../../assets/SheehanLogo.png';

// how many days History is asked for at once
const PARALLEL = 4;

const formatDay = (day) =>
    new Date(`${day}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// e.g. "24 Oct 2026", or "1 Oct 2026 – 24 Oct 2026"
const rangeText = (from, to) => (from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`);

// every ticket of these days from History, newest first per day; fullDays are the days History cut short
async function loadDays(days) {
    const orders = [];
    const fullDays = [];
    for (let i = 0; i < days.length; i += PARALLEL) {
        const batch = days.slice(i, i + PARALLEL);
        const results = await Promise.all(batch.map((day) => listHistory({ day })));
        results.forEach((rows, j) => {
            orders.push(...rows);
            if (rows.length >= DAY_LIMIT) fullDays.push(batch[j]);
        });
    }
    return { orders, fullDays };
}

// History's Export to Excel: every ticket from one day to another (today by default), one row each with what
// Customer order took for it (invoices, salesman, runner, receiver, payment, sales times, sales team, checkers,
// pick-up day) and who served it at sales; deleted tickets are left out
export default function OrderExport() {
    const [from, setFrom] = useState(todayKey);
    const [to, setTo] = useState(todayKey);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const exportExcel = async (e) => {
        e.preventDefault();
        if (exporting) return;
        setError("");
        setNotice("");
        if (!from || !to) return setError("Pick both days to export.");
        if (from > to) return setError("The first day must be before the last.");
        const days = daysBetween(from, to);
        if (days.length > MAX_EXPORT_DAYS) return setError(`Export at most ${MAX_EXPORT_DAYS} days at a time.`);

        setExporting(true);
        try {
            const { orders, fullDays } = await loadDays(days);
            const rows = orderExportRows(orders);
            if (rows.length === 0) {
                setNotice(`No orders on ${rangeText(from, to)}.`);
                return;
            }
            const [{ buildOrdersWorkbook }, logo] = await Promise.all([
                import('../export/ordersWorkbook.js'),
                fileAsDataUrl(logoUrl),
            ]);
            const report = {
                title: "Customer orders",
                rangeLabel: rangeText(from, to),
                rows,
                fullDays: fullDays.map(formatDay),
            };
            const buffer = await buildOrdersWorkbook(report, logo).xlsx.writeBuffer();
            downloadFile(buffer, `Sheehan-customer-orders-${from === to ? from : `${from}-to-${to}`}.xlsx`);
            if (fullDays.length) {
                setNotice(`Only the newest ${DAY_LIMIT} tickets of ${fullDays.map(formatDay).join(", ")} are in the file.`);
            }
        } catch (err) {
            setError(`Couldn't export: ${err.message}`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <form className="history-filters" onSubmit={exportExcel} aria-label="Export customer orders">
            <label className="history-field">
                <span>Export from</span>
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="history-field">
                <span>to</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="submit" className="admin-btn" disabled={exporting}>
                {exporting ? "Exporting..." : "Export to Excel"}
            </button>
            {error && <p className="field-error" role="alert">{error}</p>}
            {notice && <p className="history-note" role="status">{notice}</p>}
        </form>
    );
}
