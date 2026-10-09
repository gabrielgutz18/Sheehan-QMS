import roofingColors from '../data/roofingColors.js';

// color swatches beside a roofing order; optional, so tapping the chosen color again clears it
export default function RoofingColorSelector({ value, onChange, label }) {
    return (
        <div className="color-picker" role="radiogroup" aria-label={label}>
            {roofingColors.map((color) => {
                const selected = value === color.value;
                return (
                    <button
                        key={color.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={color.label}
                        title={color.label}
                        className={`color-swatch${selected ? " is-selected" : ""}`}
                        style={{ "--swatch": color.swatch }}
                        onClick={() => onChange(selected ? "" : color.value)}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </button>
                );
            })}
        </div>
    );
}
