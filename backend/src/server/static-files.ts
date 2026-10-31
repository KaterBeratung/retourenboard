import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
export const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
export { root };
export function createStaticFileTable() {
const files = new Map<string, string[]>([
    ['/bootstrap.js', ['public/bootstrap.js', 'text/javascript']],
    ['/icon-motion.js', ['public/icon-motion.js', 'text/javascript']],
    ['/notices.js', ['public/notices.js', 'text/javascript']],
    ['/i18n.js', ['public/i18n.js', 'text/javascript']],
    ['/i18n-catalog.js', ['public/i18n-catalog.js', 'text/javascript']],
    ['/login.js', ['public/login.js', 'text/javascript']],
    ['/sso-login.js', ['public/sso-login.js', 'text/javascript']],
    ['/admin-sso.js', ['public/admin-sso.js', 'text/javascript']],
    ['/auth-security.js', ['public/auth-security.js', 'text/javascript']],
    ['/ui.js', ['public/ui.js', 'text/javascript']],
    ['/switches.js', ['public/switches.js', 'text/javascript']],
    ['/switches.css', ['public/switches.css', 'text/css']],
    ['/auth-context.js', ['public/auth-context.js', 'text/javascript']],
    ['/login', ['public/login.html', 'text/html']], ['/login/', ['public/login.html', 'text/html']],
    ['/shared/auth-navigation.js', ['shared/auth-navigation.js', 'text/javascript']],
    ['/', ['public/index.html', 'text/html']], ['/index.html', ['public/index.html', 'text/html']],
    ['/admin', ['public/admin.html', 'text/html']], ['/admin/', ['public/admin.html', 'text/html']],
    ['/admin.html', ['public/admin.html', 'text/html']],
    ['/chat', ['public/index.html', 'text/html']], ['/chat/', ['public/index.html', 'text/html']],
    ['/chat.js', ['public/chat.js', 'text/javascript']], ['/chat.css', ['public/chat.css', 'text/css']],
    ['/comments.js', ['public/comments.js', 'text/javascript']], ['/collaboration-ui.js', ['public/collaboration-ui.js', 'text/javascript']],
    ['/account', ['public/account.html', 'text/html']], ['/account/', ['public/account.html', 'text/html']],
    ['/account.html', ['public/account.html', 'text/html']],
    ['/account.js', ['public/account.js', 'text/javascript']], ['/settings.css', ['public/settings.css', 'text/css']],
    ['/permission-editor.js', ['public/permission-editor.js', 'text/javascript']],
    ['/unsaved.js', ['public/unsaved.js', 'text/javascript']], ['/input-generation.js', ['public/input-generation.js', 'text/javascript']], ['/return-status.js', ['public/return-status.js', 'text/javascript']],
    ['/admin-rules.js', ['public/admin-rules.js', 'text/javascript']], ['/admin-csv-profiles.js', ['public/admin-csv-profiles.js', 'text/javascript']],
    ['/admin-audit.js', ['public/admin-audit.js', 'text/javascript']],
    ['/appearance.js', ['public/appearance.js', 'text/javascript']], ['/pagination.js', ['public/pagination.js', 'text/javascript']],
    ['/admin-notifications.js', ['public/admin-notifications.js', 'text/javascript']], ['/notifications.js', ['public/notifications.js', 'text/javascript']],
    ['/admin-backups.js', ['public/admin-backups.js', 'text/javascript']], ['/admin-diagnostics.js', ['public/admin-diagnostics.js', 'text/javascript']],
    ['/admin-updates.js', ['public/admin-updates.js', 'text/javascript']],
    ['/admin-updater.js', ['public/admin-updater.js', 'text/javascript']],
    ['/backup-restore.js', ['public/backup-restore.js', 'text/javascript']], ['/navigation-tools.js', ['public/navigation-tools.js', 'text/javascript']],
    ['/admin-settings.js', ['public/admin-settings.js', 'text/javascript']],
    ['/inventory-display.js', ['public/inventory-display.js', 'text/javascript']],
    ['/inventory-transfer.js', ['public/inventory-transfer.js', 'text/javascript']],
    ['/product-images.js', ['public/product-images.js', 'text/javascript']],
    ['/selects.js', ['public/selects.js', 'text/javascript']],
    ['/currency-control.js', ['public/currency-control.js', 'text/javascript']],
    ['/section-transition.js', ['public/section-transition.js', 'text/javascript']],
    ['/server-operations.js', ['public/server-operations.js', 'text/javascript']],
    ['/styles.css', ['public/styles.css', 'text/css']], ['/app.js', ['public/app.js', 'text/javascript']],
    ['/design.js', ['public/design.js', 'text/javascript']], ['/design.css', ['public/design.css', 'text/css']],
    ['/sidebar-navigation.js', ['public/sidebar-navigation.js', 'text/javascript']],
    ['/motion.css', ['public/motion.css', 'text/css']],
    ['/theme.js', ['public/theme.js', 'text/javascript']], ['/theme.css', ['public/theme.css', 'text/css']],
    ['/forms.js', ['public/forms.js', 'text/javascript']], ['/import.js', ['public/import.js', 'text/javascript']],
    ['/product-picker.js', ['public/product-picker.js', 'text/javascript']],
    ['/quick-actions.js', ['public/quick-actions.js', 'text/javascript']],
    ['/chat-files.js', ['public/chat-files.js', 'text/javascript']],
    ['/workspace-tools.js', ['public/workspace-tools.js', 'text/javascript']], ['/workspace-tools.css', ['public/workspace-tools.css', 'text/css']], ['/workflow.css', ['public/workflow.css', 'text/css']],
    ...['table-preferences.js', 'workspace-insights.js', 'scanner-loading.js', 'scan-labels.js', 'pdf-serial-scan.js', 'barcode-image.js', 'serial-ocr.js', 'return-labels.js', 'label-identifiers.js', 'return-drafts.js', 'scan-preview.js', 'workspace-personalization.js', 'table-sort.js', 'record-action-menu.js', 'scan-intake.js', 'update-notice.js'].map(file => ['/' + file, ['public/' + file, 'text/javascript']]),
    ...['workspace-refinements.css', 'workspace-insights.css', 'scan-labels.css', 'return-labels.css', 'return-drafts.css', 'workspace-personalization.css', 'scan-intake.css', 'inventory-polish.css'].map(file => ['/' + file, ['public/' + file, 'text/css']]),
    ['/form-feedback.js', ['public/form-feedback.js', 'text/javascript']], ['/return-timeline.js', ['public/return-timeline.js', 'text/javascript']], ['/workflow-actions.js', ['public/workflow-actions.js', 'text/javascript']],
    ['/presentation.js', ['public/presentation.js', 'text/javascript']],
    ['/admin.js', ['public/admin.js', 'text/javascript']],
    ['/accounts.js', ['public/accounts.js', 'text/javascript']],
    ['/account-deletion.js', ['public/account-deletion.js', 'text/javascript']],
    ['/attachments.js', ['public/attachments.js', 'text/javascript']],
    ['/pdf-preview.js', ['public/pdf-preview.js', 'text/javascript']],
    ['/shared/model.js', ['shared/model.js', 'text/javascript']], ['/shared/csv.js', ['shared/csv.js', 'text/javascript']],
    ...['return-completion','import-diff','return-transitions','serial-recognition'].map(name=>['/'+name+'.js',['public/'+name+'.js','text/javascript']]),
    ['/shared/return-completion.js',['shared/return-completion.js','text/javascript']],
    ['/shared/serial-number.js',['shared/serial-number.js','text/javascript']],
    ['/shared/permissions.js', ['shared/permissions.js', 'text/javascript']],
    ['/shared/import-session.js', ['shared/import-session.js', 'text/javascript']],
    ['/shared/inventory-file.js', ['shared/inventory-file.js', 'text/javascript']],
    ['/favicon.svg', ['public/favicon.svg', 'image/svg+xml']],
    ['/kofi.avif', ['public/kofi.avif', 'image/avif']]
] as any);
for(const name of ['disposals','disposal-copy','disposal-forms','disposal-labels','disposal-transfer'])files.set('/'+name+'.js',['public/'+name+'.js','text/javascript']);
files.set('/disposals.css',['public/disposals.css','text/css']);
// Only the dependency graph required for login, setup and 2FA is public.
// New application assets are private by default.
files.set('/record-communication.js',['public/record-communication.js','text/javascript']);
files.set('/customer-status.js',['public/customer-status.js','text/javascript']);
files.set('/customer-status-public.js',['public/customer-status-public.js','text/javascript']);
files.set('/customer-status.css',['public/customer-status.css','text/css']);
files.set('/error.css',['public/error.css','text/css']);
const publicScripts = new Set(['/customer-status-public.js','/theme.js', '/bootstrap.js', '/icon-motion.js', '/login.js', '/sso-login.js', '/auth-security.js', '/auth-context.js', '/ui.js', '/unsaved.js', '/i18n.js', '/notices.js', '/shared/auth-navigation.js']);
for (const name of ['tesseract.esm.min.js', 'worker.min.js'])
    files.set('/vendor/ocr/' + name, ['public/vendor/ocr/' + name, 'text/javascript']);
for (const folder of ['core', 'lang'])
    for (const name of readdirSync(new URL(`../public/vendor/ocr/${folder}/`, import.meta.url))) {
        if (!/^[\w.-]+\.(js|traineddata\.gz)$/.test(name))
            continue;
        files.set(`/vendor/ocr/${folder}/${name}`, [`public/vendor/ocr/${folder}/${name}`, name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream']);
    }
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs'])
    files.set('/vendor/pdfjs/' + name, ['public/vendor/pdfjs/' + name, 'text/javascript']);
for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
    for (const name of readdirSync(new URL(`../public/vendor/pdfjs/${folder}/`, import.meta.url))) {
        if (!/^[\w.-]+\.(bcmap|pfb|ttf|wasm|js)$/.test(name))
            continue;
        const type = name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
        files.set(`/vendor/pdfjs/${folder}/${name}`, [`public/vendor/pdfjs/${folder}/${name}`, type]);
    }
return { files, publicScripts };
}
