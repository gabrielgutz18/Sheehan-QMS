import { useState } from "react";

// larger originals are refused before the browser tries to open them
const MAX_ORIGINAL_MB = 15;

// the middle of the picture, as much of it as fits the shape, shrunk to width by height, as a JPEG
async function cropPicture(file, width, height) {
    const bitmap = await createImageBitmap(file);
    const shape = width / height;
    const cropWidth = Math.min(bitmap.width, bitmap.height * shape);
    const cropHeight = cropWidth / shape;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    // a see-through PNG goes on white, not black
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(
        bitmap,
        (bitmap.width - cropWidth) / 2,
        (bitmap.height - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        width,
        height,
    );
    bitmap.close();
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

// picking a picture for your account on My account: checks it, crops it to width by height and saves it
// upload(blob) and remove() give the updated account, which goes to onChange
// gives { busy, error, pick(file), remove() }
export default function usePictureUpload({ width, height, upload, remove, onChange }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const run = async (action) => {
        setBusy(true);
        setError("");
        try {
            onChange(await action());
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const pick = (file) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError("Choose a picture (JPEG, PNG or WebP).");
            return;
        }
        if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) {
            setError(`That picture is over ${MAX_ORIGINAL_MB} MB. Choose a smaller one.`);
            return;
        }
        run(async () => {
            let picture;
            try {
                picture = await cropPicture(file, width, height);
            } catch {
                throw new Error("This browser can't open that picture. Try a JPEG or PNG.");
            }
            return upload(picture);
        });
    };

    return { busy, error, pick, remove: () => run(remove) };
}
