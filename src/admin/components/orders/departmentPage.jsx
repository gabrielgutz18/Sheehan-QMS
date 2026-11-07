import PageTabs from "../common/pageTabs.jsx";
import DepartmentHistory from "./departmentHistory.jsx";
import DepartmentLine from "./departmentLine.jsx";
import { DEPARTMENTS } from "../../../data/loadingAreas.js";

// the Loading, TBA, Chassis and Hardware pages: today's line, where the crew calls and loads, and the History of every
// order handed over to them, as two tabs (?tab=history)
/** @param {{ department: string }} props */
export default function DepartmentPage({ department }) {
    return (
        <PageTabs
            label={`${DEPARTMENTS[department]} line and history`}
            tabs={[
                { key: "line", label: "Line", page: <DepartmentLine department={department} /> },
                { key: "history", label: "History", page: <DepartmentHistory department={department} /> },
            ]}
        />
    );
}
