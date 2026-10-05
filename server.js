import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PUBLIC_DIR = path.resolve('public')
const PORT = 3000
const MAX_BODY_SIZE = 10000
const MAX_MESSAGE_LENGTH = 2000


const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
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
    if (message.trim().length === 0) {
        return sendJson(res, 400, { 'error': 'Le message est vide' })
    }
    if (message.trim().length > MAX_MESSAGE_LENGTH) {
        return sendJson(res, 400, { 'error': 'Le message est trop long' })
    }

    sendJson(res, 200, { 'reply': message })

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
    console.log(`Port : http://localhost:${PORT}`)
})
