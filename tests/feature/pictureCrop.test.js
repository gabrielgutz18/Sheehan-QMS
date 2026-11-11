// placing a cover photo in its wide banner before it's uploaded: which part of the picture shows as it's dragged and
// zoomed, and that it never goes past the picture's edges
// run: npm test            only these: npm test -- --test-name-pattern="Placing a picture"
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { cropOf, dragView, settleView, startView } from "../../src/admin/data/pictureCrop.js";

// a tall phone photo, and the cover's 3 by 1 banner
const PHOTO = { width: 1200, height: 1600 };
const BANNER = 3;

describe("Placing a picture", () => {
    test("it opens on the middle, as wide as the picture", () => {
        assert.deepEqual(cropOf(PHOTO, BANNER, startView(PHOTO)), { x: 0, y: 600, w: 1200, h: 400 });
    });

    test("dragging down shows more of the top, and stops at the top edge", () => {
        // the frame is 600 pixels wide on screen, so one screen pixel is two of the picture's
        const down = dragView(PHOTO, BANNER, startView(PHOTO), 0, 100, 600);
        assert.deepEqual(cropOf(PHOTO, BANNER, down), { x: 0, y: 400, w: 1200, h: 400 });

        const past = dragView(PHOTO, BANNER, down, 0, 5000, 600);
        assert.equal(cropOf(PHOTO, BANNER, past).y, 0);
        // the drag past the edge isn't saved up: dragging back up moves it straight away
        assert.equal(cropOf(PHOTO, BANNER, dragView(PHOTO, BANNER, past, 0, -50, 600)).y, 100);
    });

    test("dragging up stops at the bottom edge", () => {
        const up = dragView(PHOTO, BANNER, startView(PHOTO), 0, -5000, 600);
        assert.deepEqual(cropOf(PHOTO, BANNER, up), { x: 0, y: 1200, w: 1200, h: 400 });
    });

    test("a picture as wide as the banner can't be dragged sideways until it's zoomed", () => {
        const sideways = dragView(PHOTO, BANNER, startView(PHOTO), 300, 0, 600);
        assert.equal(cropOf(PHOTO, BANNER, sideways).x, 0);

        const zoomed = settleView(PHOTO, BANNER, { ...startView(PHOTO), zoom: 2 });
        assert.deepEqual(cropOf(PHOTO, BANNER, zoomed), { x: 300, y: 700, w: 600, h: 200 });
        assert.equal(cropOf(PHOTO, BANNER, dragView(PHOTO, BANNER, zoomed, 100, 0, 600)).x, 200);
    });

    test("zoom stays between 1 and 3", () => {
        assert.equal(settleView(PHOTO, BANNER, { ...startView(PHOTO), zoom: 0.2 }).zoom, 1);
        assert.equal(settleView(PHOTO, BANNER, { ...startView(PHOTO), zoom: 9 }).zoom, 3);
    });

    test("a wide panorama shows its full height, from the middle", () => {
        const panorama = { width: 4000, height: 500 };
        assert.deepEqual(cropOf(panorama, BANNER, startView(panorama)), { x: 1250, y: 0, w: 1500, h: 500 });
    });
});
