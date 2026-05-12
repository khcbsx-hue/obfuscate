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
   XÓA TOÀN BỘ các dòng comment (//, /* ... */, /** ... */) nếu có trong code gốc.

   TUYỆT ĐỐI KHÔNG tự sinh thêm bất kỳ comment JSDoc, comment inline hay header giải thích nào vào code đầu ra.

   Chỉ giữ lại mã nguồn thuần túy để tối ưu hóa độ dài của code.

4. FORMAT CHUẨN GOOGLE APPS SCRIPT:
   - Thụt lề 2 spaces nhất quán
   - Nhóm các hàm liên quan dưới header tiếng Việt:
     // HỌC SINH
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
6. GỠ BỎ LICENSE CHECK HOÀN TOÀN (nếu có):

   XÓA HOÀN TOÀN các hàm sau (nếu tồn tại):
   - giaiMaChuoi / taoMaBam / kiemTraMaBanQuyen
   - kiemTraTrangThaiLicense / kichHoatLicenseKey
   - trangKichHoat / layUrlUngDung / _activateKey / _getUrl
   - Và bất kỳ hàm nào chỉ phục vụ mục đích kiểm tra license

   XÓA các biến hằng số liên quan:
   - CHUOI_BAN_QUYEN_GOC, MANG_KY_TU_GIAI_MA_EMAIL
   - MANG_KY_TU_GIAI_MA_BAN_QUYEN, MA_XAC_THUC_NOI_BO
   - Và bất kỳ mảng số nào dùng để giải mã license

   TRONG MỖI HÀM còn lại, xóa các khối kiểm tra license dạng:
   - var trangThaiLicense = kiemTraTrangThaiLicense();
   - if (!trangThaiLicense || !kiemTraMaBanQuyen(...) || ...) { return; }
   - Bất kỳ dòng nào gọi kiemTraTrangThaiLicense() hoặc kiemTraMaBanQuyen()

   SỬA hàm doGet() thành dạng thẳng vào app, KHÔNG qua license:
   function doGet(e) {
     var spreadsheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
     var template = HtmlService.createTemplateFromFile("Index");
     template.sheetUrl = spreadsheetUrl;
     return template.evaluate()
       .setTitle("...")
       .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
       .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
   }

   GIỮ NGUYÊN toàn bộ logic nghiệp vụ còn lại sau khi xóa license check.
   Nếu không tìm thấy bất kỳ license check nào thì bỏ qua bước này.
   
Code cần xử lý:
\`\`\`javascript
${code}
\`\`\`
`;

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

  let lastError = '';
  
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = apiKeys.length > 1 ? ` (key ${i + 1}/${apiKeys.length})` : '';

    const estimatedTokens = Math.ceil(code.length / 4);
    onProgress?.(`Đang phân tích...${keyLabel} (~${estimatedTokens} tokens)`);

    try {
      let isFinished = false;
      let fullResultText = '';
      let loopCount = 0;
      const MAX_LOOPS = 5; // Tránh treo hệ thống nếu AI bị kẹt
      
      let currentPromptContent = PROMPT_TEMPLATE(code);
      let skipToNextKey = false;
      let stopProcess = false;
      let errorResult: AiRenameResult | null = null;

      while (!isFinished && loopCount < MAX_LOOPS) {
        loopCount++;
        let currentChunk = '';
        let finishReason = '';

        if (provider === 'gemini') {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: currentPromptContent }] }],
              // Đặt giới hạn tối đa mà model hỗ trợ
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }, 
            }),
          });
          
          if (!response.ok) {
            const err = await handleHttpError(response);
            lastError = err.error ?? '';
            if (response.status === 429) { onProgress?.(`⏳ Key ${i + 1} bị limit, thử key tiếp...`); skipToNextKey = true; break; }
            errorResult = err; stopProcess = true; break;
          }
          const data = await response.json();
          currentChunk = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          finishReason = data?.candidates?.[0]?.finishReason;
        }

        else if (provider === 'openai') {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: currentPromptContent }],
              temperature: 0.1,
              max_tokens: 16384,
            }),
          });
          if (!response.ok) {
            const err = await handleHttpError(response);
            lastError = err.error ?? '';
            if (response.status === 429) { onProgress?.(`⏳ Key ${i + 1} bị limit, thử key tiếp...`); skipToNextKey = true; break; }
            errorResult = err; stopProcess = true; break;
          }
          const data = await response.json();
          currentChunk = data?.choices?.[0]?.message?.content ?? '';
          finishReason = data?.choices?.[0]?.finish_reason;
        }

        else if (provider === 'groq') {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: currentPromptContent }],
              temperature: 0.1,
              max_tokens: 32768, // Groq có thể cấu hình cao hơn
            }),
          });
          if (!response.ok) {
            const err = await handleHttpError(response);
            lastError = err.error ?? '';
            if (response.status === 429) { onProgress?.(`⏳ Key ${i + 1} bị limit, thử key tiếp...`); skipToNextKey = true; break; }
            errorResult = err; stopProcess = true; break;
          }
          const data = await response.json();
          currentChunk = data?.choices?.[0]?.message?.content ?? '';
          finishReason = data?.choices?.[0]?.finish_reason;
        }

        else if (provider === 'claude') {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 8192,
              messages: [{ role: 'user', content: currentPromptContent }],
            }),
          });
          if (!response.ok) {
            const err = await handleHttpError(response);
            lastError = err.error ?? '';
            if (response.status === 429) { onProgress?.(`⏳ Key ${i + 1} bị limit, thử key tiếp...`); skipToNextKey = true; break; }
            errorResult = err; stopProcess = true; break;
          }
          const data = await response.json();
          currentChunk = data?.content?.[0]?.text ?? '';
          finishReason = data?.stop_reason;
        }

        if (!currentChunk) {
          lastError = 'AI không trả về kết quả ở vòng lặp ' + loopCount;
          skipToNextKey = true;
          break;
        }

        // Nối đoạn code vừa sinh ra vào chuỗi kết quả tổng
        fullResultText += currentChunk;

        // Kiểm tra xem AI có bị cắt ngang do hết token không
        const isTokenLimit = 
          finishReason === 'MAX_TOKENS' || 
          finishReason === 'length' || 
          finishReason === 'max_tokens';

        if (isTokenLimit) {
          onProgress?.(`Code dài, đang xử lý tiếp phần ${loopCount + 1}...`);
          
          // Lấy 800 ký tự cuối cùng để làm context cho AI viết tiếp
          const lastPart = fullResultText.slice(-800);
          currentPromptContent = `Bạn đang làm nhiệm vụ định dạng và đổi tên biến cho đoạn code Google Apps Script. 
Tuy nhiên, đoạn code bạn đang xuất ra bị ngắt quãng giữa chừng do giới hạn bộ nhớ API. 
Đây là đoạn cuối cùng bạn vừa viết ra:

...
${lastPart}
...

Nhiệm vụ của bạn: Hãy VIẾT TIẾP phần mã còn lại từ đúng điểm ngắt này. 
- TUYỆT ĐỐI KHÔNG viết lại những gì đã xuất hiện ở trên.
- TUYỆT ĐỐI KHÔNG dùng dấu markdown (\`\`\`javascript) ở đầu câu để tránh lỗi khi nối chuỗi.
- Chỉ xuất đoạn mã nguồn tiếp nối.`;

        } else {
          // Hoàn thành hoàn toàn
          isFinished = true;
        }
      } // Kết thúc vòng lặp while

      // Xử lý luồng sau khi thoát while
      if (skipToNextKey) continue; // Chuyển sang key API tiếp theo
      if (stopProcess && errorResult) return errorResult; // Báo lỗi ngay lập tức

      onProgress?.('✅ Hoàn thành!');
      return { success: true, code: extractCode(fullResultText) };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      lastError = `🌐 Lỗi kết nối: ${message}`;
      continue;
    }
  }

  return { success: false, error: lastError || 'Tất cả key đều thất bại!' };
}

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

function extractCode(text: string): string {
  // 1. Nếu AI trả về nguyên một khối có bọc markdown
  // Tìm khối markdown đầu tiên và cuối cùng để trích xuất (loại bỏ text luyên thuyên ngoài rìa)
  const codeBlockMatch = text.match(/```(?:javascript|js)?\n?([\s\S]*?)```$/);
  let cleanedText = codeBlockMatch ? codeBlockMatch[1] : text;

  // 2. Vì nối chuỗi từ nhiều vòng lặp, có thể có các thẻ markdown lọt vào giữa code.
  // Quét và xóa toàn bộ các thẻ markdown còn sót lại trong ruột.
  cleanedText = cleanedText.replace(/```(javascript|js)?\n?/g, '');
  cleanedText = cleanedText.replace(/```/g, '');
  
  return cleanedText.trim();
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
