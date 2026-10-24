// helpers for the Excel exports (Sales on the dashboard, Customer orders on History)

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// hands the browser a workbook to save as fileName
export function downloadFile(buffer, fileName) {
    const blob = new Blob([buffer], { type: XLSX });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// an image the app bundles (the logo) as a data: URL, which is how ExcelJS takes it
export const fileAsDataUrl = async (url) => {
    const blob = await (await fetch(url)).blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
