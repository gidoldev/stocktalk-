/* ============================================================
   script.js (수정) - API 호출 방식
   
   변경사항:
   - localStorage 제거
   - sessionStorage에서 토큰 저장
   - 모든 요청을 API로 변경
============================================================ */

// API 기본 URL (브라우저/Node 환경 모두 대응)
const API_URL = (() => {
    // 1) HTML에서 window.API_URL을 미리 지정한 경우
    if (typeof window !== 'undefined' && window.API_URL) {
        return window.API_URL;
    }

    // 2) Node 번들러 환경(process.env) 대응
    if (typeof process !== 'undefined' && process?.env?.API_URL) {
        return process.env.API_URL;
    }

    // 3) 로컬 개발 환경 자동 감지
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        return 'http://localhost:5000';
    }

    // 4) 기본 프로덕션 API
    return 'https://api.stocktalk.com';
})();

// ============================================================
// [1] API 요청 헬퍼 함수
// ============================================================

/**
 * API 요청을 처리하는 함수
 * @param {string} endpoint - API 엔드포인트 (/api/posts 등)
 * @param {object} options - fetch options
 * @returns {Promise} API 응답
 */
async function apiCall(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    
    // 헤더 설정
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // 토큰이 있으면 Authorization 헤더 추가
    const token = sessionStorage.getItem('authToken');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        // 응답 파싱
        const data = await response.json();

        // 401 (Unauthorized) 처리 - 토큰 만료
        if (response.status === 401) {
            sessionStorage.clear();
            window.location.href = 'auth.html';
            throw new Error('인증이 만료되었습니다. 다시 로그인하세요.');
        }

        // 에러 응답 처리
        if (!response.ok) {
            throw new Error(data.error || '요청 처리에 실패했습니다.');
        }

        return data;
    } catch (error) {
        console.error('API 요청 오류:', error);
        throw error;
    }
}

// ============================================================
// [1] 인증 관련 함수
// ============================================================

// 1. 이용약관 동의 후 페이지 이동
window.agreeAndGo = function() {
    sessionStorage.setItem('policy_agreed', 'true');
    const urlParams = new URLSearchParams(window.location.search);
    const destination = urlParams.get('from') || 'main.html';
    window.location.href = destination;
};

// 2. 계정 삭제 (API 호출)
window.confirmDelete = async function() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert("로그인 상태가 아닙니다.");
        return;
    }
    
    if (!confirm('정말로 계정을 삭제하시겠습니까?\n모든 데이터가 즉시 파기됩니다.')) {
        return;
    }

    try {
        await apiCall('/api/auth/account', { method: 'DELETE' });
        sessionStorage.clear();
        alert("계정이 성공적으로 삭제되었습니다.");
        window.location.href = 'index.html';
    } catch (error) {
        alert('계정 삭제 중 오류가 발생했습니다: ' + error.message);
    }
};

// 3. 회원가입 로직 (API 호출)
window.handleSignup = async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('signup-id').value.trim();
    const pw = document.getElementById('signup-pw').value;
    const msg = document.getElementById('signup-msg');

    if (!id || !pw) {
        msg.style.color = '#ef4444';
        msg.innerText = "아이디와 비밀번호를 입력해주세요.";
        return;
    }

    try {
        const response = await apiCall('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ username: id, password: pw })
        });

        // 회원가입 성공
        sessionStorage.setItem('authToken', response.token);
        sessionStorage.setItem('userId', response.user.username);
        
        msg.style.color = '#10b981';
        msg.innerText = "가입 성공! 잠시 후 이동합니다.";
        document.getElementById('signup-form').reset();
        
        setTimeout(() => {
            window.location.href = 'main.html';
        }, 1500);
    } catch (error) {
        msg.style.color = '#ef4444';
        msg.innerText = error.message;
    }
};

// 4. 로그인 로직 (API 호출)
window.handleLogin = async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value;
    const msg = document.getElementById('login-msg');

    if (!id || !pw) {
        msg.style.color = '#ef4444';
        msg.innerText = "아이디와 비밀번호를 입력해주세요.";
        return;
    }

    try {
        const response = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: id, password: pw })
        });

        // 로그인 성공
        sessionStorage.setItem('authToken', response.token);
        sessionStorage.setItem('userId', response.user.username);
        sessionStorage.setItem('isLoggedIn', 'true');
        
        window.location.href = 'main.html';
    } catch (error) {
        msg.style.color = '#ef4444';
        msg.innerText = error.message;
    }
};

// ============================================================
// [2] 게시판 및 뉴스 피드 함수
// ============================================================

// 게시판 프리뷰 데이터 로드 (메인 대시보드용)
async function updateBoardPreview() {
    const latestList = document.getElementById('latest-list');
    const bestContent = document.getElementById('best-post-content');
    
    if (!latestList || !bestContent) return;

    try {
        const response = await apiCall('/api/posts');
        const posts = response.posts || [];

        if (posts.length === 0) {
            latestList.innerHTML = '<li class="empty-msg">게시글이 없습니다.</li>';
            bestContent.innerHTML = '<p class="empty-msg">데이터가 없습니다.</p>';
            return;
        }

        // 최신글 2개
        const latestPosts = posts.slice(0, 2);
        latestList.innerHTML = latestPosts.map(p => {
            const date = new Date(p.created_at).toLocaleDateString('ko-KR');
            return `
                <li style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                    <a href="view.html?id=${p.id}" style="text-decoration:none; color:var(--text-main); font-weight:500; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${p.title}
                    </a>
                    <span class="date" style="font-size: 0.8rem; color: var(--text-sub); margin-left: 10px; white-space:nowrap;">
                        ${date}
                    </span>
                </li>
            `;
        }).join('');

        // 인기글 (좋아요 순)
        const bestPost = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
        if (bestPost) {
            bestContent.innerHTML = `
                <a href="view.html?id=${bestPost.id}" class="hot-title" style="display:block; font-size:1.1rem; font-weight:700; color:var(--deep-ocean); margin-bottom:10px; text-decoration:none; overflow:hidden; text-overflow:ellipsis;">
                    ${bestPost.title}
                </a>
                <div class="hot-meta" style="display: flex; gap: 15px; font-size: 0.85rem; color: var(--text-sub);">
                    <span><i class="fas fa-heart" style="color:var(--error);"></i> ${bestPost.likes || 0}</span>
                    <span>By ${bestPost.username || '익명'}</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('게시판 프리뷰 로드 오류:', error);
        latestList.innerHTML = '<li class="empty-msg">데이터 로드 실패</li>';
    }
}

// ============================================================
// [3] TradingView 차트 로드
// ============================================================

function initTradingViewChart() {
    if (!document.getElementById('tradingview_chart')) return;

    window.loadChart = function(symbol = "NASDAQ:NVDA") {
        const container = document.getElementById('tradingview_chart');
        if (container) container.innerHTML = '';

        if (typeof TradingView !== 'undefined') {
            try {
                new TradingView.widget({
                    "autosize": true, 
                    "symbol": symbol, 
                    "interval": "D",
                    "timezone": "Asia/Seoul", 
                    "theme": "light", 
                    "style": "1",
                    "locale": "ko", 
                    "container_id": "tradingview_chart",
                    "details": true, 
                    "calendar": true, 
                    "withdateranges": true,
                    "allow_symbol_change": true
                });
            } catch (e) {
                console.error('TradingView 차트 로드 실패:', e);
            }
        }
    };

    loadChart();

    const sBtn = document.getElementById('mainSearchBtn');
    const sInp = document.getElementById('mainSearchInput');
    
    if (sBtn && sInp) {
        sBtn.onclick = () => { 
            if (sInp.value.trim()) {
                loadChart(sInp.value.toUpperCase().trim());
            }
        };
        sInp.onkeypress = (e) => { 
            if (e.key === 'Enter') sBtn.click(); 
        };
    }
}

// ============================================================
// [4] 구글 커스텀 검색 엔진 로드
// ============================================================

function initGoogleCSE() {
    if (!document.querySelector('.gcse-search')) return;

    const cx = '205acc9a5b41f4c0b';
    const gcse = document.createElement('script');
    gcse.type = 'text/javascript';
    gcse.async = true;
    gcse.src = `https://cse.google.com/cse.js?cx=${cx}`;
    document.head.appendChild(gcse);
}

// ============================================================
// [5] 헤더 UI 업데이트 (로그인/로그아웃)
// ============================================================

function updateHeaderUI() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;

    const token = sessionStorage.getItem('authToken');
    const userId = sessionStorage.getItem('userId');

    if (token && userId) {
        // 로그인 상태
        loginBtn.innerText = '로그아웃';
        loginBtn.style.background = 'white';
        loginBtn.style.color = 'var(--primary-blue)';
        loginBtn.style.border = '2px solid var(--primary-blue)';

        // 환영 메시지
        const welcome = document.createElement('span');
        welcome.innerText = `👋 ${userId}님`;
        welcome.style.cssText = "margin-right:15px; font-weight:bold; color:var(--primary-blue);";
        
        const headerContent = loginBtn.parentNode;
        if (headerContent && !headerContent.querySelector('span')) {
            headerContent.insertBefore(welcome, loginBtn);
        }

        // 로그아웃 클릭
        loginBtn.onclick = () => {
            if (confirm('로그아웃 하시겠습니까?')) {
                sessionStorage.clear();
                alert("로그아웃 되었습니다.");
                window.location.href = 'index.html';
            }
        };
    } else {
        // 로그아웃 상태
        loginBtn.innerText = '로그인';
        loginBtn.onclick = () => { 
            window.location.href = 'auth.html'; 
        };
    }
}

// ============================================================
// [6] DOM 로드 완료 후 초기화
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    updateHeaderUI();
    updateBoardPreview();
    initTradingViewChart();
    initGoogleCSE();
});
