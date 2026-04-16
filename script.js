/**
 * Smart Campus Issue Tracking System - script.js
 * High-End SaaS API-First Client
 */

const API_BASE = '/api';

// ─── AUTHENTICATION HELPERS ───────────────────────

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const btn = document.getElementById('login-btn');

    // UI resets
    hideErrors();
    
    if (!email || !password || !role) {
        showError('role-error', 'Please fill in all fields');
        return;
    }

    try {
        // LOADING STATE: Start
        btn.disabled = true;
        btn.dataset.originalText = btn.innerText;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';

        const res = await fetch(`/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });

        const data = await res.json();

        if (res.ok) {
            sessionStorage.setItem('user', JSON.stringify(data));
            // SUCCESS: Redirect based on role path
            window.location.href = `/${role}`;
        } else {
            // ERROR: Specific backend feedback
            const errorMsg = data.error || 'Login failed';
            if (errorMsg === 'Incorrect role selected') {
                showError('role-error', errorMsg);
            } else {
                showError('password-error', errorMsg);
            }
        }
    } catch (err) {
        // ERROR: Network or server not reachable
        showError('password-error', 'Server not reachable');
    } finally {
        // LOADING STATE: End
        btn.disabled = false;
        btn.innerText = btn.dataset.originalText || 'Sign In';
    }
}

async function logout() {
    await fetch(`/logout`, { method: 'POST' });
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
}

function getUser() {
    const user = sessionStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

function requireAuth(role) {
    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    if (role && user.role !== role) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

// ─── SIDEBAR NAVIGATION LOGIC ─────────────────────

function initSidebarNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const currentPath = window.location.pathname;

    navItems.forEach(item => {
        const href = item.getAttribute('href');
        
        // Handle active state
        if (currentPath === href || (currentPath === '/' && href === '/index.html')) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }

        // Handle section-based smooth scrolling
        if (href && href.startsWith('#')) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    // Update active state manually for sections
                    navItems.forEach(ni => ni.classList.remove('active'));
                    item.classList.add('active');
                    
                    targetEl.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    });
}

// ─── API DATA HELPERS ─────────────────────────────

async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) throw new Error('API Error');
        return await res.json();
    } catch (err) {
        console.error('Fetch Error:', err);
        return null;
    }
}

// Helper to get all issues from server
async function getIssues() {
    return await apiFetch('/issues');
}

// Helper to update an issue's status or details
async function updateIssue(id, updates) {
    return await apiFetch(`/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
}

// Helper to create a new issue
async function addIssue(issueData) {
    return await apiFetch('/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issueData)
    });
}

// Helper to get global stats
async function getStats() {
    return await apiFetch('/stats');
}

// ─── UI UTILITIES ─────────────────────────────────

function initNotificationSystem() {
    const user = getUser();
    if (!user || user.role !== 'user') return;
    
    loadNotifications();
    // Poll for new notifications every 30 seconds
    setInterval(loadNotifications, 30000);
}

async function loadNotifications() {
    try {
        const res = await fetch('/notifications');
        if (!res.ok) return;
        const notifs = await res.json();
        renderNotifications(notifs);
        updateNotifBadge(notifs.filter(n => !n.isRead).length);
    } catch(err) {
        console.error('Notif Fetch Error:', err);
    }
}

function renderNotifications(notifs) {
    const container = document.getElementById('notif-list');
    if (!container) return;

    if (!notifs.length) {
        container.innerHTML = `
            <div class="notif-empty">
                <i class="fas fa-bell-slash"></i>
                <div>No notifications yet</div>
            </div>`;
        return;
    }

    container.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.isRead ? 'read' : 'unread'}" onclick="handleNotifClick(${n.id}, '${n.issue_id}')">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-msg">${n.message}</div>
            <div class="notif-item-meta">
                <span><i class="fas fa-hashtag"></i> ${n.issue_id}</span>
                <span>${formatNotifTime(n.createdAt)}</span>
            </div>
        </div>
    `).join('');
}

function updateNotifBadge(count) {
    const badges = [document.getElementById('notif-count'), document.getElementById('sidebar-notif-count')];
    badges.forEach(badge => {
        if (!badge) return;
        if (count > 0) {
            badge.style.display = 'flex';
            badge.textContent = count > 9 ? '9+' : count;
        } else {
            badge.style.display = 'none';
        }
    });
}

async function handleNotifClick(id, issueId) {
    await markNotifRead(id);
    toggleNotif(false); // Close drawer
    
    // Highlight or scroll to issue
    const issueEl = document.getElementById(`issue-${issueId}`);
    if (issueEl) {
        issueEl.scrollIntoView({ behavior: 'smooth' });
        issueEl.style.boxShadow = '0 0 0 2px var(--primary)';
        setTimeout(() => issueEl.style.boxShadow = '', 3000);
    } else {
        // Fallback: If on another page or not rendered, go to user page
        if (window.location.pathname !== '/user') window.location.href = '/user';
    }
}

async function markNotifRead(id) {
    try {
        await fetch(`/notifications/${id}/read`, { method: 'PUT' });
        await loadNotifications();
    } catch(err) {
        console.error('Mark Read Error:', err);
    }
}

function toggleNotif(force) {
    const drawer = document.getElementById('notif-drawer');
    const overlay = document.getElementById('notif-drawer-overlay');
    if (!drawer) return;

    const isOpen = typeof force === 'boolean' ? !force : drawer.classList.contains('open');
    
    if (isOpen) {
        drawer.classList.remove('open');
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    } else {
        drawer.classList.add('open');
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadNotifications(); // Refresh on open
    }
}

function formatNotifTime(isoStr) {
    const date = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return date.toLocaleDateString();
}

function detectPriority(title, desc) {
    const criticalWords = ['fire', 'burst', 'electric shock', 'emergency', 'danger', 'shorth circuit'];
    const highWords = ['leak', 'broken', 'no water', 'no power', 'dark', 'security'];
    const text = (title + ' ' + desc).toLowerCase();
    
    if (criticalWords.some(w => text.includes(w))) return 'Critical';
    if (highWords.some(w => text.includes(w))) return 'High';
    return 'Medium';
}

// Simple toast/alert area helper
function showAlert(type, html) {
    const area = document.getElementById('alert-area');
    if (!area) return;
    area.innerHTML = `
      <div class="floating-alert" style="border-left-color: var(--${type});">
        <div class="floating-icon" style="background:var(--${type}-bg); color:var(--${type}); animation:none;"><i class="fas fa-${type==='success'?'check':'exclamation'}"></i></div>
        <div class="floating-content"><p>${html}</p></div>
      </div>
    `;
    setTimeout(() => { area.innerHTML = ''; }, 5000);
}

// Mock Staff Data for dropdowns (Static but could be fetched from API if needed)
const MOCK_STAFF = [
  { name: 'Rajesh Kumar', specialty: 'Electrical', avatar: 'RK', resolved: 24 },
  { name: 'Priya Sharma', specialty: 'Plumbing', avatar: 'PS', resolved: 18 },
  { name: 'Arjun Singh',  specialty: 'Network',  avatar: 'AS', resolved: 32 }
];

// Initialize navigation on all pages
document.addEventListener('DOMContentLoaded', () => {
    initSidebarNavigation();
    initNotificationSystem();
});
