import formatQueueNum from '../data/queueNum.js';
import { DEFAULT_CALL_NOTE } from '../data/callNote.js';

// call announcements for the queue display: a two-note chime, then the call read out loud with the
// browser's text-to-speech. Which voices exist depends on the computer and browser; Microsoft Edge
// has the most natural ones, including Filipino.

// settings: { enabled, voice, lang, rate, volume, repeat }; voice is a voice name, "" for the browser's default;
// volume runs from 0 (silent) to 1 (full) and is the one setting sales staff can change
export const DEFAULT_ANNOUNCER = { enabled: true, voice: "", lang: "", rate: 0.9, volume: 1, repeat: 1 };

// most browsers end an utterance by themselves; this stops a stuck one from blocking the queue
const MAX_SPEECH_MS = 20000;

const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;

let audioContext;
const getAudioContext = () => {
    audioContext ??= new AudioContext();
    return audioContext;
};

// browsers keep sound off until someone has clicked or tapped the page (unless Chrome is started with
// --autoplay-policy=no-user-gesture-required, as on an unattended display)
export const isSoundAllowed = () =>
    navigator.userActivation?.hasBeenActive || getAudioContext().state === "running";

// call from a click or tap to switch sound on for the rest of the visit
export async function unlockSound() {
    await getAudioContext().resume();
    // an empty utterance inside the click lets later announcements speak without one
    if (hasSpeech()) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

// "ding-dong" at the given volume (0–1), resolves when it has finished
export async function playChime(volume = 1) {
    const ctx = getAudioContext();
    await ctx.resume();
    const notes = [
        { freq: 659.25, at: 0 }, // E5
        { freq: 523.25, at: 0.45 }, // C5
    ];
    for (const { freq, at } of notes) {
        const start = ctx.currentTime + at;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.35 * volume), start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 1.15);
    }
    await new Promise((resolve) => setTimeout(resolve, 1300));
}

// the voices this browser offers; Chrome loads them a moment after the page opens
export function getVoices() {
    if (!hasSpeech()) return Promise.resolve([]);
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((resolve) => {
        const done = () => {
            synth.removeEventListener("voiceschanged", done);
            resolve(synth.getVoices());
        };
        synth.addEventListener("voiceschanged", done);
        setTimeout(done, 1500);
    });
}

// calls back with this browser's voices, then again each time it adds more: Edge lists its online voices first and
// this computer's own a moment later; returns a function that stops listening
export function watchVoices(callback) {
    if (!hasSpeech()) {
        callback([]);
        return () => {};
    }
    const synth = window.speechSynthesis;
    let watching = true;
    const update = () => watching && callback(synth.getVoices());
    synth.addEventListener("voiceschanged", update);
    getVoices().then(update);
    return () => {
        watching = false;
        synth.removeEventListener("voiceschanged", update);
    };
}

// the chosen voice by name; if this computer doesn't have it, one in the same language;
// then one in the browser's language; then the default
export function findVoice(voices, { voice, lang } = {}) {
    const sameLang = (a, b) => a && b && a.toLowerCase().split("-")[0] === b.toLowerCase().split("-")[0];
    return (
        voices.find((v) => v.name === voice) ??
        voices.find((v) => sameLang(v.lang, lang)) ??
        voices.find((v) => sameLang(v.lang, navigator.language)) ??
        voices.find((v) => v.default) ??
        voices[0] ??
        null
    );
}

// reads text out loud; resolves when it's done (or couldn't be spoken)
export async function speak(text, settings = DEFAULT_ANNOUNCER) {
    if (!hasSpeech()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = findVoice(await getVoices(), settings);
    if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
    }
    utterance.rate = settings.rate ?? DEFAULT_ANNOUNCER.rate;
    utterance.volume = settings.volume ?? DEFAULT_ANNOUNCER.volume;
    await new Promise((resolve) => {
        const timer = setTimeout(resolve, MAX_SPEECH_MS);
        utterance.onend = utterance.onerror = () => {
            clearTimeout(timer);
            resolve();
        };
        window.speechSynthesis.speak(utterance);
    });
}

// "RA 01" reads better as the letters, then the number: "R A, 1"
export function spokenTicket(queueNum, purpose) {
    const [letters] = formatQueueNum(queueNum, purpose).split(" ");
    return `${letters.split("").join(" ")}, ${Number(queueNum)}`;
}

// what the display says for a call, e.g. "Now serving R A, 1. Juan Dela Cruz. Please proceed to Window 1."
export function callAnnouncement({ queueNum, purpose, name, remarks }) {
    const note = (remarks || DEFAULT_CALL_NOTE).replace(/[.!\s]+$/, "");
    return `Now serving ${spokenTicket(queueNum, purpose)}. ${name}. ${note}.`;
}

// announcements wait for the one before to finish instead of talking over it
let queue = Promise.resolve();

// chime, then the text, said once or twice
export function announce(text, settings = DEFAULT_ANNOUNCER) {
    queue = queue
        .then(async () => {
            const volume = settings.volume ?? DEFAULT_ANNOUNCER.volume;
            if (volume === 0) return;
            await playChime(volume);
            for (let i = 0; i < (settings.repeat ?? 1); i++) await speak(text, settings);
        })
        .catch((err) => console.error("Announcement failed", err));
    return queue;
}
