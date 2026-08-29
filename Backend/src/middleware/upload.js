import multer from "multer";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// Memory storage: buffers are streamed straight to Cloudinary, nothing hits disk.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(Object.assign(new Error("Only JPEG, PNG, WebP or AVIF images are allowed"), { status: 400 }));
    }
    cb(null, true);
  },
});

export const uploadListingImages = upload.array("images", 6);

/**
 * Detect whether a buffer's magic bytes are a real JPEG / PNG / WebP / AVIF.
 * The multer filter above only trusts the client-supplied mimetype, which is
 * trivially spoofable — a text file named `.jpg` sailed through and then blew
 * up at Cloudinary with a confusing generic 500. Checking the bytes gives the
 * user a clear 400 instead.
 */
export function isImageBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WebP: "RIFF"...."WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return true;
  // ISO-BMFF (AVIF / HEIC): "ftyp" at bytes 4-7 with a known brand at 8-11
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (["avif", "avis", "mif1", "msf1", "heic", "heix", "hevc"].includes(brand)) return true;
  }
  return false;
}

/**
 * Express middleware to run AFTER an image multer upload: rejects any file whose
 * contents aren't actually an image with a clear 400 (instead of a later 500
 * from the storage provider).
 */
export function validateImageUpload(req, _res, next) {
  const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];
  if (files.some((f) => !isImageBuffer(f.buffer))) {
    const err = new Error("That file isn't a valid image — upload a real JPEG, PNG, WebP or AVIF photo.");
    err.status = 400;
    return next(err);
  }
  next();
}

// Separate limiter for CSV bulk-import uploads (single text/csv file).
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /csv/i.test(file.mimetype) || /\.csv$/i.test(file.originalname);
    if (!ok) return cb(Object.assign(new Error("Upload a .csv file"), { status: 400 }));
    cb(null, true);
  },
});

export const uploadCsv = csvUpload.single("file");
