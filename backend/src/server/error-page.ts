// Branded HTML for browser navigations that fail. API and asset requests keep their JSON answers.
type Copy = { title: [string, string]; text: [string, string] };
const copy: Record<number, Copy> = {
    403: { title: ['Kein Zugriff', 'No access'], text: ['Für diese Seite fehlt deinem Konto die Berechtigung. Wende dich an die Administration.', 'Your account does not have permission to open this page. Contact your administrator.'] },
    404: { title: ['Seite nicht gefunden', 'Page not found'], text: ['Diese Adresse gibt es nicht oder die Seite wurde verschoben.', 'This address does not exist or the page has moved.'] },
    429: { title: ['Zu viele Anfragen', 'Too many requests'], text: ['Bitte warte einen Moment und versuche es dann erneut.', 'Please wait a moment and try again.'] },
    500: { title: ['Etwas ist schiefgelaufen', 'Something went wrong'], text: ['Der Server konnte die Seite nicht laden. Versuche es gleich noch einmal.', 'The server could not load this page. Please try again shortly.'] },
    503: { title: ['Wartung läuft', 'Maintenance in progress'], text: ['Der Server wird gerade aktualisiert oder wiederhergestellt. Diese Seite lädt sich automatisch neu.', 'The server is being updated or restored. This page reloads automatically.'] }
};
const fallback: Copy = { title: ['Das hat nicht geklappt', 'That did not work'], text: ['Die Seite konnte nicht geöffnet werden.', 'The page could not be opened.'] };
const retryable = new Set([429, 500, 502, 503, 504]);
const refreshSeconds = 15;

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character as '&']);
const both = (de: string, en: string) => `<span lang="de">${escape(de)}</span><span lang="en">${escape(en)}</span>`;

export function prefersEnglish(header: unknown): boolean {
    const first = String(header ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
    return first === 'en' || first.startsWith('en-') || first.startsWith('en;');
}

// Never echo a request path that could be read as another site ("//host" is protocol-relative).
export function retryTarget(requestUrl: string): string {
    const url = new URL(requestUrl, 'http://localhost');
    return '/' + url.pathname.replace(/^\/+/, '') + url.search;
}

export function renderErrorPage(template: string, options: { status: number; english: boolean; retryTo?: string }): string {
    const { status, english, retryTo } = options, content = copy[status] ?? fallback, language = english ? 1 : 0;
    const actions = [`<a class="primary" href="/">${both('Zur Startseite', 'Go to home')}</a>`];
    if (retryable.has(status) && retryTo) actions.push(`<a href="${escape(retryTo)}">${both('Erneut versuchen', 'Try again')}</a>`);
    const values: Record<string, string> = {
        lang: english ? 'en' : 'de', status: String(status), title: escape(content.title[language]),
        titleDe: escape(content.title[0]), titleEn: escape(content.title[1]), textDe: escape(content.text[0]), textEn: escape(content.text[1]),
        refresh: status === 503 ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : '', actions: actions.join('')
    };
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

export function createErrorPages(readTemplate: () => Promise<string | Buffer>) {
    return {
        // Returns true when an HTML page was sent; false leaves the JSON answer to the caller.
        async respond(req: any, res: any, error: any): Promise<boolean> {
            if (res.headersSent || !['GET', 'HEAD'].includes(req.method)) return false;
            let path: string;
            try { path = new URL(req.url, 'http://localhost').pathname; } catch { return false; }
            if (path.startsWith('/api/') || path === '/health') return false;
            if (!String(req.headers?.accept ?? '').includes('text/html')) return false;
            const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
            let template: string;
            try { template = String(await readTemplate()); } catch { return false; }
            const body = Buffer.from(renderErrorPage(template, { status, english: prefersEnglish(req.headers['accept-language']), retryTo: retryTarget(req.url) }), 'utf8');
            res.writeHead(status, {
                'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Vary': 'Accept, Accept-Language',
                ...(status === 503 ? { 'Retry-After': String(refreshSeconds) } : {})
            });
            res.end(req.method === 'HEAD' ? undefined : body);
            return true;
        }
    };
}
