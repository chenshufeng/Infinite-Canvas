/* ============================================================
 * 社区提示词库模块 (Community Prompts)
 * 与 smart-canvas.js 共享全局变量：escapeHtml, escapeAttr, nodes,
 * setPromptText, closePromptTemplatePanel, scheduleSave, render,
 * promptTemplatePanel, selectedId, selectedNode
 * ============================================================ */

// ---- 状态 ----
let communitySources = [];
let communityItems = [];
let communityTags = [];
let communityCategories = [];
let communityTotal = 0;
let communityPage = 1;
const COMMUNITY_PAGE_SIZE = 24;
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
    if (communityKeyword) params.set('keyword', communityKeyword);
    if (communityTagFilter) params.set('tags', communityTagFilter);
    params.set('page', String(communityPage));
    params.set('page_size', String(COMMUNITY_PAGE_SIZE));
    try {
        const data = await communityApiJson(`/api/community-prompts?${params}`);
        const items = Array.isArray(data.items) ? data.items : [];
        communityItems = append ? communityItems.concat(items) : items;
        communityTags = Array.isArray(data.tags) ? data.tags : [];
        communityCategories = Array.isArray(data.categories) ? data.categories : [];
        communityTotal = data.total || 0;
    } catch (e) {
        if (!append) { communityItems = []; communityTotal = 0; }
    } finally {
        communityLoading = false;
    }
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
    const hasMore = communityItems.length < communityTotal;
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
                ${communityTags.slice(0, 30).map(t => `<button type="button" class="community-filter-tag ${communityTagFilter === t ? 'active' : ''}" data-community-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('')}
            </div>` : ''}
        </div>
        <div class="community-info"><span>共 ${communityTotal} 条提示词</span>${communityItems.length ? `<span>已加载 ${communityItems.length} 条</span>` : ''}</div>
        <div class="community-grid" id="communityGrid">
            ${communityItems.map((item, idx) => renderCommunityCard(item, idx)).join('')}
        </div>
        ${communityLoading && !communityItems.length ? '<div class="community-loading"><i data-lucide="loader"></i><span>加载中...</span></div>' : ''}
        ${!communityLoading && !communityItems.length ? '<div class="community-empty"><i data-lucide="inbox"></i><span>暂无社区提示词，请先刷新来源</span></div>' : ''}
        ${hasMore ? `<div class="community-load-more"><button type="button" class="community-btn" data-community-load-more><i data-lucide="chevron-down"></i><span>加载更多</span></button></div>` : ''}
        ${communityDetailItem ? renderCommunityDetailModal() : ''}
    `;
    if (window.lucide) lucide.createIcons();
}

function renderCommunityCard(item, idx) {
    const coverUrl = item.coverUrl || '';
    const tags = (item.tags || []).slice(0, 4);
    return `<div class="community-card" data-community-idx="${idx}">
        <div class="community-card-cover" data-community-detail="${idx}">
            ${coverUrl ? `<img src="${escapeAttr(coverUrl)}" alt="${escapeAttr(item.title)}" loading="lazy">` : `<div class="community-card-placeholder"><i data-lucide="file-text"></i></div>`}
        </div>
        <div class="community-card-body">
            <div class="community-card-title" data-community-detail="${idx}">${escapeHtml(item.title)}</div>
            <div class="community-card-desc">${escapeHtml(item.description || item.prompt || '').slice(0, 80)}</div>
            ${tags.length ? `<div class="community-card-tags">${tags.map(t => `<span class="community-card-tag" data-community-tag="${escapeAttr(t)}">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="community-card-actions">
            <button type="button" class="community-card-btn" data-community-use="${idx}" title="使用此提示词"><i data-lucide="check-circle"></i><span>使用</span></button>
            <button type="button" class="community-card-btn" data-community-copy="${idx}" title="复制提示词"><i data-lucide="copy"></i></button>
            <button type="button" class="community-card-btn" data-community-save-local="${idx}" title="存到本地词库"><i data-lucide="bookmark-plus"></i></button>
        </div>
    </div>`;
}

function renderCommunityDetailModal() {
    const item = communityDetailItem;
    if (!item) return '';
    const refs = (item.referenceImageUrls || []).filter(u => u !== item.coverUrl).slice(0, 6);
    return `<div class="community-modal-backdrop" data-community-close-detail>
        <div class="community-modal" onclick="event.stopPropagation()">
            <button type="button" class="community-modal-close" data-community-close-detail><i data-lucide="x"></i></button>
            <div class="community-modal-scroll">
                ${item.coverUrl ? `<img class="community-modal-cover" src="${escapeAttr(item.coverUrl)}" alt="">` : ''}
                ${refs.length ? `<div class="community-modal-refs">${refs.map(u => `<img src="${escapeAttr(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
                <h3 class="community-modal-title">${escapeHtml(item.title)}</h3>
                ${item.author ? `<div class="community-modal-author">by ${escapeHtml(item.author)}</div>` : ''}
                ${item.tags?.length ? `<div class="community-modal-tags">${item.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                ${item.description ? `<p class="community-modal-desc">${escapeHtml(item.description)}</p>` : ''}
                <pre class="community-modal-prompt">${escapeHtml(item.prompt)}</pre>
                ${item.sourceUrl ? `<a class="community-modal-source" href="${escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener">查看来源 ↗</a>` : ''}
                <div class="community-modal-actions">
                    <button type="button" class="community-btn primary" data-community-use-detail><i data-lucide="check-circle"></i><span>使用此提示词</span></button>
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
        setPromptText(promptText);
        delete promptInput.dataset.preserveDraftOnce;
        if (typeof savePromptDraftForCurrent === 'function') savePromptDraftForCurrent();
        if (typeof renderInputThumbsRow === 'function') renderInputThumbsRow(typeof selectedNode === 'function' ? selectedNode() : null);
        closePromptTemplatePanel();
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

// ---- 事件委托 ----
document.addEventListener('click', async (e) => {
    const target = e.target;
    // 使用提示词
    const useBtn = target.closest('[data-community-use]');
    if (useBtn) {
        const idx = Number(useBtn.dataset.communityUse);
        const item = communityItems[idx];
        if (item) applyCommunityPromptToCanvas(item.prompt);
        return;
    }
    // 复制提示词
    const copyBtn = target.closest('[data-community-copy]');
    if (copyBtn) {
        const idx = Number(copyBtn.dataset.communityCopy);
        const item = communityItems[idx];
        if (item) await copyCommunityPrompt(item.prompt);
        return;
    }
    // 存到本地
    const saveBtn = target.closest('[data-community-save-local]');
    if (saveBtn) {
        const idx = Number(saveBtn.dataset.communitySaveLocal);
        const item = communityItems[idx];
        if (item) await saveCommunityPromptToLocal(item);
        return;
    }
    // 查看详情
    const detailTrigger = target.closest('[data-community-detail]');
    if (detailTrigger) {
        const idx = Number(detailTrigger.dataset.communityDetail);
        communityDetailItem = communityItems[idx] || null;
        await renderCommunityTab();
        return;
    }
    // 关闭详情
    if (target.closest('[data-community-close-detail]')) {
        communityDetailItem = null;
        await renderCommunityTab();
        return;
    }
    // 详情弹窗中的操作
    if (target.closest('[data-community-use-detail]')) {
        if (communityDetailItem) applyCommunityPromptToCanvas(communityDetailItem.prompt);
        communityDetailItem = null;
        return;
    }
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
document.addEventListener('change', async (e) => {
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

// 搜索输入（防抖）
let communitySearchTimer = null;
document.addEventListener('input', (e) => {
    if (e.target.id === 'communitySearch') {
        clearTimeout(communitySearchTimer);
        communitySearchTimer = setTimeout(async () => {
            communityKeyword = e.target.value.trim();
            communityPage = 1;
            await loadCommunityPrompts(false);
            await renderCommunityTab();
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
