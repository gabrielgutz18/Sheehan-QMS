import { CREW_AREAS } from "../../../data/loadingAreas.js";

// the Loading tab's own tabs on Accounts, drawn like a browser's tabs: All loading, then the crew's areas (Roofings,
// Steel, Logistics) and Not assigned for those an admin hasn't set yet, each with its head count; the crew is still one
// shared line, so this only shows who works where
// accounts: the loading accounts; value: "all", an area or "" (not assigned); onChange(value) picks a tab
export default function CrewAreaTabs({ accounts, value, onChange }) {
    const count = (area) => accounts.filter((a) => a.loadingArea === area).length;
    const tabs = [
        { key: "all", label: "All loading", total: accounts.length },
        ...CREW_AREAS.map((area) => ({ key: area, label: area, total: count(area) })),
    ];
    // only when someone has no area yet, so a fully set crew shows just its three areas
    if (count("") > 0) tabs.push({ key: "", label: "Not assigned", total: count("") });

    return (
        <div className="crew-tabs" role="tablist" aria-label="Loading areas">
            {tabs.map(({ key, label, total }) => (
                <button
                    key={key || "none"}
                    type="button"
                    role="tab"
                    aria-selected={value === key}
                    className={`crew-tab${key === "" ? " crew-tab--none" : ""}`}
                    onClick={() => onChange(key)}
                >
                    <span className="crew-tab-label">{label}</span>
                    <span className="crew-tab-count">{total}</span>
                </button>
            ))}
        </div>
    );
}
