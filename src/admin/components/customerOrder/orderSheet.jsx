import { useRef, useState } from 'react';

import useOrders from '../../hooks/useOrders.js';
import { listOrderSheet, updateOrderSheet } from '../../api/adminOrderController.js';
import { STAGES, stageOf, whereNow } from '../../data/orderStage.js';
import { changedDetails, editTime } from '../../data/orderEdits.js';
import { INVOICE_COLUMNS, assistedBy, invoicesByColumn, sheetDate, sheetTime } from '../../data/sheetColumns.js';
import formatQueueNum from '../../../data/queueNum.js';
import teams from '../../../data/teams.js';

// must match the backend (server/api.js)
const MAX_RUNNER = 60;
const MAX_RECEIVER = 60;
// several people work on the sheet at once, so it fetches again sooner than the other pages
const REFRESH_MS = 5000;

const TEAMS = teams.map((t) => t.name);
// what each cell is called in a message
const CELL_LABELS = { runner: "runner", receiver: "receiver", team: "sales team" };

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose);
const stageLabel = (order) => STAGES.find((s) => s.value === stageOf(order)).label;

// "Juan", "RT 03" or "3" finds the order, and "Oct-24" every order that day
const matches = (order, search) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return order.name.toLowerCase().includes(text) || ticketOf(order).toLowerCase().includes(text) ||
        String(order.queueNum) === text || sheetDate(order.createdAt).toLowerCase().includes(text);
};

// a dropdown's choices, with the order's own value first if the list no longer has it, so it still shows
const choicesWith = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);

// a cell typed into like a spreadsheet's: saved when you leave it (Tab, Enter or a click elsewhere), and Escape puts
// it back as it was; a refresh while you're typing leaves what you've typed alone
function TextCell({ value, label, maxLength, className = "", onSave }) {
    const [draft, setDraft] = useState(null);
    const cancelled = useRef(false);

    // what's in the box as it's left, rather than the last draft drawn, so a fast Tab still saves the last letter
    const leave = (e) => {
        const typed = e.currentTarget.value.trim();
        if (!cancelled.current && typed !== value) onSave(typed);
        cancelled.current = false;
        setDraft(null);
    };

    return (
        <input
            className={`sheet-input ${className}`}
            aria-label={label}
            maxLength={maxLength}
            value={draft ?? value}
            onFocus={() => setDraft(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={leave}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                    cancelled.current = true;
                    e.currentTarget.blur();
                }
            }}
        />
    );
}

// the row's last column: where the customer is now, and the latest edit, short enough for a sheet: who, their sales
// team then and when, with what they changed when you point at it (every edit is on the ticket itself)
function StatusCell({ order }) {
    const [latest] = order.edits ?? [];
    return (
        <>
            <span className={`stage-badge is-${stageOf(order)}`} title={whereNow(order)}>{stageLabel(order)}</span>
            {latest && (
                <span className="sheet-edit" title={`Changed ${changedDetails(latest.changes)}`}>
                    Edited by <strong>{latest.by.name}</strong>
                    {latest.team && <> · {latest.team}</>} · {editTime(latest.at)}
                </span>
            )}
        </>
    );
}

// the Order sheet on Customer order: every order from every day (no Customer Reports: they're concerns, not orders),
// newest day first, one row each with all its details, laid out like the loading schedule sales keeps in Google Sheets (date, queue number, team, salesman, who assisted,
// the customer, the invoice numbers under their department, terms, time in and out at sales, runner and receiver) and
// as wide as the page, with no scrolling sideways; every sales staff member works on it together: they pick the team and type the
// runner and receiver right in the row, each cell saved as soon as they leave it (kept as an edit with who saved it;
// the last column shows the latest and where the customer is now), and the others' changes show within a few seconds;
// the terms (payment status) only show here: the cashier sets them, on the Cashier page
// the rest is filled in on the ticket itself: today's queue numbers open the row's ticket on the Queue ticket tab (an
// earlier day's can't be opened there, but its cells here can still be filled in)
// onOpen(queueNum): opens that ticket
export default function OrderSheet({ onOpen }) {
    const { orders, setOrders, loading, error, changed } = useOrders({ refreshMs: REFRESH_MS, list: listOrderSheet });
    const [search, setSearch] = useState("");
    // saves still on their way, and whether one has gone through yet
    const [saving, setSaving] = useState(0);
    const [savedOnce, setSavedOnce] = useState(false);
    const [saveError, setSaveError] = useState("");

    const visible = orders.filter((o) => matches(o, search));
    // by id, since queue numbers repeat every day
    const put = (id, change) => setOrders((prev) => prev.map((o) => (o.id === id ? change(o) : o)));

    // shows the new value straight away, and puts the old one back if it doesn't save
    const save = async (order, key, value) => {
        const before = order[key] ?? "";
        if (value === before) return;
        setSaveError("");
        setSaving((n) => n + 1);
        changed();
        put(order.id, (o) => ({ ...o, [key]: value }));
        try {
            const saved = await updateOrderSheet(order.id, { [key]: value });
            put(order.id, () => saved);
            setSavedOnce(true);
        } catch (err) {
            put(order.id, (o) => ({ ...o, [key]: before }));
            setSaveError(`Couldn't save the ${CELL_LABELS[key]} for ${ticketOf(order)}: ${err.message}`);
        } finally {
            changed();
            setSaving((n) => n - 1);
        }
    };

    return (
        <section className="admin-panel order-sheet" aria-labelledby="order-sheet-title">
            <div className="order-sheet-head">
                <div>
                    <h2 id="order-sheet-title">Order sheet</h2>
                    <p className="tab-hint">
                        Every day's orders, newest first, shared by everyone in sales. Pick the team, type the runner
                        and receiver; each saves when you leave the cell, and the others see it within a few seconds.
                        The terms are set by the cashier. Click one of today's queue numbers to open its ticket.
                    </p>
                </div>
                <p className="order-sheet-status" role="status">
                    {saving > 0 ? "Saving..." : savedOnce ? "All changes saved" : ""}
                </p>
                <input
                    type="search"
                    className="order-status-search"
                    placeholder="Search name, number or date"
                    aria-label="Search the sheet by customer name, ticket number or date"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {(saveError || error) && <p className="field-error" role="alert">{saveError || `Couldn't refresh the sheet: ${error}`}</p>}

            {loading ? (
                <p className="admin-status">Loading the sheet...</p>
            ) : visible.length === 0 ? (
                <p className="admin-empty">{orders.length === 0 ? "No orders yet." : "No orders match."}</p>
            ) : (
                <div className="sheet-frame">
                    {/* fixed column widths (see .sheet-table col), so the sheet fills the page and never scrolls sideways;
                        long text wraps inside its cell instead */}
                    <table className="sheet-table">
                        <colgroup>
                            <col className="c-date" />
                            <col className="c-que" />
                            <col className="c-team" />
                            <col className="c-salesman" />
                            <col className="c-person" />
                            <col className="c-customer" />
                            {INVOICE_COLUMNS.map((column) => <col key={column.key} className={`c-invoice c-${column.key}`} />)}
                            <col className="c-terms" />
                            <col className="c-time" />
                            <col className="c-time" />
                            <col className="c-person" />
                            <col className="c-person" />
                            <col className="c-status" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <th scope="col">Que</th>
                                <th scope="col" className="is-editable">Team</th>
                                <th scope="col">Salesman</th>
                                <th scope="col">Assisted by</th>
                                <th scope="col">Customer's name</th>
                                {INVOICE_COLUMNS.map((column) => <th key={column.key} scope="col">{column.header}</th>)}
                                <th scope="col">Terms</th>
                                <th scope="col" className="is-time">Time in <small>(sales)</small></th>
                                <th scope="col" className="is-time">Time out <small>(sales)</small></th>
                                <th scope="col" className="is-editable">Runner <small>(sales)</small></th>
                                <th scope="col" className="is-editable">Receiver <small>(loading / inventory)</small></th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((o) => {
                                const ticket = ticketOf(o);
                                const invoices = invoicesByColumn(o);
                                return (
                                    <tr key={o.id}>
                                        <td className="sheet-date">{sheetDate(o.createdAt)}</td>
                                        <th scope="row" className="sheet-que">
                                            {/* Customer order only opens today's tickets */}
                                            {!o.isToday ? ticket : (
                                                <button type="button" className="sheet-que-btn" title={`Open ${ticket} on Queue ticket`}
                                                    onClick={() => onOpen(o.queueNum)}>
                                                    {ticket}
                                                </button>
                                            )}
                                        </th>
                                        <td className="is-editable">
                                            <select className="sheet-select sheet-caps" aria-label={`Sales team for ${ticket}`}
                                                value={o.team ?? ""}
                                                onChange={(e) => save(o, "team", e.target.value)}>
                                                <option value="">—</option>
                                                {choicesWith(TEAMS, o.team).map((t) => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </td>
                                        <td className="sheet-caps">{o.salesman}</td>
                                        <td className="sheet-caps">{assistedBy(o)}</td>
                                        <td>{o.name}</td>
                                        {INVOICE_COLUMNS.map((column) => (
                                            <td key={column.key} className="sheet-invoices">
                                                {invoices[column.key].map((invoiceNo) => <span key={invoiceNo}>{invoiceNo}</span>)}
                                            </td>
                                        ))}
                                        {/* the cashier's: shown, not picked here */}
                                        <td className="sheet-caps">{o.paymentStatus}</td>
                                        <td className="sheet-time">{sheetTime(o.salesTimeIn)}</td>
                                        <td className="sheet-time">{sheetTime(o.salesTimeOut)}</td>
                                        <td className="is-editable">
                                            <TextCell value={o.runner ?? ""} label={`Runner for ${ticket}`} maxLength={MAX_RUNNER}
                                                className="sheet-caps sheet-runner" onSave={(value) => save(o, "runner", value)} />
                                        </td>
                                        <td className="is-editable">
                                            <TextCell value={o.receiver ?? ""} label={`Receiver for ${ticket}`} maxLength={MAX_RECEIVER}
                                                className="sheet-caps" onSave={(value) => save(o, "receiver", value)} />
                                        </td>
                                        <td className="sheet-status"><StatusCell order={o} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
