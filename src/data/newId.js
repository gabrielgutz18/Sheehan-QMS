// a random 32-character id; crypto.randomUUID() would be simpler, but browsers only offer it on https:// or
// localhost, and the kiosks reach the Windows server by its plain http:// address
export default function newId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
