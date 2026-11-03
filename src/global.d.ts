// the Facebook video player's SDK, which puts itself on window (src/components/videoup.jsx)
interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
}
