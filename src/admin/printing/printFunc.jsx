// prints the ticket on screen through the browser's print window: its preview shows just the ticket (the print
// layout in src/style/customerOrder.css), and staff pick the printer there, e.g. one shared from another computer
// on the network; nothing prints by itself
export default function PrintFunc() {
    return (
        <>
            <button type="button" className="submit-btn" onClick={() => window.print()}>
                Print ticket
            </button>
            <p className="print-hint">Opens the print preview, where you pick the printer.</p>
        </>
    );
}
