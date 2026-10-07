//func
import '../style/header.css';

//assets
import logo from '../assets/SheehanLogo.png';

export default function Header() {
    return (
        <header className="header">
            {/* customer side */}
            <nav className="navbar">
                <div className="brand">
                    <img className="logo" src={logo} alt="Sheehan Inc. logo" />
                    <h2 className="compname">Sheehan Inc.</h2>
                </div>
                <p className="customer-note">Customer</p>
            </nav>
        </header>
    );
}
