import { InputError } from '../shared/model.js';
export async function jsonBody(req: any, limit = 3000000) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
        throw new InputError('JSON-Daten erwartet.', 415);
    if (Number(req.headers['content-length']) > limit)
        throw new InputError('Anfrage ist zu groß.', 413);
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit)
            throw new InputError('Anfrage ist zu groß.', 413);
        chunks.push(chunk);
    }
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error();
        return value;
    }
    catch {
        throw new InputError('Ungültige JSON-Daten.');
    }
}
