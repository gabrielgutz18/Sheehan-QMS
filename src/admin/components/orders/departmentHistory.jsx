import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { departmentHistory } from "../../api/loadingController.js";
import { resultLabel } from "../../data/securityCheck.js";
import { DEPARTMENTS, historyListsOf } from "../../../data/loadingAreas.js";
import formatQueueNum from "../../../data/queueNum.js";

// a department's History tab (department: "loading", "tba", "chassis" or "hardware"): every order sales handed over to
// it, one list at a time so different products never mix (Roofings or Steel at loading, Tire or Battery at TBA), each
// with only that list's part: its invoices and who loaded its area, never another department's or the sale's details
// the filter (list, All / One day / Range, the days and the search) is kept in the address, so Back and reloading keep
// it; it reads the history when it opens and when the filter changes, not every few seconds: the past doesn't move

const SHOW = [
    { value: "all", label: "All" },
    { value: "day", label: "One day" },
    { value: "range", label: "Range" },
];

// wait for a pause in typing before searching
const SEARCH_DELAY_MS = 300;

const pad2 = (n) => String(n).padStart(2, "0");
// today as YYYY-MM-DD by this computer's clock, the way tickets are dated
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// "Nov 6, 2026"
const formatDay = (day) =>
    new Date(`${day}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// "9:42 AM"
const formatTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// the days the API is asked for: none for All, the same day at both ends for One day
const daysOf = (show, day, from, to) =>
    show === "day" ? { from: day, to: day } : show === "range" ? { from, to } : {};

// what an empty list says, by what was asked for
const emptyText = (list, show, day, from, to, search) => {
    if (search) return `No orders match "${search}".`;
    if (show === "day") return `No ${list} orders were handed over on ${formatDay(day)}.`;
    if (show === "range" && from && to) {
        const [first, last] = from <= to ? [from, to] : [to, from];
        return `No ${list} orders were handed over between ${formatDay(first)} and ${formatDay(last)}.`;
    }
    // a Range with one end filled in is that one day, as the server reads it
    if (show === "range" && (from || to)) return `No ${list} orders were handed over on ${formatDay(from || to)}.`;
    return `No ${list} orders have been handed over yet.`;
};

/** @param {{ department: string }} props */
export default function DepartmentHistory({ department }) {
    const lists = historyListsOf(department);
    const [params, setParams] = useSearchParams();
    const list = lists.find(({ name }) => name === params.get("list")) ?? lists[0];
    const show = SHOW.some(({ value }) => value === params.get("show")) ? params.get("show") : "all";
    const day = params.get("day") || today();
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const search = params.get("search") ?? "";

    // changes some of the filter in the address, keeping the tab and the rest; "" takes a key out
    /** @param {Record<string, string>} changes */
    const change = (changes) =>
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                for (const [key, value] of Object.entries(changes)) {
                    if (value) next.set(key, value);
                    else next.delete(key);
                }
                return next;
            },
            { replace: true },
        );

    const [query, setQuery] = useState(search.trim());
    useEffect(() => {
        const id = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
        return () => clearTimeout(id);
    }, [search]);

    const days = daysOf(show, day, from, to);
    const key = JSON.stringify([list.name, days, query]);
    // the rows and the filter they were read for, so a new filter shows "Loading..." until they match; a failed read
    // shows only its error: the rows there were belong to another filter, and nothing was read to say there are none
    const [result, setResult] = useState({ key: null, rows: [], more: false, error: "" });
    const [moreBusy, setMoreBusy] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const { from: first, to: last } = JSON.parse(key)[1];
        departmentHistory(
            department,
            { list: list.name, from: first, to: last, search: query },
            { signal: controller.signal },
        )
            .then(({ rows, more }) => setResult({ key, rows, more, error: "" }))
            .catch(
                (err) => !controller.signal.aborted && setResult({ key, rows: [], more: false, error: err.message }),
            );
        return () => controller.abort();
    }, [department, key, list.name, query]);

    const loading = result.key !== key;

    // the next 50, after the last one shown, added under them
    const showMore = async () => {
        const last = result.rows.at(-1);
        setMoreBusy(true);
        try {
            const page = await departmentHistory(department, {
                list: list.name,
                ...days,
                search: query,
                before: `${last.date}:${last.queueNum}`,
            });
            setResult((prev) =>
                prev.key === key ? { ...prev, rows: [...prev.rows, ...page.rows], more: page.more } : prev,
            );
        } catch (err) {
            setResult((prev) => ({ ...prev, error: err.message }));
        } finally {
            setMoreBusy(false);
        }
    };

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">{DEPARTMENTS[department]} history</h1>
            </div>

            <div className="history-filters department-history-filters">
                {lists.length > 1 && (
                    <div className="video-tabs" role="radiogroup" aria-label="List">
                        {lists.map(({ name }) => (
                            <button
                                key={name}
                                type="button"
                                role="radio"
                                aria-checked={list.name === name}
                                className="video-tab"
                                onClick={() => change({ list: name })}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                )}
                <div className="video-tabs" role="radiogroup" aria-label="Show">
                    {SHOW.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={show === value}
                            className="video-tab"
                            onClick={() => change({ show: value === "all" ? "" : value })}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {show === "day" && (
                    <label className="history-field">
                        <span>Day</span>
                        <input type="date" value={day} onChange={(e) => change({ day: e.target.value })} />
                    </label>
                )}
                {show === "range" && (
                    <>
                        <label className="history-field">
                            <span>From</span>
                            <input type="date" value={from} onChange={(e) => change({ from: e.target.value })} />
                        </label>
                        <label className="history-field">
                            <span>To</span>
                            <input type="date" value={to} onChange={(e) => change({ to: e.target.value })} />
                        </label>
                    </>
                )}
                <label className="history-field">
                    <span className="visually-hidden">Search</span>
                    <input
                        type="search"
                        placeholder="Search name, ticket or invoice no."
                        maxLength={100}
                        value={search}
                        onChange={(e) => change({ search: e.target.value })}
                    />
                </label>
            </div>

            {result.error && (
                <p className="field-error" role="alert">
                    {result.error}
                </p>
            )}

            <div className="admin-panel">
                {loading ? (
                    <p className="admin-empty">Loading...</p>
                ) : result.rows.length === 0 ? (
                    !result.error && <p className="admin-empty">{emptyText(list.name, show, day, from, to, query)}</p>
                ) : (
                    <ul className="counter-list">
                        {result.rows.map((row) => (
                            <li key={row.id} className="counter-ticket">
                                <div className="counter-ticket-main">
                                    <strong className="counter-number">
                                        {formatQueueNum(row.queueNum, row.purpose, row)}
                                    </strong>
                                    <span className="counter-name">{row.name}</span>
                                    <span className="counter-meta">{formatDay(row.date)}</span>
                                    <span className="counter-meta">
                                        {row.invoices.length
                                            ? `Invoice: ${row.invoices.map(({ invoiceNo }) => invoiceNo).join(", ")}`
                                            : "No invoice"}
                                    </span>
                                    <span className="counter-meta">
                                        Handed over by {row.handedOver.by.name ?? "someone"} ·{" "}
                                        {formatTime(row.handedOver.at)}
                                    </span>
                                    <span className="counter-meta">
                                        {row.loaded
                                            ? `${list.area} ✓ ${row.loaded.by.name} · ${formatTime(row.loaded.at)}`
                                            : `${list.area}: not loaded`}
                                    </span>
                                    {row.sentBack && (
                                        <p className="sent-back-note">
                                            Sent back to {list.area} by security · {resultLabel(row.sentBack.result)}
                                            {row.sentBack.note && ` · “${row.sentBack.note}”`} · {row.sentBack.by.name}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {!loading && result.more && (
                    <button
                        type="button"
                        className="admin-btn department-history-more"
                        disabled={moreBusy}
                        onClick={showMore}
                    >
                        {moreBusy ? "Loading..." : "Show more"}
                    </button>
                )}
            </div>
        </section>
    );
}
