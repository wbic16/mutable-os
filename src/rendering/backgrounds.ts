import {youtubeId} from "../interchange/youtube-reference";
import greenAuroraImageUrl from "../assets/hosted/backgrounds/images/green-aurora.jpg";
import woodImageUrl from "../assets/hosted/backgrounds/images/wood.jpg";
import cloudsImageUrl from "../assets/hosted/backgrounds/images/clouds.jpg";
import snowAuroraImageUrl from "../assets/hosted/backgrounds/images/snow-aurora.jpg";
import rainVideoUrl from "../assets/hosted/backgrounds/video/rain.mp4";
import greenAuroraVideoUrl from "../assets/hosted/backgrounds/video/green-aurora.mp4";

export const backgroundTypes = ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"] as const;
export type BackgroundType = typeof backgroundTypes[number];
export const isBackgroundType = (type: string): type is BackgroundType => backgroundTypes.includes(type as BackgroundType);
export const backgroundImages = [
  { label: "Green aurora", url: greenAuroraImageUrl },
  { label: "Desktop", url: woodImageUrl },
  { label: "High", url: cloudsImageUrl },
  { label: "Aurora over snow", url: snowAuroraImageUrl },
];
export const backgroundVideos = { rain: rainVideoUrl, greenAurora: greenAuroraVideoUrl } as const;
export const defaultBackgroundUrls: Partial<Record<BackgroundType, string>> = {
  "image-background-block": backgroundImages[0].url,
  "video-background-block": backgroundVideos.rain,
  "youtube-video-background-block": "https://www.youtube.com/watch?v=Zsqep7_9_mw",
};

export {mediaUrl} from '../interchange/media-url';

export {youtubeId} from "../interchange/youtube-reference";

export function youtubeBackgroundUrl(value: unknown, paused = false, muted = true): string | undefined {
  const id = youtubeId(value);
  if (!id) return undefined;
  const params = new URLSearchParams({ autoplay: paused ? "0" : "1", mute: muted ? "1" : "0", loop: "1", playlist: id, controls: "0", disablekb: "1", fs: "0", playsinline: "1", rel: "0", iv_load_policy: "3" });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
