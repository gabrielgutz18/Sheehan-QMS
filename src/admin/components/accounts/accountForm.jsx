import { useState } from 'react';

import { updateMyAccount } from '../../api/accountController.js';

// the account's details, saved with Update account; onChange gets the updated account
const FIELDS = [
    { key: "firstName", label: "First name", required: true, maxLength: 40, autoComplete: "given-name" },
    { key: "middleName", label: "Middle name", maxLength: 40, autoComplete: "additional-name" },
    { key: "surname", label: "Surname", required: true, maxLength: 40, autoComplete: "family-name" },
    { key: "employeeId", label: "Employee ID", maxLength: 30, placeholder: "e.g. SHN-0042" },
    { key: "department", label: "Department", maxLength: 60, placeholder: "e.g. Roofings" },
];
// the developers are the IT department: what each of them does, on their profile for staff to see
const DEVELOPER_FIELDS = [
    {
        key: "specialization",
        label: "Specialization",
        maxLength: 60,
        placeholder: "e.g. Web developer",
        list: "it-specializations",
    },
];
// a few the IT department has, to pick from or type over
const SPECIALIZATIONS = ["Software developer", "Web developer", "Network and systems", "IT support", "Hardware technician"];

// the fields this account has: a developer's specialization too
const fieldsFor = (account) => (account.role === "developer" ? [...FIELDS, ...DEVELOPER_FIELDS] : FIELDS);
const formFrom = (account) => Object.fromEntries(fieldsFor(account).map(({ key }) => [key, account[key] ?? ""]));

export default function AccountForm({ account, onChange }) {
    const fields = fieldsFor(account);
    const [form, setForm] = useState(() => formFrom(account));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const saved = formFrom(account);
    const changed = fields.some(({ key }) => form[key].trim() !== saved[key]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const updated = await updateMyAccount(form);
            onChange(updated);
            setForm(formFrom(updated));
            setNotice("Account updated.");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="account-details" onSubmit={submit}>
            {fields.map(({ key, label, required, ...input }) => (
                <label key={key} className={`admin-field account-field--${key}`}>
                    <span>
                        {label}
                        {!required && <span className="field-optional"> (optional)</span>}
                    </span>
                    <input
                        type="text"
                        required={required}
                        value={form[key]}
                        onChange={(e) => {
                            setNotice("");
                            setForm((prev) => ({ ...prev, [key]: e.target.value }));
                        }}
                        {...input}
                    />
                </label>
            ))}

            <datalist id="it-specializations">
                {SPECIALIZATIONS.map((name) => (
                    <option key={name} value={name} />
                ))}
            </datalist>

            {error && <p className="field-error account-details-full" role="alert">{error}</p>}
            {notice && <p className="admin-notice account-details-full" role="status">{notice}</p>}

            <div className="account-form-actions account-details-full">
                <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !changed}>
                    {saving ? "Updating..." : "Update account"}
                </button>
                {changed && !saving && (
                    <button type="button" className="admin-btn" onClick={() => setForm(saved)}>
                        Undo changes
                    </button>
                )}
            </div>
        </form>
    );
}
