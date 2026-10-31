import { ROLE_LABELS } from '../../auth/roles.js';

// the departments, in the order the sidebar has their pages; each is a kind of staff account
const DEPARTMENTS = ["admin", "sales", "loading", "tba", "chassis", "hardware", "security", "cashier", "inventory", "developer"];

// folder-style tabs for the Accounts page: All, then one per department that has accounts, each with its head count
// accounts: the list from listUsers(), or null while it loads; value: "all" or a role; onChange(value) picks a tab
export default function DepartmentTabs({ accounts, value, onChange }) {
    const count = (role) => accounts.filter((a) => a.role === role).length;
    const tabs = [
        { key: "all", label: "All", total: accounts.length },
        ...DEPARTMENTS.map((role) => ({ key: role, label: ROLE_LABELS[role], total: count(role) })).filter(({ total }) => total > 0),
    ];

    return (
        <div className="folder-tabs" role="tablist" aria-label="Departments">
            {tabs.map(({ key, label, total }) => (
                <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={value === key}
                    className="folder-tab"
                    onClick={() => onChange(key)}
                >
                    {label}
                    <span className="folder-tab-count">{total}</span>
                </button>
            ))}
        </div>
    );
}
