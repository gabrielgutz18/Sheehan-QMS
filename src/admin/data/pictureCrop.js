// placing a picture in a fixed shape before it's uploaded, like the cover's wide banner: how much of the picture shows
// and which part, worked out from the picture's size, the shape (width / height) and a view { zoom, cx, cy }
// zoom: 1 shows as much of the picture as fits the shape, 2 half as wide, and so on up to MAX_ZOOM
// cx, cy: the middle of the part that shows, in the picture's own pixels

export const MAX_ZOOM = 3;

const clamp = (n, low, high) => Math.min(Math.max(n, low), high);

// the view a picture opens with: all of it that fits, from the middle
/** @param {{ width: number, height: number }} picture */
export const startView = ({ width, height }) => ({ zoom: 1, cx: width / 2, cy: height / 2 });

// the part of the picture that shows, { x, y, w, h } in its own pixels, always inside it, whatever the view says
/** @param {{ width: number, height: number }} picture @param {number} shape @param {{ zoom: number, cx: number, cy: number }} view */
export const cropOf = ({ width, height }, shape, view) => {
    const w = Math.min(width, height * shape) / clamp(view.zoom, 1, MAX_ZOOM);
    const h = w / shape;
    return {
        x: clamp(view.cx - w / 2, 0, width - w),
        y: clamp(view.cy - h / 2, 0, height - h),
        w,
        h,
    };
};

// the same view with its middle pulled back inside the picture, so dragging past an edge doesn't build up a distance
// that has to be dragged back before anything moves
/** @param {{ width: number, height: number }} picture @param {number} shape @param {{ zoom: number, cx: number, cy: number }} view */
export const settleView = (picture, shape, view) => {
    const zoom = clamp(view.zoom, 1, MAX_ZOOM);
    const { x, y, w, h } = cropOf(picture, shape, { ...view, zoom });
    return { zoom, cx: x + w / 2, cy: y + h / 2 };
};

// the view after dragging the picture by dx, dy on screen, in a frame frameWidth pixels wide: the picture follows the
// finger, so dragging down shows more of the top
/**
 * @param {{ width: number, height: number }} picture @param {number} shape
 * @param {{ zoom: number, cx: number, cy: number }} view @param {number} dx @param {number} dy @param {number} frameWidth
 */
export const dragView = (picture, shape, view, dx, dy, frameWidth) => {
    const { w } = cropOf(picture, shape, view);
    const scale = w / frameWidth;
    return settleView(picture, shape, { ...view, cx: view.cx - dx * scale, cy: view.cy - dy * scale });
};
