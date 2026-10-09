import { useEffect, useMemo, useState } from 'react';

import { VideoPlayer } from '../../components/videoup.jsx';
import { getVideo, videoFileUrl } from '../../api/videoController.js';
import { MAX_VIDEO_MB, clearVideo, setVideoUrl, uploadVideoFile } from '../api/adminVideoController.js';
import { resolveVideo } from '../../data/videoSource.js';

const ACCEPTED_TYPES = "video/mp4,video/webm,video/ogg,video/quicktime,video/x-m4v";

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function VideoPage() {
    const [current, setCurrent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("link");
    const [link, setLink] = useState("");
    const [file, setFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        getVideo({ signal: controller.signal })
            .then(setCurrent)
            .catch((err) => !controller.signal.aborted && setError(err.message))
            .finally(() => !controller.signal.aborted && setLoading(false));
        return () => controller.abort();
    }, []);

    // local preview of the picked file before it's uploaded
    const filePreview = useMemo(() => file && URL.createObjectURL(file), [file]);
    useEffect(() => () => filePreview && URL.revokeObjectURL(filePreview), [filePreview]);

    const detected = link.trim() && resolveVideo(link.trim());

    const save = async (action, message) => {
        setSaving(true);
        setError("");
        setNotice("");
        try {
            setCurrent(await action());
            setNotice(message);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const saveLink = async (e) => {
        e.preventDefault();
        if (await save(() => setVideoUrl(link.trim()), "Video link saved. The display screen will switch within 30 seconds.")) {
            setLink("");
        }
    };

    const saveFile = async (e) => {
        e.preventDefault();
        if (await save(() => uploadVideoFile(file), "Video uploaded. The display screen will switch within 30 seconds.")) {
            setFile(null);
        }
    };

    const remove = () => {
        if (!window.confirm("Remove the video from the display screen?")) return;
        save(async () => {
            await clearVideo();
            return null;
        }, "Video removed.");
    };

    const pickFile = (picked) => {
        setError("");
        setNotice("");
        if (!picked) return;
        if (!ACCEPTED_TYPES.split(",").includes(picked.type)) {
            setError("Choose an MP4, WebM, OGG or MOV video.");
            return;
        }
        if (picked.size > MAX_VIDEO_MB * 1024 * 1024) {
            setError(`That video is ${formatSize(picked.size)}. The limit is ${MAX_VIDEO_MB} MB.`);
            return;
        }
        setFile(picked);
    };

    return (
        <section className="admin-page">
            <h1 className="admin-title">Display video</h1>

            {error && <p className="field-error" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="video-columns">
                <div className="admin-panel">
                    <h2>Now showing</h2>
                    <div className="video-preview">
                        {loading ? (
                            <div className="video-up video-up--empty">Loading...</div>
                        ) : current?.kind === "file" ? (
                            <VideoPlayer key={current.version} url={videoFileUrl(current.version)} isFile />
                        ) : (
                            <VideoPlayer key={current?.url} url={current?.url} />
                        )}
                    </div>
                    {current && (
                        <div className="video-current">
                            <span className="video-current-label">
                                {current.kind === "file" ? `Uploaded file: ${current.name}` : current.url}
                            </span>
                            <button type="button" className="admin-btn admin-btn-danger" onClick={remove} disabled={saving}>
                                Remove
                            </button>
                        </div>
                    )}
                </div>

                <div className="admin-panel">
                    <h2>Change video</h2>

                    <div className="video-tabs" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === "link"}
                            className="video-tab"
                            onClick={() => setTab("link")}
                        >
                            Paste a link
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === "file"}
                            className="video-tab"
                            onClick={() => setTab("file")}
                        >
                            Upload from computer
                        </button>
                    </div>

                    {tab === "link" ? (
                        <form className="video-form" onSubmit={saveLink}>
                            <label className="admin-field">
                                Video URL
                                <input
                                    type="url"
                                    required
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    value={link}
                                    onChange={(e) => setLink(e.target.value)}
                                />
                            </label>
                            <p className="video-hint">
                                {detected
                                    ? detected.platform
                                        ? `Detected: ${detected.platform}`
                                        : "Unknown site: it will be embedded as-is, so use the site's embed link."
                                    : "Works with YouTube, Facebook, Vimeo, Dailymotion, TikTok, Twitch, Streamable, Google Drive and direct .mp4/.webm links."}
                            </p>
                            {detected && (
                                <div className="video-preview">
                                    <VideoPlayer key={link.trim()} url={link.trim()} />
                                </div>
                            )}
                            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !detected}>
                                {saving ? "Saving..." : "Show this video"}
                            </button>
                        </form>
                    ) : (
                        <form className="video-form" onSubmit={saveFile}>
                            <label
                                className="video-drop"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    pickFile(e.dataTransfer.files[0]);
                                }}
                            >
                                <input
                                    type="file"
                                    accept={ACCEPTED_TYPES}
                                    className="visually-hidden"
                                    onChange={(e) => {
                                        pickFile(e.target.files[0]);
                                        e.target.value = "";
                                    }}
                                />
                                <strong>{file ? file.name : "Choose a video or drag it here"}</strong>
                                <span className="video-hint">
                                    {file ? formatSize(file.size) : `MP4, WebM, OGG or MOV, up to ${MAX_VIDEO_MB} MB`}
                                </span>
                            </label>
                            {filePreview && (
                                <div className="video-preview">
                                    <VideoPlayer key={filePreview} url={filePreview} isFile />
                                </div>
                            )}
                            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !file}>
                                {saving ? "Uploading..." : "Upload and show"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </section>
    );
}
