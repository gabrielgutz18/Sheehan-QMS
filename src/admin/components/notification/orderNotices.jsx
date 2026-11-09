import { useCallback, useEffect, useState } from "react";
import "../../style/orderNotices.css";

import { listNewOrders } from "../../api/loadingController.js";
import Icon from "../common/icon.jsx";

// as often as the chat pop-ups look for new messages
const REFRESH_MS = 5000;
// they stay up until closed, so more than this would cover the department's own line and its Call buttons
const MAX_SHOWN = 1;
// a hand-over note is only a heads-up, as the order is on the line by then
const NOTE_MS = 10000;
const CLOSE_ICON = "M6 6l12 12M18 6 6 18";

// the orders this person has closed, kept per tab like the chat pop-ups; blocked storage only means they come back
const storageKey = (userId) => `orderNoticesDismissed:${userId}`;
const loadDismissed = (userId) => {
    try {
        return JSON.parse(sessionStorage.getItem(storageKey(userId))) ?? [];
    } catch {
        return [];
    }
};
const saveDismissed = (userId, ids) => {
    try {
        sessionStorage.setItem(storageKey(userId), JSON.stringify(ids));
    } catch {
        // kept for as long as the page is open instead
    }
};

// each hand-over its own: sent back and handed over again is a new one
const noteKey = (order) => `${order.id}:${order.handedOver.at}`;

function CloseButton({ label, onClick }) {
    return (
        <button type="button" className="order-notice-close" aria-label={label} onClick={onClick}>
            <Icon d={CLOSE_ICON} className="admin-nav-icon" />
        </button>
    );
}

// the small ticket in the pop-up, only what the department needs to know what's coming
function OrderNotice({ order, onDismiss }) {
    return (
        <div className="order-notice">
            <div className="order-notice-head">
                <strong>New order made from sales</strong>
                <CloseButton label={`Dismiss ${order.ticket}`} onClick={() => onDismiss(order.id)} />
            </div>
            <div className="order-notice-body">
                <span className="order-notice-ticket">{order.ticket}</span>
                <div className="order-notice-details">
                    <p className="order-notice-types">{order.types.join(", ")}</p>
                    {order.invoices.length > 0 && <p>INV: {order.invoices.join(", ")}</p>}
                    <p>{order.name}</p>
                </div>
            </div>
            <p className="order-notice-wait">Please wait for sales to hand over to your department.</p>
        </div>
    );
}

// one line that sales have handed the order over, gone by itself after NOTE_MS; Hardware hands small items over the
// counter, so nobody there waits for a runner
function HandOverNote({ order, department, onDismiss }) {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(noteKey(order)), NOTE_MS);
        return () => clearTimeout(timer);
    }, [order, onDismiss]);

    return (
        <div className="order-notice order-notice--note">
            <p>
                <strong>{order.ticket}</strong> · Sales {order.handedOver.by} handed it over to your department.
                {department !== "hardware" && " Please wait for runner."}
            </p>
            <CloseButton label={`Dismiss hand-over of ${order.ticket}`} onClick={() => onDismiss(noteKey(order))} />
        </div>
    );
}

// a department's pop-ups: a card for each order sales have made and not handed over yet, which stays until it's closed
// or the order is handed over, and a short note when one is; the region is always there, as screen readers only
// announce what's added to one they already know
export default function OrderNotices({ userId, department }) {
    const [orders, setOrders] = useState([]);
    const [notes, setNotes] = useState([]);
    const [dismissed, setDismissed] = useState(() => loadDismissed(userId));

    useEffect(() => {
        const controller = new AbortController();
        // the hand-overs already told about; null until the first read, as what happened before this person opened the
        // page is already on their line and needs no note
        let told = null;
        // the page's own requests say when the server can't be reached, and the next try may work
        const load = () =>
            listNewOrders({ signal: controller.signal })
                .then((found) => {
                    const list = found ?? [];
                    const handedOver = list.filter((order) => order.handedOver);
                    const fresh = told ? handedOver.filter((order) => !told.has(noteKey(order))) : [];
                    told = new Set([...(told ?? []), ...handedOver.map(noteKey)]);
                    setOrders(list);
                    if (fresh.length > 0) setNotes((shown) => [...shown, ...fresh]);
                })
                .catch(() => {});
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    const dismiss = (id) => {
        const next = [...dismissed, id];
        setDismissed(next);
        saveDismissed(userId, next);
    };
    const dismissNote = useCallback((key) => setNotes((shown) => shown.filter((order) => noteKey(order) !== key)), []);

    const waiting = orders.filter((order) => !order.handedOver && !dismissed.includes(order.id));
    const shown = waiting.slice(-MAX_SHOWN).toReversed();
    const more = waiting.length - shown.length;

    return (
        <div className="order-notices" role="region" aria-live="polite" aria-label="Orders on their way">
            {shown.map((order) => (
                <OrderNotice key={order.id} order={order} onDismiss={dismiss} />
            ))}
            {more > 0 && <p className="order-notice-more">+{more} more waiting</p>}
            {notes.map((order) => (
                <HandOverNote key={noteKey(order)} order={order} department={department} onDismiss={dismissNote} />
            ))}
        </div>
    );
}
