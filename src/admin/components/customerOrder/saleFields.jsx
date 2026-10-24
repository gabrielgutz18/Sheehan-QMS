import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { todayKey } from '../../../data/pickupDate.js';

// the fields of Customer order: a label over each and its error under it
// narrow: the short ones (salesman, payment status, team, pick-up date) are half as wide, as on the paper form
function Field({ id, label, optional, narrow, error, children }) {
    return (
        <div className={`admin-field sale-field${narrow ? " is-narrow" : ""}`}>
            <label id={`${id}-label`} htmlFor={id}>
                {label}
                {optional && <span className="field-optional"> (optional)</span>}
            </label>
            {children}
            {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
        </div>
    );
}

const errorProps = (id, error) => ({
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
    className: error ? "has-error" : undefined,
});

export function SaleText({ id, label, value, onChange, error, optional, narrow, maxLength, placeholder }) {
    return (
        <Field id={id} label={label} optional={optional} narrow={narrow} error={error}>
            <input
                id={id}
                type="text"
                autoComplete="off"
                maxLength={maxLength}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                {...errorProps(id, error)}
            />
        </Field>
    );
}

// the tabs along the top of Customer order's card, like a browser's: the one picked joins the card below it
// tabs: [{ id, label }]; each tab's panel is `${id}-panel` (see the tabpanels in customerOrderPage.jsx)
// the arrow keys, Home and End move between them, as in any tab list
export function SaleTabs({ label, tabs, current, onChange }) {
    const listRef = useRef(null);

    const handleKey = (e) => {
        const at = tabs.findIndex((tab) => tab.id === current);
        const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const tab = tabs[(next + tabs.length) % tabs.length];
        onChange(tab.id);
        listRef.current.querySelector(`#${tab.id}`).focus();
    };

    return (
        <div className="sale-tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={handleKey}>
            {tabs.map(({ id, label: tabLabel }) => (
                <button
                    key={id}
                    id={id}
                    type="button"
                    role="tab"
                    className="sale-tab"
                    aria-selected={id === current}
                    aria-controls={`${id}-panel`}
                    tabIndex={id === current ? 0 : -1}
                    onClick={() => onChange(id)}
                >
                    {tabLabel}
                </button>
            ))}
        </div>
    );
}

// a time of day, which the field gives as HH:MM (24-hour) whatever way the computer shows it; "" when left blank
export function SaleTime({ id, label, value, onChange, optional, narrow }) {
    return (
        <Field id={id} label={label} optional={optional} narrow={narrow}>
            <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />
        </Field>
    );
}

// options: the choices; the empty first one reads `placeholder`
export function SaleSelect({ id, label, value, onChange, options, placeholder, error, optional, narrow }) {
    return (
        <Field id={id} label={label} optional={optional} narrow={narrow} error={error}>
            <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...errorProps(id, error)}>
                <option value="">{placeholder}</option>
                {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </Field>
    );
}

// the 4px between the field and its list, and a little room to spare at the edge of the window
const MENU_EDGE = 12;

// a field that opens a list to tick one or more of, e.g. Roofings and Steel (Type of order)
// they're kept in the list's order whatever order they're ticked in, so the queue number's letters (one set per type,
// "RT" for Roofings and Tire) don't depend on the clicking
export function CheckPicker({ id, label, names, value, onChange, placeholder, optional, error }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    const menuRef = useRef(null);

    // a name that has since left the list stays on the tickets that have it, at the end, until it's unticked
    const options = [...names, ...value.filter((name) => !names.includes(name))];
    const toggle = (name) => onChange(options.filter((n) => (n === name ? !value.includes(n) : value.includes(n))));

    // close when clicking outside or pressing Escape
    useEffect(() => {
        if (!open) return;
        const handleClick = (e) => {
            if (!containerRef.current?.contains(e.target)) setOpen(false);
        };
        const handleKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    // the list opens downward, or upward when there's more room above (Team name is near the bottom of the form),
    // and is kept inside the window: hanging past the end of the page would make the page longer
    // set on the element itself, before it's painted, since it's measured from where the field sits on screen
    useLayoutEffect(() => {
        if (!open) return;
        const menu = menuRef.current;
        const place = () => {
            menu.dataset.side = "down";
            menu.style.removeProperty("--menu-room");
            const field = containerRef.current.getBoundingClientRect();
            const topbar = document.querySelector(".admin-topbar")?.getBoundingClientRect().bottom ?? 0;
            const below = window.innerHeight - field.bottom - MENU_EDGE;
            const above = field.top - Math.max(topbar, 0) - MENU_EDGE;
            const up = menu.offsetHeight > below && above > below;
            menu.dataset.side = up ? "up" : "down";
            menu.style.setProperty("--menu-room", `${Math.max(0, Math.floor(up ? above : below))}px`);
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    }, [open]);

    return (
        <Field id={id} label={label} optional={optional} error={error}>
            <div className={`type-picker${open ? " is-open" : ""}`} ref={containerRef}>
                <button
                    id={id}
                    type="button"
                    className={`type-trigger${error ? " has-error" : ""}`}
                    aria-expanded={open}
                    aria-controls={`${id}-menu`}
                    aria-labelledby={`${id}-label ${id}-value`}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onClick={() => setOpen((prev) => !prev)}
                >
                    <span id={`${id}-value`} className={`type-trigger-text${value.length ? "" : " is-placeholder"}`}>
                        {value.length ? value.join(", ") : placeholder}
                    </span>
                    <svg className="type-chevron" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M4 7l6 6 6-6" />
                    </svg>
                </button>

                {open && (
                    <fieldset id={`${id}-menu`} className="type-menu" ref={menuRef}>
                        <legend className="visually-hidden">{label}</legend>
                        {options.map((name) => (
                            <label key={name} className="type-option">
                                <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} />
                                {name}
                            </label>
                        ))}
                    </fieldset>
                )}
            </div>
        </Field>
    );
}

// the invoices on Customer order, one row each: its number and the type of order it's for, picked from the types
// ticked above (e.g. 43355521 for Roofings); Add invoice adds a row and × takes one away, leaving at least one
// invoices: [{ key, invoiceNo, type }]; errors: { [key]: { invoiceNo?, type? } }
export function InvoiceFields({ invoices, types, onChange, onAdd, onRemove, errors = {}, maxLength, max }) {
    const update = (key, field) => (e) =>
        onChange(invoices.map((invoice) => (invoice.key === key ? { ...invoice, [field]: e.target.value } : invoice)));

    return (
        <fieldset className="invoice-fields">
            <legend>Invoices</legend>
            {invoices.map(({ key, invoiceNo, type }, i) => {
                const error = errors[key] ?? {};
                const id = `sale-invoice-${key}`;
                const message = error.invoiceNo || error.type;
                return (
                    <div key={key} className="invoice-entry">
                        <div className="invoice-row">
                            <input
                                id={id}
                                type="text"
                                autoComplete="off"
                                maxLength={maxLength}
                                placeholder="Invoice number"
                                aria-label={`Invoice ${i + 1} number`}
                                value={invoiceNo}
                                onChange={update(key, "invoiceNo")}
                                aria-invalid={Boolean(error.invoiceNo)}
                                aria-describedby={message ? `${id}-error` : undefined}
                                className={error.invoiceNo ? "has-error" : undefined}
                            />
                            <select
                                aria-label={`Invoice ${i + 1} type of order`}
                                value={types.includes(type) ? type : ""}
                                disabled={types.length === 0}
                                onChange={update(key, "type")}
                                aria-invalid={Boolean(error.type)}
                                aria-describedby={message ? `${id}-error` : undefined}
                                className={error.type ? "has-error" : undefined}
                            >
                                <option value="">{types.length ? "Type..." : "Pick a type of order first"}</option>
                                {types.map((name) => <option key={name} value={name}>{name}</option>)}
                            </select>
                            <button
                                type="button"
                                className="invoice-remove"
                                aria-label={`Remove invoice ${i + 1}`}
                                disabled={invoices.length === 1}
                                onClick={() => onRemove(key)}
                            >
                                ×
                            </button>
                        </div>
                        {message && <p className="field-error" id={`${id}-error`}>{message}</p>}
                    </div>
                );
            })}
            {invoices.length < max && (
                <button type="button" className="link-btn invoice-add" onClick={onAdd}>+ Add invoice</button>
            )}
        </fieldset>
    );
}

// a customer who comes back on a later day for the items: tick Returning and pick the day
export function ReturningField({ returning, pickupDate, onReturning, onPickupDate, error }) {
    return (
        <div className="sale-returning">
            <label className="sale-check">
                <input type="checkbox" checked={returning} onChange={(e) => onReturning(e.target.checked)} />
                Returning: the customer picks up the items on a later day
            </label>
            {returning && (
                <Field id="sale-pickup" label="Pick-up date" narrow error={error}>
                    <input
                        id="sale-pickup"
                        type="date"
                        min={todayKey()}
                        value={pickupDate}
                        onChange={(e) => onPickupDate(e.target.value)}
                        {...errorProps("sale-pickup", error)}
                    />
                </Field>
            )}
        </div>
    );
}
