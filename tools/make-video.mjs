import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const ROOT = path.resolve("..");
const FRAMES = path.join(ROOT, "deliverables", "video-frames");
const AUDIO = path.join(ROOT, "deliverables", "audio");
const WORK = path.join(ROOT, "deliverables", "video-work");
const OUT = path.join(ROOT, "deliverables", "PANSHI-demo.mp4");
fs.mkdirSync(WORK, { recursive: true });

const sections = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const segments = [];

for (const id of sections) {
  const frame = path.join(FRAMES, `sec${id}.png`);
  const audio = path.join(AUDIO, `sec${id}.wav`);
  const seg = path.join(WORK, `seg${id}.mp4`);
  if (!fs.existsSync(frame) || !fs.existsSync(audio)) throw new Error(`missing frame/audio for ${id}`);
  execFileSync(ffmpegPath, [
    "-y",
    "-loop", "1",
    "-i", frame,
    "-i", audio,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "stillimage",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
    "-shortest",
    "-pix_fmt", "yuv420p",
    seg,
  ], { stdio: "inherit" });
  segments.push(seg);
}

const list = path.join(WORK, "segments.txt");
fs.writeFileSync(list, segments.map((s) => `file '${s.replaceAll("\\", "/")}'`).join("\n"), "utf8");

execFileSync(ffmpegPath, [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", list,
  "-c", "copy",
  "-movflags", "+faststart",
  OUT,
], { stdio: "inherit" });

const stat = fs.statSync(OUT);
console.log(JSON.stringify({ output: OUT, size_mb: +(stat.size / 1024 / 1024).toFixed(1) }));
