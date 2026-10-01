const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "CHANGE_ME";

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const DATA_FILE = path.join(ROOT_DIR, "videos.json");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

app.set("trust proxy", 1);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

app.use(cors());
app.use(express.json());

app.use(
    "/uploads",
    express.static(UPLOAD_DIR, {
        acceptRanges: true
    })
);

app.use(express.static(PUBLIC_DIR));

function readVideos() {
    try {
        const data = fs.readFileSync(DATA_FILE, "utf8");
        const videos = JSON.parse(data);
        return Array.isArray(videos) ? videos : [];
    } catch (error) {
        return [];
    }
}

function saveVideos(videos) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(videos, null, 2),
        "utf8"
    );
}

function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Admin authorization required"
        });
    }

    const token = authHeader.substring(7);

    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
        return res.status(403).json({
            success: false,
            message: "Invalid admin token"
        });
    }

    next();
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);

        const randomName =
            crypto.randomBytes(16).toString("hex") + extension;

        cb(null, randomName);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 10 * 1024 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        if (file.mimetype && file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Only video files are allowed"));
        }
    }
});

app.get("/", function (req, res) {
    res.json({
        success: true,
        app: "Gazi OTT Server",
        message: "Gazi OTT server is running"
    });
});

app.get("/api/videos", function (req, res) {
    const videos = readVideos();

    const baseUrl =
        process.env.PUBLIC_BASE_URL ||
        `${req.protocol}://${req.get("host")}`;

    const result = videos.map(function (video) {
        return {
            id: video.id,
            title: video.title,
            description: video.description,
            video_url: video.video_url.startsWith("http")
                ? video.video_url
                : `${baseUrl}${video.video_url}`,
            created_at: video.created_at
        };
    });

    res.json(result.reverse());
});

app.post(
    "/api/admin/upload",
    adminAuth,
    upload.single("video"),
    function (req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Video file is required"
                });
            }

            const title = String(req.body.title || "").trim();

            const description = String(
                req.body.description || ""
            ).trim();

            if (!title) {
                fs.unlinkSync(req.file.path);

                return res.status(400).json({
                    success: false,
                    message: "Video title is required"
                });
            }

            const videos = readVideos();

            const newVideo = {
                id: crypto.randomUUID(),
                title: title,
                description: description,
                video_url: `/uploads/${req.file.filename}`,
                original_filename: req.file.originalname,
                created_at: new Date().toISOString()
            };

            videos.push(newVideo);

            saveVideos(videos);

            const baseUrl =
                process.env.PUBLIC_BASE_URL ||
                `${req.protocol}://${req.get("host")}`;

            res.status(201).json({
                success: true,
                message: "Video uploaded successfully",
                video: {
                    id: newVideo.id,
                    title: newVideo.title,
                    description: newVideo.description,
                    video_url:
                        `${baseUrl}${newVideo.video_url}`,
                    created_at: newVideo.created_at
                }
            });
        } catch (error) {
            console.error(error);

            if (
                req.file &&
                fs.existsSync(req.file.path)
            ) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                success: false,
                message: "Upload failed"
            });
        }
    }
);

app.delete(
    "/api/admin/videos/:id",
    adminAuth,
    function (req, res) {
        try {
            const videos = readVideos();

            const video = videos.find(function (item) {
                return item.id === req.params.id;
            });

            if (!video) {
                return res.status(404).json({
                    success: false,
                    message: "Video not found"
                });
            }

            if (
                video.video_url &&
                video.video_url.startsWith("/uploads/")
            ) {
                const filename =
                    path.basename(video.video_url);

                const filePath =
                    path.join(UPLOAD_DIR, filename);

                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            const updatedVideos = videos.filter(
                function (item) {
                    return item.id !== req.params.id;
                }
            );

            saveVideos(updatedVideos);

            res.json({
                success: true,
                message: "Video deleted successfully"
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Delete failed"
            });
        }
    }
);

app.get(
    "/api/admin/videos",
    adminAuth,
    function (req, res) {
        res.json(readVideos().reverse());
    }
);

app.use(function (err, req, res, next) {
    console.error(err);

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }

    res.status(400).json({
        success: false,
        message:
            err.message ||
            "Something went wrong"
    });
});

app.listen(PORT, function () {
    console.log(
        `Gazi OTT Server running on port ${PORT}`
    );
});
