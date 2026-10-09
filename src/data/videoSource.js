// turns a pasted video link into something the player can show: { type, src, platform }
// links accepted: YouTube, Facebook, Vimeo, Dailymotion, TikTok, Twitch, Streamable,
// Google Drive, a direct .mp4/.webm/.ogg file, or any embeddable player URL

// browsers only autoplay muted video, so every player is asked to start muted
const PLATFORMS = [
    {
        name: "YouTube",
        // watch, youtu.be, shorts, embed, live
        match: /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/,
        // loop needs playlist set to the same id
        embed: (id) => `https://www.youtube-nocookie.com/embed/${id}?` +
            new URLSearchParams({ autoplay: 1, mute: 1, loop: 1, playlist: id, controls: 0, rel: 0 }),
    },
    {
        name: "Vimeo",
        match: /vimeo\.com\/(?:.*\/)?(\d+)/,
        // background mode = autoplay, muted, looped, no controls
        embed: (id) => `https://player.vimeo.com/video/${id}?background=1`,
    },
    {
        name: "Dailymotion",
        match: /(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-zA-Z0-9]+)/,
        embed: (id) => `https://www.dailymotion.com/embed/video/${id}?autoplay=1&mute=1&loop=1&controls=0`,
    },
    {
        name: "TikTok",
        match: /tiktok\.com\/(?:@[\w.-]+\/video\/|player\/v1\/|embed\/v2\/)(\d+)/,
        embed: (id) => `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&controls=0&music_info=0&description=0`,
    },
    {
        name: "Twitch",
        match: /clips\.twitch\.tv\/([\w-]+)|twitch\.tv\/\w+\/clip\/([\w-]+)/,
        // twitch refuses to embed without the hosting page's domain as parent
        embed: (id) => `https://clips.twitch.tv/embed?clip=${id}&parent=${location.hostname}&autoplay=true&muted=true`,
    },
    {
        name: "Twitch",
        match: /twitch\.tv\/videos\/(\d+)/,
        embed: (id) => `https://player.twitch.tv/?video=${id}&parent=${location.hostname}&autoplay=true&muted=true`,
    },
    {
        name: "Twitch",
        match: /twitch\.tv\/(\w+)\/?$/,
        embed: (channel) => `https://player.twitch.tv/?channel=${channel}&parent=${location.hostname}&autoplay=true&muted=true`,
    },
    {
        name: "Streamable",
        match: /streamable\.com\/(?:e\/)?(\w+)/,
        embed: (id) => `https://streamable.com/e/${id}?autoplay=1&muted=1&loop=1`,
    },
    {
        name: "Google Drive",
        match: /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/,
        // drive previews can't autoplay
        embed: (id) => `https://drive.google.com/file/d/${id}/preview`,
    },
];

const DIRECT_FILE = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i;

export const resolveVideo = (url) => {
    if (!url) return null;
    if (DIRECT_FILE.test(url)) return { type: "file", src: url, platform: "Video file" };
    // watch, reels, videos, fb.watch share links
    if (/(?:facebook\.com|fb\.watch)\//.test(url)) return { type: "facebook", src: url, platform: "Facebook" };

    for (const { name, match, embed } of PLATFORMS) {
        const m = url.match(match);
        if (m) return { type: "iframe", src: embed(m[1] ?? m[2], url), platform: name };
    }

    // unknown site: assume it's already an embeddable player link
    return /^https?:\/\//.test(url) ? { type: "iframe", src: url, platform: null } : null;
};
