import { useEffect, useRef, useState } from 'react';

import LifeCycleTable from './lifeCycleTable.jsx';

// windows this wide have room for the Order status board beside Customer order; narrower ones open it from the
// drawer there too
export const BOARD_DOCKS = "(min-width: 1280px)";

// the menu button at the right of the top bar, and the Order status board it slides in from the right, so it can be
// checked from any page; the board only loads (and keeps refreshing) while it's open
// Escape, the close button or a click on the shade beside it closes it
export default function OrderStatusDrawer() {
    const [open, setOpen] = useState(false);
    const dialogRef = useRef(null);

    // a modal dialog: the page behind it can't be clicked or tabbed into while it's open
    useEffect(() => {
        const dialog = dialogRef.current;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <>
            <button type="button" className="status-drawer-btn" aria-haspopup="dialog" aria-expanded={open}
                aria-controls="order-status-drawer" onClick={() => setOpen(true)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="status-drawer-label">Order status</span>
            </button>

            <dialog id="order-status-drawer" ref={dialogRef} className="status-drawer" aria-label="Order status"
                onClose={() => setOpen(false)} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
                <div className="status-drawer-body">
                    {open && (
                        <LifeCycleTable compact action={(
                            <button type="button" className="status-drawer-close" aria-label="Close order status"
                                onClick={() => setOpen(false)}>
                                ×
                            </button>
                        )} />
                    )}
                </div>
            </dialog>
        </>
    );
}
