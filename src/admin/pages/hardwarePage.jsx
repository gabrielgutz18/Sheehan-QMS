import DepartmentPage from "../components/orders/departmentPage.jsx";

// the Hardware department's counter, the same as the Loading page: the customers sales has handed over with Hardwares
// on their order (src/data/loadingAreas.js); one who bought roofing too goes to loading and Hardware in turn
export default function HardwarePage() {
    return <DepartmentPage department="hardware" />;
}
