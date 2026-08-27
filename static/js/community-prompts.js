/* ============================================================
 * 社区提示词库模块 (Community Prompts)
 * 与 smart-canvas.js 共享全局变量：escapeHtml, escapeAttr, nodes,
 * setPromptText, closePromptTemplatePanel, scheduleSave, render,
 * promptTemplatePanel, selectedId, selectedNode
 * ============================================================ */

// ---- 图片缓存代理 ----
// 将外部 URL 转为本地缓存代理地址
function communityImgUrl(url, thumb) {
    if (!url) return '';
    return '/api/image-cache?url=' + encodeURIComponent(url) + (thumb ? '&size=thumb' : '');
}

// ---- 状态 ----
let communitySources = [];
let communityItems = []; // 当前页已加载的项
let communityAllItems = []; // 全部已加载的项（用于客户端过滤）
let communityTags = [];
let communityAllTags = [];
let communityCategories = [];
let communityTotal = 0;
let communityPage = 1;
const COMMUNITY_PAGE_SIZE = 100; // 增大初始加载量，减少翻页次数
let communityKeyword = '';
let communitySourceFilter = '';
let communityTagFilter = '';
let communityLoading = false;
let communityDetailItem = null;
let communitySourceManageOpen = false;

// ---- API 工具 ----
async function communityApiJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || '操作失败');
    return data;
}

// ---- 数据加载 ----
async function loadCommunitySources() {
    try {
        const data = await communityApiJson('/api/prompt-sources');
        communitySources = Array.isArray(data.sources) ? data.sources : [];
    } catch (e) {
        communitySources = [];
    }
}

async function loadCommunityPrompts(append = false) {
    if (communityLoading) return;
    communityLoading = true;
    const params = new URLSearchParams();
    if (communitySourceFilter) params.set('source', communitySourceFilter);
    // 有 keyword 或 tag 时才走服务端过滤，否则加载全部到客户端过滤
    if (communityKeyword && !append) params.set('keyword', communityKeyword);
    if (communityTagFilter && !append) params.set('tags', communityTagFilter);
    params.set('page', String(communityPage));
    params.set('page_size', String(COMMUNITY_PAGE_SIZE));
    try {
        const data = await communityApiJson(`/api/community-prompts?${params}`);
        const items = Array.isArray(data.items) ? data.items : [];
        const serverTags = Array.isArray(data.tags) ? data.tags : [];
        if (append) {
            communityItems = communityItems.concat(items);
            communityAllItems = communityAllItems.concat(items);
        } else {
            communityItems = items;
            // 始终更新全量数据缓存，确保客户端过滤基于最新数据
            communityAllItems = items;
            // 无过滤时更新全量标签缓存
            if (!communityKeyword && !communityTagFilter) {
                communityAllTags = serverTags;
            }
        }
        // 有过滤时从缓存中展示全量标签，避免标签被覆盖为子集
        communityTags = (communityKeyword || communityTagFilter) ? communityAllTags : serverTags;
        communityCategories = Array.isArray(data.categories) ? data.categories : [];
        communityTotal = data.total || 0;
    } catch (e) {
        if (!append) { communityItems = []; communityAllItems = []; communityTags = []; communityAllTags = []; communityTotal = 0; }
    } finally {
        communityLoading = false;
    }
}

// 客户端过滤（避免频繁 API 调用）
function getFilteredItems() {
    let items = communityAllItems.length > 0 ? communityAllItems : communityItems;
    if (communityKeyword) {
        const kw = communityKeyword.toLowerCase();
        items = items.filter(item => {
            const haystack = [
                item.title || '',
                item.prompt || '',
                item.description || '',
                (item._sourceName || ''),
                (item.tags || []).join(' ')
            ].join(' ').toLowerCase();
            return haystack.includes(kw);
        });
    }
    if (communityTagFilter) {
        const tag = communityTagFilter.toLowerCase();
        items = items.filter(item =>
            (item.tags || []).some(t => t.toLowerCase() === tag)
        );
    }
    return items;
}

async function refreshCommunitySource(sourceId) {
    try {
        const result = await communityApiJson(`/api/prompt-sources/${encodeURIComponent(sourceId)}/refresh`, { method: 'POST' });
        return result;
    } catch (e) {
        return { success: false, lastError: e.message || '拉取失败' };
    }
}

async function refreshAllCommunitySources() {
    try {
        return await communityApiJson('/api/prompt-sources/refresh-all', { method: 'POST' });
    } catch (e) {
        return { results: [], total: 0, successCount: 0, failureCount: 0 };
    }
}

// ---- 渲染主入口 ----
async function renderCommunityTab() {
    const root = document.getElementById('promptTemplateCommunityBody');
    if (!root) return;
    if (!communitySources.length) await loadCommunitySources();
    if (!communityItems.length && !communityKeyword && !communitySourceFilter) {
        await loadCommunityPrompts(false);
    }
    const enabledSources = communitySources.filter(s => s.enabled);
    const displayItems = getFilteredItems(); // 使用客户端过滤结果
    const hasMore = communityItems.length < communityTotal && !communityKeyword && !communityTagFilter;
    
    // 只更新网格区域，保持搜索框焦点
    const existingGrid = document.getElementById('communityGrid');
    const existingInfo = root.querySelector('.community-info');
    const existingLoadMore = root.querySelector('.community-load-more');
    const existingEmpty = root.querySelector('.community-loading, .community-empty');
    
    if (existingGrid) {
        // 同步筛选按钮的 active 状态
        root.querySelectorAll('[data-community-tag]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.communityTag === communityTagFilter);
        });
        root.querySelectorAll('[data-community-source]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.communitySource === communitySourceFilter);
        });
        // 只更新网格内容
        existingGrid.innerHTML = displayItems.map((item, idx) => renderCommunityCard(item, idx)).join('');
        if (window.lucide) lucide.createIcons();
        // 更新计数信息
        if (existingInfo) {
            existingInfo.innerHTML = `<span>共 ${communityTotal} 条提示词</span>${displayItems.length ? `<span>已加载 ${displayItems.length} 条</span>` : ''}`;
        }
        // 更新来源管理面板
        const existingManager = root.querySelector('.community-source-manager');
        if (communitySourceManageOpen && !existingManager) {
            const toolbar = root.querySelector('.community-toolbar');
            if (toolbar) {
                const managerDiv = document.createElement('div');
                managerDiv.innerHTML = renderCommunitySourceManager();
                toolbar.after(managerDiv.firstElementChild);
                if (window.lucide) lucide.createIcons();
            }
        } else if (!communitySourceManageOpen && existingManager) {
            existingManager.remove();
        }
        // 更新加载更多按钮
        if (existingLoadMore) {
            existingLoadMore.style.display = hasMore ? '' : 'none';
        } else if (hasMore) {
            const loadMoreDiv = document.createElement('div');
            loadMoreDiv.className = 'community-load-more';
            loadMoreDiv.innerHTML = '<button type="button" class="community-btn" data-community-load-more><i data-lucide="chevron-down"></i><span>加载更多</span></button>';
            existingGrid.after(loadMoreDiv);
            if (window.lucide) lucide.createIcons();
        }
        // 更新空状态
        if (existingEmpty) {
            existingEmpty.style.display = displayItems.length ? 'none' : '';
        } else if (!displayItems.length && !communityLoading) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'community-empty';
            emptyDiv.innerHTML = '<i data-lucide="inbox"></i><span>暂无社区提示词，请先刷新来源</span>';
            existingGrid.after(emptyDiv);
            if (window.lucide) lucide.createIcons();
        }
        // 更新详情弹窗
        const existingModal = root.querySelector('.community-modal-backdrop');
        if (communityDetailItem && !existingModal) {
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = renderCommunityDetailModal();
            root.appendChild(modalDiv.firstElementChild);
            if (window.lucide) lucide.createIcons();
        } else if (!communityDetailItem && existingModal) {
            existingModal.remove();
        }
        return; // 提前返回，不重建整个 DOM
    }
    
    // 首次渲染或网格不存在时完整渲染
    root.innerHTML = `
        <div class="community-toolbar">
            <div class="community-search-wrap">
                <i data-lucide="search"></i>
                <input id="communitySearch" type="search" value="${escapeAttr(communityKeyword)}" placeholder="搜索社区提示词...">
            </div>
            <div class="community-actions">
                <button type="button" class="community-btn" data-community-refresh-all title="拉取所有来源"><i data-lucide="refresh-cw"></i><span>刷新</span></button>
                <button type="button" class="community-btn" data-community-manage><i data-lucide="settings-2"></i><span>管理来源</span></button>
            </div>
        </div>
        ${communitySourceManageOpen ? renderCommunitySourceManager() : ''}
        <div class="community-filters">
            <div class="community-source-filter">
                <button type="button" class="community-filter-tag ${!communitySourceFilter ? 'active' : ''}" data-community-source="">全部来源</button>
                ${enabledSources.map(s => `<button type="button" class="community-filter-tag ${communitySourceFilter === s.id ? 'active' : ''}" data-community-source="${escapeAttr(s.id)}">${escapeHtml(s.name)}<small>${s.count || 0}</small></button>`).join('')}
            </div>
            ${communityTags.length ? `<div class="community-tag-filter">
                <button type="button" class="community-filter-tag ${!communityTagFilter ? 'active' : ''}" data-community-tag="">全部标签</button>
                ${communityTags.map(t => `<button type="button" class="community-filter-tag ${communityTagFilter === t ? 'active' : ''}" data-community-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('')}
            </div>` : ''}
        </div>
        <div class="community-info"><span>共 ${communityTotal} 条提示词</span>${displayItems.length ? `<span>已加载 ${displayItems.length} 条</span>` : ''}</div>
        <div class="community-grid" id="communityGrid">
            ${displayItems.map((item, idx) => renderCommunityCard(item, idx)).join('')}
        </div>
        ${communityLoading && !displayItems.length ? '<div class="community-loading"><i data-lucide="loader"></i><span>加载中...</span></div>' : ''}
        ${!communityLoading && !displayItems.length ? '<div class="community-empty"><i data-lucide="inbox"></i><span>暂无社区提示词，请先刷新来源</span></div>' : ''}
        ${hasMore ? `<div class="community-load-more"><button type="button" class="community-btn" data-community-load-more><i data-lucide="chevron-down"></i><span>加载更多</span></button></div>` : ''}
        ${communityDetailItem ? renderCommunityDetailModal() : ''}
    `;
    if (window.lucide) lucide.createIcons();
}

function renderCommunityCard(item, idx) {
    const coverUrl = item.coverUrl || '';
    const tags = (item.tags || []).slice(0, 4);
    const itemId = escapeAttr(item.id || '');
    return `<div class="community-card" data-community-id="${itemId}">
        <div class="community-card-cover" data-community-detail="${itemId}">
            ${coverUrl ? `<img src="${escapeAttr(communityImgUrl(coverUrl, true))}" alt="${escapeAttr(item.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="community-card-placeholder" style="display:none"><i data-lucide="file-text"></i></div>` : `<div class="community-card-placeholder"><i data-lucide="file-text"></i></div>`}
        </div>
        <div class="community-card-body">
            <div class="community-card-title" data-community-detail="${itemId}">${escapeHtml(item.title)}</div>
            <div class="community-card-desc">${escapeHtml(item.description || item.prompt || '').slice(0, 80)}</div>
            ${tags.length ? `<div class="community-card-tags">${tags.map(t => `<span class="community-card-tag" data-community-tag="${escapeAttr(t)}">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="community-card-actions">
            <button type="button" class="community-card-btn" data-community-use="${itemId}" title="使用此提示词"><i data-lucide="check-circle"></i><span>使用</span></button>
            <button type="button" class="community-card-btn" data-community-copy="${itemId}" title="复制提示词"><i data-lucide="copy"></i></button>
            <button type="button" class="community-card-btn" data-community-save-local="${itemId}" title="存到本地词库"><i data-lucide="bookmark-plus"></i></button>
        </div>
    </div>`;
}

function renderCommunityDetailModal() {
    const item = communityDetailItem;
    if (!item) return '';
    const refs = (item.referenceImageUrls || []).filter(u => u !== item.coverUrl).slice(0, 6);
    return `<div class="community-modal-backdrop" data-community-close-detail onclick="communityDetailItem=null;this.remove()">
        <div class="community-modal" onclick="event.stopPropagation()">
            <button type="button" class="community-modal-close" onclick="event.stopPropagation();communityDetailItem=null;this.closest('.community-modal-backdrop').remove()"><i data-lucide="x"></i></button>
            <div class="community-modal-scroll">
                ${item.coverUrl ? `<img class="community-modal-cover" src="${escapeAttr(communityImgUrl(item.coverUrl))}" alt="" style="cursor:zoom-in" onclick="event.stopPropagation();if(typeof openSmartLogLightbox==='function')openSmartLogLightbox('${escapeAttr(communityImgUrl(item.coverUrl))}')">` : ''}
                ${refs.length ? `<div class="community-modal-refs">${refs.map(u => `<img src="${escapeAttr(communityImgUrl(u))}" alt="" loading="lazy" style="cursor:zoom-in" onclick="event.stopPropagation();if(typeof openSmartLogLightbox==='function')openSmartLogLightbox('${escapeAttr(communityImgUrl(u))}')">`).join('')}</div>` : ''}
                <h3 class="community-modal-title">${escapeHtml(item.title)}</h3>
                ${item.author ? `<div class="community-modal-author">by ${escapeHtml(item.author)}</div>` : ''}
                ${item.tags?.length ? `<div class="community-modal-tags">${item.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                ${item.description ? `<p class="community-modal-desc">${escapeHtml(item.description)}</p>` : ''}
                <pre class="community-modal-prompt">${escapeHtml(item.prompt)}</pre>
                ${item.sourceUrl ? `<a class="community-modal-source" href="${escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener">查看来源 ↗</a>` : ''}
                <div class="community-modal-actions">
                    <button type="button" class="community-btn" data-community-copy-detail><i data-lucide="copy"></i><span>复制</span></button>
                    <button type="button" class="community-btn" data-community-save-local-detail><i data-lucide="bookmark-plus"></i><span>存到本地</span></button>
                </div>
            </div>
        </div>
    </div>`;
}

function renderCommunitySourceManager() {
    return `<div class="community-source-manager">
        <div class="community-source-manager-head">
            <strong>来源管理</strong>
            <button type="button" class="community-btn small" data-community-add-source><i data-lucide="plus"></i><span>新增来源</span></button>
        </div>
        <div class="community-source-list">
            ${communitySources.map(s => `<div class="community-source-row ${s.builtIn ? 'builtin' : ''}">
                <div class="community-source-info">
                    <span class="community-source-name">${escapeHtml(s.name)}${s.builtIn ? '<small>内置</small>' : ''}</span>
                    <span class="community-source-status ${s.lastError ? 'error' : ''}">${s.lastError ? escapeHtml(s.lastError) : `${s.count || 0} 条`}${s.fetchedAt ? ` · ${timeAgo(s.fetchedAt)}` : ' · 未拉取'}</span>
                </div>
                <div class="community-source-btns">
                    <label class="community-toggle" title="${s.enabled ? '已启用' : '已禁用'}">
                        <input type="checkbox" ${s.enabled ? 'checked' : ''} data-community-toggle-source="${escapeAttr(s.id)}">
                        <span></span>
                    </label>
                    <button type="button" class="community-icon-btn" data-community-refresh-source="${escapeAttr(s.id)}" title="拉取"><i data-lucide="refresh-cw"></i></button>
                    ${!s.builtIn ? `<button type="button" class="community-icon-btn danger" data-community-delete-source="${escapeAttr(s.id)}" title="删除"><i data-lucide="trash-2"></i></button>` : ''}
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

// ---- 交互操作 ----
function applyCommunityPromptToCanvas(promptText) {
    if (!promptText || !promptTemplatePanel) return;
    const target = promptTemplatePanel.dataset.target || 'node';
    if (target === 'composer') {
        // 先关闭面板（会触发 render → updateComposer 可能清空文本）
        closePromptTemplatePanel();
        // 面板关闭后再设置文本，避免被 updateComposer 清空
        setPromptText(promptText);
        if (typeof savePromptDraftForCurrent === 'function') savePromptDraftForCurrent();
        if (typeof renderInputThumbsRow === 'function') renderInputThumbsRow(typeof selectedNode === 'function' ? selectedNode() : null);
        if (typeof scheduleSave === 'function') scheduleSave();
    } else {
        const nodeId = promptTemplatePanel.dataset.nodeId || '';
        const node = (typeof nodes !== 'undefined' ? nodes : []).find(n => n.id === nodeId);
        if (!node) return;
        node.text = promptText;
        closePromptTemplatePanel();
        if (typeof scheduleSave === 'function') scheduleSave();
        if (typeof render === 'function') render();
    }
}

async function saveCommunityPromptToLocal(item) {
    if (!item) return;
    try {
        const data = await communityApiJson('/api/prompt-libraries/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                library_id: (typeof activePromptLibraryId !== 'undefined' ? activePromptLibraryId : '') || 'system',
                name: item.title || '社区提示词',
                positive: item.prompt || '',
                negative: '',
                category: 'custom',
                scene: item.description || '从社区词库导入'
            })
        });
        if (typeof promptLibraries !== 'undefined') {
            promptLibraries = data.library?.libraries || promptLibraries;
        }
        if (typeof loadPromptTemplates === 'function') await loadPromptTemplates();
        if (typeof setStatus === 'function') setStatus('已保存到本地词库');
        else if (typeof toast === 'function') toast('已保存到本地词库');
    } catch (e) {
        if (typeof toast === 'function') toast(e.message || '保存失败');
    }
}

async function copyCommunityPrompt(text) {
    try {
        await navigator.clipboard.writeText(text || '');
        if (typeof toast === 'function') toast('已复制提示词');
    } catch {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text || '';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (typeof toast === 'function') toast('已复制提示词');
    }
}

// 按 ID 查找条目（从所有已加载的条目中查找）
function findCommunityItemById(id) {
    const all = communityAllItems.length > 0 ? communityAllItems : communityItems;
    return all.find(item => item.id === id) || null;
}

// ---- Esc 关闭所有弹窗（分层关闭） ----
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        // 优先关闭图片灯箱（smartLogLightbox 或 communityImgLightbox）
        const smartLightbox = document.getElementById('smartLogLightbox');
        const smartLightboxOpen = smartLightbox && smartLightbox.classList.contains('open');
        const communityLightbox = document.getElementById('communityImgLightbox');
        const modal = document.querySelector('#promptTemplateCommunityBody .community-modal-backdrop');
        if (smartLightboxOpen) {
            if (typeof closeSmartLogLightbox === 'function') closeSmartLogLightbox();
            e.stopImmediatePropagation();
            e.preventDefault();
        } else if (communityLightbox) {
            communityLightbox.remove();
            e.stopImmediatePropagation();
            e.preventDefault();
        } else if (modal) {
            communityDetailItem = null;
            modal.remove();
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }
});

// ---- 事件委托 ----
// 注意：不能绑定到 document，因为 promptTemplatePanel 的 click handler 调用了 stopPropagation()
// 必须绑定到社区容器元素（在 panel 内部），在事件到达 panel 之前就能捕获
const _communityRoot = document.getElementById('promptTemplateCommunityBody');
// 捕获阶段处理器：详情弹窗内的 .community-modal 有 stopPropagation()，
// 必须在捕获阶段处理弹窗内的按钮点击，否则冒泡阶段收不到
_communityRoot?.addEventListener('click', async (e) => {
    const target = e.target;
    // 详情弹窗中的操作（在 modal 内部，冒泡阶段会被 stopPropagation 拦截）
    if (target.closest('[data-community-copy-detail]')) {
        e.stopPropagation();
        if (communityDetailItem) await copyCommunityPrompt(communityDetailItem.prompt);
        return;
    }
    if (target.closest('[data-community-save-local-detail]')) {
        e.stopPropagation();
        if (communityDetailItem) await saveCommunityPromptToLocal(communityDetailItem);
        return;
    }
}, true); // true = 捕获阶段
_communityRoot?.addEventListener('click', async (e) => {
    const target = e.target;
    // 使用提示词
    const useBtn = target.closest('[data-community-use]');
    if (useBtn) {
        const item = findCommunityItemById(useBtn.dataset.communityUse);
        if (item) applyCommunityPromptToCanvas(item.prompt);
        return;
    }
    // 复制提示词
    const copyBtn = target.closest('[data-community-copy]');
    if (copyBtn) {
        const item = findCommunityItemById(copyBtn.dataset.communityCopy);
        if (item) await copyCommunityPrompt(item.prompt);
        return;
    }
    // 存到本地
    const saveBtn = target.closest('[data-community-save-local]');
    if (saveBtn) {
        const item = findCommunityItemById(saveBtn.dataset.communitySaveLocal);
        if (item) await saveCommunityPromptToLocal(item);
        return;
    }
    // 查看详情
    const detailTrigger = target.closest('[data-community-detail]');
    if (detailTrigger) {
        communityDetailItem = findCommunityItemById(detailTrigger.dataset.communityDetail);
        if (communityDetailItem) await renderCommunityTab();
        return;
    }
    // 关闭详情
    if (target.closest('[data-community-close-detail]')) {
        communityDetailItem = null;
        await renderCommunityTab();
        return;
    }
    // 详情弹窗中的操作
    if (target.closest('[data-community-copy-detail]')) {
        if (communityDetailItem) await copyCommunityPrompt(communityDetailItem.prompt);
        return;
    }
    if (target.closest('[data-community-save-local-detail]')) {
        if (communityDetailItem) await saveCommunityPromptToLocal(communityDetailItem);
        return;
    }
    // 来源筛选
    const sourceFilter = target.closest('[data-community-source]');
    if (sourceFilter) {
        communitySourceFilter = sourceFilter.dataset.communitySource || '';
        communityPage = 1;
        await loadCommunityPrompts(false);
        await renderCommunityTab();
        return;
    }
    // 标签筛选
    const tagFilter = target.closest('[data-community-tag]');
    if (tagFilter && !tagFilter.closest('.community-card')) {
        communityTagFilter = tagFilter.dataset.communityTag || '';
        communityPage = 1;
        await loadCommunityPrompts(false);
        await renderCommunityTab();
        return;
    }
    // 加载更多
    if (target.closest('[data-community-load-more]')) {
        communityPage++;
        await loadCommunityPrompts(true);
        await renderCommunityTab();
        return;
    }
    // 刷新全部
    if (target.closest('[data-community-refresh-all]')) {
        const btn = target.closest('[data-community-refresh-all]');
        btn.disabled = true;
        btn.querySelector('span') && (btn.querySelector('span').textContent = '拉取中...');
        await refreshAllCommunitySources();
        await loadCommunitySources();
        communityPage = 1;
        await loadCommunityPrompts(false);
        await renderCommunityTab();
        return;
    }
    // 管理来源
    if (target.closest('[data-community-manage]')) {
        communitySourceManageOpen = !communitySourceManageOpen;
        await renderCommunityTab();
        return;
    }
    // 刷新单个来源
    const refreshSource = target.closest('[data-community-refresh-source]');
    if (refreshSource) {
        const sid = refreshSource.dataset.communityRefreshSource;
        await refreshCommunitySource(sid);
        await loadCommunitySources();
        await loadCommunityPrompts(false);
        await renderCommunityTab();
        return;
    }
    // 删除来源
    const deleteSource = target.closest('[data-community-delete-source]');
    if (deleteSource) {
        const sid = deleteSource.dataset.communityDeleteSource;
        if (!confirm('确定删除此来源？')) return;
        try {
            await communityApiJson(`/api/prompt-sources/${encodeURIComponent(sid)}`, { method: 'DELETE' });
            await loadCommunitySources();
            await loadCommunityPrompts(false);
        } catch (err) {
            if (typeof toast === 'function') toast(err.message || '删除失败');
        }
        await renderCommunityTab();
        return;
    }
    // 新增来源
    if (target.closest('[data-community-add-source]')) {
        const name = prompt('来源名称：');
        if (!name?.trim()) return;
        const url = prompt('来源 JSON URL：');
        if (!url?.trim()) return;
        const homepage = prompt('来源主页（可选）：') || '';
        try {
            await communityApiJson('/api/prompt-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), url: url.trim(), homepage: homepage.trim() })
            });
            await loadCommunitySources();
            await renderCommunityTab();
        } catch (err) {
            if (typeof toast === 'function') toast(err.message || '新增失败');
        }
        return;
    }
    // 卡片上的标签点击筛选
    const cardTag = target.closest('.community-card-tag');
    if (cardTag) {
        e.stopPropagation();
        communityTagFilter = cardTag.dataset.communityTag || '';
        communityPage = 1;
        await loadCommunityPrompts(false);
        await renderCommunityTab();
        return;
    }
});

// 来源启用/禁用切换
_communityRoot?.addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-community-toggle-source]');
    if (toggle) {
        const sid = toggle.dataset.communityToggleSource;
        const enabled = toggle.checked;
        try {
            await communityApiJson(`/api/prompt-sources/${encodeURIComponent(sid)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            await loadCommunitySources();
            communityPage = 1;
            await loadCommunityPrompts(false);
            await renderCommunityTab();
        } catch (err) {
            if (typeof toast === 'function') toast(err.message || '操作失败');
        }
    }
});

// 搜索输入（防抖 + 客户端过滤）
let communitySearchTimer = null;
_communityRoot?.addEventListener('input', (e) => {
    if (e.target.id === 'communitySearch') {
        clearTimeout(communitySearchTimer);
        communitySearchTimer = setTimeout(async () => {
            communityKeyword = e.target.value.trim();
            // 有 keyword 时走服务端过滤并重新加载，否则用客户端过滤
            if (communityKeyword) {
                communityPage = 1;
                await loadCommunityPrompts(false);
            }
            // 只更新网格区域，保持搜索框焦点
            const grid = document.getElementById('communityGrid');
            const info = document.querySelector('.community-info');
            const loadMore = document.querySelector('.community-load-more');
            const emptyState = document.querySelector('.community-loading, .community-empty');
            if (grid) {
                const displayItems = getFilteredItems();
                grid.innerHTML = displayItems.map((item, idx) => renderCommunityCard(item, idx)).join('');
                if (window.lucide) lucide.createIcons();
                if (info) {
                    info.innerHTML = `<span>共 ${communityTotal} 条提示词</span>${displayItems.length ? `<span>已加载 ${displayItems.length} 条</span>` : ''}`;
                }
                if (loadMore) {
                    const hasMore = communityItems.length < communityTotal && !communityKeyword && !communityTagFilter;
                    loadMore.style.display = hasMore ? '' : 'none';
                }
                if (emptyState) {
                    emptyState.style.display = displayItems.length ? 'none' : '';
                }
            }
        }, 300);
    }
});

// ---- 工具函数 ----
function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - Number(ts);
    if (diff < 0) return '刚刚';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} 小时前`;
    const days = Math.floor(hrs / 24);
    return `${days} 天前`;
}
