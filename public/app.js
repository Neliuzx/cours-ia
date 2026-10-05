const chatInput = document.querySelector('.chat-input')
chatInput.placeholder = "Ecrivez votre message ici.."
const form = document.querySelector('#chat-form')
const button = document.querySelector('#chat-send-button')
const messagesEl = document.querySelector('#messages')

function addMessage(text, author) {
    const message = document.createElement('div')
    message.classList.add(author)
    message.textContent = text
    messagesEl.appendChild(message)
    return message
}

form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const text = chatInput.value.trim()
    if (!text) return

    addMessage(text, 'user')
    chatInput.value = ''
    button.disabled = true
    const loader = addMessage('…', 'bot')

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text
            })
        })
        const data = await response.json()
        if (!response.ok) {
            addMessage(data.error, 'error')
        }else{
            addMessage(data.reply, 'bot')
        }
    } catch (err) {
        console.error(err)
        addMessage(err, 'error')
    } finally {
        loader.remove()
        button.disabled = false
        chatInput.focus()
    }
})