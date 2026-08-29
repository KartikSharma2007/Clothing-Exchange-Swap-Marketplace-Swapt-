import multer from "multer";
import { ZodError } from "zod";

export function notFound(_req, res) {
  res.status(404).json({ error: "Not found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Each image must be 8 MB or smaller" :
      err.code === "LIMIT_FILE_COUNT" ? "You can upload at most 6 images" :
      err.message;
    return res.status(400).json({ error: message });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({ error: `That ${field} is already taken` });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? (err.message || "Something went wrong") : err.message,
  });
}
