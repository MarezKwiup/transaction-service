import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFound: RequestHandler = (req, res) => {
    res.status(404).json({
        error: "NOT_FOUND",
        message: `No route for ${req.method} ${req.path}`
    });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err?.type === 'entity.parse.failed') {
        res.status(400).json({ error: "INVALID_JSON" });
        return;
    }

    if (err?.type === "entity.too.large") {
        res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
        return;
    }

    console.error(`[error] ${req.method} ${req.path} `, err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
}