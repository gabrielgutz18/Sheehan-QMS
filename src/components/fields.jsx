import { useEffect, useRef, useState } from "react";
import '../style/fields.css';
import purpose from '../data/purpose.js';
import { ROOFING_PURPOSE } from '../data/roofingColors.js';
import RoofingColorSelector from './roofingColorSelector.jsx';

export function NameField({ value, onChange, error }) {
    return (
        <div className="field">
            <label className="field-label" htmlFor="customer-name">Name</label>
            <input
                id="customer-name"
                className={`text-input ${error ? "has-error" : ""}`}
                type="text"
                placeholder="Your name"
                autoComplete="name"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {error && <p className="field-error">{error}</p>}
        </div>
    );
}

export function PurposeDropdown({ value, onChange, error }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    const toggleDropdown = () => setIsOpen((prev) => !prev);

    // close when clicking outside or pressing Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e) => {
            if (!containerRef.current?.contains(e.target)) setIsOpen(false);
        };
        const handleKey = (e) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [isOpen]);

    return (
        <div className="field" ref={containerRef}>
            <div className={`dropdown-container ${isOpen ? "open" : ""}`}>
                <button
                    type="button"
                    className={`dropdown-trigger ${error ? "has-error" : ""}`}
                    onClick={toggleDropdown}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                >
                    <span className="dropdown-title">{value || "Purpose"}</span>
                    <svg className="chevron" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M4 7l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                <ul className="dropdown-menu" role="listbox" aria-label="Purpose">
                    {purpose.map((item) => (
                        <li key={item.name} className="dropdown-item">
                            <button
                                type="button"
                                role="option"
                                aria-selected={value === item.name}
                                tabIndex={isOpen ? 0 : -1}
                                className={value === item.name ? "selected" : ""}
                                onClick={() => {
                                    onChange(item.name);
                                    setIsOpen(false);
                                }}
                            >
                                {item.name}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            {error && <p className="field-error">{error}</p>}
        </div>
    );
}
export function OrderField({ orders, purpose, onChange, error }) {
    const pickColor = purpose === ROOFING_PURPOSE;

    const updateOrder = (id, changes) =>
        onChange(orders.map((o) => (o.id === id ? { ...o, ...changes } : o)));

    const addOrder = () =>
        onChange([...orders, { id: crypto.randomUUID(), item: "", qty: 0, color: "" }]);

    const removeOrder = (id) => onChange(orders.filter((o) => o.id !== id));

    // the list scrolls inside a fixed area, so bring a newly added row into view and focus it
    const listRef = useRef(null);
    const prevCount = useRef(orders.length);
    useEffect(() => {
        if (orders.length > prevCount.current) {
            const inputs = listRef.current?.querySelectorAll(".order-input");
            inputs?.[inputs.length - 1]?.focus();
        }
        prevCount.current = orders.length;
    }, [orders.length]);

    return (
        <div className="field order-field">
            <span className="field-label">Order</span>
            {pickColor && <p className="field-hint">Pick a roof color for each item, or leave it blank.</p>}

            <ul className="order-list" ref={listRef}>
                {orders.map((order, index) => (
                    <li key={order.id} className="order-row">
                        <input
                            className="text-input order-input"
                            type="text"
                            placeholder="Please input your order"
                            aria-label={`Order item ${index + 1}`}
                            value={order.item}
                            onChange={(e) => updateOrder(order.id, { item: e.target.value })}
                        />

                        <div className="stepper">
                            <button
                                type="button"
                                className="step-btn"
                                aria-label="Decrease quantity"
                                disabled={order.qty <= 0}
                                onClick={() => updateOrder(order.id, { qty: Math.max(0, order.qty - 1) })}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                            </button>
                            <input
                                className="qty-input"
                                type="number"
                                min="0"
                                inputMode="numeric"
                                aria-label={`Quantity for order ${index + 1}`}
                                placeholder="0"
                                // controlled so the +/- buttons show up here; 0 renders as empty so typing doesn't leave a leading "0"
                                value={order.qty === 0 ? "" : order.qty}
                                onChange={(e) => {
                                    const qty = parseInt(e.target.value, 10);
                                    updateOrder(order.id, { qty: Number.isNaN(qty) ? 0 : Math.max(0, qty) });
                                }}
                            />
                            <button
                                type="button"
                                className="step-btn"
                                aria-label="Increase quantity"
                                onClick={() => updateOrder(order.id, { qty: order.qty + 1 })}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
                            </button>
                        </div>

                        {pickColor && (
                            <RoofingColorSelector
                                value={order.color}
                                onChange={(color) => updateOrder(order.id, { color })}
                                label={`Roof color for order ${index + 1}`}
                            />
                        )}

                        {orders.length > 1 && (
                            <button
                                type="button"
                                className="remove-btn"
                                aria-label={`Remove order ${index + 1}`}
                                onClick={() => removeOrder(order.id)}
                            >
                                ×
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {error && <p className="field-error">{error}</p>}

            <button type="button" className="add-more" onClick={addOrder}>
                Add more?
            </button>
        </div>
    );
}
