import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

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

3. KHÔNG SỬ DỤNG COMMENT (CODE RÚT GỌN):
   - XÓA TOÀN BỘ các dòng comment (//, /* */, /** */) nếu có trong code gốc
   - TUYỆT ĐỐI KHÔNG tự sinh thêm bất kỳ comment nào vào code đầu ra
   - Chỉ giữ lại mã nguồn thuần túy

4. FORMAT CHUẨN GOOGLE APPS SCRIPT:
   - Thụt lề 2 spaces nhất quán
   - Giữ dấu ngoặc nhọn { } đúng chuẩn

5. GIỮ NGUYÊN 100% — QUAN TRỌNG NHẤT:
   - KHÔNG thay đổi bất kỳ logic, điều kiện, toán tử, giá trị trả về
   - KHÔNG đổi tên tham số của hàm public
   - KHÔNG thay đổi thứ tự các hàm
   - KHÔNG rút gọn hoặc gộp các khối if/else nhiều dòng thành 1 dòng
   - KHÔNG thêm hoặc xóa bất kỳ logic nào không có trong code gốc
   - KHÔNG dịch hoặc sửa bất kỳ chuỗi tiếng Việt nào trong code
   - KHÔNG sửa nội dung bên trong các chuỗi HTML dài
   - Chỉ trả về code JavaScript hoàn chỉnh, không có giải thích bên ngoài

6. GỠ BỎ LICENSE CHECK HOÀN TOÀN (nếu có):
   - XÓA HOÀN TOÀN các hàm: giaiMaChuoi / taoMaBam / kiemTraMaBanQuyen / kiemTraTrangThaiLicense / kichHoatLicenseKey / trangKichHoat / layUrlUngDung / _activateKey / _getUrl
   - XÓA các biến hằng số: CHUOI_BAN_QUYEN_GOC, MANG_KY_TU_GIAI_MA_EMAIL, MANG_KY_TU_GIAI_MA_BAN_QUYEN, MA_XAC_THUC_NOI_BO
   - TRONG MỖI HÀM còn lại, xóa các khối kiểm tra license
   - Nếu không tìm thấy license check nào thì bỏ qua bước này

Code cần xử lý:
\`\`\`javascript
${code}
\`\`\`
`;

// ── Tách code bằng Babel AST — đảm bảo 100% không cắt giữa hàm ───────────────
function splitByAST(code: string, maxCharsPerChunk = 30000): string[] {
  try {
    // Parse code thành AST
    const ast = parser.parse(code, {
      sourceType: 'script',
      allowReturnOutsideFunction: true,
      errorRecovery: true, // không throw khi gặp lỗi nhỏ
      plugins: ['typescript'],
    });

    // Lấy danh sách tất cả top-level statements (hàm, biến, etc.)
    const topLevelNodes = ast.program.body;

    if (topLevelNodes.length === 0) {
      return [code];
    }

    const chunks: string[] = [];
    let currentNodes: string[] = [];
    let currentLength = 0;

    for (const node of topLevelNodes) {
      // Lấy source code của node này từ code gốc
      const start = node.start ?? 0;
      const end = node.end ?? code.length;
      const nodeCode = code.slice(start, end);
      const nodeLength = nodeCode.length;

      // Nếu chunk hiện tại đã đủ lớn → cắt tại đây
      if (currentLength >= maxCharsPerChunk && currentNodes.length > 0) {
        chunks.push(currentNodes.join('\n'));
        currentNodes = [];
        currentLength = 0;
      }

      currentNodes.push(nodeCode);
      currentLength += nodeLength + 1;
    }

    // Phần còn lại
    if (currentNodes.length > 0) {
      chunks.push(currentNodes.join('\n'));
    }

    return chunks;

  } catch (err) {
    // Nếu parse lỗi → fallback về cắt theo braceDepth
    console.warn('⚠️ Babel parse thất bại, dùng fallback braceDepth:', err);
    return splitByBraceDepth(code, maxCharsPerChunk);
  }
}

// ── Fallback: tách theo braceDepth nếu Babel parse lỗi ───────────────────────
function splitByBraceDepth(code: string, maxCharsPerChunk = 30000): string[] {
  const lines = code.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let braceDepth = 0;
  let inString = false;
  let stringChar = '';

  for (const line of lines) {
    // Đếm { } nhưng bỏ qua trong string
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        if (ch === stringChar && line[i - 1] !== '\\') inString = false;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; }
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
    }

    current.push(line);
    currentLength += line.length + 1;

    if (currentLength >= maxCharsPerChunk && braceDepth === 0) {
      chunks.push(current.join('\n'));
      current = [];
      currentLength = 0;
    }
  }

  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
}

// ── Gọi API theo từng provider ────────────────────────────────────────────────
async function callApi(
  provider: string,
  apiKey: string,
  code: string,
  retries = 3,
): Promise<{ success: boolean; text?: string; status?: number; finishReason?: string }> {

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT_TEMPLATE(code) }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
        }),
      });
      if (response.status === 503) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        return { success: false, status: 503 };
      }
      if (!response.ok) return { success: false, status: response.status };
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const finishReason = data?.candidates?.[0]?.finishReason ?? 'STOP';
      return { success: true, text, finishReason };
    }
    return { success: false, status: 503 };
  }

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: PROMPT_TEMPLATE(code) }],
        temperature: 0.1,
        max_tokens: 16384,
      }),
    });
    if (!response.ok) return { success: false, status: response.status };
    const data = await response.json();
    return { success: true, text: data?.choices?.[0]?.message?.content ?? '', finishReason: data?.choices?.[0]?.finish_reason ?? 'stop' };
  }

  if (provider === 'groq') {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: PROMPT_TEMPLATE(code) }],
        temperature: 0.1,
        max_tokens: 32768,
      }),
    });
    if (!response.ok) return { success: false, status: response.status };
    const data = await response.json();
    return { success: true, text: data?.choices?.[0]?.message?.content ?? '', finishReason: data?.choices?.[0]?.finish_reason ?? 'stop' };
  }

  if (provider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 16384,
        messages: [{ role: 'user', content: PROMPT_TEMPLATE(code) }],
      }),
    });
    if (!response.ok) return { success: false, status: response.status };
    const data = await response.json();
    return { success: true, text: data?.content?.[0]?.text ?? '', finishReason: data?.stop_reason ?? 'end_turn' };
  }

  return { success: false, status: 400 };
}

export interface AiRenameOptions {
  apiKey: string;
  code: string;
  provider?: 'gemini' | 'openai' | 'claude' | 'groq';
  apiKeys?: string[];
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
  const { code, onProgress, provider = 'gemini' } = options;
  const apiKeys = options.apiKeys?.length
    ? options.apiKeys
    : options.apiKey
    ? options.apiKey.split(',').map(k => k.trim()).filter(Boolean)
    : [];

  if (apiKeys.length === 0) {
    return { success: false, error: 'Chưa nhập API Key!' };
  }
  if (!code.trim()) {
    return { success: false, error: 'Không có code để xử lý!' };
  }

  // Tách code bằng Babel AST
  const MAX_CHARS = 30000;
  const chunks = splitByAST(code, MAX_CHARS);
  const totalChunks = chunks.length;
  const resultChunks: string[] = [];

  // Log debug
  console.log('=== CHUNK DEBUG (Babel AST) ===');
  console.log(`Tổng ký tự: ${code.length} | ~${Math.ceil(code.length / 4)} tokens`);
  console.log(`Số chunk: ${totalChunks}`);
  chunks.forEach((c, i) =>
    console.log(`  Chunk ${i + 1}: ${c.length} ký tự | ~${Math.ceil(c.length / 4)} tokens`)
  );
  console.log('==============================');

  onProgress?.(
    totalChunks > 1
      ? `📦 Chia thành ${totalChunks} phần (~${Math.ceil(MAX_CHARS / 4).toLocaleString()} tokens/phần)...`
      : `🔍 Đang phân tích... (~${Math.ceil(code.length / 4).toLocaleString()} tokens)`,
  );

  let keyIndex = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const chunkLabel = totalChunks > 1 ? ` [${chunkIndex + 1}/${totalChunks}]` : '';

    onProgress?.(`⚙️ Đang xử lý${chunkLabel} (~${Math.ceil(chunk.length / 4).toLocaleString()} tokens)...`);

    let chunkDone = false;
    let attempts = 0;
    const maxAttempts = apiKeys.length * 2;

    while (!chunkDone && attempts < maxAttempts) {
      const apiKey = apiKeys[keyIndex % apiKeys.length];
      const keyLabel = apiKeys.length > 1 ? ` (key ${(keyIndex % apiKeys.length) + 1}/${apiKeys.length})` : '';

      try {
        const result = await callApi(provider, apiKey, chunk);

        if (!result.success) {
          if (result.status === 429) {
            onProgress?.(`⏳${keyLabel} Bị rate limit, thử key tiếp...`);
            keyIndex++;
            attempts++;
            continue;
          }
          if (result.status === 503) {
            onProgress?.(`⏳${keyLabel} Server quá tải (503), thử key tiếp...`);
            keyIndex++;
            attempts++;
            continue;
          }
          if (result.status === 401) return { success: false, error: '❌ API Key không hợp lệ (401)!' };
          if (result.status === 403) return { success: false, error: '🚫 Không có quyền (403)!' };
          return { success: false, error: `❌ Lỗi API (${result.status})` };
        }

        if (!result.text) {
          attempts++;
          keyIndex++;
          continue;
        }

        if (result.finishReason === 'MAX_TOKENS') {
          onProgress?.(`⚠️ Chunk ${chunkIndex + 1} vẫn bị cắt! Đang thử key khác...`);
          keyIndex++;
          attempts++;
          continue;
        }

        resultChunks.push(extractCode(result.text));
        chunkDone = true;
        keyIndex++;

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        onProgress?.(`🌐 Lỗi kết nối${keyLabel}: ${message}, thử lại...`);
        keyIndex++;
        attempts++;
      }
    }

    if (!chunkDone) {
      return { success: false, error: `❌ Chunk ${chunkIndex + 1}/${totalChunks} thất bại sau ${maxAttempts} lần thử!` };
    }

    if (chunkIndex < totalChunks - 1) {
      onProgress?.(`✅ Xong phần ${chunkIndex + 1}/${totalChunks}, tiếp tục...`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  onProgress?.('✅ Hoàn thành!');
  return { success: true, code: resultChunks.join('\n\n') };
}

function extractCode(text: string): string {
  const match = text.match(/```(?:javascript|js)?\n?([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export function saveApiKey(provider: string, key: string) {
  localStorage.setItem(`ai_key_${provider}`, key);
}
export function getApiKey(provider: string): string {
  return localStorage.getItem(`ai_key_${provider}`) ?? '';
}
export function deleteApiKey(provider: string) {
  localStorage.removeItem(`ai_key_${provider}`);
}
export function hasApiKey(provider: string): boolean {
  return !!localStorage.getItem(`ai_key_${provider}`);
}
