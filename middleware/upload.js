import multer from 'multer'

const ALLOWED = ['image/jpeg', 'image/png']
const MAX_MB = 3

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED.includes(file.mimetype)) {
            return cb(new Error('Only JPG/PNG images are allowed.'))
        }
        cb(null, true)
    },
})

export default upload
