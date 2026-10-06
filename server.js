import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const GEMINI_API_KEY = process.env.API_KEY
const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_TIMEOUT = 60_000
const PUBLIC_DIR = path.resolve('public')
const PORT = 3000
const MAX_BODY_SIZE = 50000
const MAX_MESSAGE_LENGTH = 7000
const MAX_HISTORY = 20
const ALLOWED_ROLES = ['user', 'model']

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
}


if (!GEMINI_API_KEY) {
    console.error('API Key introuvable')
    process.exit(1)
}

function isValidHistory(history) {

    if (!Array.isArray(history)) {
        return false
    }
    if (history.length > MAX_HISTORY) {
        return false
    }

    return history.every((msg) => {
        const role = msg?.role
        const text = msg?.text
        return ALLOWED_ROLES.includes(role) && typeof text === 'string' && text.trim().length > 0 && text.length <= MAX_MESSAGE_LENGTH
    })

}

async function askGemini(history, text) {
    const contents = [
        ...history.map((msg) => ({ role: msg.role, parts: [{ text: msg.text }] })),
        { role: 'user', parts: [{ text }] }
    ]
    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT)
    })
    if (!response.ok) {
        const details = await response.text()
        throw new Error(`Gemini a répondu ${response.status} : ${details}`)
    }
    const data = await response.json()
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (typeof reply !== 'string') {

        throw new Error('Mauvais format')
    }
    return reply
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_BODY_SIZE) {
                const err = new Error('Trop volumineux')
                err.status = 413
                reject(err)
            } else {
                chunks.push(chunk)
            }
        })
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString()
            resolve(body)
        })
        req.on('error', reject)
    })
}

async function handleChat(req, res) {
    const string = await readBody(req)
    let data
    
    try {
        data = JSON.parse(string)
    } catch {
        return sendJson(res, 400, { error: 'JSON Invalide' })
    }

    const message = data?.message
    if (typeof message !== 'string') {
        return sendJson(res, 400, { 'error': 'Le message doit etre une string' })
    }
    const history = data?.history ?? []
    if (!isValidHistory(history)) {
        return sendJson(res, 400, { error: "Erreur dans l'historique des messages" })
    }
    const text = message.trim()
    if (text.length === 0) {
        return sendJson(res, 400, { 'error': 'Le message est vide' })
    } else if (text.length > MAX_MESSAGE_LENGTH) {
        return sendJson(res, 400, { 'error': 'Le message est trop long' })
    }
    try {
        const reply = await askGemini(history, text)
        return sendJson(res, 200, { reply })
    } catch (err) {
        console.error(err)
        if (err.name === 'TimeoutError') {
            return sendJson(res, 504, { 'error': 'Timeout Error' })
        }
        sendJson(res, 502, { 'error': 'Erreur' })

    }

}

function sendJson(res, status, data) {
    const headers = { "Content-type": "application/json" }
    const body = JSON.stringify(data)
    res.writeHead(status, headers)
    res.end(body)
}

function sendNotFound(res) {
    res.writeHead(404, { "Content-Type": "text/plain ; charset=utf-8" })
    res.end('Erreur 404')

}

async function serveStatic(res, pathname) {
    let filePath = pathname
    if (pathname === '/') {
        filePath = '/index.html'
    }
    const fullPath = path.join(PUBLIC_DIR, filePath)
    if (!fullPath.startsWith(PUBLIC_DIR + path.sep)) {
        return sendNotFound(res)
    }
    const ext = path.extname(fullPath)
    const contentType = MIME_TYPES[ext]
    if (!contentType) {
        return sendNotFound(res)
    }

    try {
        const content = await readFile(fullPath)
        res.writeHead(200, { "Content-Type": contentType })
        res.end(content)
    } catch (err) {
        if (err.code === 'ENOENT') {
            return sendNotFound(res)

        }
        throw err
    }
}

const server = http.createServer(async (req, res) => {

    try {
        const { pathname } = new URL(req.url, `http://${req.headers.host}`)
        console.log(req.method, pathname)


        if (pathname === '/api/chat') {
            if (req.method === 'POST') {
                return await handleChat(req, res)
            } else {
                return sendJson(res, 405, { "error": "Methode non autorisee" })
            }
        }

        if (req.method === 'GET') {
            return await serveStatic(res, pathname)
        }
        return sendJson(res, 405, { "error": 'Methode non autorisee' })
    } catch (err) {

        if (err.status === 413) {
            return sendJson(res, 413, { 'error': 'Requete trop grosse' })
        }
        console.error(err)
        sendJson(res, 500, { error: 'Erreur serveur' })
    }
})

server.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`)
})
