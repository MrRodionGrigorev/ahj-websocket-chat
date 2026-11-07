export default class Chat {
  constructor(container, apiUrl) {
    this.container = container;
    this.apiUrl = apiUrl;
    this.user = null;
    this.socket = null;
  }

  init() {
    this.container.innerHTML = `
      <section class="chat" hidden>
        <aside class="users-panel"><h2>Участники</h2><ul class="users"></ul></aside>
        <div class="chat-main">
          <header><div><p class="eyebrow">Корпоративный портал</p><h1>Корпоративный чат</h1></div><span class="connection">Не подключено</span></header>
          <div class="messages" aria-live="polite"></div>
          <form class="message-form"><input name="message" maxlength="2000" placeholder="Введите сообщение" autocomplete="off" required><button>Отправить</button></form>
        </div>
      </section>
      <div class="modal"><form class="login-form"><h2>Выберите псевдоним</h2><label>Ваше имя<input name="name" maxlength="30" autocomplete="off" required autofocus></label><p class="login-error" role="alert"></p><button>Продолжить</button></form></div>`;
    this.chat = this.container.querySelector('.chat');
    this.users = this.container.querySelector('.users');
    this.messages = this.container.querySelector('.messages');
    this.connection = this.container.querySelector('.connection');
    this.loginForm = this.container.querySelector('.login-form');
    this.messageForm = this.container.querySelector('.message-form');
    this.loginForm.addEventListener('submit', (event) => this.login(event));
    this.messageForm.addEventListener('submit', (event) => this.send(event));
    window.addEventListener('beforeunload', () => {
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'exit' }));
    });
  }

  async login(event) {
    event.preventDefault();
    const button = this.loginForm.querySelector('button');
    const error = this.loginForm.querySelector('.login-error');
    const name = this.loginForm.elements.name.value.trim();
    if (!name) return;
    button.disabled = true;
    error.textContent = '';
    try {
      const response = await fetch(new URL('new-user', this.apiUrl), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось войти в чат');
      this.user = result.user;
      this.container.querySelector('.modal').hidden = true;
      this.chat.hidden = false;
      this.connect();
    } catch (requestError) {
      error.textContent = requestError.message === 'Failed to fetch'
        ? 'Сервер недоступен. Проверьте, что backend запущен.' : requestError.message;
    } finally {
      button.disabled = false;
    }
  }

  connect() {
    const url = new URL(this.apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('userId', this.user.id);
    this.connection.textContent = 'Подключение…';
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => { this.connection.textContent = 'В сети'; });
    this.socket.addEventListener('message', ({ data }) => {
      const value = JSON.parse(data);
      if (Array.isArray(value)) this.renderUsers(value);
      else if (value.type === 'send') this.renderMessage(value);
    });
    this.socket.addEventListener('close', () => {
      this.connection.textContent = 'Соединение потеряно';
      if (this.user) setTimeout(() => this.connect(), 1000);
    });
  }

  renderUsers(items) {
    this.users.replaceChildren(...items.map((item) => {
      const element = document.createElement('li');
      element.textContent = item.id === this.user.id ? 'You' : item.name;
      if (item.id === this.user.id) element.className = 'you';
      return element;
    }));
  }

  send(event) {
    event.preventDefault();
    const input = this.messageForm.elements.message;
    const message = input.value.trim();
    if (!message || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'send', message }));
    input.value = '';
  }

  renderMessage(data) {
    const own = data.user.id === this.user.id;
    const item = document.createElement('article');
    item.className = `message ${own ? 'message--own' : 'message--incoming'}`;
    const meta = document.createElement('p');
    meta.className = 'message-meta';
    meta.textContent = `${own ? 'You' : data.user.name}, ${new Date(data.created).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    const text = document.createElement('p');
    text.className = 'message-text';
    text.textContent = data.message;
    item.append(meta, text);
    this.messages.append(item);
    this.messages.scrollTop = this.messages.scrollHeight;
  }
}
