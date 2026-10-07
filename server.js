import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const GEMINI_API_KEY = process.env.API_KEY
const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_TIMEOUT = 60000
const PUBLIC_DIR = path.resolve('public')
const PORT = 3000
const MAX_BODY_SIZE = 50000
const MAX_MESSAGE_LENGTH = 6000
const MAX_CONTEXT_LENGTH = 3000

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
}


if (!GEMINI_API_KEY) {
    console.error('API Key introuvable')
    process.exit(1)
}

async function callGemini(requestBody) {
    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify(requestBody),
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

async function askGemini(context, text) {
    return callGemini({
        systemInstruction: { parts: [{ text: `Contexte de la conversation : ${context}` }] },
        contents: [{ role: 'user', parts: [{ text }] }]
    })
}

async function updateContext(context, userText, reply) {
    const prompt = `Tu mets e jour le contexte d'une conversation entre un utilisateur et un assistant.

Règles :
- Garde uniquement les informations utiles à la discussion (nom, préférences, projet etc..)
- Ignore les informations inutiles (comme les formules de politesse et les détails sans importances)
- Ne renvoie que quelques phrases maximum, à la 3 eme personne et au format texte brut (pas de markdown)
- Réponds uniquement avec le nouveau contexte, sans introduction

Contexte actuel :
"""
${context || '(aucun)'}
"""

Nouvel échange :
Utilisateur : """${userText}"""
Assistant : """${reply}"""`

    return callGemini({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300 }
    })
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
    const text = message.trim()
    if (text.length === 0) {
        return sendJson(res, 400, { 'error': 'Le message est vide' })
    } else if (text.length > MAX_MESSAGE_LENGTH) {
        return sendJson(res, 400, { 'error': 'Le message est trop long' })
    }
    const context = data?.context ?? ''
    if (typeof context !== 'string' || context.length > MAX_CONTEXT_LENGTH) {
        return sendJson(res, 400, { error: 'Contexte invalide' })
    }
    let reply
    try {
        reply = await askGemini(context, text)
    } catch (err) {
        console.error(err)
        if (err.name === 'TimeoutError') {
            return sendJson(res, 504, { 'error': 'Timeout Error' })
        }
        return sendJson(res, 502, { 'error': 'Erreur' })
    }
    let newContext = context
    try {
        newContext = await updateContext(context, text, reply)
    } catch (err) {
        console.error(err)
    }

    return sendJson(res, 200, { reply, context: newContext })

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
