// ===================================================================================
// --- РАЗДЕЛ 1: ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ---
// ===================================================================================

const DOMElements = {};
document.querySelectorAll('[id]').forEach(el => DOMElements[el.id] = el);

const welcomeMessages = ["Чем я могу помочь?", "Что придумаем сегодня?", "Готов к новым идеям?", "Спросите что-нибудь..."];
let activeEditorInfo = { originalNode: null, files: [] };
let dragCounter = 0;
let canvas, ctx, isDrawing = false, lastX, lastY;
let canvasHistory = [];
let historyIndex = -1;

let state = {
    currentModel: 'gpt-oss',
    conversationHistory: [],
    chats: [],
    currentChatId: null,
    isGenerating: false,
    abortController: null,
    editingMessageId: null,
    attachedFiles: [],
    settings: { 
        theme: 'system', 
        systemPrompt: '', 
        userName: 'Пользователь', 
        accentColor: '#4a5fc1', 
        apiKeys: { chatgpt: '', deepseek: '', qwen: '' } 
    },
    customModels: [],
    isPreviewModeActive: false,
    activeCodePreviewContent: '',
};

const BUILT_IN_MODELS = {
    'gpt-oss':  { name: 'ChatGPT', endpoint: 'https://openrouter.ai/api/v1/chat/completions', modelName: 'openai/gpt-oss-20b:free', apiKeyName: 'chatgpt', vision: false },
    'deepseek': { name: 'DeepSeek', endpoint: 'https://openrouter.ai/api/v1/chat/completions', modelName: 'deepseek/deepseek-chat', apiKeyName: 'deepseek', vision: false },
    'qwen':     { name: 'Qwen (Vision)', endpoint: 'https://openrouter.ai/api/v1/chat/completions', modelName: 'qwen/qwen2.5-vl-32b-instruct:free', apiKeyName: 'qwen', vision: true }
};

// ===================================================================================
// --- РАЗДЕЛ 2: ОСНОВНЫЕ ФУНКЦИИ ---
// ===================================================================================

const saveState = () => { 
    localStorage.setItem('chats', JSON.stringify(state.chats)); 
    localStorage.setItem('appSettings', JSON.stringify(state.settings));
    localStorage.setItem('customModels', JSON.stringify(state.customModels));
};

function loadState() {
    const chats = JSON.parse(localStorage.getItem('chats'));
    const settings = JSON.parse(localStorage.getItem('appSettings'));
    const customModels = JSON.parse(localStorage.getItem('customModels'));
    if (chats) state.chats = chats;
    if (settings) {
        state.settings = { ...state.settings, ...settings };
        if (!state.settings.apiKeys) state.settings.apiKeys = { chatgpt: '', deepseek: '', qwen: '' };
    }
    if (customModels) state.customModels = customModels;
}

// --- TELEGRAM MINI APP INTEGRATION ---
function initTelegramApp() {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand(); 

    if (tg.colorScheme) {
        state.settings.theme = tg.colorScheme;
        document.body.style.backgroundColor = tg.themeParams.bg_color;
    }

    const user = tg.initDataUnsafe.user;
    if (user) {
        const fullName = `${user.first_name} ${user.last_name || ''}`.trim();
        state.settings.userName = fullName;
    }
}

function init() {
    loadState();
    
    // Инициализация Telegram если открыто через бота
    if (window.Telegram && window.Telegram.WebApp) {
        initTelegramApp();
    }
    
    applySettings();
    renderModelDropdown();
    if (state.chats.length > 0) { loadChat(state.chats[0].id); } else { prepareNewChatUI(); }
    addEventListeners();
    initDrawingCanvas();
}

// ===================================================================================
// --- РАЗДЕЛ 3: НАСТРОЙКИ И ИНТЕРФЕЙС ---
// ===================================================================================

function updateSystemTheme() {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.body.classList.toggle('light-theme', systemTheme === 'light');
}

function applySettings() {
    if (state.settings.theme === 'system') {
        updateSystemTheme();
    } else {
        document.body.classList.toggle('light-theme', state.settings.theme === 'light');
    }
    DOMElements.themeSelect.value = state.settings.theme;
    document.documentElement.style.setProperty('--accent-primary', state.settings.accentColor || '#4a5fc1');
    DOMElements.accentColor.value = state.settings.accentColor;
    DOMElements.userNameInput.value = state.settings.userName || 'Пользователь';
    DOMElements.sidebarUserName.textContent = state.settings.userName || 'Пользователь';
    updateUserAvatar();
    updateUserMenuIdentity();
    DOMElements.systemPrompt.value = state.settings.systemPrompt;
    DOMElements.apiKey_chatgpt.value = state.settings.apiKeys.chatgpt || '';
    DOMElements.apiKey_deepseek.value = state.settings.apiKeys.deepseek || '';
    DOMElements.apiKey_qwen.value = state.settings.apiKeys.qwen || '';
}

function updateUserAvatar() {
    const userName = state.settings.userName || 'Пользователь';
    let initials = '';
    const nameParts = userName.trim().split(/\s+/);
    if (nameParts.length > 1 && nameParts[0] && nameParts[1]) {
        initials = (nameParts[0][0] || '') + (nameParts[1][0] || '');
    } else if (userName.length > 1) {
        initials = userName.substring(0, 2);
    } else {
        initials = userName;
    }
    initials = initials.toUpperCase();
    DOMElements.sidebarAvatar.textContent = initials;
    DOMElements.sidebarCollapsedAvatar.textContent = initials;
}

function updateUserMenuIdentity() {
    const userName = state.settings.userName;
    if (userName && userName !== 'Пользователь') {
        DOMElements.userMenuEmail.textContent = userName;
    } else {
        if (!DOMElements.userMenuEmail.textContent.startsWith('user')) {
            DOMElements.userMenuEmail.textContent = `user${Math.floor(1000 + Math.random() * 9000)}`;
        }
    }
}

function saveSettings() {
    state.settings.theme = DOMElements.themeSelect.value;
    state.settings.systemPrompt = DOMElements.systemPrompt.value;
    state.settings.userName = DOMElements.userNameInput.value.trim() || 'Пользователь';
    state.settings.accentColor = DOMElements.accentColor.value.trim() || '#4a5fc1';
    state.settings.apiKeys.chatgpt = DOMElements.apiKey_chatgpt.value.trim();
    state.settings.apiKeys.deepseek = DOMElements.apiKey_deepseek.value.trim();
    state.settings.apiKeys.qwen = DOMElements.apiKey_qwen.value.trim();
    saveState();
    applySettings();
    toggleModal('settingsModal', false);
}

const toggleModal = (modalId, show) => {
    const modal = DOMElements[modalId];
    if (!modal) return;
    modal.classList.toggle('show', show);
    const isAnyModalOpen = document.querySelector('.settings-modal.show, .drawing-modal.show, .immersive-modal.show');
    const isImmersive = modal.classList.contains('drawing-modal') || modal.classList.contains('immersive-modal');
    const showOverlay = isAnyModalOpen && !DOMElements.sidebar.classList.contains('open') && !isImmersive;
    DOMElements.sidebarOverlay.classList.toggle('show', showOverlay);
};

function saveCustomModel() {
    const baseUrl = DOMElements.modelBaseUrl.value.trim();
    const modelName = DOMElements.modelName.value.trim();
    const apiKey = DOMElements.modelApiKey.value.trim();
    const vision = DOMElements.modelVision.checked;
    if (!modelName) { alert('Имя модели (Model Name) обязательно для заполнения.'); return; }
    try { new URL(baseUrl); } catch (e) { if (baseUrl) { alert('Base URL не является корректным URL.'); return; } }
    const newModel = { id: `custom-${Date.now()}`, name: modelName, baseUrl: baseUrl || 'https://openrouter.ai/api/v1/chat/completions', apiKey: apiKey, vision: vision };
    state.customModels.push(newModel);
    saveState(); renderModelDropdown(); toggleModal('addModelModal', false);
}

function deleteCustomModel(modelId) {
    if (!confirm(`Вы уверены, что хотите удалить модель "${state.customModels.find(m => m.id === modelId)?.name}"?`)) return;
    state.customModels = state.customModels.filter(m => m.id !== modelId);
    if (state.currentModel === modelId) state.currentModel = 'gpt-oss';
    saveState(); loadChat(state.currentChatId);
}

const toggleSidebar = (show) => {
    const isOpen = DOMElements.sidebar.classList.contains('open');
    const shouldShow = typeof show === 'boolean' ? show : !isOpen;
    DOMElements.sidebar.classList.toggle('open', shouldShow);
    if (window.innerWidth < 1024) DOMElements.sidebarOverlay.classList.toggle('show', shouldShow);
};

const scrollToBottom = () => setTimeout(() => DOMElements.main.scrollTop = DOMElements.main.scrollHeight, 100);

// ===================================================================================
// --- РАЗДЕЛ 4: УПРАВЛЕНИЕ ЧАТАМИ ---
// ===================================================================================

function updatePageTitle() {
    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (chat && chat.title !== 'Новый чат') {
        document.title = `${chat.title} - FreeChat`;
    } else {
        document.title = 'FreeChat';
    }
}

const prepareNewChatUI = () => {
    state.currentChatId = null; state.conversationHistory = []; DOMElements.chatContainer.innerHTML = '';
    DOMElements.chatContainer.classList.remove('active'); DOMElements.welcomeScreen.classList.remove('hidden');
    DOMElements.welcomeScreen.querySelector('h1').textContent = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    document.body.classList.add('new-chat-active');
    renderChatsList(); DOMElements.messageInput.value = ''; DOMElements.messageInput.focus();
    clearAttachedFiles();
    updatePageTitle();
};

const createNewChat = () => { if (state.isGenerating) return; stopGeneration(); exitEditMode(); prepareNewChatUI(); toggleSidebar(false); };

function loadChat(chatId, maintainScroll = false) {
    if (state.isGenerating) return; stopGeneration();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) { prepareNewChatUI(); return; }
    const mainEl = DOMElements.main;
    const isScrolledToBottom = mainEl.scrollHeight - mainEl.clientHeight <= mainEl.scrollTop + 1;
    state.currentChatId = chatId; state.conversationHistory = chat.messages || []; state.currentModel = chat.model || 'gpt-oss';
    DOMElements.chatContainer.innerHTML = '';
    const hasMessages = state.conversationHistory.length > 0;
    DOMElements.welcomeScreen.classList.toggle('hidden', hasMessages); DOMElements.chatContainer.classList.toggle('active', hasMessages);
    if (hasMessages) {
        document.body.classList.remove('new-chat-active');
        state.conversationHistory.forEach(msg => addMessageToDOM(msg, true));
    } else {
        document.body.classList.add('new-chat-active');
    }
    updateModelDisplay(); renderChatsList(); 
    if (isScrolledToBottom && !maintainScroll) scrollToBottom();
    updateAIActions();
    updatePageTitle();
}

function updateCurrentChat() {
    if (!state.currentChatId) return;
    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (chat) { chat.messages = state.conversationHistory.map(msg => ({ ...msg })); chat.model = state.currentModel; saveState(); renderChatsList(); }
}

const deleteChat = (chatId) => {
    if (confirm(`Вы уверены, что хотите удалить этот чат?`)) {
        state.chats = state.chats.filter(c => c.id !== chatId);
        saveState();
        if (state.currentChatId === chatId) { if (state.chats.length > 0) loadChat(state.chats[0].id); else prepareNewChatUI(); }
        renderChatsList();
    }
};

// ===================================================================================
// --- РАЗДЕЛ 5: РЕНДЕРИНГ ЭЛЕМЕНТОВ ---
// ===================================================================================

function renderChatsList() {
    const chatsList = DOMElements.chatsList; chatsList.innerHTML = '';
    const query = DOMElements.chatSearchInput.value.toLowerCase();
    const filteredChats = state.chats.filter(c => c.title.toLowerCase().includes(query));
    if (filteredChats.length === 0) { chatsList.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Чатов не найдено</div>`; return; }
    filteredChats.forEach(chat => {
        const chatEl = document.createElement('div'); chatEl.className = 'chat-item'; chatEl.classList.toggle('active', chat.id === state.currentChatId); chatEl.dataset.chatId = chat.id;
        chatEl.innerHTML = `<span class="chat-item-title">${chat.title}</span><div class="chat-item-actions"><button class="icon-btn rename-chat-btn" title="Переименовать"><span class="material-symbols-outlined">edit</span></button><button class="icon-btn delete-chat-btn" title="Удалить чат"><span class="material-symbols-outlined">delete</span></button></div>`;
        chatEl.addEventListener('click', (e) => {
            const chatId = parseInt(chatEl.dataset.chatId);
            if (e.target.closest('.delete-chat-btn')) { e.stopPropagation(); deleteChat(chatId); }
            else if (e.target.closest('.rename-chat-btn')) { e.stopPropagation(); enterChatRenameMode(chatId); }
            else { loadChat(chatId); toggleSidebar(false); }
        });
        chatsList.appendChild(chatEl);
    });
}

function enterChatRenameMode(chatId) {
    const chatEl = DOMElements.chatsList.querySelector(`[data-chat-id="${chatId}"]`), titleEl = chatEl.querySelector('.chat-item-title'), currentTitle = titleEl.textContent;
    const input = document.createElement('input'); input.type = 'text'; input.className = 'chat-item-input'; input.value = currentTitle;
    const saveRename = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) { 
            const chatToUpdate = state.chats.find(c => c.id === chatId); 
            if (chatToUpdate) { chatToUpdate.title = newTitle; saveState(); if (chatId === state.currentChatId) updatePageTitle(); } 
        }
        renderChatsList();
    };
    input.addEventListener('blur', saveRename); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRename(); } else if (e.key === 'Escape') { renderChatsList(); } });
    titleEl.replaceWith(input); input.focus(); input.select();
}

function renderModelDropdown() {
    const dropdown = DOMElements.modelDropdown; dropdown.innerHTML = '';
    Object.entries(BUILT_IN_MODELS).forEach(([id, model]) => { const option = document.createElement('div'); option.className = 'model-option'; option.dataset.modelId = id; option.innerHTML = `<span>${model.name}</span>`; dropdown.appendChild(option); });
    if (state.customModels.length > 0) { const separator = document.createElement('div'); separator.className = 'model-dropdown-separator'; dropdown.appendChild(separator); state.customModels.forEach(model => { const option = document.createElement('div'); option.className = 'model-option custom-model-option'; option.dataset.modelId = model.id; option.innerHTML = `<span class="custom-model-name">${model.name}</span><button class="icon-btn delete-model-btn" title="Удалить модель"><span class="material-symbols-outlined">delete</span></button>`; dropdown.appendChild(option); }); }
    const separator2 = document.createElement('div'); separator2.className = 'model-dropdown-separator'; dropdown.appendChild(separator2);
    const addBtn = document.createElement('div'); addBtn.className = 'model-option add-model-btn'; addBtn.id = 'addCustomModelBtn'; addBtn.innerHTML = `<span class="material-symbols-outlined">add</span><span>Добавить ИИ</span>`; dropdown.appendChild(addBtn);
    document.querySelectorAll('.model-option:not(.add-model-btn)').forEach(o => { o.addEventListener('click', (e) => { if (e.target.closest('.delete-model-btn')) { e.stopPropagation(); deleteCustomModel(o.dataset.modelId); DOMElements.modelDropdown.classList.remove('show'); } else if (!state.isGenerating) { state.currentModel = o.dataset.modelId; updateModelDisplay(); updateCurrentChat(); DOMElements.modelDropdown.classList.remove('show'); } }); });
    document.getElementById('addCustomModelBtn').addEventListener('click', () => { toggleModal('addModelModal', true); DOMElements.modelDropdown.classList.remove('show'); });
    updateModelDisplay();
}

const updateModelDisplay = () => {
    const modelId = state.currentModel; let displayName = "Неизвестная модель";
    if (BUILT_IN_MODELS[modelId]) displayName = BUILT_IN_MODELS[modelId].name;
    else { const customModel = state.customModels.find(m => m.id === modelId); if (customModel) displayName = customModel.name; }
    DOMElements.currentModelName.textContent = displayName;
    document.querySelectorAll('.model-option').forEach(opt => opt.classList.toggle('active', opt.dataset.modelId === modelId));
};

function enhanceCodeBlocks(element) {
    element.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-block-header')) return;
        const code = pre.querySelector('code'); if (!code) return;
        const language = code.className.replace('language-', '') || 'code';
        const header = document.createElement('div'); header.className = 'code-block-header';
        const langSpan = document.createElement('span'); langSpan.textContent = language;
        const actionsWrapper = document.createElement('div'); actionsWrapper.className = 'code-block-actions';
        const copyBtn = document.createElement('button'); copyBtn.className = 'code-action-btn'; copyBtn.innerHTML = `<span class="material-symbols-outlined">content_copy</span><span>Копировать</span>`;
        copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(code.innerText).then(() => { copyBtn.querySelector('span:last-child').textContent = 'Скопировано!'; setTimeout(() => { copyBtn.querySelector('span:last-child').textContent = 'Копировать'; }, 2000); }); });
        actionsWrapper.appendChild(copyBtn);
        const downloadBtn = document.createElement('button'); downloadBtn.className = 'code-action-btn';
        downloadBtn.innerHTML = `<span class="material-symbols-outlined">download</span><span>Скачать</span>`;
        downloadBtn.addEventListener('click', () => { const extension = getLanguageExtension(language); downloadFile(code.innerText, `code-snippet-${Date.now()}.${extension}`, 'text/plain'); });
        actionsWrapper.appendChild(downloadBtn);
        if (['html', 'javascript', 'js', 'css'].includes(language)) { const runBtn = document.createElement('button'); runBtn.className = 'code-action-btn'; runBtn.innerHTML = `<span class="material-symbols-outlined">play_arrow</span><span>Запустить</span>`; runBtn.addEventListener('click', () => openCodeRunner(code.innerText)); actionsWrapper.appendChild(runBtn); }
        header.appendChild(langSpan); header.appendChild(actionsWrapper);
        const contentWrapper = document.createElement('div'); contentWrapper.className = 'code-block-content';
        contentWrapper.appendChild(code); pre.innerHTML = ''; pre.appendChild(header); pre.appendChild(contentWrapper);
    });
}

function enhanceTables(element) {
    element.querySelectorAll('table').forEach(table => {
        if (table.parentElement.classList.contains('table-wrapper')) return;
        const wrapper = document.createElement('div'); wrapper.className = 'table-wrapper'; table.parentNode.insertBefore(wrapper, table); wrapper.appendChild(table);
        const actionsWrapper = document.createElement('div'); actionsWrapper.className = 'table-actions';
        const copyBtn = document.createElement('button'); copyBtn.className = 'table-action-btn'; copyBtn.innerHTML = `<span class="material-symbols-outlined">table</span><span>Копировать</span>`;
        copyBtn.addEventListener('click', () => { const tsvContent = Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th, td')).map(td => td.innerText.trim()).join('\t')).join('\n'); navigator.clipboard.writeText(tsvContent).then(() => { copyBtn.querySelector('span:last-child').textContent = 'Скопировано!'; setTimeout(() => { copyBtn.querySelector('span:last-child').textContent = 'Копировать'; }, 2000); }); });
        actionsWrapper.appendChild(copyBtn);
        const downloadBtn = document.createElement('button'); downloadBtn.className = 'table-action-btn'; downloadBtn.innerHTML = `<span class="material-symbols-outlined">download</span><span>CSV</span>`;
        downloadBtn.addEventListener('click', () => downloadTableAsCSV(table));
        actionsWrapper.appendChild(downloadBtn);
        wrapper.appendChild(actionsWrapper);
    });
}

function setSendButtonState() {
    if (state.editingMessageId && window.innerWidth < 1024) { DOMElements.sendButton.querySelector('span').textContent = 'check'; DOMElements.sendButton.classList.remove('stop-generation'); DOMElements.sendButton.style.display = 'flex'; return; }
    const hasContent = DOMElements.messageInput.value.trim() !== '' || state.attachedFiles.length > 0;
    DOMElements.sendButton.style.display = hasContent ? 'flex' : 'none';
    if (state.isGenerating) { DOMElements.sendButton.classList.add('stop-generation'); DOMElements.sendButton.querySelector('span').textContent = 'stop'; DOMElements.sendButton.style.display = 'flex'; } 
    else { DOMElements.sendButton.classList.remove('stop-generation'); DOMElements.sendButton.querySelector('span').textContent = 'arrow_upward'; }
}

// ===================================================================================
// --- РАЗДЕЛ 6: CODE RUNNER И ФАЙЛЫ ---
// ===================================================================================

function openCodeRunner(code) { state.activeCodePreviewContent = code; DOMElements.previewIframe.srcdoc = code; state.isPreviewModeActive = true; document.body.classList.add('preview-mode'); }
function closeCodeRunner() { state.isPreviewModeActive = false; document.body.classList.remove('preview-mode'); state.activeCodePreviewContent = ''; DOMElements.previewIframe.srcdoc = 'about:blank'; }
function downloadFile(content, fileName, mimeType) { const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
function getLanguageExtension(language) { const langMap = { python: 'py', javascript: 'js', js: 'js', html: 'html', css: 'css', java: 'java', csharp: 'cs', cpp: 'cpp', c: 'c', go: 'go', ruby: 'rb', php: 'php', swift: 'swift', typescript: 'ts', shell: 'sh', bash: 'sh', sql: 'sql', json: 'json', markdown: 'md' }; return langMap[language.toLowerCase()] || 'txt'; }
function downloadTableAsCSV(tableElement) { let csv = []; const rows = tableElement.querySelectorAll('tr'); for (const row of rows) { const rowData = []; const cells = row.querySelectorAll('th, td'); for (const cell of cells) { let cellText = cell.innerText.trim(); if (cellText.includes('"') || cellText.includes(',')) { cellText = `"${cellText.replace(/"/g, '""')}"`; } rowData.push(cellText); } csv.push(rowData.join(',')); } downloadFile(csv.join('\n'), `table-export-${Date.now()}.csv`, 'text/csv;charset=utf-8;'); }

function renderFilePreviews() {
    DOMElements.filePreviewContainer.innerHTML = '';
    if (state.attachedFiles.length === 0) { DOMElements.filePreviewContainer.classList.remove('visible'); return; }
    state.attachedFiles.forEach(file => {
        const previewItem = document.createElement('div'); previewItem.className = 'file-preview-item'; previewItem.dataset.fileId = file.id;
        let iconHTML; if (file.fileType === 'image' && file.previewUrl) iconHTML = `<img src="${file.previewUrl}" class="file-preview-img" alt="preview">`; else iconHTML = `<span class="material-symbols-outlined">${file.icon}</span>`;
        previewItem.innerHTML = `<div class="file-preview-icon" style="background-color: ${file.iconColor};">${iconHTML}<div class="file-loader"></div></div><div class="file-preview-details"><span class="file-preview-name">${file.name}</span><span class="file-preview-type">${file.typeDescription}</span></div><button class="icon-btn remove-file-btn" title="Удалить файл"><span class="material-symbols-outlined">close</span></button>`;
        previewItem.querySelector('.remove-file-btn').addEventListener('click', () => removeAttachedFile(file.id));
        DOMElements.filePreviewContainer.appendChild(previewItem);
    });
    DOMElements.filePreviewContainer.classList.add('visible');
}

function addVirtualFile(fileInfoPartial) { const fileId = Date.now() + Math.random(); const fileInfo = { id: fileId, name: 'virtual_file', content: null, fileType: 'other', icon: 'draft', iconColor: '#7f8c8d', typeDescription: 'Файл', previewUrl: null, ...fileInfoPartial }; state.attachedFiles.push(fileInfo); renderFilePreviews(); setSendButtonState(); }

async function handleFileSelect(files) {
    const fileList = Array.from(files); if (fileList.length === 0) return; if (state.attachedFiles.length + fileList.length > 10) { alert('Можно прикрепить не более 10 файлов.'); return; }
    for (const file of fileList) {
        const fileId = Date.now() + Math.random();
        const fileInfo = { id: fileId, name: file.name, content: null, fileType: 'other', icon: 'draft', iconColor: '#7f8c8d', typeDescription: 'Файл', previewUrl: null };
        const extension = file.name.split('.').pop().toLowerCase();
        if (file.type.startsWith('image/')) { fileInfo.fileType = 'image'; fileInfo.icon = 'image'; fileInfo.iconColor = '#8e44ad'; fileInfo.typeDescription = 'Изображение'; fileInfo.previewUrl = URL.createObjectURL(file); }
        else if (['docx', 'doc'].includes(extension)) { fileInfo.icon = 'description'; fileInfo.iconColor = '#2980b9'; fileInfo.typeDescription = 'Документ'; }
        else if (['py', 'js', 'html', 'css', 'cpp'].includes(extension)) { fileInfo.icon = 'code'; fileInfo.iconColor = '#f39c12'; fileInfo.typeDescription = 'Код'; }
        else if (['txt', 'me'].includes(extension)) { fileInfo.icon = 'subject'; fileInfo.iconColor = '#7f8c8d'; fileInfo.typeDescription = 'Текст'; }
        state.attachedFiles.push(fileInfo); renderFilePreviews();
        const iconEl = DOMElements.filePreviewContainer.querySelector(`[data-file-id="${fileId}"] .file-preview-icon`); iconEl.classList.add('is-loading');
        try {
            if (fileInfo.fileType === 'image') { fileInfo.content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = reject; reader.readAsDataURL(file); }); URL.revokeObjectURL(fileInfo.previewUrl); fileInfo.previewUrl = fileInfo.content; const imgEl = DOMElements.filePreviewContainer.querySelector(`[data-file-id="${fileId}"] .file-preview-img`); if(imgEl) imgEl.src = fileInfo.previewUrl; }
            else if (['txt', 'me', 'py', 'html', 'css', 'js', 'cpp'].includes(extension)) { fileInfo.content = await file.text(); }
            else if (['docx', 'doc'].includes(extension)) { const arrayBuffer = await file.arrayBuffer(); const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer }); fileInfo.content = result.value; }
            else { fileInfo.content = `[Неподдерживаемый тип файла: ${file.name}]`; }
        } catch (error) { console.error("Ошибка обработки файла:", error); fileInfo.content = `[Ошибка чтения файла: ${file.name}]`; }
        finally { if (iconEl) iconEl.classList.remove('is-loading'); setSendButtonState(); }
    }
    DOMElements.fileInput.value = '';
}

function removeAttachedFile(fileId) { state.attachedFiles = state.attachedFiles.filter(f => f.id !== fileId); renderFilePreviews(); setSendButtonState(); }
function clearAttachedFiles() { state.attachedFiles = []; renderFilePreviews(); setSendButtonState(); }

// ===================================================================================
// --- РАЗДЕЛ 7: РИСОВАНИЕ ---
// ===================================================================================

function saveCanvasState() { if (historyIndex < canvasHistory.length - 1) { canvasHistory = canvasHistory.slice(0, historyIndex + 1); } if (canvasHistory.length > 30) { canvasHistory.shift(); } canvasHistory.push(canvas.toDataURL()); historyIndex = canvasHistory.length - 1; updateUndoRedoButtons(); }
function restoreCanvasState() { if (historyIndex < 0 || historyIndex >= canvasHistory.length) return; const img = new Image(); img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); }; img.src = canvasHistory[historyIndex]; }
function undoCanvas() { if (historyIndex > 0) { historyIndex--; restoreCanvasState(); updateUndoRedoButtons(); } }
function redoCanvas() { if (historyIndex < canvasHistory.length - 1) { historyIndex++; restoreCanvasState(); updateUndoRedoButtons(); } }
function updateUndoRedoButtons() { DOMElements.undoCanvasBtn.disabled = historyIndex <= 0; DOMElements.redoCanvasBtn.disabled = historyIndex >= canvasHistory.length - 1; }

function initDrawingCanvas() {
    canvas = DOMElements.drawingCanvas; ctx = canvas.getContext('2d');
    const resizeCanvas = () => { const wasEmpty = historyIndex < 1; const oldState = wasEmpty ? null : canvas.toDataURL(); canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; if (!wasEmpty) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = oldState; } };
    const openDrawingModal = () => { toggleModal('drawingModal', true); setTimeout(() => { resizeCanvas(); ctx.clearRect(0, 0, canvas.width, canvas.height); canvasHistory = []; historyIndex = -1; saveCanvasState(); }, 50); };
    DOMElements.drawSketchOption.addEventListener('click', openDrawingModal);
    const getPos = (e) => { const rect = canvas.getBoundingClientRect(); const touch = e.touches ? e.touches[0] : e; return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }; };
    const startDrawing = (e) => { e.preventDefault(); isDrawing = true; const pos = getPos(e); [lastX, lastY] = [pos.x, pos.y]; };
    const draw = (e) => { if (!isDrawing) return; e.preventDefault(); const pos = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = DOMElements.colorSwatches.querySelector('.active').dataset.color || '#FFFFFF'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke(); [lastX, lastY] = [pos.x, pos.y]; };
    const stopDrawing = () => { if (!isDrawing) return; isDrawing = false; saveCanvasState(); };
    canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing); canvas.addEventListener('touchstart', startDrawing); canvas.addEventListener('touchmove', draw); canvas.addEventListener('touchend', stopDrawing);
    DOMElements.colorSwatches.addEventListener('click', (e) => { if (e.target.classList.contains('color-swatch')) { DOMElements.colorSwatches.querySelector('.active').classList.remove('active'); e.target.classList.add('active'); } });
    DOMElements.undoCanvasBtn.addEventListener('click', undoCanvas); DOMElements.redoCanvasBtn.addEventListener('click', redoCanvas); DOMElements.clearCanvasBtn.addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); saveCanvasState(); });
}

// ===================================================================================
// --- РАЗДЕЛ 8: ВЗАИМОДЕЙСТВИЕ С AI ---
// ===================================================================================

function getModelDetails(modelId) { if (BUILT_IN_MODELS[modelId]) { const model = BUILT_IN_MODELS[modelId]; return { endpoint: model.endpoint, modelName: model.modelName, apiKey: state.settings.apiKeys[model.apiKeyName] || '', vision: model.vision, displayName: model.name }; } const customModel = state.customModels.find(m => m.id === modelId); if (customModel) { return { endpoint: customModel.baseUrl, modelName: customModel.name, apiKey: customModel.apiKey, vision: customModel.vision, displayName: customModel.name }; } return null; }
function isCurrentModelVisionCapable() { const details = getModelDetails(state.currentModel); return details ? details.vision : false; }
function copyToClipboard(text) { const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.left = '-9999px'; document.body.appendChild(textarea); textarea.select(); try { document.execCommand('copy'); } catch (err) { console.error('Fallback error', err); } document.body.removeChild(textarea); }
function _formatCodeContent(content) { const codeBlockRegex = /(```[\s\S]*?```)/g; return content.replace(codeBlockRegex, (codeBlock) => { const lines = codeBlock.split('\n'); const language = lines[0].replace('```', '').trim(); if (!language) return codeBlock; let indentLevel = 0; const indentSize = 2; let formattedCode = `\`\`\`${language}\n`; for (let i = 1; i < lines.length -1; i++) { let line = lines[i].trim(); if (!line) continue; if (line.match(/^[}\]]/) || line.match(/<\/.*?>/)) { indentLevel = Math.max(0, indentLevel - 1); } formattedCode += ' '.repeat(indentLevel * indentSize) + line + '\n'; if (line.match(/[{\[]$/) || line.match(/<(?![/!]).*?>/)) { if (!line.match(/<.*?\/>/)) { indentLevel++; } } } formattedCode += '```'; return formattedCode; }); }

function addMessageToDOM(message, isHistory = false) {
    const messageEl = document.createElement('div'); messageEl.className = `message ${message.role}`; messageEl.dataset.messageId = message.id; const messageBody = document.createElement('div'); messageBody.className = 'message-body';
    if (message.role === 'user') {
        const hasFiles = message.files && message.files.length > 0; const hasText = message.originalContent && message.originalContent.trim() !== ''; if (!hasFiles && !hasText) return; 
        const contentContainer = document.createElement('div'); contentContainer.className = 'message-content';
        if (hasFiles) { message.files.forEach(file => { const attachmentEl = document.createElement('div'); attachmentEl.className = 'user-message-part attachment-preview'; attachmentEl.dataset.fileId = file.id; const displayName = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name; let iconOrImg; if(file.fileType === 'image' && file.previewUrl) { iconOrImg = `<img src="${file.previewUrl}" alt="${file.name}" style="width: 100%; height: 100%; object-fit: cover;">`; } else { iconOrImg = `<span class="material-symbols-outlined">${file.icon || 'description'}</span>`; } attachmentEl.innerHTML = `<div class="attachment-icon" style="background-color: ${file.iconColor || '#007bff'};">${iconOrImg}</div><div class="attachment-details"><div class="attachment-name">${displayName}</div><div class="attachment-type">${file.typeDescription || 'Файл'}</div></div><div class="attachment-delete-overlay"><span class="material-symbols-outlined">delete</span></div>`; contentContainer.appendChild(attachmentEl); }); }
        if (hasText) { const textEl = document.createElement('div'); textEl.className = 'user-message-part text-preview'; textEl.innerHTML = marked.parse(message.originalContent); contentContainer.appendChild(textEl); }
        messageBody.appendChild(contentContainer); messageEl.appendChild(messageBody);
        if(hasText || (message.files && message.files.length > 0)){ const actionsEl = document.createElement('div'); actionsEl.className = 'message-actions'; actionsEl.innerHTML = `<button class="icon-btn edit-message-btn" title="Редактировать"><span class="material-symbols-outlined">edit</span></button>`; messageEl.appendChild(actionsEl); }
    } else { const contentEl = document.createElement('div'); contentEl.className = 'message-content'; let finalContent = message.content || '...'; if (finalContent.includes('```')) { finalContent = _formatCodeContent(finalContent); } contentEl.innerHTML = marked.parse(finalContent); messageBody.appendChild(contentEl); messageEl.appendChild(messageBody); enhanceCodeBlocks(contentEl); enhanceTables(contentEl); }
    DOMElements.chatContainer.appendChild(messageEl); if (window.Prism) { Prism.highlightAllUnder(messageEl); } if (!isHistory) { scrollToBottom(); } return messageEl;
}

function updateAIActions() { document.querySelectorAll('.ai-response-actions').forEach(el => el.remove()); if (state.isGenerating || state.conversationHistory.length === 0) return; const lastMessage = state.conversationHistory.slice(-1)[0]; const lastMessageEl = DOMElements.chatContainer.querySelector(`.message[data-message-id="${lastMessage.id}"]`); if (lastMessage.role === 'assistant' && lastMessageEl) { const panel = document.createElement('div'); panel.className = 'ai-response-actions'; panel.innerHTML = `<button class="icon-btn copy-btn" title="Копировать"><span class="material-symbols-outlined">content_copy</span></button><button class="icon-btn like-btn" title="Нравится"><span class="material-symbols-outlined">thumb_up</span></button><button class="icon-btn dislike-btn" title="Не нравится"><span class="material-symbols-outlined">thumb_down</span></button><button class="icon-btn regenerate-btn" title="Регенерировать"><span class="material-symbols-outlined">refresh</span></button><div class="more-btn-container"><button class="icon-btn more-btn" title="Ещё"><span class="material-icons">more_horiz</span></button><div class="more-options-menu"><div class="more-option-item" data-action="elaborate"><span class="material-symbols-outlined">expand_content</span>Сделать подробнее</div><div class="more-option-item" data-action="summarize"><span class="material-symbols-outlined">short_text</span>Сделать короче</div><div class="more-option-item" data-action="save_md"><span class="material-symbols-outlined">markdown</span>Скачать (.md)</div><div class="more-option-item" data-action="save_html"><span class="material-symbols-outlined">download</span>Сохранить (.html)</div></div></div>`; lastMessageEl.querySelector('.message-body').appendChild(panel); } }
function handleRegenerateRequest() { if (state.isGenerating || state.conversationHistory.length < 2) return; const lastAiMsgIndex = state.conversationHistory.findLastIndex(m => m.role === 'assistant'); if (lastAiMsgIndex === -1) return; const lastAiMsgEl = DOMElements.chatContainer.querySelector(`.message.assistant:last-of-type`); if (lastAiMsgEl) lastAiMsgEl.remove(); state.conversationHistory.splice(lastAiMsgIndex); getAIResponse(); }
async function handleModificationRequest(type) { if (state.isGenerating || state.conversationHistory.length === 0) return; const lastAiMsg = state.conversationHistory.findLast(m => m.role === 'assistant'); if (!lastAiMsg) return; DOMElements.chatContainer.querySelector('.message.assistant:last-of-type')?.remove(); state.conversationHistory.pop(); const modificationPrompt = type === 'elaborate' ? 'Сделай свой предыдущий ответ более подробным и развернутым.' : 'Сократи свой предыдущий ответ, сделай его более сжатым и по существу.'; const followUpMsg = { role: 'user', content: modificationPrompt, isHidden: true, originalContent: modificationPrompt }; state.conversationHistory.push(followUpMsg); await getAIResponse(); const hiddenPromptIndex = state.conversationHistory.findIndex(m => m.isHidden); if (hiddenPromptIndex > -1) { state.conversationHistory.splice(hiddenPromptIndex, 1); } updateCurrentChat(); }

async function _saveAndForkHistory(messageId, newText, newFiles) { const editedMsgIndex = state.conversationHistory.findIndex(m => m.id === messageId); if (editedMsgIndex === -1) return; const originalMessage = state.conversationHistory[editedMsgIndex]; const filesChanged = originalMessage.files.length !== newFiles.length || originalMessage.files.some((f, i) => f.id !== newFiles[i].id); if (newText.trim() === (originalMessage.originalContent || '').trim() && !filesChanged) return; const messageEl = DOMElements.chatContainer.querySelector(`.message[data-message-id="${messageId}"]`); if (messageEl) { while (messageEl.nextSibling) messageEl.nextSibling.remove(); } state.conversationHistory = state.conversationHistory.slice(0, editedMsgIndex + 1); const messageToUpdate = state.conversationHistory[editedMsgIndex]; messageToUpdate.originalContent = newText; messageToUpdate.files = newFiles; if (messageEl) { const freshMessageEl = addMessageToDOM(messageToUpdate, true); messageEl.replaceWith(freshMessageEl); } await handleSendMessage(newText, newFiles); }
function enterEditModeDesktop(messageId) { if (state.editingMessageId) exitEditModeDesktop(); const message = state.conversationHistory.find(m => m.id === messageId), messageEl = DOMElements.chatContainer.querySelector(`.message[data-message-id="${messageId}"]`); if (!message || !messageEl) return; state.editingMessageId = messageId; activeEditorInfo.files = [...message.files]; const textContentEl = messageEl.querySelector('.text-preview'), hasText = message.originalContent && message.originalContent.trim() !== ''; if (hasText && textContentEl) { activeEditorInfo.originalNode = textContentEl; const editorContainer = document.createElement('div'); editorContainer.className = 'message-editor'; const textarea = document.createElement('textarea'); textarea.rows = '1'; textarea.value = message.originalContent; const autoResize = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; }; textarea.addEventListener('input', autoResize); const actionsContainer = document.createElement('div'); actionsContainer.className = 'message-editor-actions'; const cancelButton = document.createElement('button'); cancelButton.className = 'message-editor-btn cancel'; cancelButton.textContent = 'Отменить'; cancelButton.onclick = exitEditMode; const saveButton = document.createElement('button'); saveButton.className = 'message-editor-btn save'; saveButton.textContent = 'Отправить'; saveButton.onclick = () => saveEditedMessageDesktop(); actionsContainer.append(cancelButton, saveButton); editorContainer.append(textarea, actionsContainer); textContentEl.replaceWith(editorContainer); setTimeout(autoResize, 0); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); } document.body.classList.add('is-editing-message'); messageEl.classList.add('is-being-edited'); }
function exitEditModeDesktop() { if (!state.editingMessageId || !document.body.classList.contains('is-editing-message')) return; const messageEl = DOMElements.chatContainer.querySelector(`.message[data-message-id="${state.editingMessageId}"]`); if (messageEl) { const editorEl = messageEl.querySelector('.message-editor'); if (editorEl && activeEditorInfo.originalNode) editorEl.replaceWith(activeEditorInfo.originalNode); messageEl.classList.remove('is-being-edited'); } document.body.classList.remove('is-editing-message'); state.editingMessageId = null; activeEditorInfo.originalNode = null; activeEditorInfo.files = []; }
async function saveEditedMessageDesktop() { if (!state.editingMessageId) return; const messageEl = DOMElements.chatContainer.querySelector(`.message[data-message-id="${state.editingMessageId}"]`), editorTextarea = messageEl.querySelector('.message-editor textarea'); const newText = editorTextarea ? editorTextarea.value : state.conversationHistory.find(m => m.id === state.editingMessageId).originalContent, newFiles = activeEditorInfo.files, messageIdToSave = state.editingMessageId; exitEditModeDesktop(); await _saveAndForkHistory(messageIdToSave, newText, newFiles); }
function enterEditModeMobile(messageId) { const message = state.conversationHistory.find(m => m.id === messageId); if (!message) return; state.editingMessageId = messageId; DOMElements.editModeContainer.style.display = 'flex'; DOMElements.footer.classList.add('is-editing'); DOMElements.messageInput.value = message.originalContent || ''; DOMElements.messageInput.focus(); DOMElements.messageInput.dispatchEvent(new Event('input')); clearAttachedFiles(); state.attachedFiles = [...message.files]; renderFilePreviews(); DOMElements.attachFileBtn.disabled = true; DOMElements.micBtn.disabled = true; document.querySelectorAll('.edit-message-btn').forEach(btn => btn.disabled = true); setSendButtonState(); }
function exitEditModeMobile() { if (!state.editingMessageId || !DOMElements.footer.classList.contains('is-editing')) return; state.editingMessageId = null; DOMElements.editModeContainer.style.display = 'none'; DOMElements.footer.classList.remove('is-editing'); DOMElements.messageInput.value = ''; DOMElements.messageInput.dispatchEvent(new Event('input')); clearAttachedFiles(); DOMElements.attachFileBtn.disabled = false; DOMElements.micBtn.disabled = false; document.querySelectorAll('.edit-message-btn').forEach(btn => btn.disabled = false); setSendButtonState(); }
async function saveEditedMessageMobile() { if (!state.editingMessageId) return; const newText = DOMElements.messageInput.value, newFiles = state.attachedFiles, messageIdToSave = state.editingMessageId; exitEditModeMobile(); await _saveAndForkHistory(messageIdToSave, newText, newFiles); }
function enterEditMode(messageId) { if (state.isGenerating) return; if (window.innerWidth < 1024) enterEditModeMobile(messageId); else enterEditModeDesktop(messageId); }
function exitEditMode() { exitEditModeDesktop(); exitEditModeMobile(); }
const stopGeneration = () => { if (state.abortController) { state.abortController.abort(); state.abortController = null; } };
async function handleSendOrStop() { if (state.isGenerating) stopGeneration(); else if (state.editingMessageId) { if (window.innerWidth < 1024) await saveEditedMessageMobile(); else await saveEditedMessageDesktop(); } else await handleSendMessage(); }

async function handleSendMessage(editedText = null, editedFiles = null) {
    const userText = editedText !== null ? editedText : DOMElements.messageInput.value.trim(); const files = editedFiles !== null ? editedFiles : state.attachedFiles; if (userText === '' && files.length === 0) return;
    document.body.classList.remove('new-chat-active');
    const currentModelDetails = getModelDetails(state.currentModel);
    if (!currentModelDetails || !currentModelDetails.apiKey) { alert(`API ключ для модели "${currentModelDetails?.displayName || state.currentModel}" не найден.`); if (state.currentModel.startsWith('custom-')) toggleModal('addModelModal', true); else toggleModal('settingsModal', true); return; }
    if (state.currentChatId === null) { const newChatObject = { id: Date.now(), title: 'Новый чат', messages: [], model: state.currentModel, createdAt: new Date().toISOString() }; state.chats.unshift(newChatObject); state.currentChatId = newChatObject.id; updatePageTitle(); }
    DOMElements.welcomeScreen.classList.add('hidden'); DOMElements.chatContainer.classList.add('active');
    if (editedText === null) { const userMsg = { role: 'user', id: Date.now(), originalContent: userText, files: files.map(f => ({...f})) }; state.conversationHistory.push(userMsg); addMessageToDOM(userMsg); DOMElements.messageInput.value = ''; DOMElements.messageInput.dispatchEvent(new Event('input')); clearAttachedFiles(); }
    await getAIResponse();
}

async function getAIResponse(overrideMessages = null) {
    state.isGenerating = true; document.body.classList.add('is-generating'); setSendButtonState(); state.abortController = new AbortController();
    const currentModelDetails = getModelDetails(state.currentModel); if (!currentModelDetails) { console.error("Critical error: Cannot find details for the current model."); return; }
    const messagesToSend = overrideMessages || state.conversationHistory.filter(m => !m.isHidden).map(msg => { if (msg.role === 'assistant') return { role: 'assistant', content: msg.content }; const hasImages = msg.files && msg.files.some(f => f.fileType === 'image'); if (isCurrentModelVisionCapable() && hasImages) { const textParts = []; if (msg.originalContent) textParts.push(msg.originalContent); const textFileContent = msg.files.filter(f => f.fileType !== 'image' && f.content).map(f => `\n\n--- Контекст из файла ${f.name} ---\n${f.content}`).join(''); if (textFileContent) textParts.push(textFileContent); const contentParts = [{ type: 'text', text: textParts.join('\n') }]; msg.files.forEach(file => { if (file.fileType === 'image') contentParts.push({ type: 'image_url', image_url: { url: file.content } }); }); return { role: 'user', content: contentParts }; } else { let combinedContent = msg.originalContent || ''; if (msg.files && msg.files.length > 0) { const fileContext = msg.files.map(f => { const fileText = f.fileType === 'image' ? `[Изображение: ${f.name}]` : f.content; return `\n\n--- Контекст из файла ${f.name} ---\n${fileText}`; }).join(''); combinedContent += fileContext; } return { role: 'user', content: combinedContent }; } });
    let finalSystemPrompt = state.settings.systemPrompt; if(state.settings.userName && state.settings.userName !== 'Пользователь') { finalSystemPrompt += `\n\nК пользователю обращайся по имени: ${state.settings.userName}.`; } if (finalSystemPrompt) { messagesToSend.unshift({ role: 'system', content: finalSystemPrompt.trim() }); }
    const aiMsg = { role: 'assistant', id: Date.now(), content: '' }; const aiMessageElement = addMessageToDOM(aiMsg), contentElement = aiMessageElement.querySelector('.message-content');
    try {
        const response = await fetch(currentModelDetails.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentModelDetails.apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': encodeURIComponent(document.title) }, body: JSON.stringify({ model: currentModelDetails.modelName, messages: messagesToSend, stream: true }), signal: state.abortController.signal });
        if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`); }
        const reader = response.body.getReader(), decoder = new TextDecoder();
        while (true) { const { done, value } = await reader.read(); if (done) break; const textChunk = decoder.decode(value, { stream: true }); const lines = textChunk.split('\n').filter(line => line.startsWith('data: ')); for (const line of lines) { const jsonStr = line.substring(6); if (jsonStr.trim() === '[DONE]') break; try { const parsed = JSON.parse(jsonStr), chunkContent = parsed.choices[0]?.delta?.content; if (chunkContent) { aiMsg.content += chunkContent; let formatted = aiMsg.content.includes('```') ? _formatCodeContent(aiMsg.content) : aiMsg.content; contentElement.innerHTML = marked.parse(formatted + ' ▌'); scrollToBottom(); } } catch (e) { } } }
    } catch (error) { if (error.name !== 'AbortError') { console.error('Fetch error:', error); contentElement.innerHTML = `<span style="color: #c14a4a;">Ошибка: ${error.message}</span>`; } else { aiMsg.content += '\n\n*(Генерация остановлена)*'; } }
    finally { state.isGenerating = false; document.body.classList.remove('is-generating'); state.abortController = null; if (aiMsg.content.includes('```')) { aiMsg.content = _formatCodeContent(aiMsg.content); } contentElement.innerHTML = marked.parse(aiMsg.content); state.conversationHistory.push(aiMsg); enhanceCodeBlocks(aiMessageElement); enhanceTables(aiMessageElement); if (window.Prism) { Prism.highlightAllUnder(aiMessageElement); } setSendButtonState(); updateCurrentChat(); updateAIActions(); const isNewChat = state.conversationHistory.length <= 2; if (isNewChat && aiMsg.content) { generateChatTitle(state.currentChatId); } }
}

async function generateChatTitle(chatId) { const chat = state.chats.find(c => c.id === chatId); if (!chat || chat.title !== 'Новый чат' || !chat.messages[0] || !chat.messages[1]) return; const modelDetails = getModelDetails(chat.model); if (!modelDetails || !modelDetails.apiKey) return; const userContent = chat.messages[0].originalContent || '', aiContent = chat.messages[1].content.substring(0, 150); const titlePrompt = `Придумай короткий заголовок (3-5 слов) для этого диалога. Ответь только заголовком. Диалог:\n\nUser: ${userContent}\nAI: ${aiContent}`; try { const response = await fetch(modelDetails.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${modelDetails.apiKey}` }, body: JSON.stringify({ model: modelDetails.modelName, messages: [{ role: 'user', content: titlePrompt }], max_tokens: 20 }) }); if (!response.ok) return; const data = await response.json(); const newTitle = data.choices[0]?.message?.content; if (newTitle) { const chatToRename = state.chats.find(c => c.id === chatId); if (chatToRename) { chatToRename.title = newTitle.replace(/["'«»]/g, "").trim(); saveState(); renderChatsList(); updatePageTitle(); } } } catch (error) { console.error('Error generating title:', error); } }

// ===================================================================================
// --- РАЗДЕЛ 9: ОБРАБОТЧИКИ СОБЫТИЙ ---
// ===================================================================================

function toggleUserProfileMenu(event) { event.stopPropagation(); const menu = DOMElements.userProfileMenu; const anchorEl = event.currentTarget; const isCurrentlyShown = menu.classList.contains('show'); if (isCurrentlyShown) { menu.classList.remove('show'); } else { const rect = anchorEl.getBoundingClientRect(); const isCollapsed = anchorEl.id === 'userProfileCollapsedBtn'; if (isCollapsed) { menu.style.top = 'auto'; menu.style.bottom = `${window.innerHeight - rect.bottom}px`; menu.style.left = `${rect.right + 10}px`; menu.style.right = 'auto'; menu.style.transformOrigin = 'bottom left'; } else { menu.style.top = 'auto'; menu.style.bottom = `${window.innerHeight - rect.top + 8}px`; menu.style.left = `${rect.left}px`; menu.style.right = 'auto'; menu.style.transformOrigin = 'bottom left'; } menu.classList.add('show'); } }
function handleUserProfileMenuAction(e) { const item = e.target.closest('.user-profile-menu-item'); if (!item) return; const action = item.dataset.action; DOMElements.userProfileMenu.classList.remove('show'); switch (action) { case 'personalization': toggleModal('settingsModal', true); document.querySelector('.settings-nav-item.active').classList.remove('active'); document.querySelector('.settings-nav-item[data-page="personalization"]').classList.add('active'); document.querySelector('.settings-page.active').classList.remove('active'); document.getElementById('settings-page-personalization').classList.add('active'); break; case 'settings': toggleModal('settingsModal', true); document.querySelector('.settings-nav-item.active').classList.remove('active'); document.querySelector('.settings-nav-item[data-page="general"]').classList.add('active'); document.querySelector('.settings-page.active').classList.remove('active'); document.getElementById('settings-page-general').classList.add('active'); break; case 'privacy': window.open('privacy.html', '_blank'); break; case 'logout': alert('Функция выхода из системы еще не реализована.'); break; } }

function addEventListeners() {
    DOMElements.menuIcon.addEventListener('click', () => toggleSidebar());
    DOMElements.closeSidebar.addEventListener('click', () => toggleSidebar(false));
    DOMElements.sidebarOverlay.addEventListener('click', () => { toggleSidebar(false); document.querySelectorAll('.settings-modal.show, .drawing-modal.show, .immersive-modal.show').forEach(m => toggleModal(m.id, false)); DOMElements.userProfileMenu.classList.remove('show'); DOMElements.attachmentMenu.classList.remove('show'); });
    DOMElements.newChatBtn.addEventListener('click', createNewChat); DOMElements.headerNewChatBtn.addEventListener('click', createNewChat); DOMElements.chatSearchInput.addEventListener('input', renderChatsList);
    DOMElements.userProfileBtn.addEventListener('click', toggleUserProfileMenu); DOMElements.userProfileCollapsedBtn.addEventListener('click', toggleUserProfileMenu); DOMElements.userProfileMenu.addEventListener('click', handleUserProfileMenuAction);
    DOMElements.closeSettingsModal.addEventListener('click', () => toggleModal('settingsModal', false)); DOMElements.saveSettingsBtn.addEventListener('click', saveSettings);
    DOMElements.closeAddModelModal.addEventListener('click', () => toggleModal('addModelModal', false)); DOMElements.saveModelBtn.addEventListener('click', saveCustomModel);
    DOMElements.closeTextInputModal.addEventListener('click', () => toggleModal('textInputModal', false)); DOMElements.saveTextBtn.addEventListener('click', () => { const text = DOMElements.textInputField.value; if (text.trim()) { addVirtualFile({ name: 'text_snippet.txt', content: text, icon: 'subject', typeDescription: 'Текстовый фрагмент', fileType: 'text' }); } toggleModal('textInputModal', false); DOMElements.textInputField.value = ''; });
    DOMElements.closeDrawingModal.addEventListener('click', () => toggleModal('drawingModal', false)); DOMElements.saveDrawingBtn.addEventListener('click', () => { const dataUrl = canvas.toDataURL('image/png'); addVirtualFile({ name: 'sketch.png', content: dataUrl, previewUrl: dataUrl, icon: 'draw', typeDescription: 'Эскиз', fileType: 'image' }); toggleModal('drawingModal', false); });
    DOMElements.openSidebarBtn.addEventListener('click', () => toggleSidebar(true)); DOMElements.newChatCollapsedBtn.addEventListener('click', createNewChat); DOMElements.searchCollapsedBtn.addEventListener('click', () => { toggleSidebar(true); setTimeout(() => DOMElements.chatSearchInput.focus(), 300); });
    DOMElements.cancelEditBtn.addEventListener('click', exitEditMode);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'system') updateSystemTheme(); });
    const settingsNav = document.querySelector('.settings-nav'); settingsNav.addEventListener('click', e => { const navItem = e.target.closest('.settings-nav-item'); if (!navItem) return; const page = navItem.dataset.page; settingsNav.querySelector('.active').classList.remove('active'); navItem.classList.add('active'); document.querySelector('.settings-page.active').classList.remove('active'); document.getElementById(`settings-page-${page}`).classList.add('active'); });
    DOMElements.modelButton.addEventListener('click', e => { e.stopPropagation(); DOMElements.modelDropdown.classList.toggle('show'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.model-selector')) DOMElements.modelDropdown.classList.remove('show'); if (!e.target.closest('.more-btn-container')) document.querySelector('.more-options-menu.show')?.classList.remove('show', 'open-up'); if (!e.target.closest('#userProfileBtn') && !e.target.closest('#userProfileCollapsedBtn') && !e.target.closest('#userProfileMenu')) DOMElements.userProfileMenu.classList.remove('show'); if (!e.target.closest('.input-container-wrapper')) DOMElements.attachmentMenu.classList.remove('show'); });
    DOMElements.messageInput.addEventListener('input', () => { DOMElements.messageInput.style.height = 'auto'; DOMElements.messageInput.style.height = `${DOMElements.messageInput.scrollHeight}px`; setSendButtonState(); });
    DOMElements.messageInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendOrStop(); } });
    DOMElements.sendButton.addEventListener('click', handleSendOrStop);
    DOMElements.attachFileBtn.addEventListener('click', (e) => { e.stopPropagation(); DOMElements.attachmentMenu.classList.toggle('show'); });
    DOMElements.uploadFileOption.addEventListener('click', () => { DOMElements.fileInput.click(); DOMElements.attachmentMenu.classList.remove('show'); });
    DOMElements.addTextOption.addEventListener('click', () => { toggleModal('textInputModal', true); DOMElements.attachmentMenu.classList.remove('show'); });
    DOMElements.drawSketchOption.addEventListener('click', () => { DOMElements.attachmentMenu.classList.remove('show'); });
    DOMElements.fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));
    DOMElements.scrollToBottomBtn.addEventListener('click', scrollToBottom);
    const pageWrapper = DOMElements.pageWrapper; pageWrapper.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); dragCounter++; DOMElements.dragDropOverlay.classList.add('visible'); }); pageWrapper.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); }); pageWrapper.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dragCounter--; if (dragCounter === 0) DOMElements.dragDropOverlay.classList.remove('visible'); }); pageWrapper.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dragCounter = 0; DOMElements.dragDropOverlay.classList.remove('visible'); if (e.dataTransfer.files?.length) handleFileSelect(e.dataTransfer.files); }); document.addEventListener('paste', (e) => { if (e.clipboardData.files.length > 0) { e.preventDefault(); handleFileSelect(e.clipboardData.files); } });
    DOMElements.closeRunnerBtn.addEventListener('click', closeCodeRunner); DOMElements.downloadCodeBtn.addEventListener('click', () => downloadFile(state.activeCodePreviewContent, `code-${Date.now()}.html`, 'text/html'));
    document.body.addEventListener('click', e => {
        const editingFileDesktop = e.target.closest('.is-being-edited .attachment-preview'); if (editingFileDesktop) { const fileId = parseFloat(editingFileDesktop.dataset.fileId); activeEditorInfo.files = activeEditorInfo.files.filter(f => f.id !== fileId); editingFileDesktop.style.display = 'none'; }
        const editingFileMobile = e.target.closest('.is-editing .file-preview-item'); if (editingFileMobile && e.target.closest('.remove-file-btn')) { const fileId = parseFloat(editingFileMobile.dataset.fileId); state.attachedFiles = state.attachedFiles.filter(f => f.id !== fileId); renderFilePreviews(); }
        const chatContainer = e.target.closest('#chatContainer'); if (!chatContainer) return;
        const editBtn = e.target.closest('.edit-message-btn'); if (editBtn) { const messageEl = editBtn.closest('.message'), messageId = parseInt(messageEl.dataset.messageId); enterEditMode(messageId); return; }
        const lastAiMsgIndex = state.conversationHistory.findLastIndex(m => m.role === 'assistant'); if (lastAiMsgIndex === -1) return; const lastAiMsg = state.conversationHistory[lastAiMsgIndex];
        if (e.target.closest('.copy-btn')) copyToClipboard(lastAiMsg.content);
        if (e.target.closest('.regenerate-btn')) handleRegenerateRequest();
        const likeBtn = e.target.closest('.like-btn'); if (likeBtn) likeBtn.classList.toggle('active');
        const dislikeBtn = e.target.closest('.dislike-btn'); if (dislikeBtn) dislikeBtn.classList.toggle('active');
        const moreBtn = e.target.closest('.more-btn'); if (moreBtn) { const menu = moreBtn.nextElementSibling; menu.classList.remove('open-up'); menu.classList.toggle('show'); if (menu.classList.contains('show')) { const menuRect = menu.getBoundingClientRect(); if (menuRect.bottom > window.innerHeight - 20) menu.classList.add('open-up'); } }
        const moreOption = e.target.closest('.more-option-item'); if (moreOption) { const action = moreOption.dataset.action; if (action === 'elaborate' || action === 'summarize') handleModificationRequest(action); else if (action === 'save_html') saveAiResponseAsHtml(lastAiMsg); else if (action === 'save_md') downloadFile(lastAiMsg.content, `chat-response-${Date.now()}.md`, 'text/markdown'); moreOption.parentElement.classList.remove('show', 'open-up'); }
    });
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition; if (SpeechRec) { const rec = new SpeechRec(); rec.lang = 'ru-RU'; rec.interimResults = false; DOMElements.micBtn.addEventListener('click', () => { try { rec.start(); DOMElements.micBtn.style.color = '#c14a4a'; } catch (e) {} }); rec.onresult = e => { DOMElements.messageInput.value = e.results[0][0].transcript; DOMElements.messageInput.dispatchEvent(new Event('input')); }; rec.onend = () => DOMElements.micBtn.style.color = ''; rec.onerror = e => console.error(`Mic error: ${e.error}`); } else { DOMElements.micBtn.style.display = 'none'; }
}

function saveAiResponseAsHtml(aiMessage) {
    const tempDiv = document.createElement('div'); tempDiv.innerHTML = marked.parse(aiMessage.content);
    const fullHtml = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>AI Chat Response</title><style>:root { --bg-primary: #1a1a1a; --text-primary: #ffffff; --code-bg: #0d0d0d; } body { font-family: sans-serif; background-color: var(--bg-primary); color: var(--text-primary); padding: 20px; }</style></head><body>${tempDiv.innerHTML}</body></html>`;
    downloadFile(fullHtml.replace(/\n\s+/g, '\n'), `chat-response-${Date.now()}.html`, 'text/html');
}

// ЗАПУСК
init();