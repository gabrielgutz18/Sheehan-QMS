import { useEffect, useRef, useState } from 'react';

import { todayKey } from '../../data/pickupDate.js';

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

export function SaleText({ id, label, value, onChange, error, narrow, maxLength, placeholder }) {
    return (
        <Field id={id} label={label} narrow={narrow} error={error}>
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

// a field that opens a list to tick one or more of, e.g. Roofings and Steel (Type of order, Team name)
// they're kept in the list's order whatever order they're ticked in, so the first type (which gives the queue
// number its letters) doesn't depend on the clicking
export function CheckPicker({ id, label, names, value, onChange, placeholder, optional, error }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

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
                    <fieldset id={`${id}-menu`} className="type-menu">
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
