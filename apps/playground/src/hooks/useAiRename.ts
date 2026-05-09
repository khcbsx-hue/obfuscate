const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const PROMPT_TEMPLATE = (code: string) => `
You are a JavaScript/Google Apps Script reverse engineering expert.
Analyze this obfuscated code using 4 layers and rename ALL obfuscated variables/functions:

LAYER 1 - STRING ANALYSIS:
- Extract all string literals in the code
- Infer the purpose of each function from strings like error messages, labels, keys

LAYER 2 - API CALLS:
- Identify Google Apps Script APIs: SpreadsheetApp, PropertiesService, LockService, Session, HtmlService, MailApp...
- Identify DOM/Node APIs
- sheet.deleteRow() → delete operation
- sheet.appendRow() → insert operation  
- sheet.getRange().setValues() → update operation

LAYER 3 - INPUT/OUTPUT PATTERN:
- Analyze function parameters and return values
- (username, password) + return {success, user} → loginUser
- (prefix, sheet) + return string ID → generateId
- No params + return multi-sheet data → getAllData

LAYER 4 - STRUCTURAL PATTERN:
- Find repeated patterns (license check, error handling...)
- Each function doing the same pattern but different "action" → name by the action

RULES:
- ONLY rename obfuscated identifiers in the pattern _0x..., _abc, _xyz, single/double letter names (except loop counters i, j, k)
- DO NOT rename any function or variable that already has a meaningful name — examples: saveNguoiDung stays saveNguoiDung, deleteHocSinh stays deleteHocSinh, loginUser stays loginUser, getCurrentUser stays getCurrentUser
- DO NOT rename parameters that are already meaningful — examples: sessionToken, userData, classData stay as-is
- Preserve 100% of the original logic, do NOT simplify or remove anything
- DO NOT reorder functions or statements — preserve the exact original sequence
- DO NOT translate any Vietnamese text, strings, variable names, or comments — keep all Vietnamese as-is
- DO NOT modify content inside long HTML strings or template literals
- Add a brief 1-line comment above each function explaining its purpose
- Return ONLY the renamed JavaScript code, no explanation text outside the code

Code to analyze:
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
