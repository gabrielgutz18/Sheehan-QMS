import { useEffect, useState } from 'react';

import LineChart from '../common/lineChart.jsx';
import { getMyStats } from '../../api/staffController.js';
import { longLabel, shortLabel } from '../../data/periodLabels.js';

// the signed-in staff member's customers served (one point each): totals for today, this week,
// this month, this year and all time, and a graph of the chosen period

const PERIODS = [
    { value: "day", label: "Day", caption: "Today, by hour" },
    { value: "week", label: "Week", caption: "This week, Monday to Sunday" },
    { value: "month", label: "Month", caption: "This month" },
    { value: "year", label: "Year", caption: "This year, by month" },
];
const REFRESH_MS = 60000;
const whole = new Intl.NumberFormat();

// version: bump it to reload straight away, e.g. after marking a customer done
export default function MyStats({ version }) {
    const [period, setPeriod] = useState("week");
    const [stats, setStats] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        const load = () =>
            getMyStats(period, { signal: controller.signal })
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
    }, [period, version]);

    const totals = stats?.totals;
    const tiles = [
        { label: "Served today", value: totals?.today },
        { label: "This week", value: totals?.week },
        { label: "This month", value: totals?.month },
        { label: "This year", value: totals?.year },
        { label: "All time", value: totals?.total },
    ];
    const points = (stats?.buckets ?? []).map((b) => ({
        key: b.key,
        label: shortLabel(stats.period, b.key),
        long: longLabel(stats.period, b.key),
        value: b.future ? null : b.served,
    }));
    const loading = !stats || stats.period !== period;

    return (
        <section className="stats" aria-labelledby="my-stats-title">
            <div className="stats-head">
                <h2 id="my-stats-title" className="stats-title">Customers you served</h2>
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
            </div>

            {error && <p className="field-error" role="alert">{error}</p>}

            <div className="stat-grid">
                {tiles.map(({ label, value }) => (
                    <div key={label} className="stat-card">
                        <span className="stat-label">{label}</span>
                        <span className="stat-value">{value === undefined ? "–" : whole.format(value)}</span>
                    </div>
                ))}
            </div>

            <div className="admin-panel">
                <p className="stats-caption">
                    Customers served · {PERIODS.find((p) => p.value === (stats?.period ?? period)).caption} · one point each
                </p>
                <LineChart
                    points={points}
                    unit="served"
                    label="Your customers served"
                    dimmed={loading && !!stats}
                    emptyText="No customers served in this period yet."
                />
                {/* the same numbers as a table, for screen readers */}
                <table className="visually-hidden">
                    <caption>Customers you served</caption>
                    <thead>
                        <tr><th scope="col">When</th><th scope="col">Served</th></tr>
                    </thead>
                    <tbody>
                        {points.map((p) => (
                            <tr key={p.key}><th scope="row">{p.long}</th><td>{p.value ?? "–"}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
