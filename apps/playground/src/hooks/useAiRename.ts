const PROMPT_TEMPLATE = (code: string) => `
Bạn là chuyên gia phân tích ngược JavaScript và Google Apps Script.
Nhiệm vụ: Chuyển code bị làm rối thành code sạch, dễ đọc, chuẩn Google Apps Script.

1. GIẢI MÃ TÊN BIẾN/HÀM BỊ RỐI:
   - Chỉ đổi tên các identifier dạng _0x..., _abc, _xyz, tên 1-2 ký tự vô nghĩa
   - KHÔNG đổi tên các hàm/biến đã có nghĩa (saveNguoiDung, loginUser, _piwjp, _mrdot...)
   - Đổi tên biến nội bộ thành camelCase tiếng Việt có nghĩa
   - Ví dụ: _0x31d034 → sheetNguoiDung, _0x3dbcc8 → duLieuNguoiDung, _0x488d31 → i

2. ĐẶT TÊN DỰA VÀO CONTEXT:
   - Đọc string literals, API calls, return values bên trong hàm để suy ra tên đúng
   - Thấy getSheetByName("Học sinh") + appendRow → biến là sheetHocSinh
   - Thấy getScriptCache().get(token) → biến là cacheDuLieu
   - Thấy deleteRow() + tham số mã → biến là viTriDong, maCanXoa
   - Thấy PropertiesService.getScriptProperties() → biến là scriptProps
   - Thấy Utilities.getUuid() → biến là sessionToken

3. COMMENT TIẾNG VIỆT:
   - Thêm 1 dòng comment tiếng Việt phía trên mỗi hàm giải thích chức năng
   - Thêm comment inline cho các dòng logic quan trọng
   - TUYỆT ĐỐI không dùng tiếng Anh trong comment
   - Ví dụ đúng:
     // Lưu thông tin học sinh — thêm mới hoặc cập nhật
     // Kiểm tra quyền license trước khi thực thi
     // Tìm dòng theo mã, trả về -1 nếu không tìm thấy

4. FORMAT CHUẨN GOOGLE APPS SCRIPT:
   - Thụt lề 2 spaces nhất quán
   - Nhóm các hàm liên quan dưới header tiếng Việt:
     // ─────────────────────────────────────────
     // HỌC SINH
     // ─────────────────────────────────────────
   - Giữ dấu ngoặc nhọn { } đúng chuẩn

5. GIỮ NGUYÊN 100% — QUAN TRỌNG NHẤT:
   - KHÔNG thay đổi bất kỳ logic, điều kiện, toán tử, giá trị trả về
   - KHÔNG đổi tên tham số của hàm public (loginUser, saveHocSinh...)
   - KHÔNG thay đổi thứ tự các hàm
   - KHÔNG rút gọn hoặc gộp các khối if/else nhiều dòng thành 1 dòng
   - KHÔNG thêm hoặc xóa bất kỳ logic nào không có trong code gốc
   - KHÔNG dịch hoặc sửa bất kỳ chuỗi tiếng Việt nào trong code
   - KHÔNG sửa nội dung bên trong các chuỗi HTML dài
   - Chỉ trả về code JavaScript hoàn chỉnh, không có giải thích bên ngoài

Code cần xử lý:
\`\`\`javascript
${code}
\`\`\`
`;

export interface AiRenameOptions {
  apiKey: string;
  code: string;
  provider?: 'gemini' | 'openai' | 'claude'| 'groq';
  onProgress?: (message: string) => void;
}

export interface AiRenameResult {
  success: boolean;
  code?: string;
  error?: string;
}

export async function aiRenameVariables(
  options: AiRenameOptions,
): Promise<AiRenameResult> {
  const { apiKey, code, onProgress, provider = 'gemini' } = options;

  if (!code.trim()) {
    return { success: false, error: 'Không có code để xử lý!' };
  }

  const estimatedTokens = Math.ceil(code.length / 4);
  onProgress?.(`Đang phân tích... (~${estimatedTokens} tokens)`);

  try {
    let resultText = '';

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT_TEMPLATE(code) }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
        }),
      });
      if (!response.ok) return await handleHttpError(response);
      const data = await response.json();
      resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: PROMPT_TEMPLATE(code) }],
          temperature: 0.1,
          max_tokens: 16384,
        }),
      });
      if (!response.ok) return await handleHttpError(response);
      const data = await response.json();
      resultText = data?.choices?.[0]?.message?.content ?? '';
    }
     else if (provider === 'groq') {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: PROMPT_TEMPLATE(code) }],
      temperature: 0.1,
      max_tokens: 32768,
    }),
  });
  if (!response.ok) return await handleHttpError(response);
  const data = await response.json();
  resultText = data?.choices?.[0]?.message?.content ?? '';
}
    else if (provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 16384,
          messages: [{ role: 'user', content: PROMPT_TEMPLATE(code) }],
        }),
      });
      if (!response.ok) return await handleHttpError(response);
      const data = await response.json();
      resultText = data?.content?.[0]?.text ?? '';
    }

    if (!resultText) {
      return { success: false, error: 'AI không trả về kết quả. Thử lại sau!' };
    }

    onProgress?.('✅ Hoàn thành!');
    return { success: true, code: extractCode(resultText) };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `🌐 Lỗi kết nối: ${message}` };
  }
}

// Xử lý lỗi HTTP chung cho cả 3 provider
async function handleHttpError(response: Response): Promise<AiRenameResult> {
  const status = response.status;
  if (status === 429) return { success: false, error: '⏳ Vượt quota! Chờ 1 phút rồi thử lại.' };
  if (status === 400) return { success: false, error: '❌ Request không hợp lệ (400)!' };
  if (status === 401) return { success: false, error: '❌ API Key không hợp lệ hoặc hết hạn (401)!' };
  if (status === 403) return { success: false, error: '🚫 Không có quyền truy cập API (403)!' };
  const body = await response.json().catch(() => ({}));
  const msg = (body as { error?: { message?: string } })?.error?.message ?? response.statusText;
  return { success: false, error: `Lỗi API (${status}): ${msg}` };
}

// Tách code ra khỏi ```javascript ... ``` nếu AI trả về markdown
function extractCode(text: string): string {
  const match = text.match(/```(?:javascript|js)?\n?([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

// Lưu key vào localStorage
export function saveApiKey(provider: string, key: string) {
  localStorage.setItem(`ai_key_${provider}`, key);
}

// Lấy key từ localStorage
export function getApiKey(provider: string): string {
  return localStorage.getItem(`ai_key_${provider}`) ?? '';
}

// Xóa key khỏi localStorage
export function deleteApiKey(provider: string) {
  localStorage.removeItem(`ai_key_${provider}`);
}

// Kiểm tra đã có key chưa
export function hasApiKey(provider: string): boolean {
  return !!localStorage.getItem(`ai_key_${provider}`);
}
