const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  const { apiKey, code, onProgress } = options;

  if (!code.trim()) {
    return { success: false, error: 'Không có code để xử lý!' };
  }

  // Ước tính token — ~4 chars = 1 token
  const estimatedTokens = Math.ceil(code.length / 4);
  onProgress?.(`Đang phân tích... (~${estimatedTokens} tokens)`);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT_TEMPLATE(code) }],
          },
        ],
        generationConfig: {
          temperature: 0.1,      // Thấp để kết quả ổn định
          maxOutputTokens: 65536, // Tối đa output
        },
      }),
    });

    // Xử lý lỗi HTTP
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 429) {
        return {
          success: false,
          error: '⏳ Đã đạt giới hạn quota! Vui lòng chờ 1 phút rồi thử lại.',
        };
      }
      if (response.status === 400) {
        return {
          success: false,
          error: '❌ API Key không hợp lệ! Vui lòng kiểm tra lại key.',
        };
      }
      if (response.status === 403) {
        return {
          success: false,
          error: '🔒 API Key không có quyền truy cập! Kiểm tra lại key.',
        };
      }

      return {
        success: false,
        error: `Lỗi API: ${response.status} — ${errorData?.error?.message ?? 'Unknown error'}`,
      };
    }

    const data = await response.json();

    // Lấy text từ response
    const resultText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!resultText) {
      return {
        success: false,
        error: 'AI không trả về kết quả. Thử lại sau!',
      };
    }

    // Tách code ra khỏi markdown code block nếu có
    const cleanCode = extractCode(resultText);

    onProgress?.('✅ Hoàn thành!');
    return { success: true, code: cleanCode };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    
    if (message.includes('fetch')) {
      return {
        success: false,
        error: '🌐 Lỗi kết nối mạng! Kiểm tra internet và thử lại.',
      };
    }
    
    return { success: false, error: `Lỗi: ${message}` };
  }
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
