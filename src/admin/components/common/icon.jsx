// a line icon drawn from one 24 × 24 SVG path, in the text's color; its size comes from the class
export default function Icon({ d, className = "line-icon" }) {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
            <path d={d} />
        </svg>
    );
}
