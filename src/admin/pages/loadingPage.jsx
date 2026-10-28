import DepartmentLine from '../components/orders/departmentLine.jsx';

// the loading crew's counter: the customers sales has handed over with something to load at Roofings, Steel or TBA
// (src/data/loadingAreas.js); the Hardware page is the same for Hardware
export default function LoadingPage() {
    return <DepartmentLine department="loading" />;
}
