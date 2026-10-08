import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dossierVault = path.join(__dirname, 'vault')

export function loadVault() {
    const vault = {}

    const vaultArr = fs.readdirSync(dossierVault, { recursive: true })
        .filter(fichier => fichier.endsWith('.md') && !fichier.includes('.obsidian'))

    vaultArr.forEach(element => {
        const brut = fs.readFileSync(path.join(dossierVault, element), 'utf8')
        const id = path.basename(element, '.md')
        const match = brut.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)

        if (!match) {
            console.error(`erreur dans ${element}`)
            return
        }

        const finalmatch = match[1].split(/\r?\n/)
        const meta = {}

        finalmatch.forEach(e => {
            const position = e.indexOf(':')
            if (position === -1) return
            const key = e.slice(0, position).trim()
            const value = e.slice(position + 1).trim()
            meta[key] = value
        })

        vault[id] = {
            titre: meta.titre,
            tags: meta.tags,
            resume: meta.resume,
            contenu: match[2]
        }
    })

    return { vault, index: buildMessage(vault) }
}

function buildMessage(vault) {
    return Object.entries(vault)
        .map(([id, note]) => `${id} | ${note.titre} | ${note.resume} | ${note.tags}`)
        .join('\n')
}

console.log(loadVault().index)