// cover photos and profiles: each staff member picks a wide picture for the top of their profile on My account, and
// on SheeChat anyone can open the profile of whoever they can chat with
// run: npm test            only these: npm test -- --test-name-pattern="cover photo|SheeChat profile"
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// the start of a PNG file, which is all the server checks before keeping it
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("picture")]);
const putCover = (who, bytes = png, type = "image/png") => who.upload("/admin/me/cover", bytes, type, "PUT");
const onDisk = (name) => existsSync(join(app.dataDir, "photos", name));

describe("cover photo", () => {
    test("a staff member sets one, and it stays with their account across sign-ins", async () => {
        const sales = await app.actingAsSales();
        assert.equal(sales.account.coverPhoto, null);

        const updated = (await putCover(sales)).assertStatus(200).body;
        assert.match(updated.coverPhoto, new RegExp(`^cover-${sales.account.id}-\\d+\\.png$`));
        assert.equal(updated.photo, null, "the profile photo is a separate picture");
        assert.ok(onDisk(updated.coverPhoto));

        // the Dashboard reads it from the signed-in account
        assert.equal((await sales.get("/auth/me")).assertStatus(200).body.coverPhoto, updated.coverPhoto);
    });

    test("any signed-in account can see it, and nobody else", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        (await putCover(sales)).assertStatus(200);

        assert.deepEqual((await loading.get(`/photos/${sales.account.id}/cover`)).assertStatus(200).body, png);
        (await app.client().get(`/photos/${sales.account.id}/cover`)).assertStatus(401);
        (await loading.get(`/photos/${loading.account.id}/cover`)).assertStatus(404);
    });

    test("it doesn't take the place of the profile photo", async () => {
        const sales = await app.actingAsSales();
        const cover = Buffer.concat([png, Buffer.from(" cover")]);
        (await sales.upload("/admin/me/photo", png, "image/png", "PUT")).assertStatus(200);
        (await putCover(sales, cover)).assertStatus(200);

        assert.deepEqual((await sales.get(`/photos/${sales.account.id}`)).body, png);
        assert.deepEqual((await sales.get(`/photos/${sales.account.id}/cover`)).body, cover);
    });

    test("a new one or removing it deletes the old file", async () => {
        const sales = await app.actingAsSales();
        const first = (await putCover(sales)).assertStatus(200).body.coverPhoto;
        // the file name has the time in it, so the next one needs a later moment
        await new Promise((resolve) => setTimeout(resolve, 5));
        const second = (await putCover(sales)).assertStatus(200).body.coverPhoto;
        assert.notEqual(first, second);
        assert.equal(onDisk(first), false);
        assert.ok(onDisk(second));

        assert.equal((await sales.delete("/admin/me/cover")).assertStatus(200).body.coverPhoto, null);
        assert.equal(onDisk(second), false);
        (await sales.get(`/photos/${sales.account.id}/cover`)).assertStatus(404);
    });

    test("only real pictures are kept, up to 2 MB", async () => {
        const sales = await app.actingAsSales();
        (await putCover(sales, Buffer.from("not a picture"))).assertStatus(400);
        (await putCover(sales, Buffer.from("%PDF-1.7"), "application/pdf")).assertStatus(415);
        (await putCover(sales, Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]))).assertStatus(413);
        assert.equal((await sales.get("/auth/me")).body.coverPhoto, null);
    });

    test("signing out means no setting one", async () => {
        (await putCover(app.client())).assertStatus(401);
    });
});

describe("SheeChat profile", () => {
    test("shows someone's details and cover, without what's only for them", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        (
            await loading.patch("/admin/me", {
                firstName: "Pedro",
                middleName: "Luna",
                surname: "Garcia",
                employeeId: "E-77",
                department: "Yard 2",
            })
        ).assertStatus(200);
        const { coverPhoto } = (await putCover(loading)).assertStatus(200).body;

        const profile = (await sales.get(`/admin/sheechat/${loading.account.id}/profile`)).assertStatus(200).body;
        assert.equal(profile.name, "Pedro Garcia");
        assert.equal(profile.role, "loading");
        assert.equal(profile.department, "Yard 2");
        assert.equal(profile.coverPhoto, coverPhoto);
        assert.equal(profile.disabled, false);
        assert.equal(profile.online, true);
        assert.ok(profile.createdAt);

        for (const hidden of ["username", "employeeId", "middleName", "password_hash", "passwordHash", "password"]) {
            assert.equal(hidden in profile, false, `${hidden} stays private`);
        }
    });

    test("every role but the developers can open one", async () => {
        const inventory = await app.actingAsInventory();
        for (const who of [await app.actingAsAdmin(), await app.actingAsSecurity(), await app.actingAsChassis()]) {
            (await who.get(`/admin/sheechat/${inventory.account.id}/profile`)).assertStatus(200);
        }

        const developer = await app.actingAsDeveloper();
        (await developer.get(`/admin/sheechat/${inventory.account.id}/profile`)).assertStatus(403);
        (await app.client().get(`/admin/sheechat/${inventory.account.id}/profile`)).assertStatus(401);
    });

    test("it's for the people on SheeChat: not yourself, a developer or an account that doesn't exist", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();
        (await sales.get(`/admin/sheechat/${sales.account.id}/profile`)).assertStatus(404);
        (await sales.get(`/admin/sheechat/${developer.account.id}/profile`)).assertStatus(404);
        (await sales.get("/admin/sheechat/99999/profile")).assertStatus(404);
    });

    test("someone switched off still has one, marked as such and not online", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const admin = await app.actingAsAdmin();
        (await admin.patch(`/admin/users/${cashier.account.id}`, { disabled: true })).assertStatus(200);

        const profile = (await sales.get(`/admin/sheechat/${cashier.account.id}/profile`)).assertStatus(200).body;
        assert.equal(profile.disabled, true);
        assert.equal(profile.online, false);
    });

    test("opening it doesn't read their messages", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "Truck 2 is here." })).assertStatus(201);

        (await loading.get(`/admin/sheechat/${sales.account.id}/profile`)).assertStatus(200);
        assert.equal((await loading.get("/admin/sheechat")).body[0].unread, 1);
    });
});
