import streamifier from 'streamifier'
import cloudinary from '../config/cloudinary.js'

export function uploadBufferToCloudinary(buffer, opts = {}) {
    const {
        folder = 'futsal-pulse/avatars',
        public_id,
        resource_type = 'image',
        overwrite = true,
        invalidate = true,
    } = opts

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { resource_type, folder, public_id, overwrite, invalidate },
            (err, result) => (err ? reject(err) : resolve(result))
        )
        streamifier.createReadStream(buffer).pipe(stream)
    })
}

export function deleteFromCloudinary(publicId) {
    return cloudinary.uploader.destroy(publicId)
}
