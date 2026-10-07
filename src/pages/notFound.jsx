import { Link } from 'react-router';
import '../style/customerOrder.css';

import Header from '../components/header.jsx';

export default function NotFound() {
    return (
        <>
            <Header />
            <main className="order-page">
                <h1>Page not found</h1>
                <Link to="/" className="submit-btn not-found-link">Back to ordering</Link>
            </main>
        </>
    );
}
