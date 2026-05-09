import { createSignal, Show } from 'solid-js';
import { saveApiKey, getApiKey, deleteApiKey, hasApiKey } from '../hooks/useAiRename';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm?: (config: { provider: string; apiKey: string }) => void;
}

export default function AiRenameModal(props: Props) {
  const [provider, setProvider] = createSignal<'claude' | 'openai' | 'gemini'>('claude');
  const [apiKey, setApiKey] = createSignal('');
  const [showKey, setShowKey] = createSignal(false);
  const [saveKey, setSaveKey] = createSignal(true);
  const savedKey = getApiKey(provider());
  if (savedKey) setApiKey(savedKey);

  return (
    <Show when={props.open}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm"
        onClick={props.onClose}
      >
        {/* Modal box */}
        <div
          class="bg-[#2a2a2e] border border-[#444] rounded-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Header */}
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-base-content flex items-center gap-2">
              🤖 AI Rename Setup
            </h2>
            <button
              class="btn btn-ghost btn-sm btn-circle"
              onClick={props.onClose}
            >
              ✕
            </button>
          </div>

          {/* Provider selection */}
          <div class="flex flex-col gap-2">
            <label class="text-sm font-semibold text-base-content/70">
              Chọn AI Provider:
            </label>
            <div class="flex flex-col gap-2">
              {(
                [
                  { value: 'claude', label: '🟣 Claude (Anthropic)', desc: 'claude-3-5-haiku' },
                  { value: 'openai', label: '🟢 GPT (OpenAI)', desc: 'gpt-4o-mini' },
                  { value: 'gemini', label: '🔵 Gemini (Google)', desc: 'gemini-1.5-flash' },
                ] as const
              ).map((item) => (
                <label class={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  provider() === item.value
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:border-base-content/30'
                }`}>
                  <input
                    type="radio"
                    class="radio radio-primary radio-sm"
                    name="provider"
                    value={item.value}
                    checked={provider() === item.value}
                    onChange={() => setProvider(item.value)}
                  />
                  <span class="text-sm font-medium text-base-content">{item.label}</span>
                  <span class="text-xs text-base-content/40 ml-auto">{item.desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* API Key input */}
          <div class="flex flex-col gap-2">
            <label class="text-sm font-semibold text-base-content/70">
              API Key:
            </label>
            <div class="flex gap-2">
              <input
                type={showKey() ? 'text' : 'password'}
                class="input input-bordered flex-1 font-mono text-sm"
                placeholder={
                  provider() === 'claude'
                    ? 'sk-ant-...'
                    : provider() === 'openai'
                    ? 'sk-...'
                    : 'AIza...'
                }
                value={apiKey()}
                onInput={(e) => setApiKey(e.currentTarget.value)}
              />
              <button
                class="btn btn-ghost btn-square"
                title={showKey() ? 'Ẩn key' : 'Hiện key'}
                onClick={() => setShowKey(!showKey())}
              >
                {showKey() ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Save key checkbox */}
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              class="checkbox checkbox-sm checkbox-primary"
              checked={saveKey()}
              onChange={(e) => setSaveKey(e.currentTarget.checked)}
            />
            <span class="text-sm text-base-content/70">
              Lưu key trên máy này (localStorage)
            </span>
          </label>

          {/* Info */}
          <div class="bg-base-300 rounded-lg p-3 text-xs text-base-content/50 leading-relaxed">
            🔒 Key chỉ lưu trên trình duyệt của bạn, không gửi lên server.
            Bạn có thể xóa bất cứ lúc nào trong Settings.
          </div>

          {/* Buttons */}
          <div class="flex gap-3 justify-end">
            <button
              class="btn btn-ghost"
              onClick={props.onClose}
            >
              Hủy
            </button>
            <button
  class="btn btn-primary"
  disabled={apiKey().trim().length === 0}
  onClick={() => {
    if (saveKey()) {
      saveApiKey(provider(), apiKey());
    }
    props.onConfirm?.({
      provider: provider(),
      apiKey: apiKey(),
    });
    props.onClose();
  }}
>
  ✨ Xác nhận
</button>
          </div>

        </div>
      </div>
    </Show>
  );
}
