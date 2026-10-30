import DepartmentLine from '../components/orders/departmentLine.jsx';

// the loading crew's counter: the customers sales has handed over with something to load at Roofings or Steel
// (src/data/loadingAreas.js); the TBA and Hardware pages are the same for theirs
export default function LoadingPage() {
    return <DepartmentLine department="loading" />;
}
