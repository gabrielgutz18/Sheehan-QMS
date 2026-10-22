// the roof color on a roofing item, on tickets taken before invoices (Customer order no longer lists items);
// values must match the backend
const roofingColors = [
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
];

export const colorLabel = (value) => roofingColors.find((c) => c.value === value)?.label ?? value;
