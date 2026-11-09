import DepartmentPage from "../components/orders/departmentPage.jsx";

// the Logistics department's counter, the same as the Loading page: the customers sales has handed over with Plain
// Sheet, Stainless Steel or Insulations on their order (src/data/loadingAreas.js); one who bought from other departments
// too goes to each in turn
export default function LogisticsPage() {
    return <DepartmentPage department="logistics" />;
}
