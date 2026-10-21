import { MAX_CONCERN } from '../data/customerReport.js';

// shown in the Customer order form in place of the order list when the purpose is Customer Report;
// the form's own Purpose and Submit cover the rest, so this is just the concern
export default function CustomerReport({ value, onChange, error }) {
    const near = value.length > MAX_CONCERN * 0.8;

    return (
        <div className="field">
            <label className="field-label" htmlFor="customer-concern">Customer's concern</label>
            <textarea
                id="customer-concern"
                className={`text-input concern-input ${error ? "has-error" : ""}`}
                rows={4}
                maxLength={MAX_CONCERN}
                placeholder="Describe the customer's concern..."
                aria-describedby="customer-concern-count"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            <p id="customer-concern-count" className={`field-hint concern-count${near ? " is-near" : ""}`}>
                {value.length} / {MAX_CONCERN}
            </p>
            {error && <p className="field-error">{error}</p>}
        </div>
    );
}
