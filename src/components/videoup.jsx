import { useEffect, useRef, useState } from "react";

import { getVideo, videoFileUrl } from "../api/videoController.js";
import { resolveVideo } from "../data/videoSource.js";

// the admin sets the video (link or upload) under Admin → Display video; re-check for changes this often
const REFRESH_MS = 30000;

// facebook's iframe ignores autoplay/mute params, so use their SDK player and drive it directly
let fbSdk;
const loadFacebookSdk = () => fbSdk ??= new Promise((resolve) => {
    window.fbAsyncInit = () => {
        window.FB.init({ xfbml: false, version: "v21.0" });
        resolve(window.FB);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
});

function FacebookVideo({ url }) {
    const boxRef = useRef(null);

    useEffect(() => {
        const box = boxRef.current;
        // built outside react because the SDK replaces the element's contents
        const el = document.createElement("div");
        el.className = "fb-video";
        el.id = `fb-video-${crypto.randomUUID()}`;
        el.dataset.href = url;
        el.dataset.showText = "false";
        box.appendChild(el);

        let FB;
        const handlers = [];
        const onReady = (msg) => {
            if (msg.type !== "video" || msg.id !== el.id) return;
            const player = msg.instance;
            player.mute();
            player.play();
            // no loop option, so restart when it ends
            handlers.push(player.subscribe("finishedPlaying", () => {
                player.seek(0);
                player.play();
            }));
        };

        loadFacebookSdk().then((sdk) => {
            if (!box.contains(el)) return;
            FB = sdk;
            FB.Event.subscribe("xfbml.ready", onReady);
            FB.XFBML.parse(box);
        });

        return () => {
            FB?.Event.unsubscribe("xfbml.ready", onReady);
            handlers.forEach((h) => h.release("finishedPlaying"));
            el.remove();
        };
    }, [url]);

    return <div ref={boxRef} className="video-up video-up--facebook" />;
}

// plays a pasted link (any supported site) or, with isFile, a direct video file / blob URL
export function VideoPlayer({ url, isFile = false }) {
    const video = isFile ? { type: "file", src: url } : resolveVideo(url?.trim());

    if (!video) return <div className="video-up video-up--empty">No video available</div>;

    if (video.type === "facebook") return <FacebookVideo url={video.src} />;

    if (video.type === "file") {
        return <video className="video-up" src={video.src} autoPlay muted loop playsInline />;
    }

    return (
        <iframe
            className="video-up"
            src={video.src}
            title="Sheehan video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
        />
    );
}

// display-screen video: whatever the admin last saved
export default function VideoUp() {
    const [video, setVideo] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        const load = () =>
            getVideo({ signal: controller.signal })
                .then(setVideo)
                // keep playing the current video if a refresh fails
                .catch(() => {});

        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    if (video?.kind === "file") return <VideoPlayer key={video.version} url={videoFileUrl(video.version)} isFile />;
    return <VideoPlayer key={video?.url} url={video?.url} />;
}
