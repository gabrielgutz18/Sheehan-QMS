// a coworker's profile opened from their photo or name anywhere in the staff area (the Dashboard's In charge list,
// Accounts, the Crew tab, the developer chats), and a developer's specialization: what they do in the IT department
// run: npm test            only these: npm test -- --test-name-pattern="profile|specialization"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

const profileOf = (who, id) => who.get(`/admin/profiles/${id}`);

describe("profiles", () => {
    test("every role can open anyone's profile, the developers' and their own included", async () => {
        const dev = await app.actingAsDeveloper("Dev Coder");
        const maria = await app.actingAsSales("Maria Santos");
        for (const who of [
            await app.actingAsAdmin(),
            maria,
            await app.actingAsLoading(),
            await app.actingAsService(),
            await app.actingAsHardware(),
            await app.actingAsSecurity(),
            await app.actingAsCashier(),
            await app.actingAsInventory(),
            dev,
        ]) {
            assert.equal((await profileOf(who, dev.account.id)).assertStatus(200).body.name, "Dev Coder");
            assert.equal((await profileOf(who, maria.account.id)).assertStatus(200).body.role, "sales");
        }
        (await profileOf(maria, maria.account.id)).assertStatus(200);
    });

    test("a profile shows only what a coworker may see, and needs a sign-in", async () => {
        const maria = await app.actingAsSales("Maria Santos");
        await maria.patch("/admin/me", {
            firstName: "Maria",
            surname: "Santos",
            employeeId: "SHN-0042",
            department: "Sales",
            middleName: "Cruz",
        });
        const pedro = await app.actingAsLoading();
        const profile = (await profileOf(pedro, maria.account.id)).assertStatus(200).body;

        assert.equal(profile.department, "Sales");
        assert.equal(profile.specialization, "");
        for (const hidden of ["username", "employeeId", "middleName", "password_hash", "passwordHash"]) {
            assert.equal(hidden in profile, false, `${hidden} stays private`);
        }
        (await profileOf(pedro, 9999)).assertStatus(404);
        (await app.client().get(`/admin/profiles/${maria.account.id}`)).assertStatus(401);
    });
});

describe("a developer's specialization", () => {
    test("a developer sets it on My account, and it shows on their profile and in the developer list", async () => {
        const dev = await app.actingAsDeveloper("Dev Coder");
        const saved = (
            await dev.patch("/admin/me", { firstName: "Dev", surname: "Coder", specialization: " Web developer " })
        ).assertStatus(200).body;
        assert.equal(saved.specialization, "Web developer");
        app.assertDatabaseHas("users", { id: dev.account.id, specialization: "Web developer" });

        const maria = await app.actingAsSales();
        assert.equal((await profileOf(maria, dev.account.id)).body.specialization, "Web developer");
        const [listed] = (await maria.get("/admin/developers")).assertStatus(200).body;
        assert.equal(listed.specialization, "Web developer");
    });

    test("saving My account without it keeps it, and it can be cleared", async () => {
        const dev = await app.actingAsDeveloper("Dev Coder");
        await dev.patch("/admin/me", { firstName: "Dev", surname: "Coder", specialization: "IT support" });

        const kept = (
            await dev.patch("/admin/me", { firstName: "Dev", surname: "Coder", department: "IT" })
        ).assertStatus(200).body;
        assert.equal(kept.specialization, "IT support");
        const cleared = (
            await dev.patch("/admin/me", { firstName: "Dev", surname: "Coder", specialization: "" })
        ).assertStatus(200).body;
        assert.equal(cleared.specialization, "");
    });

    test("only developers have one, and it has a length limit", async () => {
        const maria = await app.actingAsSales();
        const refused = (
            await maria.patch("/admin/me", { firstName: "Maria", surname: "Santos", specialization: "Web developer" })
        ).assertStatus(400).body;
        assert.equal(refused.message, "Only developers have a specialization.");
        // My account sends an empty one for anyone; that's fine
        (await maria.patch("/admin/me", { firstName: "Maria", surname: "Santos", specialization: "" })).assertStatus(
            200,
        );

        const dev = await app.actingAsDeveloper();
        (
            await dev.patch("/admin/me", { firstName: "Dev", surname: "Coder", specialization: "x".repeat(61) })
        ).assertStatus(400);
    });
});
