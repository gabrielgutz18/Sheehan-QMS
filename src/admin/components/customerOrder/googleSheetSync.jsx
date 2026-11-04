import { useEffect, useState } from 'react';

import { getOrderSheetSync } from '../../api/adminOrderController.js';
import { editTime } from '../../data/orderEdits.js';

const REFRESH_MS = 5000;

const STATE_LABELS = {
    waiting: "Waiting to sync",
    saving: "Saving...",
    saved: "Saved",
    failed: "Sync failed",
};

// the Order sheet's copy in Google Sheets: whether it's saving or failing, so sales know if they can trust what's there,
// and a button to open it; nothing shows where no sheet is set up. A failed sync loses nothing: the orders are still
// here, and the server keeps trying until the sheet has them
export default function GoogleSheetSync() {
    const [sync, setSync] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        // if this can't be fetched, the sheet's own refresh message already says the server can't be reached, so the
        // last answer stays up
        const load = () => getOrderSheetSync({ signal }).then(setSync).catch(() => {});
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    if (!sync || sync.state === "off") return null;

    return (
        <div className="sheet-sync">
            <p className={`sheet-sync-status is-${sync.state}`} role="status">
                <strong>Google Sheet: {STATE_LABELS[sync.state]}</strong>
                {sync.state === "failed" && <span>{sync.error}</span>}
                {sync.state === "failed" && <span>Retrying; no orders are lost</span>}
                {sync.savedAt && <span>Last saved {editTime(sync.savedAt)}</span>}
            </p>
            {sync.link && (
                <a className="admin-btn" href={sync.link} target="_blank" rel="noreferrer">
                    Open Google Sheet
                </a>
            )}
        </div>
    );
}
