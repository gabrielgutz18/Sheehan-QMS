import { useEffect, useMemo, useState } from 'react';

import { getStats } from '../../api/adminStatsController.js';
import LineChart from '../common/lineChart.jsx';
import { asDate, longLabel, shortLabel } from '../../data/periodLabels.js';
import { downloadFile, fileAsDataUrl } from '../../export/download.js';
import purpose from '../../../data/purpose.js';
import logoUrl from '../../../assets/SheehanLogo.png';

// sales line graph for the dashboard: orders taken per hour / day / month, for every type of order or one (an order
// for Roofings and Steel counts for each, and once under All products), with today's served total, and an Excel
// export of the same numbers

const PERIODS = [
    { value: "day", label: "Day", range: "Today", column: "Hour" },
    { value: "week", label: "Week", range: "Last 7 days", column: "Date" },
    { value: "month", label: "Month", range: "Last 30 days", column: "Date" },
    { value: "year", label: "Year", range: "Last 12 months", column: "Month" },
];
const ALL = "all";
const REFRESH_MS = 60000;

const periodInfo = (value) => PERIODS.find((p) => p.value === value);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const whole = new Intl.NumberFormat();

// e.g. "Last 7 days: 6 Oct – 12 Oct 2026"
const rangeText = ({ period, from, to }) => {
    const day = (d) => asDate(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    const { range } = periodInfo(period);
    if (period === "day") return `${range}, ${day(to)}`;
    if (period === "year") {
        const month = (d) => asDate(d).toLocaleDateString(undefined, { month: "short", year: "numeric" });
        return `${range}: ${month(from)} – ${month(to)}`;
    }
    return `${range}: ${day(from)} – ${day(to)}`;
};

export default function Statistics() {
    const [period, setPeriod] = useState("week");
    const [product, setProduct] = useState(ALL);
    // the last numbers loaded; kept on screen (dimmed) while another period loads
    const [stats, setStats] = useState(null);
    const [error, setError] = useState("");
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const load = () =>
            getStats(period, { signal: controller.signal })
                .then((data) => {
                    setStats(data);
                    setError("");
                })
                .catch((err) => !controller.signal.aborted && setError(err.message));
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, [period]);

    // the types of order, plus any older ones that only appear in the data
    const products = useMemo(() => {
        const names = new Set(purpose.map((p) => p.name));
        stats?.buckets.forEach((b) => Object.keys(b.orders).forEach((name) => names.add(name)));
        return [...names];
    }, [stats]);

    // a slot's orders: all of them, each once, or the ones for the type picked
    const pickValue = (b) => (product === ALL ? b.total : b.orders[product] ?? 0);
    // on the Day view, hours later today haven't happened, so they get no value rather than a 0
    const comingHour = (key) => stats.period === "day" && Number(key) > new Date().getHours();
    const points = (stats?.buckets ?? []).map((b) => ({
        key: b.key,
        label: shortLabel(stats.period, b.key),
        long: longLabel(stats.period, b.key),
        value: comingHour(b.key) ? null : pickValue(b),
    }));

    const productLabel = product === ALL ? "All products" : product;
    const loading = !stats || stats.period !== period;

    const exportExcel = async () => {
        setExporting(true);
        setError("");
        try {
            const columns = product === ALL ? products : [product];
            const report = {
                title: "Sales report: orders",
                rangeLabel: rangeText(stats),
                productLabel,
                columnLabel: periodInfo(stats.period).column,
                columns,
                rows: stats.buckets.map((b) => ({
                    label: longLabel(stats.period, b.key),
                    values: columns.map((name) => b.orders[name] ?? 0),
                    total: pickValue(b),
                })),
                servedToday: stats.servedToday,
            };
            const [{ buildStatsWorkbook }, logo] = await Promise.all([
                import('../../export/statsWorkbook.js'),
                fileAsDataUrl(logoUrl),
            ]);
            const buffer = await buildStatsWorkbook(report, logo).xlsx.writeBuffer();
            const slug = product === ALL ? "all-products" : product.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            downloadFile(buffer, `Sheehan-sales-${stats.period}-${slug}-${stats.to}.xlsx`);
        } catch (err) {
            setError(`Couldn't export: ${err.message}`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <section className="stats" aria-labelledby="stats-title">
            <div className="stats-head">
                <h2 id="stats-title" className="stats-title">Sales</h2>
                <div className="stats-filters">
                    <div className="video-tabs" role="radiogroup" aria-label="Period">
                        {PERIODS.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={period === value}
                                className="video-tab"
                                onClick={() => setPeriod(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <label className="admin-filter">
                        <span className="visually-hidden">Product</span>
                        <select value={product} onChange={(e) => setProduct(e.target.value)}>
                            <option value={ALL}>All products</option>
                            {products.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" className="admin-btn" onClick={exportExcel} disabled={loading || exporting}>
                        {exporting ? "Exporting..." : "Export to Excel"}
                    </button>
                </div>
            </div>

            {error && <p className="field-error" role="alert">{error}</p>}

            <div className="stat-grid">
                <div className="stat-card">
                    <span className="stat-label">Served today</span>
                    <span className="stat-value">{stats ? whole.format(stats.servedToday) : "–"}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Orders</span>
                    <span className="stat-value">{stats ? whole.format(sum(points.map((p) => p.value ?? 0))) : "–"}</span>
                </div>
            </div>

            <div className="admin-panel">
                <p className="stats-caption">
                    Orders · {stats ? rangeText(stats) : periodInfo(period).range} · {productLabel}
                </p>
                <LineChart
                    points={points}
                    unit="orders"
                    label="Sales graph"
                    dimmed={loading && !!stats}
                    emptyText="No orders in this period yet."
                />

                {/* the same numbers as a table, for screen readers; hidden by a div around it, since a table grows past
                    a 1px height and would leave the page scrolling into blank space under it */}
                <div className="visually-hidden">
                    <table>
                        <caption>Orders, {productLabel}</caption>
                        <thead>
                            <tr><th scope="col">{periodInfo(stats?.period ?? period).column}</th><th scope="col">Orders</th></tr>
                        </thead>
                        <tbody>
                            {points.map((p) => (
                                <tr key={p.key}><th scope="row">{p.long}</th><td>{p.value ?? "–"}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
