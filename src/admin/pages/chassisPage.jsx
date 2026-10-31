import DepartmentLine from '../components/orders/departmentLine.jsx';

// the Chassis department's counter, the same as the Loading page: the customers sales has handed over with a Chassis on
// their order (src/data/loadingAreas.js); one who bought roofing, a Tire, Battery or Hardwares too goes to each
// department in turn
export default function ChassisPage() {
    return <DepartmentLine department="chassis" />;
}
