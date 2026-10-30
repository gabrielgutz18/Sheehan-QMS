import DepartmentLine from '../components/orders/departmentLine.jsx';

// the TBA department's counter, the same as the Loading page: the customers sales has handed over with a Tire, Battery
// or Chassis on their order (src/data/loadingAreas.js); one who bought roofing or Hardwares too goes to each department
// in turn
export default function TbaPage() {
    return <DepartmentLine department="tba" />;
}
