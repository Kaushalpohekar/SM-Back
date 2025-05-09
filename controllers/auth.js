const bcrypt = require('bcrypt');
const db = require('../config/db');
const { generateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

async function register(req, res) {
    try {
        const { first_name, last_name, email, role, password, destination_id } = req.body;

        const validRoles = ['user', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified.' });
        }

        const userExistsQuery = 'SELECT 1 FROM "idp".idp_users WHERE email = $1';
        const userExistsResult = await db.query(userExistsQuery, [email]);

        if (userExistsResult.rowCount > 0) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO "idp".idp_users 
                (first_name, last_name, email, password_hash, role, destination_id)
            VALUES 
                ($1, $2, $3, $4, $5, $6)
            RETURNING user_id
        `;

        const insertResult = await db.query(insertQuery, [
            first_name,
            last_name,
            email,
            hashedPassword,
            role,
            destination_id
        ]);

        res.status(200).json({
            message: 'User registered successfully.',
            user_id: insertResult.rows[0].user_id,
        });

    } catch (error) {
        console.error('Error in registration:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        const query = `
            SELECT user_id, first_name, last_name, email, role, password_hash, destination_id
            FROM "idp".idp_users
            WHERE email = $1
        `;

        const result = await db.query(query, [email]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const payload = {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
            destination_id: user.destination_id,
        };

        const token = generateToken(payload);

        res.status(200).json({
            message: 'Login successful',
            token
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

async function getUser(req, res) {
    try {
        const userId = req.user.user_id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized. User ID missing.' });
        }

        const query = `SELECT * FROM "idp".idp_users WHERE user_id = $1`;
        const { rows } = await db.query(query, [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({ user: rows[0] });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}

function getUserDetails(req, res) {
    const user = req.user;
    res.json({ user });
}

async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { first_name, last_name, role, password, email, destination_id } = req.body;

        const validRoles = ['user', 'admin'];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified.' });
        }

        // Check if user exists
        const userExistsQuery = 'SELECT 1 FROM "idp".idp_users WHERE user_id = $1';
        const userExistsResult = await db.query(userExistsQuery, [id]);

        if (userExistsResult.rowCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Prepare dynamic update query
        const fields = [];
        const values = [];
        let idx = 1;

        if (first_name) { fields.push(`first_name = $${idx++}`); values.push(first_name); }
        if (last_name) { fields.push(`last_name = $${idx++}`); values.push(last_name); }
        if (role) { fields.push(`role = $${idx++}`); values.push(role); }
        if (email) { fields.push(`email = $${idx++}`); values.push(email); }
        if (destination_id) { fields.push(`destination_id = $${idx++}`); values.push(destination_id); }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fields.push(`password_hash = $${idx++}`);
            values.push(hashedPassword);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No fields provided for update.' });
        }

        const updateQuery = `
            UPDATE "idp".idp_users
            SET ${fields.join(', ')}
            WHERE user_id = $${idx}
        `;
        values.push(id);

        await db.query(updateQuery, values);

        res.status(200).json({ message: 'User updated successfully.' });
    } catch (error) {
        console.error('Error in updateUser:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}

module.exports = {
    register,
    login,
    getUserDetails,
    updateUser,
    getUser
};
