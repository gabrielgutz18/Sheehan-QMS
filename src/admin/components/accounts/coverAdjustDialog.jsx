import { useEffect, useRef, useState } from "react";

import { MAX_ZOOM, cropOf, dragView, settleView, startView } from "../../data/pictureCrop.js";

// how far an arrow key moves the picture, as a part of the frame
const KEY_STEP = 0.05;

// a new cover photo before it's saved: the picture in the banner's shape, dragged up or down (or sideways once zoomed
// in) to choose the part that shows, and zoomed with the slider; OK saves that part, Cancel keeps the old cover
// picture: { url, width, height }, the chosen file; shape: the banner's width / height; onSave({ x, y, w, h }): the
// part to save, in the picture's own pixels
/**
 * @param {{ picture: { url: string, width: number, height: number }, shape: number, busy: boolean, error: string,
 *   onSave: (crop: { x: number, y: number, w: number, h: number }) => any, onClose: () => void }} props
 */
export default function CoverAdjustDialog({ picture, shape, busy, error, onSave, onClose }) {
    const dialogRef = useRef(null);
    const frameRef = useRef(null);
    // where a drag started: the pointer, and the view then
    const dragRef = useRef(null);
    const [view, setView] = useState(() => startView(picture));
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();
        frameRef.current.focus();
    }, []);

    const crop = cropOf(picture, shape, view);
    // the whole picture, sized and moved so the crop fills the frame; top and height are parts of the frame's height
    const placed = {
        width: `${(picture.width / crop.w) * 100}%`,
        height: `${(picture.height / crop.h) * 100}%`,
        left: `${(-crop.x / crop.w) * 100}%`,
        top: `${(-crop.y / crop.h) * 100}%`,
    };

    const startDrag = (e) => {
        if (busy || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { x: e.clientX, y: e.clientY, view };
        setDragging(true);
    };

    const moveDrag = (e) => {
        const start = dragRef.current;
        if (!start) return;
        const frameWidth = frameRef.current.clientWidth;
        setView(dragView(picture, shape, start.view, e.clientX - start.x, e.clientY - start.y, frameWidth));
    };

    const endDrag = () => {
        dragRef.current = null;
        setDragging(false);
    };

    // the arrow keys move it like a drag, a step at a time
    const nudge = (e) => {
        const steps = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
        if (!steps || busy) return;
        e.preventDefault();
        const frame = frameRef.current;
        const [dx, dy] = steps;
        setView(
            dragView(
                picture,
                shape,
                view,
                dx * frame.clientWidth * KEY_STEP,
                dy * frame.clientHeight * KEY_STEP,
                frame.clientWidth,
            ),
        );
    };

    const submit = (e) => {
        e.preventDefault();
        onSave(crop);
    };

    return (
        <dialog
            ref={dialogRef}
            className="admin-dialog cover-adjust-dialog"
            aria-labelledby="cover-adjust-title"
            onClose={onClose}
            // don't let Esc close it while the cover is saving
            onCancel={(e) => busy && e.preventDefault()}
        >
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="cover-adjust-title" className="admin-dialog-title">
                    Place your cover photo
                </h2>
                <p className="admin-dialog-sub">
                    Drag the picture up or down to choose the part that shows, and zoom in to show less of it.
                </p>

                <div
                    ref={frameRef}
                    className={`cover-adjust-frame${dragging ? " is-dragging" : ""}`}
                    style={{ aspectRatio: String(shape) }}
                    tabIndex={0}
                    role="group"
                    aria-label="Cover preview. Drag, or use the arrow keys, to move the picture."
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={nudge}
                >
                    <img className="cover-adjust-img" src={picture.url} alt="" draggable={false} style={placed} />
                    <span className="cover-adjust-hint" aria-hidden="true">
                        ↕ Drag to move
                    </span>
                </div>

                <label className="cover-adjust-zoom">
                    Zoom
                    <input
                        type="range"
                        min={1}
                        max={MAX_ZOOM}
                        step={0.01}
                        value={view.zoom}
                        disabled={busy}
                        onChange={(e) => setView(settleView(picture, shape, { ...view, zoom: Number(e.target.value) }))}
                    />
                </label>

                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}

                <div className="admin-dialog-actions">
                    <button
                        type="button"
                        className="admin-btn"
                        onClick={() => dialogRef.current.close()}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
                        {busy ? "Saving..." : "OK"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
