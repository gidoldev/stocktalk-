/* ===============================
   view.js (수정) - API 호출 방식
=============================== */

let currentPostId = new URLSearchParams(window.location.search).get('id');
const userId = sessionStorage.getItem('userId') || 'guest';
const token = sessionStorage.getItem('authToken');

document.addEventListener('DOMContentLoaded', () => {
    // URL에 id가 없는 경우 차단
    if (!currentPostId) {
        alert('잘못된 접근입니다.');
        location.href = 'board.html';
        return;
    }

    loadPostDetail();
});

/* ===============================
   게시글 상세 내용 로드 (API)
=============================== */
async function loadPostDetail() {
    try {
        const response = await apiCall(`/api/posts/${currentPostId}`);
        const post = response.post;

        if (!post) {
            alert('존재하지 않는 게시글입니다.');
            location.href = 'board.html';
            return;
        }

        // 게시글 정보 화면에 표시
        const titleEl = document.getElementById('view-title');
        const authorEl = document.getElementById('view-author');
        const dateEl = document.getElementById('view-date');
        const contentEl = document.getElementById('view-content');
        const likeCountEl = document.getElementById('like-count');

        const postDate = new Date(post.created_at).toLocaleDateString('ko-KR');

        if (titleEl) titleEl.innerText = post.title || '제목 없음';
        if (authorEl) authorEl.innerHTML = `<i class="fas fa-user"></i> ${post.username || '익명'}`;
        if (dateEl) dateEl.innerHTML = `<i class="fas fa-calendar-alt"></i> ${postDate}`;
        if (contentEl) contentEl.innerText = post.content || '내용 없음';
        if (likeCountEl) likeCountEl.innerText = post.likes || 0;

        // 좋아요 버튼 UI 업데이트
        if (token) {
            updateLikeButtonUI();
        } else {
            // 비로그인 상태: 좋아요 버튼 비활성화
            const likeBtn = document.getElementById('like-btn');
            if (likeBtn) {
                likeBtn.style.opacity = '0.5';
                likeBtn.style.pointerEvents = 'none';
                likeBtn.title = '로그인 후 이용 가능합니다.';
            }
        }
    } catch (error) {
        alert('게시글을 불러올 수 없습니다: ' + error.message);
        location.href = 'board.html';
    }
}

/* ===============================
   좋아요 처리 함수 (API)
=============================== */
async function handleLike() {
    // 게스트 사용자 처리
    if (!token) {
        alert('로그인 후 좋아요를 누를 수 있습니다.');
        return;
    }

    try {
        const response = await apiCall(`/api/posts/${currentPostId}/like`, {
            method: 'POST'
        });

        // UI 업데이트
        const likeCountEl = document.getElementById('like-count');
        
        // 최신 좋아요 수를 다시 조회
        const postResponse = await apiCall(`/api/posts/${currentPostId}`);
        if (likeCountEl) {
            likeCountEl.innerText = postResponse.post.likes || 0;
        }

        updateLikeButtonUI();
    } catch (error) {
        alert('좋아요 처리 중 오류가 발생했습니다: ' + error.message);
    }
}

/* ===============================
   좋아요 버튼 UI 상태 업데이트 (API)
=============================== */
async function updateLikeButtonUI() {
    if (!token) return;

    try {
        const response = await apiCall(`/api/posts/${currentPostId}/like-status`);
        const likeBtn = document.getElementById('like-btn');

        if (likeBtn) {
            if (response.liked) {
                likeBtn.classList.add('active');
            } else {
                likeBtn.classList.remove('active');
            }
        }
    } catch (error) {
        console.error('좋아요 상태 확인 오류:', error);
    }
}
