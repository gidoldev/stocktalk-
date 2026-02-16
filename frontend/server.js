/* ============================================================
   server.js - Express 백엔드 서버
   
   설치: npm init -y && npm install express cors bcryptjs jsonwebtoken dotenv pg
   실행: node server.js
============================================================ */

const express = require('express');
const cors = require('cors');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { Pool } = require('pg');

const app = express();

// ============================================================
// [1] 보안 미들웨어 설정
// ============================================================

// CORS 설정 (Cloudflare Pages 도메인 허용)
const corsOptions = {
    origin: [
        'https://stocktalk.pages.dev',      // Cloudflare Pages
        'http://localhost:5000',             // 로컬 개발
        'http://localhost:3000'              // 대체 포트
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// 보안 헤더 설정
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Rate Limiting (간단한 버전)
const rateLimit = {};
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!rateLimit[ip]) {
        rateLimit[ip] = [];
    }
    
    // 1분 이내 요청만 유지
    rateLimit[ip] = rateLimit[ip].filter(time => now - time < 60000);
    
    if (rateLimit[ip].length > 100) { // 분당 100 요청 제한
        return res.status(429).json({ error: '너무 많은 요청입니다. 나중에 다시 시도하세요.' });
    }
    
    rateLimit[ip].push(now);
    next();
});

// ============================================================
// [2] 데이터베이스 연결
// ============================================================

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'stocktalk',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// DB 연결 테스트
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('데이터베이스 연결 실패:', err);
    } else {
        console.log('데이터베이스 연결 성공:', res.rows[0]);
    }
});

// ============================================================
// [3] 데이터베이스 초기화 (테이블 생성)
// ============================================================

async function initDatabase() {
    try {
        // users 테이블
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // posts 테이블
        await pool.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                likes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // likes 테이블 (사용자-포스트 좋아요 추적)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS post_likes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, post_id)
            )
        `);

        // chats 테이블
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ 데이터베이스 초기화 완료');
    } catch (error) {
        console.error('❌ 데이터베이스 초기화 실패:', error);
    }
}

initDatabase();

// ============================================================
// [4] JWT 토큰 생성/검증 함수
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// JWT 미들웨어
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }

    req.userId = decoded.userId;
    next();
}

// ============================================================
// [5] 입력값 검증 함수
// ============================================================

function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 50) {
        return '아이디는 3-50자 사이여야 합니다.';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return '아이디는 영문, 숫자, 언더스코어만 가능합니다.';
    }
    return null;
}

function validatePassword(password) {
    if (!password || password.length < 6) {
        return '비밀번호는 6자 이상이어야 합니다.';
    }
    return null;
}

// ============================================================
// [6] 인증 API
// ============================================================

// 회원가입
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 입력값 검증
        let error = validateUsername(username);
        if (error) return res.status(400).json({ error });

        error = validatePassword(password);
        if (error) return res.status(400).json({ error });

        // 중복 확인
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
        }

        // 비밀번호 해싱 (bcrypt)
        const passwordHash = await bcryptjs.hash(password, 10);

        // 사용자 생성
        const result = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, passwordHash]
        );

        const user = result.rows[0];
        const token = generateToken(user.id);

        res.status(201).json({
            success: true,
            message: '회원가입 성공',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
        }

        // 사용자 조회
        const result = await pool.query(
            'SELECT id, username, password_hash FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }

        const user = result.rows[0];

        // 비밀번호 검증
        const isPasswordValid = await bcryptjs.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }

        const token = generateToken(user.id);

        res.json({
            success: true,
            message: '로그인 성공',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 토큰 검증
app.post('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ success: true, userId: req.userId });
});

// 계정 삭제
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;

        // 사용자 삭제 (CASCADE로 관련 데이터 자동 삭제)
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ success: true, message: '계정이 삭제되었습니다.' });
    } catch (error) {
        console.error('계정 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ============================================================
// [7] 게시글 API
// ============================================================

// 게시글 목록 조회
app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id, 
                p.title, 
                p.content, 
                p.likes,
                p.created_at,
                u.username
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            posts: result.rows
        });
    } catch (error) {
        console.error('게시글 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게시글 상세 조회
app.get('/api/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT 
                p.id, 
                p.title, 
                p.content, 
                p.likes,
                p.created_at,
                u.username
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        res.json({
            success: true,
            post: result.rows[0]
        });
    } catch (error) {
        console.error('게시글 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게시글 작성 (인증 필요)
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { title, content } = req.body;
        const userId = req.userId;

        if (!title || !content) {
            return res.status(400).json({ error: '제목과 내용을 입력하세요.' });
        }

        if (title.length > 255) {
            return res.status(400).json({ error: '제목은 255자 이하여야 합니다.' });
        }

        const result = await pool.query(
            'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
            [userId, title, content]
        );

        res.status(201).json({
            success: true,
            message: '게시글이 작성되었습니다.',
            post: result.rows[0]
        });
    } catch (error) {
        console.error('게시글 작성 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게시글 수정 (본인만)
app.put('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        const userId = req.userId;

        if (!title || !content) {
            return res.status(400).json({ error: '제목과 내용을 입력하세요.' });
        }

        // 게시글 소유 확인
        const postCheck = await pool.query(
            'SELECT user_id FROM posts WHERE id = $1',
            [id]
        );

        if (postCheck.rows.length === 0) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        if (postCheck.rows[0].user_id !== userId) {
            return res.status(403).json({ error: '자신의 게시글만 수정할 수 있습니다.' });
        }

        const result = await pool.query(
            'UPDATE posts SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [title, content, id]
        );

        res.json({
            success: true,
            message: '게시글이 수정되었습니다.',
            post: result.rows[0]
        });
    } catch (error) {
        console.error('게시글 수정 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 게시글 삭제 (본인만)
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        // 게시글 소유 확인
        const postCheck = await pool.query(
            'SELECT user_id FROM posts WHERE id = $1',
            [id]
        );

        if (postCheck.rows.length === 0) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        if (postCheck.rows[0].user_id !== userId) {
            return res.status(403).json({ error: '자신의 게시글만 삭제할 수 있습니다.' });
        }

        await pool.query('DELETE FROM posts WHERE id = $1', [id]);

        res.json({
            success: true,
            message: '게시글이 삭제되었습니다.'
        });
    } catch (error) {
        console.error('게시글 삭제 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ============================================================
// [8] 좋아요 API
// ============================================================

// 좋아요 추가/제거 토글
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        // 게시글 존재 확인
        const postCheck = await pool.query(
            'SELECT id FROM posts WHERE id = $1',
            [id]
        );

        if (postCheck.rows.length === 0) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        // 좋아요 여부 확인
        const likeCheck = await pool.query(
            'SELECT id FROM post_likes WHERE user_id = $1 AND post_id = $2',
            [userId, id]
        );

        if (likeCheck.rows.length > 0) {
            // 좋아요 제거
            await pool.query(
                'DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2',
                [userId, id]
            );
            await pool.query(
                'UPDATE posts SET likes = likes - 1 WHERE id = $1',
                [id]
            );
            res.json({ success: true, liked: false });
        } else {
            // 좋아요 추가
            await pool.query(
                'INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)',
                [userId, id]
            );
            await pool.query(
                'UPDATE posts SET likes = likes + 1 WHERE id = $1',
                [id]
            );
            res.json({ success: true, liked: true });
        }
    } catch (error) {
        console.error('좋아요 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 좋아요 상태 확인
app.get('/api/posts/:id/like-status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const result = await pool.query(
            'SELECT id FROM post_likes WHERE user_id = $1 AND post_id = $2',
            [userId, id]
        );

        res.json({
            success: true,
            liked: result.rows.length > 0
        });
    } catch (error) {
        console.error('좋아요 상태 확인 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ============================================================
// [9] 채팅 API
// ============================================================

// 채팅 메시지 저장
app.post('/api/chats', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        const userId = req.userId;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: '메시지를 입력하세요.' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: '메시지는 500자 이하여야 합니다.' });
        }

        const result = await pool.query(
            'INSERT INTO chats (user_id, message) VALUES ($1, $2) RETURNING *',
            [userId, message]
        );

        res.status(201).json({
            success: true,
            chat: result.rows[0]
        });
    } catch (error) {
        console.error('채팅 저장 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 채팅 메시지 조회
app.get('/api/chats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.id,
                c.message,
                c.created_at,
                u.username
            FROM chats c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            chats: result.rows.reverse() // 오래된 순서로 반환
        });
    } catch (error) {
        console.error('채팅 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ============================================================
// [10] 헬스 체크
// ============================================================

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================
// [11] 404 핸들러
// ============================================================

app.use((req, res) => {
    res.status(404).json({ error: 'API 엔드포인트를 찾을 수 없습니다.' });
});

// ============================================================
// [12] 에러 핸들러
// ============================================================

app.use((err, req, res, next) => {
    console.error('에러:', err);
    res.status(500).json({ error: '예상치 못한 서버 오류가 발생했습니다.' });
});

// ============================================================
// [13] 서버 시작
// ============================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║    🌊 StockTalk API 서버 시작          ║
║    PORT: ${PORT}                        ║
║    ENV: ${process.env.NODE_ENV || 'development'} ║
╚════════════════════════════════════════╝
    `);
});

module.exports = app;
