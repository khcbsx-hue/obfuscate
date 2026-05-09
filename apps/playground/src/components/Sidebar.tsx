import { createEffect, createSignal, Show } from 'solid-js';
import { config } from '../App';
import { useDeobfuscateContext } from '../context/DeobfuscateContext';
import FileTree from './FileTree';
import AiRenameModal from './AiRenameModal';
import { aiRenameVariables } from '../hooks/useAiRename';

interface Props {
  paths: string[];
  onFileClick?: (path: string) => void;
  getCurrentCode?: () => string;
  onAiResult?: (code: string) => void;
}

type MangleMode = 'off' | 'all' | 'hex' | 'short' | 'custom';

export default function Sidebar(props: Props) {
  const { deobfuscate, cancel, isRunning } = useDeobfuscateContext();

  const [mangleMode, setMangleMode] = createSignal<MangleMode>('off');
  const [mangleString, setMangleString] = createSignal('_0x');
  const [mangleFlags, setMangleFlags] = createSignal('');
  const [showAiModal, setShowAiModal] = createSignal(false);
  const [aiLoading, setAiLoading] = createSignal(false);
  const [aiProgress, setAiProgress] = createSignal('');

  createEffect(() => {
    const mode = mangleMode();
    if (mode === 'off') config.mangleRegex = undefined;
    else if (mode === 'all') config.mangleRegex = /.+/;
    else if (mode === 'hex') config.mangleRegex = /^_0x/;
    else if (mode === 'short') config.mangleRegex = /^.{1,2}$/;
    else if (mode === 'custom') {
      try {
        config.mangleRegex = new RegExp(mangleString(), mangleFlags());
      } catch {
        config.mangleRegex = undefined;
      }
    }
  });

  return (
    <nav class="flex flex-col gap-3 p-3 h-full overflow-y-auto text-sm">
      {/* Start / Cancel + AI Rename */}
      <div class="flex flex-col items-center gap-2 py-4 px-2">
        {/* Start / Cancel button */}
        <Show
          when={isRunning()}
          fallback={
            <button
              class="btn btn-primary w-full"
              title="Start deobfuscation"
              onClick={deobfuscate}
            >
              <svg width="20" height="20" viewBox="0 0 24 24"
                stroke-width="1.5" stroke="currentColor"
                fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M7 4v16l13 -8z" />
              </svg>
              <span class="hidden sm:inline">Start</span>
            </button>
          }
        >
          <button class="btn btn-error w-full" title="Cancel" onClick={cancel}>
            <span class="loading loading-spinner loading-sm"></span>
            <span class="hidden sm:inline">Cancel</span>
          </button>
        </Show>

        {/* AI Rename button */}
        <button
          class="btn btn-secondary w-full"
          title="AI Rename Variables"
          disabled={aiLoading()}
          onClick={() => setShowAiModal(true)}
        >
          <Show
            when={aiLoading()}
            fallback={
              <>
                <svg width="20" height="20" viewBox="0 0 24 24"
                  stroke-width="1.5" stroke="currentColor"
                  fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M4 20l3 -3" />
                  <path d="M4.5 12.5l8 -8l.5 .5" />
                  <path d="M5 13l6.5 -6.5l5.5 5.5l-6.5 6.5z" />
                  <path d="M12 6l2.5 2.5" />
                  <path d="M20 21l-2 -2" />
                  <path d="M16 16l4 4" />
                </svg>
                <span class="hidden sm:inline">AI Rename</span>
              </>
            }
          >
            <span class="loading loading-spinner loading-sm"></span>
            <span class="hidden sm:inline text-xs">{aiProgress() || 'Đang xử lý...'}</span>
          </Show>
        </button>
      </div>

      {/* Deobfuscation options */}
      <div class="flex flex-col gap-1">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-sm"
            checked={config.deobfuscate}
            onChange={e => (config.deobfuscate = e.currentTarget.checked)} />
          <a href="/docs/guide/deobfuscation.html" target="_blank"
            class="hover:underline">Deobfuscate</a>
        </label>

        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-sm"
            checked={config.unminify}
            onChange={e => (config.unminify = e.currentTarget.checked)} />
          <a href="/docs/guide/unminify.html" target="_blank"
            class="hover:underline">Unminify</a>
        </label>

        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-sm"
            checked={config.unpackBundles}
            onChange={e => (config.unpackBundles = e.currentTarget.checked)} />
          <a href="/docs/guide/unpack-bundles.html" target="_blank"
            class="hover:underline">Unpack Bundle</a>
        </label>

        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-sm"
            checked={config.jsx}
            onChange={e => (config.jsx = e.currentTarget.checked)} />
          <a href="/docs/guide/jsx.html" target="_blank"
            class="hover:underline">Decompile JSX</a>
        </label>
      </div>

      {/* Mangle mode */}
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold opacity-60 uppercase tracking-wide">Mangle</label>
        <select class="select select-sm select-bordered w-full"
          value={mangleMode()}
          onChange={e => setMangleMode(e.currentTarget.value as MangleMode)}>
          <option value="off">Off</option>
          <option value="all">All</option>
          <option value="hex">Hex (_0x…)</option>
          <option value="short">Short (≤2 chars)</option>
          <option value="custom">Custom regex</option>
        </select>

        <Show when={mangleMode() === 'custom'}>
          <div class="flex gap-1 mt-1">
            <input type="text" placeholder="Pattern" class="input input-sm input-bordered flex-1"
              value={mangleString()}
              onInput={e => setMangleString(e.currentTarget.value)} />
            <input type="text" placeholder="Flags" class="input input-sm input-bordered w-16"
              value={mangleFlags()}
              onInput={e => setMangleFlags(e.currentTarget.value)} />
          </div>
        </Show>
      </div>

      {/* File tree */}
      <div class="flex-1 overflow-y-auto">
        <FileTree paths={props.paths} onFileClick={props.onFileClick} />
      </div>

      {/* AI Rename Modal */}
      <AiRenameModal
        open={showAiModal()}
        onClose={() => setShowAiModal(false)}
        onConfirm={async ({ provider, apiKey }) => {
          const code = props.getCurrentCode?.();
          if (!code) {
            alert('Không có code để xử lý.');
            return;
          }
          setShowAiModal(false);
          setAiLoading(true);
          setAiProgress('Đang gửi tới Gemini...');
          const result = await aiRenameVariables({
            apiKey,
            code,
            onProgress: setAiProgress,
          });
          setAiLoading(false);
          setAiProgress('');
          if (result.success && result.code) {
            props.onAiResult?.(result.code);
          } else {
            alert(result.error ?? 'Lỗi không xác định từ AI.');
          }
        }}
      />
    </nav>
  );
}
