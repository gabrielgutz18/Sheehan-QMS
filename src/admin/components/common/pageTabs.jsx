import { useSearchParams } from 'react-router';

// a few pages under one menu item, as tabs, e.g. Display & printer; the open tab is in the address (?tab=printer),
// so a link or an old address opens the right one, and Back goes to the tab before
// label: what the tabs are, for screen readers; tabs: [{ key, label, page }], the first open when the address names none
export default function PageTabs({ label, tabs }) {
    const [params, setParams] = useSearchParams();
    const open = tabs.find(({ key }) => key === params.get("tab")) ?? tabs[0];

    return (
        <>
            <div className="folder-tabs page-tabs" role="tablist" aria-label={label}>
                {tabs.map(({ key, label: tabLabel }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={open.key === key}
                        className="folder-tab"
                        onClick={() => setParams({ tab: key })}
                    >
                        {tabLabel}
                    </button>
                ))}
            </div>
            <div role="tabpanel" aria-label={open.label}>
                {open.page}
            </div>
        </>
    );
}
