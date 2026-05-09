const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const PROMPT_TEMPLATE = (code: string) => `
You are a JavaScript/Google Apps Script reverse engineering expert.
Your job is to fully clean, rename and reformat obfuscated code into production-ready readable code.

STEP 1 - RENAME obfuscated identifiers:
- ONLY rename identifiers matching pattern _0x..., _abc, _xyz, single/double meaningless letters (except loop counters i, j, k)
- DO NOT rename functions or variables that already have meaningful names (saveNguoiDung, loginUser, getCurrentUser, _piwjp, _mrdot, _hzpga, _ipwda...)
- Rename internal variables/parameters to meaningful camelCase Vietnamese names
- Examples: _0x3461cb → i, _0x2ba0be → maKyTu, _0x53eeb3 → hash1, _0x31d034 → sheetNguoiDung

STEP 2 - FORMAT clean readable code:
- Use consistent 2-space indentation
- Group related functions under Vietnamese section headers like:
  // ─────────────────────────────────────────
  // TÊN NHÓM CHỨC NĂNG
  // ─────────────────────────────────────────
- ALL comments must be written in Vietnamese — absolutely no English comments

STEP 3 - COMMENTS in Vietnamese:
- Add 1-line Vietnamese comment above each function: // Mô tả chức năng bằng tiếng Việt
- Add inline Vietnamese comments for important logic lines
- Examples:
  // Lưu thông tin học sinh — thêm mới hoặc cập nhật
  // Kiểm tra license hợp lệ
  // Lấy dữ liệu từ cache theo token
  // Không cho phép tự xóa bản thân

STRICT RULES — MUST FOLLOW EXACTLY:
- PRESERVE 100% all logic, conditions, operators, return values — do NOT simplify, merge, or split any statement
- PRESERVE exact function signatures — do NOT change parameter names of public functions (loginUser, saveHocSinh, deleteNguoiDung...)
- PRESERVE exact original function order — do NOT reorder anything
- PRESERVE all Vietnamese string literals exactly as-is
- PRESERVE all numeric values, magic numbers, and constants exactly as-is
- DO NOT modify content inside long HTML strings or template literals
- DO NOT add, remove, or change any logic that does not exist in the original
- DO NOT merge multi-line if/else blocks into single lines
- ALL comments must be in Vietnamese — never write English comments
- Return ONLY the final JavaScript code, no explanation text outside the code

Code to process:
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
