import { InputError,PRODUCT_COLUMNS,RETURN_IMPORT_COLUMNS } from './model.js';
const normalizeHeader=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={sku:['sku','artnr','artikelnr'],name:['name','produkt','productname'],productName:['name','produkt','product','productname'],price:['preis','productprice'],description:['beschreibung','productdescription'],serialNumber:['sn','serialnumber'],receiptDate:['datum','date','datereceived'],customerReference:['customerref'],trackingNumber:['tracking','trackingno','trackingid','shipmentnumber','shipmentno','sendungsnr','paketnummer'],reason:['returnreason'],condition:['condition'],resolution:['outcome'],orderNumber:['ordernumber']};
export function guessCsvMapping(kind,headers){
    const columns=kind==='products'?PRODUCT_COLUMNS:RETURN_IMPORT_COLUMNS;
    return Object.fromEntries(Object.entries(columns).map(([key,label])=>[key,headers.findIndex(header=>[normalizeHeader(key),normalizeHeader(label),...(aliases[key]??[])].includes(normalizeHeader(header)))]));
}
export function inferCsvKind(headers,fallback='products'){
    const products=guessCsvMapping('products',headers),returns=guessCsvMapping('returns',headers);
    if(returns.sku>=0&&(returns.serialNumber>=0||returns.returnNumber>=0))return 'returns';
    if(products.sku>=0&&products.name>=0)return 'products';
    return fallback;
}
export function parseCsv(source,options={}) {
    if(options.delimiter!==undefined&&!['auto',';',',','\t'].includes(options.delimiter))throw new InputError('Ungültiges CSV-Trennzeichen.');
    if (typeof source !== 'string' || source.length > 2_000_000)
        throw new InputError('CSV darf maximal 2 MB Text enthalten.');
    let text = source.replace(/^\uFEFF/, ''), initialLine = 1;
    if (!text.trim())
        throw new InputError('Die CSV-Datei ist leer.');
    const directive = text.match(/^(?:[ \t]*(?:\r\n|\n|\r(?!\n)))*[ \t]*sep=([;,])[ \t]*(?:\r\n|\n|\r|$)/i);
    if (directive) {
        initialLine += (directive[0].match(/\r\n|\n|\r/g) || []).length;
        text = text.slice(directive[0].length);
    }
    let quote = false, commas = 0, semicolons = 0,tabs=0, hasContent = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quote && text[i + 1] === '"') {
                hasContent = true;
                i++;
            }
            else
                quote = !quote;
        }
        else if (!quote && (c === '\n' || c === '\r')) {
            if (hasContent)
                break;
            commas = 0;
            semicolons = 0;
            tabs=0;
        }
        else if (!quote && c === ',')
            commas++;
        else if (!quote && c === ';')
            semicolons++;
        else if(!quote&&c==='\t')tabs++;
        else if (c.trim())
            hasContent = true;
    }
    const delimiter = options.delimiter&&options.delimiter!=='auto'?options.delimiter:directive?directive[1]:tabs>commas&&tabs>semicolons?'\t':semicolons>=commas?';':',';
    const records = [];
    let values = [], value = '', quoted = false, closed = false, line = initialLine, startLine = initialLine;
    const cell = () => { values.push(value); value = ''; closed = false; };
    const row = () => {
        cell();
        if (values.length > 50)
            throw new InputError(`Zeile ${startLine}: maximal 50 Spalten.`);
        if (values.some(value => value.trim() !== ''))
            records.push({ line: startLine, values });
        if (records.length > 10001)
            throw new InputError('Maximal 10.000 Datenzeilen pro Import.');
        values = [];
    };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    value += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else {
                value += c;
                if (c === '\n' || (c === '\r' && text[i + 1] !== '\n'))
                    line++;
            }
        }
        else if (c === delimiter)
            cell();
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            row();
            line++;
            startLine = line;
        }
        else if (c === '"') {
            if (value || closed)
                throw new InputError(`Zeile ${line}: unerwartetes Anführungszeichen.`);
            quoted = true;
        }
        else {
            if (closed)
                throw new InputError(`Zeile ${line}: ungültige Zeichen nach einem Anführungszeichen.`);
            value += c;
        }
    }
    if (quoted)
        throw new InputError(`Zeile ${startLine}: Anführungszeichen wurde nicht geschlossen.`);
    if (value || values.length || closed)
        row();
    const headers = records.shift()?.values.map(h => h.trim());
    if (!headers?.length || headers.some(h => !h) || new Set(headers).size !== headers.length)
        throw new InputError('Spaltenüberschriften müssen vorhanden und eindeutig sein.');
    for (const record of records)
        if (record.values.length !== headers.length)
            throw new InputError(`Zeile ${record.line}: Anzahl der Spalten stimmt nicht mit der Kopfzeile überein.`);
    return { headers, rows: records, delimiter };
}
export function exportCsv(headers, rows) {
    const cell = (input) => {
        let value = String(input ?? '');
        if (/^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value))
            value = `'${value}`;
        return `"${value.replaceAll('"', '""')}"`;
    };
    return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
