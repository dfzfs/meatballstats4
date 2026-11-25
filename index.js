// Meatball — entry point. Kept tiny on purpose: with the master switch off, this file and the settings row are
// all that runs. The engine (src/st/runtime.js) and the phone (src/ui/phone.js) are imported only when needed.
import { ctx, cfg, saveCfg, toast } from './src/st/host.js';
import { paint } from './src/st/look.js';

let runtime = null, phone = null;
const loadRuntime = async () => (runtime ??= await import('./src/st/runtime.js'));
const loadPhone = async () => (phone ??= await import('./src/ui/phone.js'));

async function power(on) {
    cfg().on = !!on; saveCfg();
    if (on) await (await loadRuntime()).boot();
    else { runtime?.shutdown(); phone?.close(); }
    document.getElementById('mb4-launch')?.classList.toggle('mb4-off', !on);
}
async function openPhone(view = '') {
    if (!cfg().on) { toast('미트볼이 꺼져 있어요. 확장 설정에서 켜 주세요.'); return; }
    (await loadPhone()).open(await loadRuntime(), typeof view === 'string' ? view : '');
}
// The status strip and the labels under replies ask for the phone this way.
document.addEventListener('mb4:open', (e) => openPhone(e.detail?.view ?? ''));

function mountSettings() {
    const box = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!box || document.getElementById('mb4-settings')) return;
    box.insertAdjacentHTML('beforeend', `<div id="mb4-settings" class="extension_settings"><div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header"><b>😼 미트볼</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" id="mb4-on"><span>미트볼 켜기</span></label>
            <div class="menu_button menu_button_icon" id="mb4-open-set"><span>😼 미트볼 열기</span></div>
            <small>앱 고르기와 나머지 설정은 미트볼 안에 있어요. 끄면 AI에 아무것도 보내지 않아요.</small>
        </div></div></div>`);
    const box2 = document.getElementById('mb4-on');
    box2.checked = cfg().on;
    box2.addEventListener('change', () => power(box2.checked));
    document.getElementById('mb4-open-set').addEventListener('click', () => openPhone());
}
function mountLauncher() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('mb4-launch')) return;
    menu.insertAdjacentHTML('beforeend', '<div id="mb4-launch" class="list-group-item flex-container flexGap5 interactable" tabindex="0"><span>😼</span><span>미트볼</span></div>');
    const el = document.getElementById('mb4-launch');
    el.classList.toggle('mb4-off', !cfg().on);
    el.addEventListener('click', () => openPhone());
}

(async function init() {
    try {
        const { eventSource, event_types: E } = ctx();
        let done = false;
        const ready = async () => {
            if (done) return;
            done = true;
            mountSettings(); mountLauncher(); paint();
            if (!cfg().on) return;
            await (await loadRuntime()).boot();
            if (!cfg().asked) toast('🪄 메뉴의 「😼 미트볼」을 눌러 쓸 기능을 골라 주세요.');
        };
        eventSource.on(E.APP_READY, ready);
    } catch (e) { console.error('[meatball] could not start', e); }
})();
