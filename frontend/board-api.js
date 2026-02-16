/* ============================================================
   board.js (수정) - API 호출 방식
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // 사이드바 게시글 로드
    loadSidebarPosts();

    // 채팅 폼 이벤트 리스너
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', sendChat);
    }

    // 초기 채팅 메시지 로드
    loadChatHistory();
});

/* ============================================================
   [1] 사이드바 게시글 로드 (API)
============================================================ */
async function loadSidebarPosts() {
    const sidebarList = document.getElementById('sidebar-list');
    if (!sidebarList) return;

    try {
        const response = await apiCall('/api/posts');
        const posts = response.posts || [];

        if (posts.length === 0) {
            sidebarList.innerHTML = '<div class="empty-msg" style="padding:20px; text-align:center; color:var(--text-sub);">작성된 글이 없습니다.</div>';
            return;
        }

        const postHTML = posts.map(p => {
            const postDate = new Date(p.created_at).toLocaleDateString('ko-KR');
            return `
                <div class="sidebar-item" onclick="location.href='view.html?id=${p.id}'">
                    <div class="side-title" style="font-weight:700; margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${p.title || '제목 없음'}
                    </div>
                    <div class="side-meta" style="font-size:0.8rem; color:var(--text-sub); display:flex; justify-content:space-between; align-items:center;">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <i class="fas fa-user-circle"></i> ${p.username || '익명'}
                        </span>
                        <span>${postDate}</span>
                    </div>
                    <div style="font-size:0.75rem; color:var(--primary-blue); margin-top:4px;">
                        <i class="fas fa-heart"></i> ${p.likes || 0}
                    </div>
                </div>
            `;
        }).join('');

        sidebarList.innerHTML = postHTML;
    } catch (error) {
        console.error('게시글 로드 오류:', error);
        sidebarList.innerHTML = '<div class="empty-msg">게시글 로드 실패</div>';
    }
}

/* ============================================================
   [2] 채팅 메시지 전송 (API)
============================================================ */
async function sendChat(e) {
    e.preventDefault();

    const input = document.getElementById('chat-input');
    const container = document.getElementById('chat-messages');
    const token = sessionStorage.getItem('authToken');
    const userId = sessionStorage.getItem('userId') || '익명';

    // 입력값 검증
    if (!input.value.trim()) {
        return;
    }

    // 로그인 확인
    if (!token) {
        alert('로그인 후 채팅을 이용할 수 있습니다.');
        return;
    }

    try {
        // API에 메시지 저장
        const response = await apiCall('/api/chats', {
            method: 'POST',
            body: JSON.stringify({ message: input.value.trim() })
        });

        // 현재 시간 포맷
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // 메시지 요소 생성
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';

        msgDiv.innerHTML = `
            <div style="font-size:0.75rem; margin-bottom:4px; color:var(--text-sub); display:flex; gap:6px;">
                <span class="msg-author" style="color:var(--primary-blue); font-weight:700;">
                    ${escapeHtml(userId)}
                </span>
                <span>·</span>
                <span>${timeStr}</span>
            </div>
            <div class="msg-text" style="word-break:break-word;">
                ${escapeHtml(input.value)}
            </div>
        `;

        container.appendChild(msgDiv);

        // 자동 스크롤
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });

        // 입력창 초기화
        input.value = '';
        input.focus();

    } catch (error) {
        alert('메시지 전송 실패: ' + error.message);
    }
}

/* ============================================================
   [3] 채팅 메시지 로드 (API)
============================================================ */
async function loadChatHistory() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    try {
        const response = await apiCall('/api/chats');
        const chats = response.chats || [];

        if (chats.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;">아직 메시지가 없습니다.</div>';
            return;
        }

        container.innerHTML = chats.map(chat => {
            const chatTime = new Date(chat.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            return `
                <div class="chat-msg">
                    <div style="font-size:0.75rem; margin-bottom:4px; color:var(--text-sub); display:flex; gap:6px;">
                        <span class="msg-author" style="color:var(--primary-blue); font-weight:700;">
                            ${escapeHtml(chat.username)}
                        </span>
                        <span>·</span>
                        <span>${chatTime}</span>
                    </div>
                    <div class="msg-text" style="word-break:break-word;">
                        ${escapeHtml(chat.message)}
                    </div>
                </div>
            `;
        }).join('');

        // 스크롤을 맨 아래로
        if (container.scrollHeight > 0) {
            container.scrollTop = container.scrollHeight;
        }
    } catch (error) {
        console.error('채팅 로드 오류:', error);
        container.innerHTML = '<div style="text-align:center; color:var(--error); padding:20px;">채팅 로드 실패</div>';
    }
}

/* ============================================================
   [4] XSS 방지 (HTML 이스케이핑)
============================================================ */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
