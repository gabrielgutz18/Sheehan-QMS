// paste any YouTube link here (watch, youtu.be or shorts)
const YOUTUBE_URL = "https://www.youtube.com/watch?v=fLexgOxsZu0";

const youtubeId = (url) =>
    url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];

export default function VideoUp() {
    const id = youtubeId(YOUTUBE_URL);

    if (!id) return <div className="video-up video-up--empty">No video available</div>;

    // browsers only autoplay muted video; loop needs playlist set to the same id
    const params = new URLSearchParams({ autoplay: 1, mute: 1, loop: 1, playlist: id, controls: 0, rel: 0 });

    return (
        <iframe
            className="video-up"
            src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
            title="Sheehan video"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
        />
    );
}
