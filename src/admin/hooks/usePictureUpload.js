import { useEffect, useRef, useState } from "react";

import { cropOf, startView } from "../data/pictureCrop.js";

// larger originals are refused before the browser tries to open them
const MAX_ORIGINAL_MB = 15;

// the part of the picture in crop ({ x, y, w, h }, its own pixels; the middle, as much as fits, when left out), shrunk
// to width by height, as a JPEG
async function cropPicture(bitmap, width, height, crop = cropOf(bitmap, width / height, startView(bitmap))) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    // a see-through PNG goes on white, not black
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

const openPicture = async (file) => {
    try {
        return await createImageBitmap(file);
    } catch {
        throw new Error("This browser can't open that picture. Try a JPEG or PNG.");
    }
};

// picking a picture for your account on My account: checks it, crops it to width by height and saves it
// upload(blob) and remove() give the updated account, which goes to onChange
// adjust: show the picture first so it can be placed (draft), and save it only on save(crop); otherwise the middle is
// saved straight away
// gives { busy, error, draft, pick(file), save(crop), cancel(), remove() }; draft: { url, width, height } while the
// picture is being placed, else null
export default function usePictureUpload({ width, height, upload, remove, onChange, adjust = false }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState(null);
    // the opened picture behind the draft, kept out of state since it's only drawn from
    const bitmapRef = useRef(null);

    const dropDraft = () => {
        bitmapRef.current?.close();
        bitmapRef.current = null;
        setDraft((old) => {
            if (old) URL.revokeObjectURL(old.url);
            return null;
        });
    };

    // a picture still being placed when the page closes lets go of its memory
    useEffect(
        () => () => {
            bitmapRef.current?.close();
        },
        [],
    );

    const run = async (action) => {
        setBusy(true);
        setError("");
        try {
            const account = await action();
            if (account) onChange(account);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
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
            const bitmap = await openPicture(file);
            if (adjust) {
                dropDraft();
                bitmapRef.current = bitmap;
                setDraft({ url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height });
                return null;
            }
            try {
                return await upload(await cropPicture(bitmap, width, height));
            } finally {
                bitmap.close();
            }
        });
    };

    // the placed picture is saved; it stays open if saving fails, so it can be tried again
    const save = async (crop) => {
        const bitmap = bitmapRef.current;
        if (!bitmap) return;
        if (await run(async () => upload(await cropPicture(bitmap, width, height, crop)))) dropDraft();
    };

    const cancel = () => {
        dropDraft();
        setError("");
    };

    return { busy, error, draft, pick, save, cancel, remove: () => run(remove) };
}
