import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Where uploaded news images (outlet icons, covers, article pictures) are kept.
 *
 * On Railway this must be inside a mounted volume, or uploads disappear on
 * every deploy. Set NEWS_MEDIA_DIR to a folder on the volume, for example
 * /data/news-media. Without it, a folder next to the bot is used.
 */
export const NEWS_MEDIA_DIR = path.resolve(process.env.NEWS_MEDIA_DIR || './news-media');

/** Stored files are always named like 3f9a...e1.png: 32 hex characters and an image extension. */
export const MEDIA_FILE_PATTERN = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;

export const MEDIA_TYPES: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
};

/** The public path the website uses for a stored file, or null if there isn't one. */
export const mediaPath = (file: string | null | undefined) => {
    if(!file || !MEDIA_FILE_PATTERN.test(file)) return null;
    return `/news/media/${file}`;
}

// ---------------------------------------------------------------- saving uploads


/** Largest image accepted, after the website has resized it. */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Works out the real file type from the file's first bytes, ignoring what the uploader claims. */
export const detectImageType = (bytes: Buffer): string | null => {
    if(bytes.length < 12) return null;
    if(bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'png';
    if(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if(bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if(bytes.toString('ascii', 0, 4) === 'GIF8') return 'gif';
    return null;
}

/** Saves an uploaded image under a random name and returns that name, or an error message. */
export const saveImage = (base64: string): { ok: true; file: string } | { ok: false; msg: string } => {
    const clean = String(base64 || '').replace(/^data:[^,]*,/, '');
    if(!clean) return { ok: false, msg: 'No image was received.' };
    if(clean.length > Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 8) return { ok: false, msg: 'That image is too large. The limit is 3 MB.' };
    const bytes = Buffer.from(clean, 'base64');
    if(bytes.length > MAX_UPLOAD_BYTES) return { ok: false, msg: 'That image is too large. The limit is 3 MB.' };
    const type = detectImageType(bytes);
    if(!type) return { ok: false, msg: 'Only PNG, JPEG, WebP and GIF images can be uploaded.' };

    const file = `${crypto.randomBytes(16).toString('hex')}.${type}`;
    fs.mkdirSync(NEWS_MEDIA_DIR, { recursive: true });
    fs.writeFileSync(`${NEWS_MEDIA_DIR}/${file}`, bytes);
    return { ok: true, file };
}

/** True if a file name is one the bot generated and it still exists. */
export const mediaExists = (file: unknown) =>
    typeof file === 'string' && MEDIA_FILE_PATTERN.test(file) && fs.existsSync(`${NEWS_MEDIA_DIR}/${file}`);
