import path from 'node:path'
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dossierVault = path.join(__dirname, 'vault')

const vaultArr = fs.readdirSync(dossierVault, { recursive: true }).filter(fichier => fichier.endsWith('.md') && !fichier.includes('.obsidian'))
console.log(vaultArr)


export function loadVault(vaultArr) {

    const vault = {}

    vaultArr.forEach(element => {
        const brut = fs.readFileSync(path.join(dossierVault, element), 'utf8')
        const id = path.basename(element, '.md')
        vault[id] = {brut}
    })
    return vault
}

const vault = loadvault(vaultArr)
   console.log(Object.keys(vault))