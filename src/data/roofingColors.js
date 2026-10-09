// the color picker only shows for this purpose; must match a name in purpose.js
export const ROOFING_PURPOSE = "Roofings";

// values must match the backend; swatch is what the button is filled with
const roofingColors = [
    { value: "red", label: "Red", swatch: "#c8202a" },
    { value: "blue", label: "Blue", swatch: "#1d4ed8" },
    { value: "green", label: "Green", swatch: "#15803d" },
];

export const colorLabel = (value) => roofingColors.find((c) => c.value === value)?.label ?? value;

export default roofingColors;
