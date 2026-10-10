import { useCallback, useEffect, useRef, useState } from 'react';
import formatQueueNum from '../data/queueNum.js';
import { printReceipt } from './printReceipt.js';

// prints a saved ticket as soon as it shows, with a button to print it again,
// the "take your ticket" note once it has printed, and a popup when it can't print
// the status starts over whenever this remounts, e.g. when the receipt is shown again after an edit
export default function PrintFunc({ ticket }) {
    // "printing" | "done" | "failed"
    const [printStatus, setPrintStatus] = useState("printing");
    const dialogRef = useRef(null);
    const autoPrinted = useRef(false);

    // through the print service, or the USB printer approved in admin
    const print = useCallback(async () => {
        try {
            await printReceipt({
                queueNumber: formatQueueNum(ticket.queueNum, ticket.purpose),
                name: ticket.name,
                purpose: ticket.purpose,
                orders: ticket.orders,
                issuedAt: ticket.createdAt,
            });
            setPrintStatus("done");
        } catch (err) {
            // the customer only sees the popup; the real reason is for service support
            console.error("Ticket couldn't be printed", err);
            setPrintStatus("failed");
            if (!dialogRef.current.open) dialogRef.current.showModal();
        }
    }, [ticket]);

    // the ref stops StrictMode's second effect run from printing the ticket twice
    useEffect(() => {
        if (autoPrinted.current) return;
        autoPrinted.current = true;
        print();
    }, [print]);

    const handlePrint = () => {
        setPrintStatus("printing");
        print();
    };

    return (
        <>
            <button
                type="button"
                className="submit-btn"
                onClick={handlePrint}
                disabled={printStatus === "printing"}
            >
                {printStatus === "printing" ? "Printing..." : printStatus === "done" ? "Print again" : "Try again"}
            </button>
            {printStatus === "done" && (
                <p className="print-status" role="status">
                    Please take your ticket and hand it to the sales counter.
                </p>
            )}

            <dialog ref={dialogRef} className="print-error" aria-labelledby="print-error-title">
                <h2 id="print-error-title" className="print-error-title">Printer not found</h2>
                <p className="print-error-code">ERR_404</p>
                <p className="print-error-text">Please contact service support.</p>
                <button type="button" className="submit-btn" onClick={() => dialogRef.current.close()}>
                    OK
                </button>
            </dialog>
        </>
    );
}
