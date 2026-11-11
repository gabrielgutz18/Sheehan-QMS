import { useEffect, useRef, useState } from "react";

import useOrders from "../../hooks/useOrders.js";
import {
    addSheetColumn,
    createOrderSheetRow,
    listOrderSheet,
    listSheetColumns,
    removeSheetColumn,
    updateOrderSheet,
} from "../../api/adminOrderController.js";
import GoogleSheetSync from "./googleSheetSync.jsx";
import { STAGES, stageOf, whereNow } from "../../data/orderStage.js";
import { changedDetails, editTime, editVerb } from "../../data/orderEdits.js";
import { INVOICE_COLUMNS, sheetDate, sheetValues } from "../../data/sheetColumns.js";
import { ticketNumber } from "../../../data/queueNum.js";
import TicketNumber from "../common/ticketNumber.jsx";
import paymentStatus from "../../../data/paymentStatus.js";
import teams from "../../../data/teams.js";

// several people work on the sheet at once, so it fetches again sooner than the other pages
const REFRESH_MS = 5000;
// must match the backend (server/sheetCells.js)
const MAX_COLUMN_NAME = 40;

const TEAMS = teams.map((t) => t.name);
const TERMS = paymentStatus.map((p) => p.type);

// the cells typed or picked into, left to right as on the schedule; the date, queue number and status are the system's,
// since they run the queue. list: picked from it, not typed; time: stays on one line; caps: written in capitals;
// invoices: each number stays whole, one above the other
const CELLS = [
    { key: "team", label: "Team", col: "c-team", list: TEAMS, caps: true },
    { key: "salesman", label: "Salesman", col: "c-salesman", max: 60, caps: true },
    { key: "assistedBy", label: "Assisted by", col: "c-person", max: 120, caps: true },
    { key: "customer", label: "Customer's name", col: "c-customer", max: 100 },
    ...INVOICE_COLUMNS.map(({ key, header }) => ({ key, label: header, col: `c-invoice c-${key}`, invoices: true })),
    { key: "purpose", label: "Type of order", col: "c-type", max: 200 },
    { key: "terms", label: "Terms", col: "c-terms", list: TERMS, caps: true },
    { key: "salesTimeIn", label: "Time in", sub: "(sales)", col: "c-time", time: true },
    { key: "salesTimeOut", label: "Time out", sub: "(sales)", col: "c-time", time: true },
    { key: "runner", label: "Runner", sub: "(sales)", col: "c-person", max: 60, caps: true, runner: true },
    { key: "receiver", label: "Receiver", sub: "(loading / inventory)", col: "c-person", max: 60, caps: true },
    { key: "loadingTimeIn", label: "Time in", sub: "(loading)", col: "c-time", time: true },
    { key: "loadingTimeOut", label: "Time out", sub: "(loading)", col: "c-time", time: true },
    { key: "doubleCheckedBy", label: "Double checked by", col: "c-person", max: 120, caps: true },
];
const CUSTOM_CELL_MAX = 500;

const ticketOf = (o) => ticketNumber(o);
const stageLabel = (order) => STAGES.find((s) => s.value === stageOf(order)).label;

// "Juan", "RT 03" or "3" finds the order, and "Oct-24" every order that day
const matches = (order, search) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return (
        order.name.toLowerCase().includes(text) ||
        ticketOf(order).toLowerCase().includes(text) ||
        String(order.queueNum) === text ||
        sheetDate(order.createdAt).toLowerCase().includes(text)
    );
};

// a dropdown's choices, with the order's own value first if the list no longer has it, so it still shows
const choicesWith = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);

// what a new row needs before it can be a ticket; the server checks the rest
const readyToCreate = (cells) =>
    Boolean(cells.customer?.trim() && cells.purpose?.trim() && INVOICE_COLUMNS.some(({ key }) => cells[key]?.trim()));

// a box as tall as what's in it, so a long name or several invoice numbers all show while they're typed
const fitToText = (box) => {
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
};

// a cell typed into like a spreadsheet's: it reads as plain text, so long text wraps and the column fits it, and becomes
// a box when clicked or tabbed to; saved when you leave it (Tab, Enter or a click elsewhere), Shift+Enter starts a new
// line for another invoice number, and Escape puts it back as it was; a refresh while you're typing leaves it alone
function TextCell({ value, label, maxLength, onSave }) {
    const [draft, setDraft] = useState(null);
    const box = useRef(null);
    const cancelled = useRef(false);
    const editing = draft !== null;

    useEffect(() => {
        if (!editing || !box.current) return;
        box.current.focus();
        box.current.setSelectionRange(box.current.value.length, box.current.value.length);
        fitToText(box.current);
    }, [editing]);

    // what's in the box as it's left, rather than the last draft drawn, so a fast Tab still saves the last letter
    const leave = (e) => {
        const typed = e.currentTarget.value.trim();
        if (!cancelled.current && typed !== value) onSave(typed);
        cancelled.current = false;
        setDraft(null);
    };

    if (!editing) {
        return (
            <button
                type="button"
                className="sheet-cell"
                aria-label={label}
                onClick={() => setDraft(value)}
                onFocus={() => setDraft(value)}
            >
                {value}
            </button>
        );
    }
    return (
        <textarea
            ref={box}
            className="sheet-input"
            aria-label={label}
            rows={1}
            maxLength={maxLength}
            value={draft}
            onChange={(e) => {
                setDraft(e.target.value);
                fitToText(e.target);
            }}
            onBlur={leave}
            onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                    cancelled.current = true;
                    e.currentTarget.blur();
                }
            }}
        />
    );
}

// one editable cell of a row, by what its column takes; clearable: a dropdown can be set back to nothing; the terms can
// be changed, but not cleared once set, the same as on the Cashier page
function SheetCell({ cell, value, label, onSave }) {
    const className = [
        "is-editable",
        cell.caps && "sheet-caps",
        cell.time && "sheet-time",
        cell.invoices && "sheet-invoices",
        cell.runner && "sheet-runner",
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <td className={className}>
            {cell.list ? (
                <select
                    className="sheet-select sheet-caps"
                    aria-label={label}
                    value={value}
                    onChange={(e) => onSave(e.target.value)}
                >
                    {(cell.key !== "terms" || !value) && <option value="">—</option>}
                    {choicesWith(cell.list, value).map((choice) => (
                        <option key={choice} value={choice}>
                            {choice}
                        </option>
                    ))}
                </select>
            ) : (
                <TextCell value={value} label={label} maxLength={cell.max} onSave={onSave} />
            )}
        </td>
    );
}

// the row's last column: where the customer is now, and the latest edit, short enough for a sheet: who, their sales
// team then and when, with what they changed when you point at it (every edit is on the ticket itself)
function StatusCell({ order }) {
    const [latest] = order.edits ?? [];
    return (
        <>
            <span className={`stage-badge is-${stageOf(order)}`} title={whereNow(order)}>
                {stageLabel(order)}
            </span>
            {latest && (
                <span
                    className="sheet-edit"
                    title={changedDetails(latest.changes) && `Changed ${changedDetails(latest.changes)}`}
                >
                    {editVerb(latest)} <strong>{latest.by.name}</strong>
                    {latest.team && <> · {latest.team}</>} · {editTime(latest.at)}
                </span>
            )}
        </>
    );
}

// the columns people added, refreshed like the orders, since they can be added in the Google sheet too
function useSheetColumns() {
    const [columns, setColumns] = useState([]);
    useEffect(() => {
        const controller = new AbortController();
        const load = () =>
            listSheetColumns({ signal: controller.signal })
                .then((data) => setColumns(data ?? []))
                .catch(() => {});
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);
    return { columns, setColumns };
}

// the Order sheet on Customer order: every order from every day (no Customer Reports: they're concerns, not orders), newest
// day first with all the priority orders together below the regular ones, one row each with all its details, laid out
// like the loading schedule sales keeps in Google Sheets; every sales staff member works on it together, like a
// spreadsheet: every cell but the date, queue number and status is typed or picked right in the row, each saved as soon as
// they leave it (kept as an edit with who saved it; the last column shows the latest and where the customer is now), and
// the others' changes show within a few seconds; a new row becomes a ticket once it has a customer's name, a type of order
// and an invoice number, and anyone can add a column of their own, which also shows in the Google sheet; today's queue
// numbers open the row's ticket on the Queue ticket tab (an earlier day's can't be opened there, but its cells here can
// still be filled in)
// onOpen(queueNum): opens that ticket
export default function OrderSheet({ onOpen }) {
    const { orders, setOrders, loading, error, changed } = useOrders({ refreshMs: REFRESH_MS, list: listOrderSheet });
    const { columns, setColumns } = useSheetColumns();
    const [search, setSearch] = useState("");
    // saves still on their way, and whether one has gone through yet
    const [saving, setSaving] = useState(0);
    const [savedOnce, setSavedOnce] = useState(false);
    const [saveError, setSaveError] = useState("");
    // what's on its way for each cell, so it shows straight away, "<order id>|<key>" → text
    const [pending, setPending] = useState(/** @type {Record<string, string>} */ ({}));
    // the cells of the row being added, or null; and the name of the column being added, or null
    const [newRow, setNewRow] = useState(null);
    const creating = useRef(false);
    const [newColumn, setNewColumn] = useState(null);

    const visible = orders.filter((o) => matches(o, search));
    const put = (saved) => setOrders((prev) => prev.map((o) => (o.id === saved.id ? saved : o)));

    const allCells = [
        ...CELLS,
        ...columns.map(({ key, name }) => ({
            key,
            label: name,
            col: "c-custom",
            max: CUSTOM_CELL_MAX,
            removable: true,
        })),
    ];

    // the order's text for a cell: what's on its way, or else what it has; by id, since queue numbers repeat every day
    const valueOf = (order, key) => {
        const waiting = pending[`${order.id}|${key}`];
        if (waiting !== undefined) return waiting;
        return key.startsWith("c:") ? (order.sheetCells?.[key] ?? "") : sheetValues(order)[key];
    };

    // saved one at a time; if it doesn't save, the old value shows again, with the reason
    const save = async (order, cell, value) => {
        const slot = `${order.id}|${cell.key}`;
        setSaveError("");
        setSaving((n) => n + 1);
        changed();
        setPending((all) => ({ ...all, [slot]: value }));
        try {
            put(await updateOrderSheet(order.id, { [cell.key]: value }));
            setSavedOnce(true);
        } catch (err) {
            setSaveError(`Couldn't save the ${cell.label.toLowerCase()} for ${ticketOf(order)}: ${err.message}`);
        } finally {
            setPending((all) => Object.fromEntries(Object.entries(all).filter(([waiting]) => waiting !== slot)));
            changed();
            setSaving((n) => n - 1);
        }
    };

    // the new row's cell; once the row has what it needs, it's made a ticket, and joins the sheet like any other
    const saveNewCell = async (key, value) => {
        const cells = { ...newRow, [key]: value };
        setNewRow(cells);
        if (!readyToCreate(cells) || creating.current) return;
        creating.current = true;
        setSaveError("");
        setSaving((n) => n + 1);
        changed();
        try {
            const created = await createOrderSheetRow(cells);
            setOrders((prev) => [created, ...prev]);
            setNewRow(null);
            setSavedOnce(true);
        } catch (err) {
            setSaveError(err.message);
        } finally {
            creating.current = false;
            changed();
            setSaving((n) => n - 1);
        }
    };

    const addColumn = async (e) => {
        e.preventDefault();
        setSaveError("");
        try {
            const added = await addSheetColumn(newColumn);
            setColumns((all) => [...all, added]);
            setNewColumn(null);
        } catch (err) {
            setSaveError(err.message);
        }
    };

    const removeColumn = async ({ id, name }) => {
        if (
            !window.confirm(
                `Take the ${name} column off the Order sheet? What's typed in it is kept if the column is added again, and it stays in the Google sheet but no longer syncs.`,
            )
        )
            return;
        setSaveError("");
        try {
            await removeSheetColumn(id);
            setColumns((all) => all.filter((column) => column.id !== id));
        } catch (err) {
            setSaveError(err.message);
        }
    };

    const header = (cell) => {
        const column = cell.removable && columns.find(({ key }) => key === cell.key);
        return (
            <th key={cell.key} scope="col" className={`is-editable${cell.time ? " is-time" : ""}`}>
                {cell.label}
                {cell.sub && <small>{cell.sub}</small>}
                {column && (
                    <button
                        type="button"
                        className="sheet-column-remove"
                        aria-label={`Remove the ${cell.label} column`}
                        onClick={() => removeColumn(column)}
                    >
                        ×
                    </button>
                )}
            </th>
        );
    };

    return (
        <section className="admin-panel order-sheet" aria-labelledby="order-sheet-title">
            <div className="order-sheet-head">
                <div>
                    <h2 id="order-sheet-title">Order sheet</h2>
                    <p className="tab-hint">
                        Every day's orders, newest first, with all the priority orders together below the regular ones,
                        shared by everyone in sales. Click any cell but the date, number and status to change it; it
                        saves when you leave the cell, and the others see it within a few seconds. Put several invoice
                        numbers one above the other with Shift+Enter. Click one of today's queue numbers to open its
                        ticket.
                    </p>
                </div>
                <p className="order-sheet-status" role="status">
                    {saving > 0 ? "Saving..." : savedOnce ? "All changes saved" : ""}
                </p>
                <div className="order-sheet-tools">
                    <GoogleSheetSync />
                    <div className="sheet-tool-row">
                        <button
                            type="button"
                            className="sheet-tool"
                            disabled={newRow !== null}
                            onClick={() => setNewRow({})}
                        >
                            Add row
                        </button>
                        <button
                            type="button"
                            className="sheet-tool"
                            disabled={newColumn !== null}
                            onClick={() => setNewColumn("")}
                        >
                            Add column
                        </button>
                    </div>
                    <input
                        type="search"
                        className="order-status-search"
                        placeholder="Search name, number or date"
                        aria-label="Search the sheet by customer name, ticket number or date"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {newColumn !== null && (
                <form className="sheet-new-column" onSubmit={addColumn}>
                    <label htmlFor="sheet-new-column-name">New column's name</label>
                    <input
                        id="sheet-new-column-name"
                        autoFocus
                        maxLength={MAX_COLUMN_NAME}
                        value={newColumn}
                        onChange={(e) => setNewColumn(e.target.value)}
                    />
                    <button type="submit" className="sheet-tool" disabled={!newColumn.trim()}>
                        Add
                    </button>
                    <button type="button" className="sheet-tool" onClick={() => setNewColumn(null)}>
                        Cancel
                    </button>
                </form>
            )}

            {(saveError || error) && (
                <p className="field-error" role="alert">
                    {saveError || `Couldn't refresh the sheet: ${error}`}
                </p>
            )}

            {loading ? (
                <p className="admin-status">Loading the sheet...</p>
            ) : visible.length === 0 && newRow === null ? (
                <p className="admin-empty">{orders.length === 0 ? "No orders yet." : "No orders match."}</p>
            ) : (
                <div className="sheet-frame">
                    {/* each column has its share of the width (see .sheet-table col), and the sheet scrolls inside this frame; long
                        text wraps inside its cell, and a long queue code widens its column */}
                    <table className="sheet-table" style={/** @type {any} */ ({ "--sheet-added": columns.length })}>
                        <colgroup>
                            <col className="c-date" />
                            <col className="c-que" />
                            {allCells.map((cell) => (
                                <col key={cell.key} className={cell.col} />
                            ))}
                            <col className="c-status" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <th scope="col">Que</th>
                                {allCells.map(header)}
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {newRow !== null && (
                                <tr className="sheet-new-row">
                                    <td className="sheet-date">New</td>
                                    <th scope="row" className="sheet-que">
                                        —
                                    </th>
                                    {allCells.map((cell) => (
                                        <SheetCell
                                            key={cell.key}
                                            cell={cell}
                                            value={newRow[cell.key] ?? ""}
                                            label={`${cell.label} for the new row`}
                                            onSave={(value) => saveNewCell(cell.key, value)}
                                        />
                                    ))}
                                    <td className="sheet-status">
                                        <span className="sheet-edit">
                                            Needs a customer's name, a type of order and an invoice number.
                                        </span>
                                        <button type="button" className="sheet-tool" onClick={() => setNewRow(null)}>
                                            Cancel
                                        </button>
                                    </td>
                                </tr>
                            )}
                            {visible.map((o) => {
                                const ticket = ticketOf(o);
                                return (
                                    <tr key={o.id}>
                                        <td className="sheet-date">{sheetDate(o.createdAt)}</td>
                                        <th scope="row" className="sheet-que">
                                            {/* Customer order only opens today's tickets */}
                                            {!o.isToday ? (
                                                <TicketNumber order={o} />
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="sheet-que-btn"
                                                    title={`Open ${ticket} on Queue ticket`}
                                                    onClick={() => onOpen(o.queueNum)}
                                                >
                                                    <TicketNumber order={o} />
                                                </button>
                                            )}
                                        </th>
                                        {allCells.map((cell) => (
                                            <SheetCell
                                                key={cell.key}
                                                cell={cell}
                                                value={valueOf(o, cell.key)}
                                                label={`${cell.label} for ${ticket}`}
                                                onSave={(value) => save(o, cell, value)}
                                            />
                                        ))}
                                        <td className="sheet-status">
                                            <StatusCell order={o} />
                                        </td>
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
