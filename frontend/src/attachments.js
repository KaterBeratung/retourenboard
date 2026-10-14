import {html,locale,setText,t,apiError} from './i18n.js';
import { showPdf } from './pdf-preview.js';
import { h, icon, showDetails } from './forms.js';
const sizeLabel = (size) => size < 1024 * 1024 ? t`${Math.max(1, Math.round(size / 1024))} KB` : t`${(size / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`;
export async function renderAttachments(ctx, returnId, root) {
    async function refresh() {
        try {
            if(!ctx.can('attachmentsView')){root.innerHTML=html('<h3>Dateianhänge</h3><p class="muted small-text">Dein Konto hat keinen Zugriff auf Dateianhänge.</p>');return;}
            const limits = await ctx.api('/api/config'), maxSize = limits.uploadMaxMb * 1024 * 1024, maxFiles = limits.maxFilesPerReturn;
            const items = await ctx.api(`/api/returns/${returnId}/attachments`);
            if (!root.isConnected)
                return;
            if(!ctx.can('attachmentsView'))return;
            const returnDelete=root.closest('dialog')?.querySelector('#delete-item');
            if(returnDelete&&items.length&&!ctx.can('attachmentsDelete')){returnDelete.disabled=true;returnDelete.title=t('Zum Löschen dieser Retoure benötigst du auch das Recht, ihre Dateianhänge zu löschen.');}
            root.innerHTML = html`<div class="attachment-heading"><div><h3>Dateianhänge <span class="count-pill">${items.length}/${maxFiles}</span></h3><p>Nur für angemeldete Personen sichtbar · PDF, PNG, JPG/JPEG und WebP · je maximal ${limits.uploadMaxMb} MB</p></div></div>
        ${ctx.can('attachmentsUpload') ? html`<form class="attachment-upload"><label class="upload-picker ${items.length >= maxFiles ? 'disabled' : ''}"><input class="sr-only" type="file" name="files" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple aria-label="Dateien auswählen" ${items.length >= maxFiles ? 'disabled' : ''}><span class="picker-icon">${icon('upload')}</span><span class="picker-copy"><strong data-file-label>Dateien auswählen</strong><small data-file-hint>${items.length >= maxFiles ? t`Dateilimit erreicht · maximal ${maxFiles} Dateien` : t('PDF, PNG, JPG/JPEG oder WebP · auch mehrere Dateien')}</small></span><span class="picker-plus">${icon('plus')}</span></label><button type="submit" class="btn secondary" ${items.length >= maxFiles ? 'disabled' : ''}>${icon('upload')}Hochladen</button></form>` : ''}
        <p class="form-error" role="alert" hidden></p><div class="attachment-grid">${items.map(item => html`<article class="attachment-card">${item.mediaType.startsWith('image/') ? html`<a class="attachment-image" href="/api/attachments/${item.id}/preview" target="_blank" rel="noopener" aria-label="${h(item.originalName)} ansehen"><img src="/api/attachments/${item.id}/preview" alt="${h(item.originalName)}" loading="lazy"></a>` : html`<div class="attachment-pdf-label">${icon('file')}PDF-Dokument</div>`}<div class="attachment-caption"><strong>${h(item.originalName)}</strong><span>${sizeLabel(item.size)}</span></div>${item.mediaType === 'application/pdf' ? html`<details class="pdf-preview"><summary>PDF-Vorschau</summary><div class="pdf-canvas-preview" data-pdf="${item.id}"></div><a href="/api/attachments/${item.id}/preview" target="_blank" rel="noopener">PDF in neuem Tab öffnen</a></details>` : ''}<div class="attachment-actions"><a class="text-link" href="/api/attachments/${item.id}/download">${icon('download')}Herunterladen</a>${ctx.can('attachmentsDelete') ? html`<button class="icon-btn" data-file-delete="${item.id}" aria-label="${h(item.originalName)} entfernen">${icon('trash')}</button>` : ''}</div><div class="attachment-confirm" data-confirm="${item.id}" hidden><p>Datei dauerhaft entfernen?</p><button class="btn danger small" data-file-confirm="${item.id}">Entfernen</button><button class="btn secondary small" data-file-cancel="${item.id}">Abbrechen</button></div></article>`).join('')}</div>${!items.length ? html('<p class="muted small-text attachment-empty">Noch keine Dateien angehängt.</p>') : ''}`;
            root.querySelectorAll('.pdf-preview').forEach(details => details.addEventListener('toggle', () => { if (details.open) {
                const preview = details.querySelector('[data-pdf]');
                showPdf(preview, `/api/attachments/${preview.dataset.pdf}/preview`);
            } }));
            root.querySelector('#attachment-unlock')?.addEventListener('click', () => ctx.ensureUnlocked(async () => showDetails(ctx, 'returns', await ctx.api(`/api/returns/${returnId}`))));
            root.querySelector('input[name=files]')?.addEventListener('change', event => { const files = [...event.target.files]; setText(root.querySelector('[data-file-label]'),files.length ? t`${files.length} Datei${files.length === 1 ? '' : 'en'} ausgewählt` : t('Dateien auswählen')); setText(root.querySelector('[data-file-hint]'),files.length ? files.map(file => file.name).join(' · ') : t('PDF, PNG, JPG/JPEG oder WebP · auch mehrere Dateien')); });
            root.querySelector('form')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const form = event.currentTarget, button = form.querySelector('button'), error = root.querySelector('.form-error');
                error.hidden = true;
                const files = [...form.elements.namedItem('files').files];
                if (!files.length) {
                    setText(error,t('Bitte mindestens eine Datei auswählen.'));
                    error.hidden = false;
                    return;
                }
                if (files.some(file => file.size > maxSize)) {
                    setText(error,t`Eine Datei ist zu groß. Maximal ${limits.uploadMaxMb} MB pro Datei sind erlaubt.`);
                    error.hidden = false;
                    return;
                }
                if (items.length + files.length > maxFiles) {
                    setText(error,t`Pro Retoure sind maximal ${maxFiles} Dateien erlaubt.`);
                    error.hidden = false;
                    return;
                }
                button.disabled = true;
                let uploaded = 0;
                try {
                    for (const file of files) {
                        await ctx.api(`/api/returns/${returnId}/attachments`, { method: 'POST', file });
                        uploaded++;
                    }
                    await refresh();
                    root.dispatchEvent(new CustomEvent('return-activity-changed',{bubbles:true}));ctx.toast(t`${uploaded} Datei(en) hochgeladen.`);
                }
                catch (err) {
                    await refresh();
                    if(uploaded)root.dispatchEvent(new CustomEvent('return-activity-changed',{bubbles:true}));
                    const error = root.querySelector('.form-error');
                    if (error) {
                        setText(error,t(`${uploaded ? t`${uploaded} Datei(en) hochgeladen. ` : ''}${err.message}`));
                        error.hidden = false;
                    }
                }
                finally {
                    button.disabled = false;
                }
            });
            root.querySelectorAll('[data-file-delete]').forEach(el => el.onclick = () => root.querySelector(`[data-confirm="${el.dataset.fileDelete}"]`).hidden = false);
            root.querySelectorAll('[data-file-cancel]').forEach(el => el.onclick = () => root.querySelector(`[data-confirm="${el.dataset.fileCancel}"]`).hidden = true);
            root.querySelectorAll('[data-file-confirm]').forEach(el => el.onclick = async () => { el.disabled = true; try {
                await ctx.api(`/api/attachments/${el.dataset.fileConfirm}`, { method: 'DELETE' });
                await refresh();
                root.dispatchEvent(new CustomEvent('return-activity-changed',{bubbles:true}));ctx.toast(t('Datei entfernt.'));
            }
            catch (err) {
                const error = root.querySelector('.form-error');
                setText(error,apiError(err.message));
                error.hidden = false;
                el.disabled = false;
            } });
        }
        catch (err) {
            if (root.isConnected)
                root.innerHTML = html`<p class="form-error" role="alert">${h(err.message)}</p>`;
        }
    }
    root.innerHTML = html('<p class="muted small-text">Dateianhänge werden geladen …</p>');
    await refresh();
}

