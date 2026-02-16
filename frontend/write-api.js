/* ===============================
   write.js (수정) - API 호출 방식
=============================== */

window.savePost = async function (e) {
    e.preventDefault();

    const titleInput = document.getElementById('post-title');
    const contentInput = document.getElementById('post-content');

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const token = sessionStorage.getItem('authToken');

    // 로그인 확인
    if (!token) {
        alert("로그인이 필요합니다.");
        return;
    }

    // 제목/내용 입력 확인
    if (!title || !content) {
        alert("제목과 내용을 모두 입력해주세요.");
        return;
    }

    try {
        // API 호출
        const response = await apiCall('/api/posts', {
            method: 'POST',
            body: JSON.stringify({ title, content })
        });

        alert("글이 등록되었습니다!");
        location.href = 'board.html';
    } catch (error) {
        alert('글 등록 중 오류가 발생했습니다: ' + error.message);
    }
};

/* 페이지 로드 시 작성자 표시 */
document.addEventListener('DOMContentLoaded', () => {
    const userDisplay = document.getElementById('user-display');
    const userId = sessionStorage.getItem('userId');

    if (userDisplay) {
        if (userId) {
            userDisplay.innerText = `작성자: ${userId}`;
        } else {
            userDisplay.innerText = "로그인이 필요합니다";
            userDisplay.style.color = 'var(--error)';
            
            // 3초 후 로그인 페이지로 이동
            setTimeout(() => {
                location.href = 'auth.html';
            }, 3000);
        }
    }
});
