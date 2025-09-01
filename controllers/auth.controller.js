import { validationResult } from 'express-validator'
import { hashPassword, checkPassword, generateJWT } from '../auth.js'

export const register = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'fail', errors: errors.array() })
    }

    const { username, email, password, role } = req.body

    try {
        const existingUser = await db
            .collection('users')
            .findOne({ $or: [{ username }, { email }] })
        if (existingUser) {
            return res.status(409).json({ message: 'Username or email already exists.' })
        }

        const hashedPassword = await hashPassword(password)
        if (!hashedPassword) {
            return res.status(500).json({ message: 'Error occurred during password processing.' })
        }

        const newUser = {
            username,
            email,
            password: hashedPassword,
            role,
            full_name: '',
            profile_image_url: '',
            bio: '',
            contact_phone: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        const result = await db.collection('users').insertOne(newUser)
        if (!result.acknowledged) {
            return res.status(500).json({ message: 'Failed to save registration data.' })
        }

        res.status(201).json({ message: 'Registration successful.' })
    } catch (err) {
        console.error('Error in /register controller:', err)
        res.status(500).json({ message: 'An internal server error occurred.' })
    }
}

export const login = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'fail', errors: errors.array() })
    }

    const { username, password } = req.body

    try {
        const user = await db.collection('users').findOne({ username })
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' })
        }

        const isValid = await checkPassword(password, user.password)
        if (!isValid) {
            return res.status(401).json({ message: 'Invalid credentials.' })
        }

        const token = generateJWT({
            id: user._id.toString(),
            username: user.username,
            role: user.role,
        })
        if (!token) {
            return res.status(500).json({ message: 'Could not generate authentication token.' })
        }

        return res.status(200).json({ jwt_token: token, role: user.role })
    } catch (err) {
        console.error('Error in /login controller:', err)
        res.status(500).json({ message: 'An internal server error occurred.' })
    }
}
