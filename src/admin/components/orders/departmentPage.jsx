import PageTabs from "../common/pageTabs.jsx";
import DepartmentHistory from "./departmentHistory.jsx";
import DepartmentLine from "./departmentLine.jsx";
import LoadingCrew from "./loadingCrew.jsx";
import { DEPARTMENTS } from "../../../data/loadingAreas.js";

// the Loading, Service, Chassis and Hardware pages: today's line, where the crew calls and loads, and the History of every
// order handed over to them, as tabs (?tab=history); the Loading page has a Crew tab too (?tab=crew), its crew by area
/** @param {{ department: string }} props */
export default function DepartmentPage({ department }) {
    return (
        <PageTabs
            label={`${DEPARTMENTS[department]} line, history${department === "loading" ? " and crew" : ""}`}
            tabs={[
                { key: "line", label: "Line", page: <DepartmentLine department={department} /> },
                { key: "history", label: "History", page: <DepartmentHistory department={department} /> },
                ...(department === "loading" ? [{ key: "crew", label: "Crew", page: <LoadingCrew /> }] : []),
            ]}
        />
    );
}
